var path = require('path');
var fs = require('fs');
var formidable = require('formidable');
var ejs = require('ejs');
var eejs = require('ep_etherpad-lite/node/eejs');

/** @namespace args.app */

var Backend = require('./lib/backend');
var consts = require('./lib/consts');
var log = require('./lib/log');
var Utils = require('./lib/utils');

var settings_file = path.join(__dirname, 'settings.json');
var exists = fs.existsSync(settings_file);
if (!exists) {
	log('warn', 'settings not found, copying settings.json.dist to settings.json');
	fs.writeFileSync(settings_file, fs.readFileSync(path.join(__dirname, 'settings.json.dist')));
}

var settings = require('./settings.json');
var baseurl = '/';
var backend = new Backend(settings);

var language = function (s) {
	var lang = (settings.lang || '').toUpperCase();
	if ((lang.length === 0) || (lang === 'EN')) {
		return s;
	}
	var result = consts.languages[lang][s];
	if (result) {
		return result;
	}
	log('info', 'needs ' + lang + ' translation: "' + s + '"');
	return s;
};

var saveSettings = function (sets, cb) {
	log('info', 'writing settings');
	fs.writeFile(settings_file, JSON.stringify(sets, null, '\t'), function (err) {
		if (err) {
			log('error', err);
			return cb(err);
		}
		log('info', 'restarting backend');
		settings = sets;
		backend = new Backend(settings);
		cb();
	});
};

var render_file = function (file, render_args, user, cb) {
	render_args.product_name = settings.name || 'Etherpad';
	render_args.lang = language;
	render_args.baseurl = baseurl;
	render_args.staticurl = baseurl + 'static/plugins/ep_users/static/';
	render_args.errors = [];
	render_args.active = file;
	render_args.msg = render_args.msg || '';
	render_args.settings = settings || {};
	if (!user) {
		render_args.username = false;
	}
	else {
		render_args.username = user.FullName;
	}
	ejs.renderFile(path.join(__dirname, 'templates/' + file + '.ejs'), render_args, function (err, data) {
		if (err) {
			log('error', err);
			return cb(consts.errors.INTERAL_ERROR);
		}
		cb(null, data);
	});
};

var render = function (res, file, render_args, user) {
	render_file(file, render_args, user, function (err, data) {
		if (err) {
			return res.send(consts.errors.INTERAL_ERROR);
		}
		res.send(data);
	});
};

var render_msg = function (res, msg, user) {
	render(res, 'msg', {msg: msg}, user);
};

var render_error_msg = function (res, error, user) {
	render_msg(res, error.toString(), user);
};

var isUserAuthenticated = function (req) {
	return (req.session.userID);
};

var getSessionUser = function (req, cb) {
	backend.getUser(req.session.userID, function (err, user) {
		if (err) {
			return cb(err);
		}
		if (!user) {
			return cb(consts.errors.INVALID_USER);
		}
		cb(null, user);
	});
};

var parseFields = function (req, res, next) {
	new formidable.IncomingForm().parse(req, function (err, fields) {
		if (err) {
			return sendError(res, err);
		}
		req.fields = fields;
		next();
	});
};

var logOut = function logOut(req) {
	req.session.userID = null;
};

var authorize = function (req, res, next) {
	if (isUserAuthenticated(req)) {
		getSessionUser(req, function (err, user) {
			if (!user) {
				return res.redirect(baseurl + 'start');
			}
			req.user = user;
			next();
		});
	} else {
		res.redirect(baseurl + 'start');
	}
};


var authorizeError = function (req, res, next) {
	if (isUserAuthenticated(req)) {
		getSessionUser(req, function (err, user) {
			if (!user) {
				return sendError(res, consts.errors.USER_NOT_FOUND);
			}
			req.user = user;
			next();
		});
	} else {
		sendError(res, consts.errors.USER_NOT_LOGGED_IN);
	}
};

