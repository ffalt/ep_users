var async = require('async');
var Database = require('./db');
var Mail = require('./mail');
var Utils = require('./utils');
var consts = require('./consts');

var etherpad = {
	sessionManager: require('ep_etherpad-lite/node/db/SessionManager'),
	authorManager: require('ep_etherpad-lite/node/db/AuthorManager'),
	padManager: require('ep_etherpad-lite/node/db/PadManager'),
	groupManager: require('ep_etherpad-lite/node/db/GroupManager'),
	settings: require('ep_etherpad-lite/node/utils/Settings'),
	db: require('ep_etherpad-lite/node/db/DB').db
};

/** @namespace async.forEachSeries */

function Backend(settings) {
	var me = this;

	var database = new Database({
		host: etherpad.settings.dbSettings.host,
		user: etherpad.settings.dbSettings.user,
		password: etherpad.settings.dbSettings.password,
		database: etherpad.settings.dbSettings.database,
		insecureAuth: true,
		stringifyObjects: true
	});

	var mail = new Mail(settings.mail);

	var ep = {};

	ep.etherpad_mapAuthorWithDBKey = function (mapperkey, mapper, cb) {
		//try to map to an author
		etherpad.db.get(mapperkey + ':' + mapper, function (err, author) {
			if (err) {
				return cb(err);
			}
			//there is no author with this mapper, so create one
			if (author === null) {
				etherpad.authorManager.createAuthor(null, function (err, new_author) {
					if (err) {
						return cb(err);
					}
					//create the token2author relation
					etherpad.db.set(mapperkey + ':' + mapper, new_author.authorID);
					//return the author
					cb(null, new_author);
				});
			}
			//there is a author with this mapper
			else {
				//update the timestamp of this author
				etherpad.db.setSub('globalAuthor:' + author, ['timestamp'], new Date().getTime());
				//return the author
				cb(null, {authorID: author});
			}
		});
	};

	ep.etherpad_deleteUser = function (userID, cb) {
		ep.etherpad_mapAuthorWithDBKey('mapper2author', userID, function (err, author) {
			if (err) {
				return cb(err);
			}
			etherpad.db.remove('globalAuthor:' + author.authorID);
			var sql = 'DELETE FROM store where store.key = ?';
			database.deleteSql(sql, ['mapper2author:' + userID], function (err) {
				if (err) {
					return cb(err);
				}
				var sql2 = 'DELETE FROM store where store.value = ? and store.key like ?';
				database.deleteSql(sql2, ['mapper2author:' + userID, 'token2author:%'], function (err) {
					cb(err);
				});
			});
		});
	};

	ep.etherpad_getGroup = function (groupID, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		var sql = 'SELECT * FROM store WHERE store.key = ?';
		database.getSql(sql, ['mapper2group:' + groupID], function (err, results) {
			if (err) {
				return cb(err);
			}
			if (!results || results.length === 0) {
				return cb('Mapper Group not found');
			}
			cb(null, results[0].value.replace(/"/g, ''));
		});
	};

	ep.etherpad_addGroup = function (groupID, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		etherpad.groupManager.createGroupIfNotExistsFor(groupID.toString(), function (err) {
			if (err) {
				return cb(err);
			}
			cb();
		});
	};

	ep.getPadInfos = function (groupID, name, cb) {
		ep.etherpad_getGroup(groupID, function (err, etherpad_group) {
			if (err) {
				return cb(err);
			}
			etherpad.padManager.getPad(etherpad_group + '$' + name, null, function (err, origPad) {
				if (err) {
					return cb(err);
				}
				var info = {};
				info.isProtected = origPad.isPasswordProtected();
				origPad.getLastEdit(function (err, lastEdit) {
					info.lastedit = Utils.convertPadTimestamp(lastEdit);
					info.lastedit_ts = lastEdit;
					cb(null, info);
				});
			});
		});
	};

	ep.createPadSession = function (groupID, userID, padName, cb) {
		ep.etherpad_getGroup(groupID, function (err, etherpad_group) {
			if (err) {
				return cb(err);
			}
			ep.etherpad_addUser(userID, function (err, etherpad_author) {
				if (err) {
					return cb(err);
				}
				etherpad.sessionManager.createSession(etherpad_group, etherpad_author.authorID, Date.now() + 7200000, function (err, session) {
					if (err) {
						return cb(err);
					}
					cb(err, etherpad_group + '$' + padName, session.id || session.sessionID);
				});
			});
		});
	};

	ep.etherpad_deletePad = function (padName, groupID, cb) {
		if (!padName) {
			return cb(consts.errors.INVALID_PAD_NAME);
		}
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		ep.etherpad_getGroup(groupID, function (err, etherpad_group) {
			if (err) {
				return cb(err);
			}
			etherpad.padManager.removePad(etherpad_group + '$' + padName);
			cb();
		});
	};

	ep.etherpad_addUser = function (userName, cb) {
		if (!userName) {
			return cb(consts.errors.INVALID_USER_NAME);
		}
		//noinspection JSUnresolvedFunction
		etherpad.authorManager.createAuthorIfNotExistsFor(userName, null, function (err, author) {
			cb(err, author);
		});
	};

	ep.etherpad_addPad = function (padName, groupID, cb) {
		if (!padName) {
			return cb(consts.errors.INVALID_PAD_NAME);
		}
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		ep.etherpad_getGroup(groupID, function (err, etherpad_group) {
			if (err) {
				return cb(err);
			}
			etherpad.groupManager.createGroupPad(etherpad_group, padName, function (err) {
				cb(err);
			});
		});
	};

	ep.etherpad_deleteGroup = function (groupID, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		ep.etherpad_getGroup(groupID, function (err, etherpad_group) {
			if (err) {
				return cb(err);
			}
			etherpad.groupManager.deleteGroup(etherpad_group, function (err) {
				if (err) {
					return cb(err);
				}
				var sql = 'DELETE FROM store WHERE store.key = ?';
				database.deleteSql(sql, ['mapper2group:' + groupID], function (err) {
					cb(err);
				});
			});
		});
	};

	ep.etherpad_setPadPassword = function (groupID, padName, pw, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		if (!pw) {
			return cb(consts.errors.PW_EMPTY);
		}
		ep.etherpad_getGroup(groupID, function (err, etherpad_group) {
			if (err) {
				return cb(err);
			}
			etherpad.padManager.getPad(etherpad_group + '$' + padName, null, function (err, origPad) {
				if (err) {
					return cb(err);
				}
				origPad.setPassword(pw);
				cb();
			});
		});
	};

	me.commands = {};

	me.commands.setUserActive = function (userID, active, cb) {
		var sql = 'UPDATE User SET User.active = ? where User.userID = ?';
		database.updateSql(sql, [(active ? 1 : 0), userID], function (err) {
			if (err) {
				return cb(err);
			}
			cb();
		});
	};

	me.commands.getGroupUsers = function (groupID, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		var sql = 'Select * from UserGroup where UserGroup.groupID = ?';
		database.getSql(sql, [groupID], function (err, groups) {
			if (err) {
				return cb(err);
			}
			var all = [];
			async.forEachSeries(groups, function (group, next) {
				var sql2 = 'Select * from User where User.userID = ?';
				database.getSql(sql2, [group.userID], function (err, users) {
					if (err) {
						return cb(err);
					}
					if (users.length > 0) {
						users[0].Role = group.Role;
						all.push(users[0]);
					}
					next();
				});
			}, function () {
				cb(err, all);
			});
		});
	};

	me.commands.countGroupsOfUser = function (userID, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		var sql = 'Select count(groupID) as amount from UserGroup Where UserGroup.userID = ?';
		database.getSql(sql, [userID], function (err, results) {
			if (err) {
				return cb(err);
			}
			cb(null, results[0].amount);
		});
	};

	me.commands.sendNewPassword = function (userID, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		var pw = Utils.createSalt();
		var salt = Utils.createSalt();
		me.getUser(userID, function (err, user) {
			if (err) {
				return cb(err);
			}
			var encrypted = Utils.encryptPassword(pw, salt);
			var sql = 'UPDATE User SET User.pwd = ?, User.salt = ? where User.userID = ?';
			database.updateSql(sql, [encrypted, salt, userID], function (err, bool) {
				if (err) {
					return cb(err);
				}
				mail.sendNewPassword(user.name, pw, function (err) {
					if (err) {
						return cb(err);
					}
					cb(null, bool);
				})
			})
		});
	};

	me.commands.login = function (email, password, cb) {
		if (!email) {
			return cb(consts.errors.INVALID_USER_MAIL);
		}
		if (!password) {
			return cb(consts.errors.PW_EMPTY);
		}
		var userSql = 'SELECT * FROM User WHERE User.name = ?';
		database.getSql(userSql, [email], function (err, results) {
			if (err) {
				return cb(err);
			}
			var userFound = results ? results[0] : null;
			if (!userFound) {
				return cb(consts.errors.USER_OR_PASSWORD_WRONG);
			}
			var encrypted = Utils.encryptPassword(password, userFound.salt);
			if (userFound.pwd !== encrypted) {
				return cb(consts.errors.USER_OR_PASSWORD_WRONG);
			}
			if (!userFound.active) {
				return cb(consts.errors.USER_INACTIVE);
			}
			if (!userFound.considered) {
				return cb(consts.errors.USER_NOT_CONFIRMED);
			}
			cb(null, userFound);
		});
	};

	me.commands.getUserByName = function (username, cb) {
		username = (username || '').trim();
		if (!username) {
			return cb(consts.errors.INVALID_USER_NAME);
		}
		var sql = 'SELECT * FROM User WHERE User.name = ?';
		database.getSql(sql, [username], function (err, results) {
			if (err) {
				return cb(err);
			}
			if (!results || results.length === 0) {
				return cb(consts.errors.USER_NOT_FOUND);
			}
			cb(null, results[0]);
		});
	};

	me.commands.getUser = function (userID, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		var sql = 'SELECT * FROM User WHERE userID = ?';
		database.getSql(sql, [userID], function (err, results) {
			if (err) {
				return cb(err);
			}
			if (!results || results.length === 0) {
				return cb(consts.errors.USER_NOT_FOUND);
			}
			cb(null, results[0]);
		});
	};

	me.commands.addUser = function (name, email, password, cb) {
		me.commands.userExists(email, function (err, exists) {
			if (err) {
				return cb(err);
			}
			if (exists) {
				return cb(consts.errors.USER_EXISTS);
			}
			me.commands.storeNewUser(email, name, password, true, function (err, newId, consString) {
				ep.etherpad_addUser(newId, function (err) {
					cb(err);
				});
			});
		});
	};

	me.commands.storeNewUser = function (email, name, password, registered, cb) {
		if (!email) {
			return cb(consts.errors.INVALID_USER_MAIL);
		}
		if (!name) {
			return cb(consts.errors.INVALID_USER_NAME);
		}
		if (!password) {
			return cb(consts.errors.PW_EMPTY);
		}
		var salt = Utils.createSalt();
		var consString = Utils.createID();
		var encrypted = Utils.encryptPassword(password, salt);
		var sql = 'INSERT INTO User VALUES(null, ?,?, ?, 0, ?,?,?,1)';
		database.insertSql(sql, [email, encrypted, registered ? 1 : 0, name, consString, salt], function (err, newId) {
			if (err) {
				return cb(err);
			}
			cb(null, newId, consString);
		});
	};

	me.commands.registerUser = function (name, email, password, cb) {
		if (!password || password.trim().length === 0) {
			return cb(consts.errors.PW_EMPTY);
		}
		me.commands.userExists(email, function (err, exists) {
			if (err) {
				return cb(err);
			}
			if (exists) {
				return cb(consts.errors.USER_EXISTS);
			}
			me.commands.storeNewUser(email, name, password, false, function (err, newUserId, consString) {
				if (err) {
					return cb(err);
				}
				mail.sendRegistrationMail(email, consString, function (err) {
					if (err) {
						return cb(err);
					}
					me.commands.checkInvitations(email, newUserId, cb);
				});
			});
		});
	};

	me.commands.userExists = function (username, cb) {
		if (!username) {
			return cb(consts.errors.INVALID_USER_NAME);
		}
		var existUser = 'SELECT * FROM User WHERE User.name = ?';
		database.existValueInDatabase(existUser, [username], function (err, found) {
			cb(err, found)
		});
	};

	me.commands.getGroup = function (groupID, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		var sql = 'SELECT * FROM Groups WHERE groupID = ?';
		database.getSql(sql, [groupID], function (err, results) {
			if (err) {
				return cb(err);
			}
			if (!results || results.length === 0) {
				return cb(consts.errors.GROUP_NOT_FOUND);
			}
			cb(null, results[0]);
		});
	};

	me.commands.getGroupsOwnedByUser = function (userID, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		var sql = 'SELECT * FROM UserGroup WHERE userID = ? and UserGroup.Role = 1';
		database.getSql(sql, [userID], function (err, results) {
			if (err) {
				return cb(err);
			}
			var groups = [];
			async.forEachSeries(results, function (foundGroup, next) {
					me.commands.getGroup(foundGroup.groupID, function (err, group) {
							if (err) {
								return cb(err);
							}
							groups.push(group);
							next();
						}
					)
				}, function () {
					cb(null, groups);
				}
			);
		});
	};

	me.commands.makeOwner = function (userID, groupID, cb) {
		me.commands.setAllGroupUserRoles(groupID, false, function (err) {
			if (err) {
				return cb(err);
			}
			me.commands.setGroupUserRole(userID, groupID, true, function (err) {
				if (err) {
					return cb(err);
				}
				cb();
			});
		});
	};

	me.commands.isUserInGroup = function (userID, groupID, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		var sql = 'SELECT * FROM UserGroup WHERE UserGroup.userID = ? and UserGroup.groupID= ?';
		database.getSql(sql, [userID, groupID], function (err, results) {
			if (err) {
				return cb(err);
			}
			cb(null, results.length > 0);
		});
	};

	me.commands.countUsersInGroup = function (groupID, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		var sql = 'Select count(userID) as amount from UserGroup Where groupID = ?';
		database.getSql(sql, [groupID], function (err, results) {
			if (err) {
				return cb(err);
			}
			cb(null, results[0].amount);
		});
	};

	me.commands.addUserToGroup = function (userID, groupID, asOwner, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		var sql = 'INSERT INTO UserGroup Values(?,?,?)';
		database.insertSql(sql, [userID, groupID, (asOwner ? 1 : 2)], function (err, newId) {
			cb(err, newId);
		});
	};

	me.commands.addPadToGroup = function (groupID, padName, cb) {
		if (!padName) {
			return cb(consts.errors.INVALID_PAD_NAME);
		}
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		var sql = 'INSERT INTO GroupPads VALUES(?, ?)';
		database.insertSql(sql, [groupID, padName], function (err) {
			if (err) {
				return cb(err);
			}
			ep.etherpad_addPad(padName, groupID, function (err) {
				cb(err);
			});
		});
	};

	me.commands.inviteRegistered = function (groupID, email, fromname, userID, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		if (!email) {
			return cb(consts.errors.INVALID_USER_MAIL);
		}
		me.commands.isUserInGroup(userID, groupID, function (err, isInGroup) {
			if (err) {
				return cb(err);
			}
			if (isInGroup) {
				return cb(consts.errors.USER_IN_GROUP);
			}
			me.commands.getGroup(groupID, function (err, group) {
				if (err) {
					return cb(err);
				}
				if (!group) {
					return cb(consts.errors.GROUP_NOT_FOUND);
				}
				me.commands.addUserToGroup(userID, groupID, false, function (err) {
					if (err) {
						return cb(err);
					}
					cb();
					mail.sendInviteRegistered(email, group.name, fromname, function (err) {
						// ignore mail errors if user is registered
					});
				});
			});
		});
	};

	me.commands.addToInvitation = function (email, groupID, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		if (!email) {
			return cb(consts.errors.INVALID_USER_MAIL);
		}
		var sql = 'INSERT INTO NotRegisteredUsersGroups Values(?,?)';
		database.insertSql(sql, [email, groupID], function (err, newId) {
			cb(err, newId);
		});
	};

	me.commands.isInInvitation = function (email, groupID, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		if (!email) {
			return cb(consts.errors.INVALID_USER_MAIL);
		}
		var sql = 'SELECT * FROM NotRegisteredUsersGroups WHERE email = ? and groupID = ?';
		database.getSql(sql, [email, groupID], function (err, results) {
			if (err) {
				return cb(err);
			}
			cb(null, results && results.length > 0);
		});
	};

	me.commands.inviteUnregistered = function (groupID, email, fromname, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		if (!email) {
			return cb(consts.errors.INVALID_USER_MAIL);
		}
		me.commands.getGroup(groupID, function (err, group) {
			if (err) {
				return cb(err);
			}
			if (!group) {
				return cb(consts.errors.GROUP_NOT_FOUND);
			}
			me.commands.isInInvitation(email, groupID, function (err, isIn) {
				if (err) {
					return cb(err);
				}
				if (isIn) {
					return cb();
				}
				mail.sendInviteUnregistered(email, group.name, fromname, function (err) {
					if (err) {
						return cb(err);
					}
					me.commands.addToInvitation(email, groupID, function (err) {
						cb(err);
					});
				});
			});
		});
	};

	me.commands.inviteUser = function (groupID, email, fromname, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		if (!email) {
			return cb(consts.errors.INVALID_USER_MAIL);
		}
		me.commands.getUserByName(email, function (err, user) {
			if (err) {
				return cb(err);
			}
			if (user) {
				me.commands.inviteRegistered(groupID, email, fromname, user.userID, cb);
			} else {
				me.commands.inviteUnregistered(groupID, email, fromname, cb);
			}
		});
	};

	me.commands.inviteUsers = function (groupID, emails, fromname, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		emails = emails.filter(function (email) {
			return email && (email.toString().trim().length > 0);
		});
		if (emails.length === 0) {
			return cb(consts.errors.INVALID_USER_MAIL);
		}
		async.forEachSeries(emails, function (email, next) {
			email = email.toString().replace(/\s/g, '').trim();
			if (email.length === 0) {
				return next();
			}
			me.commands.inviteUser(groupID, email, fromname, function (err) {
				if (err) {
					return cb(err);
				}
				next();
			});
		}, function () {
			cb();
		});
	};

	me.commands.isUserOwnerOfGroup = function (userID, groupID, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		var sql = 'SELECT * FROM UserGroup WHERE UserGroup.userID = ? and UserGroup.groupID= ?';
		database.getSql(sql, [userID, groupID], function (err, results) {
			if (err) {
				return cb(err);
			}
			cb(null, results && results[0] && results[0].Role === 1);
		});
	};

	me.commands.setGroupUserRole = function (userID, groupID, isOwner, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		var sql = 'UPDATE UserGroup SET Role = ? WHERE userID= ? and groupID = ?';
		database.updateSql(sql, [(isOwner ? 1 : 2), userID, groupID], function (err) {
			if (err) {
				return cb(err);
			}
			cb(err, !err);
		});
	};

	me.commands.setAllGroupUserRoles = function (groupID, isOwner, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		var sql = 'UPDATE UserGroup SET Role = ? WHERE groupID = ?';
		database.updateSql(sql, [(isOwner ? 1 : 2), groupID], function (err) {
			if (err) {
				return cb(err);
			}
			cb(err, !err);
		});
	};

	me.commands.isUserOwnerOfAnyGroup = function (userID, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		var sql = 'SELECT * from UserGroup where UserGroup.userId = ? and UserGroup.Role = 1';
		database.existValueInDatabase(sql, [userID], function (err, exist) {
			cb(err, exist);
		});
	};

	me.commands.deleteUserFromGroup = function (userID, groupID, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		var deleteUserFromGroupSql = 'DELETE FROM UserGroup WHERE userID = ? and groupID = ?';
		database.updateSql(deleteUserFromGroupSql, [userID, groupID], function (err) {
			cb(err, !err);
		});
	};

	me.commands.getUserByConfirmationId = function (consString, cb) {
		if (!consString) {
			return cb(consts.errors.INVALID_CONFIRMATION_ID);
		}
		var sql = 'SELECT * FROM User WHERE User.considerationString = ?';
		database.getSql(sql, [consString || ''], function (err, results) {
			if (err) {
				return cb(err);
			}
			if (!results || results.length === 0) {
				return cb('User not found');
			}
			cb(null, results[0])
		});
	};

	me.commands.requestPasswordReset = function (email, cb) {
		me.commands.getUserByName(email, function (err, userFound) {
			if (err) {
				return cb(err);
			}
			if (!userFound.active) {
				return cb(consts.errors.USER_INACTIVE);
			}
			if (!userFound.considered) {
				return cb(consts.errors.USER_NOT_CONFIRMED);
			}
			var count = parseInt(userFound.considerationString.split('-')[1], 10);
			if (isNaN(count) || count <= 0) {
				count = 1;
			}
			else {
				count++;
			}
			if (count > 5) {
				return cb(consts.errors.TOO_MANY_REQUESTS);
			}
			var consString = Utils.createID() + '-' + count;
			me.commands.storeConfirmationID(consString, userFound.userID, function (err) {
				if (err) {
					return cb(err);
				}
				mail.sendPasswordReset(email, consString, function (err) {
					if (err) {
						return cb(err);
					}
					cb();
				});
			});
		});
	};

	me.commands.storeConfirmationID = function (consString, userID, cb) {
		var sql2 = 'Update User SET considerationString = ? WHERE User.userID = ?';
		database.updateSql(sql2, [consString, userID], function (err) {
			if (err) {
				return cb(err);
			}
			cb();
		});
	};

	me.commands.passwordReset = function (consString, password, passwordrepeat, cb) {
		if (!consString) {
			return cb(consts.errors.INVALID_PWRESET_ID);
		}
		if (password !== passwordrepeat) {
			return cb(consts.errors.PASSWORD_WRONG);
		}
		me.commands.getUserByConfirmationId(consString, function (err, user) {
			if (!user) {
				return cb(consts.errors.INVALID_PWRESET_ID);
			}
			if (err) {
				return cb(err);
			}
			me.commands.changeUserPw(user.userID, password, function (err) {
				if (err) {
					return cb(err);
				}
				me.commands.storeConfirmationID(Utils.createID(), user.userID, function (err) {
					if (err) {
						return cb(err);
					}
					cb();
				});
			});
		});
	};

	me.commands.confirmUser = function (consString, cb) {
		if (!consString) {
			return cb(consts.errors.INVALID_CONFIRMATION_ID);
		}
		me.commands.getUserByConfirmationId(consString, function (err, user) {
			if (err) {
				return cb(err);
			}
			if (!user) {
				return cb(consts.errors.USER_NOT_FOUND);
			}
			if (user.considered) {
				return cb(consts.errors.USER_IS_REGISTERED);
			}
			var sql2 = 'Update User SET considered = 1 WHERE User.userID = ?';
			database.updateSql(sql2, [user.userID], function (err) {
				if (err) {
					return cb(err);
				}
				user.considered = 1;
				ep.etherpad_addUser(user.userID, function (err) {
					if (err) {
						return cb(err);
					}
					cb(null, user);
				});
			});
		});
	};

	me.commands.deleteUser = function (userID, cb) {
		me.getUser(userID, function (err, user) {
			if (err) {
				return cb(err);
			}
			var sql = 'DELETE FROM User where User.userID = ?';
			database.deleteSql(sql, [userID], function (err) {
				if (err) {
					return cb(err);
				}
				var sql2 = 'DELETE FROM UserGroup where UserGroup.userID = ?';
				database.deleteSql(sql2, [userID], function (err) {
					if (err) {
						return cb(err);
					}
					if (user.considered === 1) {
						ep.etherpad_deleteUser(userID, cb);
					} else {
						cb();
					}
				});
			});
		});
	};

	me.commands.deleteNotRegUser = function (groupID, username, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		if (!username) {
			return cb(consts.errors.INVALID_USER_NAME);
		}
		var deleteNotRegisteredSql = 'DELETE FROM NotRegisteredUsersGroups WHERE groupID = ? and email = ?';
		database.updateSql(deleteNotRegisteredSql, [groupID, username], function (err) {
			cb(err, !err);
		});
	};

	me.commands.changeUserEMail = function (userID, newEmail, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		newEmail = (newEmail || '').toString().trim();
		if (newEmail.length === 0) {
			return cb(consts.errors.NO_VALID_MAIL);
		}
		if (!Utils.isValidMail(newEmail)) {
			return cb(consts.errors.NO_VALID_MAIL);
		}
		var updateUserSql = 'UPDATE User SET name = ? WHERE userID= ?';
		database.updateSql(updateUserSql, [newEmail, userID], function (err) {
			cb(err, !err);
		});
	};

	me.commands.changeUserName = function (userID, newUserName, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		newUserName = (newUserName || '').toString().trim();
		if (newUserName.length === 0) {
			return cb(consts.errors.INVALID_USER_NAME);
		}
		var updateUserSql = 'UPDATE User SET FullName = ? WHERE userID= ?';
		database.updateSql(updateUserSql, [newUserName, userID], function (err) {
			cb(err, !err);
		});
	};

	me.commands.changeUserPw = function (userID, newPW, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		if (!newPW) {
			return cb(consts.errors.INVALID_PASSWORD);
		}
		var salt = Utils.createSalt();
		var encrypted = Utils.encryptPassword(newPW, salt);
		var updateUserSql = 'UPDATE User SET pwd = ?, salt = ? WHERE userID= ?';
		database.updateSql(updateUserSql, [encrypted, salt, userID], function (err) {
			cb(err, !err);
		});
	};

	me.commands.reinviteUser = function (groupID, userID, fromname, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		me.getGroup(groupID, function (err, group) {
			if (err) {
				return cb(err);
			}
			if (!group) {
				return cb(consts.errors.GROUP_NOT_FOUND);
			}
			me.commands.getUser(userID, function (err, user) {
				if (err) {
					return cb(err);
				}
				if (!user) {
					return cb(consts.errors.USER_NOT_FOUND);
				}
				mail.sendInviteUnregistered(user.email, group.name, fromname, function (err) {
					cb(err, !err);
				});
			});
		});
	};

	me.commands.checkInvitations = function (email, userID, cb) {
		if (!email) {
			return cb(consts.errors.INVALID_USER_MAIL);
		}
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		var sql = 'SELECT * FROM NotRegisteredUsersGroups WHERE email = ?';
		database.getSql(sql, [email], function (err, results) {
			if (err) {
				return cb(err);
			}
			async.forEachSeries(results, function (notReg, next) {
				var sql2 = 'INSERT INTO UserGroup VALUES(?, ?, 2)';
				database.updateSql(sql2, [userID, notReg.groupID], function (err) {
					if (err) {
						return cb(err);
					}
					var sql3 = 'DELETE FROM NotRegisteredUsersGroups WHERE groupID = ? and email = ?';
					database.updateSql(sql3, [notReg.groupID, email], function (err) {
						if (err) {
							return cb(err);
						}
						next();
					});
				});
			}, cb);
		});
	};

	me.commands.isPadInGroup = function (groupID, padName, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		if (!padName) {
			return cb(consts.errors.INVALID_PAD_NAME);
		}
		var sql = 'SELECT * from GroupPads where GroupPads.GroupID = ? and GroupPads.PadName = ?';
		database.existValueInDatabase(sql, [groupID, padName], cb);
	};

	me.commands.groupExists = function (groupName, cb) {
		if (!groupName) {
			return cb(consts.errors.INVALID_GROUP_NAME);
		}
		var sql = 'SELECT * FROM Groups WHERE Groups.name = ?';
		database.getSql(sql, [groupName], function (err, results) {
			if (err) {
				return cb(err);
			}
			cb(null, results.length > 0);
		});
	};

	me.commands.padExists = function (groupID, padName, cb) {
		if (!padName) {
			return cb(consts.errors.INVALID_PAD_NAME);
		}
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		var sql = 'SELECT * FROM GroupPads WHERE PadName = ? AND GroupID = ?';
		database.existValueInDatabase(sql, [padName, groupID], function (err, found) {
			cb(err, found);
		});
	};

	me.commands.deletePad = function (groupID, padName, cb) {
		me.commands.padExists(groupID, padName, function (err, exists) {
			if (err) {
				return cb(err);
			}
			if (!exists) {
				return cb(consts.errors.PAD_NOT_FOUND);
			}
			var sql = 'DELETE FROM GroupPads WHERE GroupPads.PadName = ? and GroupPads.GroupID = ?';
			database.deleteSql(sql, [padName, groupID], function (err) {
				if (err) {
					return cb(err);
				}
				ep.etherpad_deletePad(padName, groupID, function (err) {
					cb(err);
				});
			});
		});
	};

	me.commands.createGroup = function (groupName, cb) {
		if (!groupName) {
			return cb(consts.errors.INVALID_GROUP_NAME);
		}
		me.commands.groupExists(groupName, function (err, groupExist) {
			if (err) {
				return cb(err);
			}
			if (groupExist) {
				return cb(consts.errors.GROUP_EXISTS);
			}
			var addGroupSql = 'INSERT INTO Groups VALUES(null, ?)';
			database.insertSql(addGroupSql, [groupName], function (err, newId) {
				if (err) {
					return cb(err);
				}
				ep.etherpad_addGroup(newId, function () {
					if (err) {
						return cb(err);
					}
					cb(null, newId);
				});
			});
		});
	};

	me.commands.createPad = function (groupID, padName, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		if (!padName) {
			return cb(consts.errors.INVALID_PAD_NAME);
		}
		me.commands.padExists(groupID, padName, function (err, exists) {
			if (exists) {
				return cb(consts.errors.PAD_EXISTS);
			}
			var sql = 'INSERT INTO GroupPads VALUES(?, ?)';
			database.insertSql(sql, [groupID, padName], function (err, newId) {
				if (err) {
					return cb(err);
				}
				ep.etherpad_addPad(padName, groupID, function (err) {
					cb(err, newId);
				});
			});
		});
	};

	me.commands.getPadsOfGroup = function (groupID, term, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		var allPads = [];
		var sql = 'SELECT * FROM GroupPads WHERE GroupPads.GroupID = ? and GroupPads.PadName like ?';
		database.getSql(sql, [groupID, '%' + term + '%'], function (err, results) {
			if (err) {
				return cb(err);
			}
			async.forEachSeries(results, function (foundPad, next) {
				if (!foundPad.PadName || foundPad.PadName.length === 0) {
					return next();
				}
				var pad = {};
				pad.name = foundPad.PadName;
				ep.getPadInfos(groupID, pad.name, function (err, info) {
					pad.isProtected = info.isProtected;
					pad.lastedit = info.lastedit;
					allPads.push(pad);
					next();
				});
			}, function () {
				cb(null, allPads)
			});
		});
	};

	me.commands.loginPad = function (userID, groupID, padName, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		if (!padName) {
			return cb(consts.errors.INVALID_PAD_NAME);
		}
		me.commands.padExists(groupID, padName, function (err, exists) {
			if (err) {
				return cb(err);
			}
			if (!exists) {
				return cb(consts.errors.PAD_NOT_FOUND);
			}
			ep.createPadSession(groupID, userID, padName, function (err, padUrl, sessionID) {
				if (err) {
					return cb(err);
				}
				cb(err, padUrl, sessionID);
			});
		});
	};

	me.commands.deleteGroup = function (groupID, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		var sqls =
			[
				'DELETE FROM Groups WHERE Groups.groupID = ?',
				'DELETE FROM UserGroup WHERE UserGroup.groupID = ?',
				'DELETE FROM GroupPads WHERE GroupPads.groupID = ?',
				'DELETE FROM NotRegisteredUsersGroups WHERE NotRegisteredUsersGroups.groupID = ?'
			];
		async.forEachSeries(sqls, function (sql, next) {
			database.deleteSql(sql, [groupID], function (err) {
				if (err) {
					return cb(err);
				}
				next();
			});
		}, function () {
			ep.etherpad_deleteGroup(groupID, function (err) {
				cb(err);
			});
		});
	};

	me.commands.getUserGroups = function (userID, cb) {
		var sql = 'SELECT * FROM Groups inner join UserGroup on(UserGroup.groupID = Groups.groupID) WHERE UserGroup.userID = ?';
		database.getSql(sql, [userID], function (err, groups) {
			cb(err, groups);
		});
	};

	me.commands.searchGroups = function (userID, term, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		var sql = 'SELECT * FROM Groups inner join UserGroup on(UserGroup.groupID = Groups.groupID) WHERE UserGroup.userID = ? and Groups.name like ?';
		database.getSql(sql, [userID, '%' + term + '%'], function (err, groups) {
			cb(err, groups);
		});
		/*
		 var sql = 'Select * from UserGroup where UserGroup.userID = ?';
		 database.getSql(sql, [userID], function (err, groups) {
		 if (err) return cb(err);
		 var allGroups = [];
		 async.forEachSeries(groups, function (foundGroup, next) {
		 var sql = 'Select * from Groups where Groups.groupID = ? and Groups.name like ?';
		 database.getSql(sql, [foundGroup.groupID, '%' + term + '%'], function (err, groups) {
		 allGroups.push({
		 id: foundGroup.groupID,
		 name: groups[0].name
		 });
		 next();
		 });
		 }, function () {
		 cb(null, allGroups);
		 })
		 });
		 */
	};

	me.commands.setPadPassword = function (groupID, padName, pw, cb) {
		ep.etherpad_setPadPassword(groupID, padName, pw, cb);
	};

	me.commands.searchUsers = function (term, cb) {
		var sql = 'Select * from User where User.name like ?';
		database.getSql(sql, ['%' + term + '%'], function (err, users) {
			if (err) {
				return cb(err);
			}
			cb(null, users);
		});
	};

	me.commands.searchUsersInGroup = function (groupID, term, userID, cb) {
		if (!groupID) {
			return cb(consts.errors.INVALID_GROUP_ID);
		}
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		var sql = 'SELECT User.name, User.FullName, User.userID, UserGroup.Role FROM User INNER JOIN UserGroup on(UserGroup.userID = User.userID) WHERE User.userID not in (?) and User.userID in (SELECT UserGroup.userID FROM UserGroup WHERE groupID = ?) and UserGroup.groupID = ? and User.name like ?';
		database.getSql(sql, [userID, groupID, groupID, '%' + term + '%'], function (err, users) {
			var sql2 = 'SELECT * FROM NotRegisteredUsersGroups WHERE groupID = ?';
			database.getSql(sql2, [groupID], function (err, notRegistered) {
				if (err) {
					return cb(err);
				}
				users = users.concat(notRegistered.map(function (user) {
					return {
						name: user.email,
						notRegistered: true
					};
				}));
				cb(null, users);
			});
		});
	};

	me.commands.searchUngroupedUsers = function (groupID, term, cb) {
		var sql = 'select distinct User.name, User.userID from User left join UserGroup on(UserGroup.userID = User.userID) where User.userId NOT IN ' +
			'(Select distinct UserGroup.userID from UserGroup where UserGroup.groupID = ?) and User.name like ?';
		database.getSql(sql, [groupID, '%' + term + '%'], function (err, users) {
			if (err) {
				return cb(err);
			}
			cb(null, users);
		});
	};

	me.commands.searchUserPads = function (userID, term, cb) {
		// TODO: JOIN requests
		var sql = 'Select * from UserGroup where UserGroup.userID = ?';
		database.getSql(sql, [userID], function (err, groups) {
			if (err) {
				return cb(err);
			}
			var allPads = [];
			async.forEachSeries(groups, function (group, next) {
				var sql2 = 'Select * from GroupPads where GroupPads.GroupID = ? and GroupPads.PadName like ?';
				database.getSql(sql2, [group.groupID, term], function (err, pads) {
					if (err) {
						return cb(err);
					}
					allPads = allPads.concat(pads);
					next();
				});
			}, function () {
				cb(err, allPads);
			});
		});
	};

	me.commands.getUserPads = function (userID, cb) {
		// TODO: JOIN requests
		var sql = 'SELECT * FROM Groups inner join UserGroup on(UserGroup.groupID = Groups.groupID) WHERE UserGroup.userID = ?';
		database.getSql(sql, [userID], function (err, groups) {
			if (err) {
				return cb(err);
			}
			var allPads = [];
			async.forEachSeries(groups, function (group, next) {
				var sql2 = 'Select * from GroupPads where GroupPads.GroupID = ?';
				database.getSql(sql2, [group.groupID], function (err, foundPads) {
					if (err) {
						return cb(err);
					}
					async.forEachSeries(foundPads, function (foundPad, nextPad) {
						if (!foundPad.PadName || foundPad.PadName.length === 0) {
							return next();
						}
						if (err) {
							return cb(err);
						}
						var pad = {};
						pad.name = foundPad.PadName;
						pad.groupID = group.groupID;
						pad.groupName = group.name;
						ep.getPadInfos(group.groupID, pad.name, function (err, info) {
							pad.isProtected = info.isProtected;
							pad.lastedit = info.lastedit;
							pad.lastedit_ts = info.lastedit_ts;
							allPads.push(pad);
							nextPad();
						});
					}, function () {
						next();
					});
				});
			}, function () {
				allPads = allPads.sort(function (a, b) {
					return a.lastedit_ts - b.lastedit_ts;
				});
				cb(err, allPads);
			});
		});
	};

	me.commands.searchGroupUsers = function (groupID, term, cb) {
		var sql = 'Select * from UserGroup where UserGroup.groupID = ?';
		database.getSql(sql, [groupID], function (err, groups) {
			if (err) {
				return cb(err);
			}
			var all = [];
			async.forEachSeries(groups, function (group, next) {
				var sql2 = 'Select * from User where User.userID = ? and User.name like ?';
				database.getSql(sql2, [group.userID, '%' + term + '%'], function (err, users) {
					if (err) {
						return cb(err);
					}
					users[0].Role = group.Role;
					all.push(users[0]);
					next();
				});
			}, function () {
				cb(err, all);
			});
		});
	};

	me.commands.searchGroup = function (term, cb) {
		var sql = 'Select * from Groups where Groups.name like ?';
		database.getSql(sql, ['%' + term + '%'], function (err, groups) {
			if (err) {
				return cb(err);
			}
			async.forEachSeries(groups, function (group, next) {
				me.commands.countUsersInGroup(group.groupID, function (err, amount) {
					group.amAuthors = amount;
					next();
				});
			}, function () {
				cb(null, groups);
			})
		});
	};

	me.commands.searchGroupNotInUser = function (userID, term, cb) {
		var sql = 'select distinct Groups.name, Groups.groupID from Groups left join UserGroup on(UserGroup.groupID = Groups.groupID) where Groups.groupID NOT IN ' +
			'(Select distinct UserGroup.groupID from UserGroup where UserGroup.userID = ?) and Groups.name like ?';
		database.getSql(sql, [userID, '%' + term + '%'], function (err, groups) {
			if (err) {
				return cb(err);
			}
			cb(null, groups)
		});
	};

	me.getGroup = function (groupID, cb) {
		me.commands.getGroup(groupID, cb);
	};

	me.searchUsers = function (groupID, term, userID, cb) {
		me.commands.isUserInGroup(userID, groupID, function (err, inGroup) {
			if (err) {
				return cb(err);
			}
			if (!inGroup) {
				return cb(consts.errors.MUST_BE_IN_GROUP);
			}
			me.commands.searchUsersInGroup(groupID, term, userID, cb);
		});
	};

	me.isUserInGroup = function (userID, groupID, cb) {
		me.commands.isUserInGroup(userID, groupID, cb);
	};

	me.getGroupUsers = function (groupID, userID, cb) {
		me.commands.isUserInGroup(userID, groupID, function (err, inGroup) {
			if (err) {
				return cb(err);
			}
			if (!inGroup) {
				return cb(consts.errors.MUST_BE_IN_GROUP);
			}
			me.commands.getGroupUsers(groupID, function (err, users) {
				if (err) {
					return cb(err);
				}
				cb(err, users);
			});
		});
	};

	me.login = function (username, password, cb) {
		me.commands.login(username, password, cb);
	};

	me.getUser = function (userID, cb) {
		me.commands.getUser(userID, cb);
	};

	me.requestPasswordReset = function (email, cb) {
		me.commands.requestPasswordReset(email, cb);
	};

	me.passwordReset = function (confirmation, password, passwordrepeat, cb) {
		me.commands.passwordReset(confirmation, password, passwordrepeat, cb);
	};

	me.getPasswordResetUser = function (consString, cb) {
		me.commands.getUserByConfirmationId(consString, function (err, user) {
			if (!user) {
				return cb(consts.errors.INVALID_PWRESET_ID);
			}
			if (err) {
				return cb(err);
			}
			cb(null, user);
		});
	};

	me.inviteUser = function (groupID, email, user, cb) {
		me.commands.isUserOwnerOfGroup(user.userID, groupID, function (err, isOwner) {
			if (err) {
				return cb(err);
			}
			if (!isOwner) {
				return cb(consts.errors.MUST_BE_OWNER);
			}
			me.commands.inviteUser(groupID, email, user.FullName, cb);
		});
	};

	me.inviteUsers = function (groupID, emails, user, cb) {
		me.commands.isUserOwnerOfGroup(user.userID, groupID, function (err, isOwner) {
			if (err) {
				return cb(err);
			}
			if (!isOwner) {
				return cb(consts.errors.MUST_BE_OWNER);
			}
			me.commands.inviteUsers(groupID, emails, user.FullName, cb);
		});
	};

	me.confirmUser = function (consString, cb) {
		me.commands.confirmUser(consString, cb);
	};

	me.deleteUser = function (userID, cb) {
		me.commands.isUserOwnerOfAnyGroup(userID, function (err, exist) {
			if (err) {
				return cb(err);
			}
			if (exist) {
				return cb(consts.errors.MUST_NOT_BE_OWNER);
			}
			me.commands.deleteUser(userID, cb);
		});
	};

	me.deleteNotRegUser = function (groupID, username, userID, cb) {
		me.commands.isUserOwnerOfGroup(userID, groupID, function (err, isOwner) {
			if (err) {
				return cb(err);
			}
			if (!isOwner) {
				return cb(consts.errors.MUST_BE_OWNER);
			}
			me.commands.deleteNotRegUser(groupID, username, cb);
		});
	};

	me.changeUserEMail = function (userID, newEmail, cb) {
		me.commands.changeUserEMail(userID, newEmail, cb);
	};

	me.changeUserName = function (userID, newUserName, cb) {
		me.commands.changeUserName(userID, newUserName, cb);
	};

	me.changeUserPw = function (userID, newPW, oldPW, user, cb) {
		newPW = (newPW || '').toString().trim();
		oldPW = (oldPW || '').toString().trim();
		if (newPW.length === 0 || oldPW.length === 0) {
			return cb(consts.errors.PW_EMPTY);
		}
		var encrypted = Utils.encryptPassword(oldPW, user.salt);
		if (user.pwd !== encrypted) {
			return cb(consts.errors.INVALID_PASSWORD);
		}

		me.commands.changeUserPw(userID, newPW, cb);
	};

	me.registerUser = function (name, email, password, passwordrepeat, cb) {
		if (password !== passwordrepeat) {
			return cb(consts.errors.PASSWORD_WRONG);
		}
		if (!Utils.isValidMail(email)) {
			return cb(consts.errors.NO_VALID_MAIL);
		}
		me.commands.registerUser(name, email, password, cb);
	};

	me.reinviteUser = function (groupID, userID, sender, cb) {
		me.commands.isUserOwnerOfGroup(sender.userID, groupID, function (err, isOwner) {
			if (err) {
				return cb(err);
			}
			if (!isOwner) {
				return cb(consts.errors.MUST_BE_OWNER);
			}
			me.commands.reinviteUser(groupID, userID, sender.FullName, cb);
		});
	};

	me.createGroup = function (userID, groupName, cb) {
		if (!userID) {
			return cb(consts.errors.INVALID_USER_ID);
		}
		me.commands.createGroup(groupName, function (err, newId) {
			if (err) {
				return cb(err);
			}
			me.commands.addUserToGroup(userID, newId, true, function (err) {
				if (err) {
					return cb(err);
				}
				cb(null, newId);
			});
		});
	};

	me.createPad = function (groupID, padName, userID, cb) {
		me.commands.isUserInGroup(userID, groupID, function (err, inGroup) {
			if (err) {
				return cb(err);
			}
			if (!inGroup) {
				return cb(consts.errors.MUST_BE_IN_GROUP);
			}
			me.commands.createPad(groupID, padName, cb);
		});
	};

	me.padLogin = function (groupID, padName, userID, cb) {
		me.commands.isUserInGroup(userID, groupID, function (err, isInGroup) {
			if (err) {
				return cb(err);
			}
			if (!isInGroup) {
				return cb(consts.errors.MUST_BE_IN_GROUP);
			}
			me.commands.getGroup(groupID, function (err, group) {
				if (err) {
					return cb(err);
				}
				if (!group) {
					return cb(consts.errors.GROUP_NOT_FOUND);
				}
				me.commands.loginPad(userID, groupID, padName, function (err, padUrl, sessionID) {
					if (err) {
						return cb(err);
					}
					cb(null, group, padUrl, sessionID);
				});
			});
		});
	};

	me.deleteUserFromGroup = function (groupUserId, groupID, userID, cb) {
		me.commands.isUserOwnerOfGroup(userID, groupID, function (err, isOwner) {
			if (err) {
				return cb(err);
			}
			if (!isOwner) {
				return cb(consts.errors.MUST_BE_OWNER);
			}
			me.commands.deleteUserFromGroup(groupUserId, groupID, cb);
		});
	};

	me.deleteGroup = function (groupID, userID, cb) {
		me.commands.isUserOwnerOfGroup(userID, groupID, function (err, isOwner) {
			if (err) {
				return cb(err);
			}
			if (!isOwner) {
				return cb(consts.errors.MUST_BE_OWNER);
			}
			me.commands.deleteGroup(groupID, cb);
		});
	};

	me.makeOwner = function (newUserID, groupID, userID, cb) {
		me.commands.isUserOwnerOfGroup(userID, groupID, function (err, isOwner) {
			if (err) {
				return cb(err);
			}
			if (!isOwner) {
				return cb(consts.errors.MUST_BE_OWNER);
			}
			me.commands.makeOwner(newUserID, groupID, cb);
		});
	};

	me.searchGroups = function (userID, term, cb) {
		me.commands.searchGroups(userID, term, cb);
	};

	me.getUserGroups = function (userID, cb) {
		me.commands.getUserGroups(userID, cb);
	};

	me.searchPads = function (groupID, term, userID, cb) {
		me.commands.isUserInGroup(userID, groupID, function (err, isIn) {
			if (err) {
				return cb(err);
			}
			if (!isIn) {
				return cb(consts.errors.MUST_BE_IN_GROUP);
			}
			me.commands.getGroup(groupID, function (err, group) {
				if (err) {
					return cb(err);
				}
				if (!group) {
					return cb(consts.errors.GROUP_NOT_FOUND);
				}
				me.commands.getPadsOfGroup(groupID, term, function (err, pads) {
					cb(err, group, pads);
				});
			});
		});
	};

	me.getGroupInfo = function (groupID, userID, cb) {
		me.commands.isUserInGroup(userID, groupID, function (err, isInGroup) {
			if (err) {
				return cb(err);
			}
			if (!isInGroup) {
				return cb(consts.errors.MUST_BE_IN_GROUP);
			}
			me.commands.getGroup(groupID, function (err, group) {
				if (err) {
					return cb(err);
				}
				if (!group) {
					return cb(consts.errors.GROUP_NOT_FOUND);
				}
				me.commands.getGroupUsers(groupID, function (err, users) {
					if (err) {
						return cb(err);
					}
					me.commands.getPadsOfGroup(groupID, '', function (err, pads) {
						if (err) {
							return cb(err);
						}
						me.commands.isUserOwnerOfGroup(userID, groupID, function (err, isOwner) {
							if (err) {
								return cb(err);
							}
							cb(null, group, pads, isOwner, users);
						});
					});
				});
			});
		});
	};

	me.deletePad = function (groupID, padName, userID, cb) {
		me.commands.isUserOwnerOfGroup(userID, groupID, function (err, isOwner) {
			if (err) {
				return cb(err);
			}
			if (!isOwner) {
				return cb(consts.errors.MUST_BE_OWNER);
			}
			me.commands.deletePad(groupID, padName, cb);
		});
	};

	me.setPadPassword = function (groupID, userID, padName, pw, cb) {
		me.commands.isUserOwnerOfGroup(userID, groupID, function (err, isOwner) {
			if (err) {
				return cb(err);
			}
			if (!isOwner) {
				return cb(consts.errors.MUST_BE_OWNER);
			}
			me.commands.setPadPassword(groupID, padName, pw, cb);
		});
	};

	me.getUserPads = function (userID, cb) {
		me.commands.getUserPads(userID, cb);
	};

	/* admin */

	me.adminDeleteUser = function (userID, hard, cb) {
		me.commands.isUserOwnerOfAnyGroup(userID, function (err, isOwner) {
			if (err) {
				return cb(err);
			}
			if (isOwner && !hard) {
				return cb(consts.errors.USER_IS_OWNER);
			}
			me.commands.deleteUser(userID, cb);
		});
	};

	me.adminDeleteUserFromGroup = function (userID, groupID, cb) {
		me.commands.deleteUserFromGroup(userID, groupID, cb);
	};

	me.adminMakeUserOwnerFromGroup = function (userID, groupID, cb) {
		me.commands.makeOwner(userID, groupID, cb);
	};

	me.adminSearchGroupsOfUser = function (userID, term, cb) {
		me.commands.searchGroups(userID, term, cb);
	};

	me.adminGetUser = function (userID, cb) {
		me.commands.getUser(userID, function (err, user) {
			if (err) {
				return cb(err);
			}
			cb(null, me.repackageUser(user));
		});
	};

	me.repackageUser = function (user) {
		return {
			name: user.FullName,
			email: user.name,
			userID: user.userID,
			considered: user.considered,
			Role: user.Role,
			active: user.active
		};
	};

	me.adminDeletePad = function (groupID, padName, cb) {
		me.commands.deletePad(groupID, padName, cb);
	};

	me.adminDeactivateUser = function (userID, cb) {
		me.commands.setUserActive(userID, false, cb);
	};

	me.adminActivateUser = function (userID, cb) {
		me.commands.setUserActive(userID, true, cb);
	};

	me.adminAddUser = function (name, email, password, cb) {
		me.commands.addUser(name, email, password, cb);
	};

	me.adminSearchUsers = function (term, cb) {
		me.commands.searchUsers(term, function (err, users) {
			var result = [];
			async.forEachSeries(users, function (user, next) {
				if (err) {
					return cb(err);
				}
				var u = me.repackageUser(user);
				result.push(u);
				me.commands.countGroupsOfUser(u.userID, function (err, amount) {
					u.amGroups = amount;
					next();
				});
			}, function () {
				cb(null, result);
			})
		});
	};

	me.adminSearchPadsOfUser = function (userID, term, cb) {
		me.commands.searchUserPads(userID, term, cb);
	};

	me.adminSendNewPassword = function (userId, cb) {
		me.commands.sendNewPassword(userId, cb);
	};

	me.adminDeleteGroup = function (groupID, cb) {
		me.commands.deleteGroup(groupID, cb);
	};

	me.adminCreateGroup = function (groupName, cb) {
		me.commands.createGroup(groupName, cb);
	};

	me.adminDirectToPad = function (userID, groupID, padName, cb) {
		me.commands.loginPad(userID, groupID, padName, cb);
	};

	me.adminGetGroup = function (groupID, cb) {
		me.commands.getGroup(groupID, cb);
	};

	me.adminSearchPads = function (groupID, term, cb) {
		me.commands.getPadsOfGroup(groupID, term, cb);
	};

	me.adminSearchUngroupedUsers = function (groupID, term, cb) {
		me.commands.searchUngroupedUsers(groupID, term, function (err, users) {
			if (err) {
				return cb(err);
			}
			cb(null, users.map(function (user) {
				return me.repackageUser(user);
			}));
		});
	};

	me.adminSearchGroupUsers = function (groupID, term, cb) {
		me.commands.searchGroupUsers(groupID, term, function (err, users) {
			if (err) {
				return cb(err);
			}
			cb(null, users.map(function (user) {
				return me.repackageUser(user);
			}));
		});
	};

	me.adminSearchGroup = function (term, cb) {
		me.commands.searchGroup(term, cb);
	};

	me.adminSearchGroupNotInUser = function (userID, term, cb) {
		me.commands.searchGroupNotInUser(userID, term, cb);
	};

	me.adminAddUserToGroup = function (userID, groupID, cb) {
		me.commands.isUserInGroup(userID, groupID, function (err, isInGroup) {
			if (err) {
				return cb(err);
			}
			if (isInGroup) {
				return cb(consts.errors.USER_IN_GROUP);
			}
			me.commands.addUserToGroup(userID, groupID, false, cb);
		});
	};

	me.adminAddPadToGroup = function (groupID, padName, cb) {
		me.commands.isPadInGroup(groupID, padName, function (err, bool) {
			if (bool) {
				return cb(consts.errors.PAD_IN_GROUP);
			}
			me.commands.addPadToGroup(groupID, padName, cb);
		});
	};

}

module.exports = Backend;