var sendError = function (res, error) {
	log('error', error);
	res.send({
		success: false,
		error: error
	});
};

var allowedIDs = {};

exports.expressCreateServer = function (hook_name, args, cb) {

	args.app.get('/', function (req, res) {
		if (isUserAuthenticated(req)) {
			return res.redirect(baseurl + 'home');
		}
		if (settings.allow_public_pads) {
			res.redirect(baseurl + 'start');
		} else {
			res.redirect(baseurl + 'login');
		}
	});

	args.app.get('/start', function (req, res) {
		if (isUserAuthenticated(req)) {
			return res.redirect(baseurl + 'home');
		}
		render(res, 'start', {});
	});

	args.app.get('/register', function (req, res) {
		if (isUserAuthenticated(req)) {
			return res.redirect(baseurl + 'home');
		}
		render(res, 'register', {});
	});

	args.app.get('/user-status', function (req, res) {
		return res.json({user: isUserAuthenticated(req), publicpads: settings.allow_public_pads});
	});

	args.app.get('/terms', function (req, res) {
		var terms = settings.terms || '';
		render(res, 'terms', {terms: terms});
	});

	args.app.get('/login', function (req, res) {
		if (isUserAuthenticated(req)) {
			return res.redirect(baseurl + 'home');
		}
		render(res, 'login', {});
	});

	args.app.post('/login', parseFields, function (req, res) {
		backend.login(req.fields.email, req.fields.password, function (err, user) {
			if (err) {
				return sendError(res, err);
			}
			req.session.userID = user.userID;
			req.session.baseurl = req.fields.url;
			res.send({success: true});
		});
	});

	args.app.post('/logout', function (req, res) {
		logOut(req);
		res.send(true);
	});

	args.app.get('/logout', function (req, res) {
		logOut(req);
		res.redirect(baseurl + 'start');
	});

	args.app.post('/register', parseFields, function (req, res) {
		if (!settings.allow_registration) {
			return sendError(res, consts.msgs.REGISTRATION_CLOSED);
		}
		backend.registerUser(req.fields.fullname, req.fields.email, req.fields.password, req.fields.passwordrepeat, function (err) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true});
		});
	});

	args.app.get('/confirm/:consString', function (req, res) {
		if (!settings.allow_registration) {
			return sendError(res, consts.msgs.REGISTRATION_CLOSED);
		}
		backend.confirmUser(req.params.consString, function (err) {
			if (err) {
				return render_msg(res, err);
			}
			render_msg(res, consts.msgs.REGISTRATION_COMPLETE);
		});
	});

	args.app.post('/pwreset', parseFields, function (req, res) {
		if (req.fields.email) {
			backend.requestPasswordReset(req.fields.email, function (err) {
				if (err) {
					return sendError(res, err);
				}
				res.send({success: true});
			});
		} else if (req.fields.confirmation) {
			backend.passwordReset(req.fields.confirmation, req.fields.password, req.fields.passwordrepeat, function (err) {
				if (err) {
					return sendError(res, err);
				}
				res.send({success: true});
			});
		} else {
			sendError(res, consts.errors.INVALID_REQUEST)
		}
	});

	args.app.get('/pwreset/:consString', function (req, res) {
		backend.getPasswordResetUser(req.params.consString, function (err, user) {
			if (err) {
				return render_msg(res, err);
			}
			render(res, 'pwreset', {consString: req.params.consString}, req.user);
		});
	});


	args.app.get('/home', authorize, function (req, res) {
		backend.getUserGroups(req.user.userID, function (err, groups) {
			if (err) {
				return render_msg(res, err);
			}
			backend.getUserPads(req.user.userID, function (err, pads) {
				if (err) {
					return render_msg(res, err);
				}
				render(res, 'home', {groups: groups, pads: pads}, req.user);
			});
		});
	});

	args.app.get('/pads', authorize, function (req, res) {
		render(res, 'pads', {}, req.user);
	});

	args.app.get('/group/:groupID', authorize, function (req, res) {
		backend.getGroupInfo(req.params.groupID, req.user.userID, function (err, group, pads, isOwner, users) {
			if (err) {
				return render_error_msg(res, err, req.user);
			}
			render(res, 'group', {
				id: group.name,
				groupID: group.groupID,
				isOwner: isOwner,
				pads: pads,
				users: users
			}, req.user);
		});
	});

	args.app.get('/groups', authorize, function (req, res) {
		backend.getUserGroups(req.user.userID, function (err, groups) {
			if (err) {
				return render_error_msg(res, err, req.user);
			}
			render(res, 'groups', {groups: groups}, req.user);
		});
	});

	args.app.get('/group/:groupID/pad/:padName', authorize, function (req, res) {
		backend.padLogin(req.params.groupID, req.params.padName, req.user.userID, function (err, group, padURL, sessionID) {
			if (err) {
				return render_error_msg(res, err, req.user);
			}
			var allowedID = Utils.randomString(10);
			allowedIDs[allowedID] = true;
			render(res, 'pad', {
				padname: req.params.padName,
				groupID: req.params.groupID,
				groupName: group.name,
				padurl: baseurl + 'p/' + padURL + '?access=' + allowedID,
				sessionID: sessionID
			}, req.user);
		});
	});

	args.app.get('/user', authorize, function (req, res) {
		render(res, 'user', {user: req.user}, req.user);
	});

	args.app.post('/padSearchTerm', authorizeError, parseFields, function (req, res) {
		backend.searchPads(req.fields.groupID, req.fields.term, req.user.id, function (err, group, pads) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true, group: group, pads: pads});
		});
	});

	args.app.post('/groupsSearchTerm', authorizeError, parseFields, function (req, res) {
		backend.searchGroups(req.user.userID, req.fields.term, function (err, groups) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true, groups: groups});
		});
	});

	args.app.post('/inviteUsers', authorizeError, parseFields, function (req, res) {
		backend.inviteUsers(req.fields.groupID, req.fields.users, req.user, function (err) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true});
		});
	});

	args.app.post('/userSearchTerm', authorizeError, parseFields, function (req, res) {
		backend.searchUsers(req.fields.groupID, req.fields.term, req.user.userID, function (err, users) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true, users: users})
		});
	});

	args.app.post('/deleteNotRegUser', authorizeError, parseFields, function (req, res) {
		backend.deleteNotRegUser(req.fields.groupID, req.fields.username, req.user.userID, function (err) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true});
		});
	});

	args.app.post('/reinviteUser', authorizeError, parseFields, function (req, res) {
		backend.reinviteUser(req.fields.groupID, req.fields.userID, baseurl, req.user, function (err) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true});
		});
	});

	args.app.post('/changeUserName', authorizeError, parseFields, function (req, res) {
		backend.changeUserName(req.user.userID, req.fields.newUserName, function (err) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true});
		});
	});

	args.app.post('/changeEmail', authorizeError, parseFields, function (req, res) {
		backend.changeUserEMail(req.user.userID, req.fields.newEmail, function (err) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true});
		});
	});

	args.app.post('/changeUserPw', authorizeError, parseFields, function (req, res) {
		backend.changeUserPw(req.user.userID, req.fields.newPW, req.fields.oldPW, req.user, function (err) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true});
		});
	});

	args.app.post('/makeOwner', authorizeError, parseFields, function (req, res) {
		backend.makeOwner(req.fields.userID, req.fields.groupID, req.user.userID, function (err) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true});
		});
	});

	args.app.post('/deleteUserFromGroup', authorizeError, parseFields, function (req, res) {
		backend.deleteUserFromGroup(req.fields.userID, req.fields.groupID, req.user.userID, function (err) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true});
		});
	});

	args.app.post('/deleteUser', authorizeError, parseFields, function (req, res) {
		backend.deleteUser(req.user.userID, function (err) {
			if (err) {
				return sendError(res, err);
			}
			logOut(req);
			res.send({success: true});
		});
	});

	args.app.post('/createGroup', authorizeError, parseFields, function (req, res) {
		backend.createGroup(req.user.userID, req.fields.groupName, function (err, groupID) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true, groupID: groupID});
		});
	});

	args.app.post('/createPad', authorizeError, parseFields, function (req, res) {
		backend.createPad(req.fields.groupID, req.fields.padName, req.user.userID, function (err) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true, padname: req.fields.padName});
		});
	});

	args.app.post('/deletePad', authorizeError, parseFields, function (req, res) {
		backend.deletePad(req.fields.groupID, req.fields.padName, req.user.userID, function (err) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true});
		});
	});

	args.app.post('/deleteGroup', authorizeError, parseFields, function (req, res) {
		backend.deleteGroup(req.fields.groupID, req.user.userID, function (err) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true});
		});
	});

	args.app.post('/setPassword', authorizeError, parseFields, function (req, res) {
		backend.setPadPassword(req.fields.groupID, req.user.userID, req.fields.padName, req.fields.pw, function (err) {
			if (err) {
				return sendError(res, err);
			}
			res.send({success: true});
		});
	});

	/* admin */

	args.app.get('/admin/users', function (req, res) {
		res.send(eejs.require('ep_users/templates/admin/user_pad_admin.ejs', {errors: []}));
	});

	args.app.get('/admin/users/groups', function (req, res) {
		res.send(eejs.require('ep_users/templates/admin/user_pad_admin_groups.ejs', {errors: []}));
	});

	args.app.get('/admin/users/groups/group', function (req, res) {
		res.send(eejs.require('ep_users/templates/admin/user_pad_admin_group.ejs', {errors: []}));
	});

	args.app.get('/admin/users/users', function (req, res) {
		res.send(eejs.require('ep_users/templates/admin/user_pad_admin_users.ejs', {errors: []}));
	});

	args.app.get('/admin/users/users/user', function (req, res) {
		res.send(eejs.require('ep_users/templates/admin/user_pad_admin_user.ejs', {errors: []}));
	});

	args.app.get('/admin/users/settings', function (req, res) {
		res.send(eejs.require('ep_users/templates/admin/user_pad_admin_settings.ejs', {errors: []}));
	});

	args.app.get('/p/:id', function (req, res, next) {
		if (!settings.allow_public_pads) {
			if (!allowedIDs[req.query.access]) {
				return res.send(consts.msgs.NO_PUBLIC_PADS);
			}
			delete allowedIDs[req.query.access];
		}
		next();
	});

	args.app.get('/socket.io/', function (req, res, next) {
		if (settings.allow_public_pads) {
			return next();
		}
		if (isUserAuthenticated(req)) {
			return next();
		}
		res.send(consts.msgs.NO_PUBLIC_PADS);
	});

	return cb();

};

exports.eejsBlock_body = function (hook_name, args, cb) {
	var render_args = {};
	render_args.lang = language;
	render_args.baseurl = baseurl;
	render_args.product_name = settings.name || 'Etherpad';
	args.content += eejs.require('ep_users/templates/partials/pad_hook_header.ejs', render_args);
	cb();
};

exports.eejsBlock_styles = function (hook_name, args, cb) {
	args.content += eejs.require('ep_users/templates/partials/pad_hook_style.ejs', {});
	return cb();
};

exports.eejsBlock_indexWrapper = function (hook_name, args, cb) {
	args.content = '<script>window.location = "' + baseurl + 'start";</script>';
	return cb();
};

exports.eejsBlock_adminMenu = function (hook_name, args, cb) {
	var hasAdminUrlPrefix = (args.content.indexOf('<a href="admin/') !== -1),
		hasOneDirDown = (args.content.indexOf('<a href="../') !== -1),
		hasTwoDirDown = (args.content.indexOf('<a href="../../') !== -1),
		urlPrefix = hasAdminUrlPrefix ? 'admin/' : hasTwoDirDown ? '../../' : hasOneDirDown ? '../' : ''
	;
	args.content = args.content + '<li><a href="' + urlPrefix + 'users">User Administration</a> </li>';
	return cb();
};

exports.socketio = function (hook_name, args, callback) {
	var io = args.io.of('/pluginfw/admin/user_pad');
	io.on('connection', function (socket) {
		if (!socket.request.session.user || !socket.request.session.user.is_admin) {
			return;
		}

		socket.on('search-group', function (searchTerm, cb) {
			backend.adminSearchGroup(searchTerm, cb);
		});

		socket.on('get-group', function (groupID, cb) {
			backend.adminGetGroup(groupID, cb);
		});

		socket.on('search-pads', function (groupID, term, cb) {
			backend.adminSearchPads(groupID, term, cb);
		});

		socket.on('search-all-users-not-in-group', function (groupID, term, cb) {
			backend.adminSearchUngroupedUsers(groupID, term, cb);
		});

		socket.on('search-group-user', function (groupID, term, cb) {
			backend.adminSearchGroupUsers(groupID, term, cb);
		});

		socket.on('delete-group', function (groupID, cb) {
			backend.adminDeleteGroup(groupID, cb);
		});

		socket.on('delete-pad', function (groupID, padName, cb) {
			backend.adminDeletePad(groupID, padName, cb);
		});

		socket.on('remove-user-from-group', function (userID, groupID, cb) {
			backend.adminDeleteUserFromGroup(userID, groupID, cb);
		});

		socket.on('make-user-owner-of-group', function (userID, groupID, cb) {
			backend.adminMakeUserOwnerFromGroup(userID, groupID, cb);
		});

		socket.on('add-group', function (name, cb) {
			backend.adminCreateGroup(name, cb);
		});

		socket.on('add-pad-to-group', function (groupID, padName, cb) {
			backend.adminAddPadToGroup(groupID, padName, cb);
		});

		socket.on('search-all-user', function (term, cb) {
			backend.adminSearchUsers(term, cb);
		});

		socket.on('add-user', function (name, email, password, cb) {
			backend.adminAddUser(name, email, password, cb);
		});

		socket.on('deactivate-user', function (userID, cb) {
			backend.adminDeactivateUser(userID, cb);
		});

		socket.on('activate-user', function (userID, cb) {
			backend.adminActivateUser(userID, cb);
		});

		socket.on('send-new-pw-user', function (userID, cb) {
			backend.adminSendNewPassword(userID, cb);
		});

		socket.on('delete-user', function (userID, hard, cb) {
			backend.adminDeleteUser(userID, hard, cb);
		});

		socket.on('search-pads-of-user', function (userID, term, cb) {
			backend.adminSearchPadsOfUser(userID, term, cb);
		});

		socket.on('search-groups-of-user', function (userID, term, cb) {
			backend.adminSearchGroupsOfUser(userID, term, cb);
		});

		socket.on('search-user', function (userID, cb) {
			backend.adminGetUser(userID, cb);
		});

		socket.on('add-user-to-group', function (userID, groupID, cb) {
			backend.adminAddUserToGroup(userID, groupID, cb);
		});

		socket.on('search-groups-not-in-user', function (userID, term, cb) {
			backend.adminSearchGroupNotInUser(userID, term, cb);
		});

		socket.on('direct-to-group-pad', function (userID, groupID, padName, cb) {
			backend.adminDirectToPad(userID, groupID, padName, cb);
		});

		socket.on('settings-get', function (vals, cb) {
			cb(null, settings);
		});

		socket.on('settings-set', function (sets, cb) {
			saveSettings(sets, cb);
		});
	});
	callback();
};


