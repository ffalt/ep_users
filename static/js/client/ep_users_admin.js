var ep_users_admin = {};

/*global io */

var columns = {
	'id': {
		asc: function (a, b) {
			return a.id - b.id;
		}, desc: function (a, b) {
			return b.id - a.id;
		}
	},
	'name': {
		asc: function (a, b) {
			var nameA = (a.name || '').toLowerCase(), nameB = (b.name || '').toLowerCase();
			if (nameA < nameB) //sort string ascending
			{
				return -1;
			}
			if (nameA > nameB) {
				return 1;
			}
			return 0; //default return value (no sorting)
		}, desc: function (a, b) {
			var nameA = (a.name || '').toLowerCase(), nameB = (b.name || '').toLowerCase();
			if (nameA < nameB) //sort string desc
			{
				return 1;
			}
			if (nameA > nameB) {
				return -1;
			}
			return 0; //default return value (no sorting)
		}
	},
	'email': {
		asc: function (a, b) {
			var nameA = (a.email || '').toLowerCase(), nameB = (b.email || '').toLowerCase();
			if (nameA < nameB) //sort string ascending
			{
				return -1;
			}
			if (nameA > nameB) {
				return 1;
			}
			return 0; //default return value (no sorting)
		}, desc: function (a, b) {
			var nameA = (a.email || '').toLowerCase(), nameB = (b.email || '').toLowerCase();
			if (nameA < nameB) //sort string desc
			{
				return 1;
			}
			if (nameA > nameB) {
				return -1;
			}
			return 0; //default return value (no sorting)
		}
	},
	'groups': {
		asc: function (a, b) {
			return a.amGroups - b.amGroups;
		}, desc: function (a, b) {
			return b.amGroups - a.amGroups;
		}
	},
	'authors': {
		asc: function (a, b) {
			return a.amAuthors - b.amAuthors;
		}, desc: function (a, b) {
			return b.amAuthors - a.amAuthors;
		}
	}
};

var connectSocket = function (nr) {
	var loc = document.location, port = loc.port === '' ? (loc.protocol === 'https:' ? 443 : 80) : loc.port;
	var url = loc.protocol + '//' + loc.hostname + ':' + port + '/pluginfw/admin/user_pad';
	var pathComponents = location.pathname.split('/');
	var baseURL = pathComponents.slice(0, pathComponents.length - nr).join('/') + '/';
	var resource = baseURL.substring(1) + 'socket.io';
	return io.connect(url, {resource: resource});
};

var extractURLParameter = function (name) {
	var querystring = document.location.search;
	if (querystring === '') {
		return '';
	}
	var list = querystring.slice(1).split('&');
	var o = {};
	list.forEach(function (line) {
		var sl = line.split('=');
		var key = unescape(sl[0]).replace('+', ' ');
		o[key] = unescape(sl[1]).replace('+', ' ');
	});
	return o[name];
};

var sortColumnByField = function (list, field, ascend) {
	var text = field.toLowerCase();
	var sorter = columns[text];
	if (sorter) {
		list.sort(sorter[ascend ? 'asc' : 'desc']);
	}
};

var logError = function (err) {
	// eslint-disable-next-line no-console
	console.log(err);
};

ep_users_admin.users = function (hooks, context) {
	var socket = connectSocket(3);

	var currentUsers = [];
	var widget = $('.user-results-div');

	var searchUser = function (searchTerm) {
		setInfo('');
		socket.emit('search-all-user', searchTerm, function (err, users) {
			if (err) {
				return logError(err);
			}
			if (!users || users.length === 0) {
				return setInfo('No users!');
			}
			currentUsers = users;
			sortColumnByField(currentUsers, 'name', true);
			showUsers(currentUsers);
		});
	};

	var reload = function () {
		searchUser('');
	};

	var handlers = function () {
		$('.sort.up').unbind('click').click(function (e) {
			var row = $(e.target).closest('th');
			var field = $(row).data('field');
			sortColumnByField(currentUsers, field, true);
			showUsers(currentUsers);
		});
		$('.sort.down').unbind('click').click(function (e) {
			var row = $(e.target).closest('th');
			var field = $(row).data('field');
			sortColumnByField(currentUsers, field, false);
			showUsers(currentUsers);
		});
		$('#addUserButton').unbind('click').click(function (e) {
			socket.emit('add-user', $('#name-of-user').val(), $('#email-of-user').val(), $('#pw-of-user').val(), function (err) {
				if (!err) {
					setInfo('User added!');
					reload();
				} else {
					setInfo(err);
				}
			});
		});
	};

	var setInfo = function (info) {
		$('#textfield-info').html(info);
	};

	var showUsers = function (users) {
		var resultList = widget.find('.user-results');
		resultList.html('');

		function createRow(user) {
			var row = widget.find('.template tr').clone();
			row.find('.id').html(user.userID);
			row.find('.name').html('<a href = "users/user?id=' + user.userID + '" class="userName">' + user.name + '</a>');
			row.find('.email').html(user.email);
			row.find('.groups').html(user.amGroups);
			row.find('.deleteButton').bind('click', function (e) {
				e.preventDefault();
				if (!confirm('Delete User?')) {
					return;
				}
				var hard = false;
				socket.emit('delete-user', user.userID, false, function (err) {
					if (err) {
						if (confirm(err + '! Are you sure to delete this user?')) {
							hard = true;
							socket.emit('delete-user', user.userID, hard, function (err) {
								if (err) {
									logError(err);
								} else {
									reload();
								}
							});
						}
					} else {
						reload();
					}

				});
			});
			row.find('.newPWButton').bind('click', function (e) {
				e.preventDefault();
				if (!confirm('Are you sure to you want to reset the password and send an email?')) {
					return;
				}
				setInfo('');
				socket.emit('send-new-pw-user', user.userID, function (err) {
					if (!err) {
						setInfo('New Password sent.');
					} else {
						logError(err);
					}
				});
			});
			if (user.active) {
				row.find('.setActiveBtn').val('Deactivate');
				row.find('.setActiveBtn').bind('click', function (e) {
					e.preventDefault();
					var conf = confirm('Are you sure to you want to deactivate the user?');
					if (!conf) {
						return;
					}
					socket.emit('deactivate-user', user.userID, function (err) {
						if (err) {
							logError(err)
						} else {
							reload();
						}
					});
				});
			}
			else {
				row.find('.setActiveBtn').val('Activate');
				row.find('.setActiveBtn').bind('click', function (e) {
					e.preventDefault();
					if (!confirm('Are you sure to you want to activate the user?')) {
						return;
					}
					socket.emit('activate-user', user.userID, function (err) {
						if (err) {
							logError(err)
						} else {
							reload();
						}
					});
				});
			}
			return row;
		}

		users.forEach(function (user) {
			resultList.append(createRow(user));
		});
	};

	handlers();
	reload();
};

ep_users_admin.groups = function (hooks, context) {
	var socket = connectSocket(3);

	var currentGroups = [];
	var widget = $('.group-results-div');

	var searchGroup = function (searchTerm) {
		socket.emit('search-group', searchTerm, function (err, allGroups) {
			if (err) {
				return logError(err);
			}
			currentGroups = allGroups;
			sortColumnByField(currentGroups, 'name', true);
			showGroups(currentGroups);
		});
	};

	var reload = function () {
		searchGroup('');
	};

	var addGroup = function (name) {
		socket.emit('add-group', name, function (err) {
			if (!err) {
				setInfo('Group added!');
				reload();
			} else {
				setInfo(err);
			}
		});
	};

	var handlers = function () {
		$('.sort.up').unbind('click').click(function (e) {
			var row = $(e.target).closest('th');
			var field = $(row).data('field');
			sortColumnByField(currentGroups, field, true);
			showGroups(currentGroups);
		});
		$('.sort.down').unbind('click').click(function (e) {
			var row = $(e.target).closest('th');
			var field = $(row).data('field');
			sortColumnByField(currentGroups, field, false);
			showGroups(currentGroups);
		});
		$('#addGroupButton').unbind('click').click(function (e) {
			addGroup($('#name-of-group').val());
		});
	};

	var setInfo = function (info) {
		$('#textfield-group').html(info);
	};

	var showGroups = function (groups) {
		var resultList = widget.find('.group-results');
		resultList.html('');

		function createRow(group) {
			var row = widget.find('.template tr').clone();
			row.find('.id').html(group.groupID);
			row.find('.name').html('<a href = "groups/group?id=' + group.groupID + '" class="groupName">' + group.name + '</a>');
			row.find('.authors').html(group.amAuthors);
			row.find('.deleteButton').bind('click', function (e) {
				e.preventDefault();
				if (!confirm('Delete Group?')) {
					return;
				}
				socket.emit('delete-group', group.groupID, function (err) {
					if (err) {
						logError(err)
					} else {
						reload();
					}
				});
			});
			return row;
		}

		groups.forEach(function (group) {
			resultList.append(createRow(group));
		});
	};

	handlers();
	reload();
};

ep_users_admin.group = function (hooks, context) {
	var socket = connectSocket(4);
	var currentPads = [];
	var currentUsers = [];
	var groupID = extractURLParameter('id');

	var getGroup = function () {
		socket.emit('get-group', groupID, function (err, group) {
			if (err) {
				return logError(err);
			}
			$('#group-name').html(group.name);
		});
	};

	var searchPads = function (searchTerm) {
		socket.emit('search-pads', groupID, searchTerm, function (err, pads) {
			if (err) {
				return logError(err);
			}
			currentPads = pads;
			sortColumnByField(currentPads, 'name', true);
			showPads(currentPads);
		});
	};

	var searchUsers = function (searchTerm) {
		socket.emit('search-group-user', groupID, searchTerm, function (err, users) {
			if (err) {
				return logError(err);
			}
			currentUsers = users;
			sortColumnByField(currentUsers, 'name', true);
			showUsers(currentUsers);
		});
	};

	var searchOtherUsers = function (name, cb) {
		socket.emit('search-all-users-not-in-group', groupID, name, function (err, users) {
			if (err) {
				return logError(err);
			}
			showUsersUserBox(users, cb);
		});
	};

	var addUserToGroup = function (userID) {
		socket.emit('add-user-to-group', userID, groupID, function (err) {
			if (err) {
				return logError(err);
			}
			reload();
		});
	};

	var addPad = function (padName) {
		socket.emit('add-pad-to-group', groupID, padName, function (err) {
			if (err) {
				return logError(err);
			}
			$('#name-of-pad').val('');
			reload();
		});
	};

	function closeBox() {
		$('#UserBox').css('display', 'none');
		$('#fade').css('display', 'none');
	}

	function handlers() {

		$('.pad-results-div .sort.up').unbind('click').click(function (e) {
			var row = $(e.target).closest('th');
			var field = $(row).data('field');
			sortColumnByField(currentPads, field, true);
			showPads(currentPads);
		});
		$('.pad-results-div .sort.down').unbind('click').click(function (e) {
			var row = $(e.target).closest('th');
			var field = $(row).data('field');
			sortColumnByField(currentPads, field, false);
			showPads(currentPads);
		});

		$('.user-results-div .pad-results-div .sort.up').unbind('click').click(function (e) {
			var row = $(e.target).closest('th');
			var field = $(row).data('field');
			sortColumnByField(currentUsers, field, true);
			showUsers(currentUsers);
		});
		$('.user-results-div .pad-results-div .sort.down').unbind('click').click(function (e) {
			var row = $(e.target).closest('th');
			var field = $(row).data('field');
			sortColumnByField(currentUsers, field, false);
			showUsers(currentUsers);
		});

		$('#addPadButton').unbind('click').click(function (e) {
			addPad($('#name-of-pad').val());
		});

		$('#addUserButton').unbind('click').bind('click', function (e) {
			e.preventDefault();
			$('#UserBox').css('display', 'block');
			$('#fade').css('display', 'block');
			searchOtherUsers('', function () {
				closeBox();
			});
		});
	}

	var showPads = function (pads) {
		var widget = $('.pad-results-div');
		var resultList = widget.find('.pad-results');
		resultList.html('');

		function createRow(pad) {
			var row = widget.find('.template tr').clone();
			row.find('.name').html(pad.name);
			row.find('.name').bind('click', function (e) {
				e.preventDefault();
				socket.emit('direct-to-group-pad', 'admin', groupID, pad.name, function (err, padUrl, sessionID) {
					if (err) {
						return logError(err);
					}
					document.cookie = 'sessionID=' + sessionID + '; path=/';
					window.location = '/group/' + groupID + '/pad/' + pad.name;
				});
			});
			row.find('.deleteButton').bind('click', function (e) {
				e.preventDefault();
				if (!confirm('Delete Pad?')) {
					return;
				}
				socket.emit('delete-pad', groupID, pad.name, function (err) {
					if (err) {
						return logError(err);
					}
					reload();
				});
			});
			return row;
		}

		pads.forEach(function (pad) {
			resultList.append(createRow(pad));
		});
	};

	var showUsers = function (users) {
		var $widget = $('.user-results-div');
		var $resultList = $widget.find('.user-results');
		$resultList.html('');

		function createRow(user) {
			var row = $widget.find('.template tr').clone();
			row.find('.id').html(user.userID);
			row.find('.email').html(user.email);
			row.find('.name').html('<a href = "../users/user?id=' + user.userID + '" class="userId">' + user.name + '</a>');
			row.find('.removeButton').bind('click', function (e) {
				e.preventDefault();
				if (!confirm('Remove User from group?')) {
					return;
				}
				socket.emit('remove-user-from-group', user.userID, groupID, function (err) {
					if (err) {
						return logError(err);
					}
					reload();
				});
			});
			if (user.Role === 1) {
				row.find('.status').html('Owner');
			} else {
				row.find('.makeOwnerButton').bind('click', function (e) {
					e.preventDefault();
					if (!confirm('Make Owner?')) {
						return;
					}
					socket.emit('make-user-owner-of-group', user.userID, groupID, function (err) {
						if (err) {
							return logError(err);
						}
						reload();
					});
				});
			}

			return row;
		}

		users.forEach(function (user) {
			$resultList.append(createRow(user));
		});
	};

	var showUsersUserBox = function (users, cb) {
		var $widget = $('.whitebox-result-div');
		var $resultList = $widget.find('.results');
		$resultList.html('');
		$('#closeBoxButton').unbind('click').click(function (e) {
			closeBox();
		});

		function createRow(user) {
			var row = $widget.find('.template tr').clone();
			row.find('.id').html(user.userID);
			row.find('.email').html(user.email);
			row.find('.name').html('<a class="userName">' + user.name + '</a>');
			row.find('.name').bind('click', function (e) {
				e.preventDefault();
				addUserToGroup(user.userID);
				cb();
			});
			return row;
		}

		users.forEach(function (user) {
			$resultList.append(createRow(user));
		});
	};

	var reload = function () {
		getGroup();
		searchPads('');
		searchUsers('');
	};

	handlers();
	reload();
};

ep_users_admin.user = function (hooks, context) {
	var socket = connectSocket(4);
	var currentGroups = [];
	var userID = extractURLParameter('id');


	var setInfo = function (info) {
		$('#textfield-group').html(info);
	};

	var addToGroup = function (groupID) {
		socket.emit('add-user-to-group', userID, groupID, function (err) {
			if (!err) {
				reload();
				setInfo('Added to Group!');
			} else {
				setInfo(err);
			}
		});
	};

	var searchGroupsOfUser = function (name) {
		socket.emit('search-groups-of-user', userID, name, function (err, groups) {
			if (err) {
				return console.log(err);
			}
			currentGroups = groups;
			sortColumnByField(currentGroups, 'name', true);
			showGroups(groups);
		});
	};

	var reload = function () {
		getUser();
		searchGroupsOfUser('');
	};

	var getUser = function () {
		socket.emit('search-user', userID, function (err, user) {
			if (err) {
				return console.log(err);
			}
			$('#username').html(user.name + ' (' + user.email + ')');
		});
	};

	var searchAllGroupsNotInUser = function (name, cb) {
		socket.emit('search-groups-not-in-user', userID, name, function (err, allGroups) {
			if (err) {
				return console.log(err);
			}
			showGroupsGroupBox(allGroups, cb);
		});
	};

	var handlers = function () {
		$('.sort.up').unbind('click').click(function (e) {
			var row = $(e.target).closest('th');
			var field = $(row).data('field');
			sortColumnByField(currentGroups, field, true);
			showGroups(currentGroups);
		});
		$('.sort.down').unbind('click').click(function (e) {
			var row = $(e.target).closest('th');
			var field = $(row).data('field');
			sortColumnByField(currentGroups, field, false);
			showGroups(currentGroups);
		});
		$('#addGroupButton').unbind('click').bind('click', function (e) {
			e.preventDefault();
			$('#GroupBox').css('display', 'block');
			$('#fade').css('display', 'block');
			searchAllGroupsNotInUser('', function () {
				$('#GroupBox').css('display', 'none');
				$('#fade').css('display', 'none');
			});
		});
	};

	var showGroups = function (groups) {
		var widget = $('.group-results-div');
		var resultList = widget.find('.group-results');
		resultList.html('');

		function createRow(group) {
			var row = widget.find('.template tr').clone();
			row.find('.id').html('<a class="groupID">' + group.groupID + '</a>');
			row.find('.name').html('<a href = "../groups/group?id=' + group.groupID + '" class="groupName">' + group.name + '</a>');
			row.find('.deleteButton').bind('click', function (e) {
				e.preventDefault();
				socket.emit('remove-user-from-group', userID, group.groupID, function (err) {
					if (err) {
						console.log(err);
					}
					reload();
				});
			});
			return row;
		}

		for (var i = 0; i < groups.length; i++) {
			var row = createRow(groups[i]);
			resultList.append(row);
		}
	};

	var showGroupsGroupBox = function (groups, cb) {
		var widget = $('.whitebox-result-div');
		var resultList = widget.find('.results');
		resultList.html('');

		function createRow(group) {
			var row = widget.find('.template tr').clone();
			row.find('.name').html('<a class="groupName">' + group.name + '</a>');
			row.find('.id').html('<a class="groupID">' + group.groupID + '</a>');
			row.find('.name').bind('click', function (e) {
				e.preventDefault();
				addToGroup(group.groupID);
				cb();
			});
			return row;
		}

		for (var i = 0; i < groups.length; i++) {
			var row = createRow(groups[i]);
			resultList.append(row);
		}
	};

	handlers();
	reload();
};

ep_users_admin.settings = function (hooks, context) {
	var socket = connectSocket(3);

	var handler = function () {
		$('#reloadSettings').unbind('click').click(function (e) {
			e.preventDefault();
			refresh();
		});
		$('#storeSettings').unbind('click').click(function (e) {
			e.preventDefault();
			save();
		});
	};

	var save = function () {
		var $msg = $('.err-message');
		$msg.text('');
		var text = $('textarea.settings').val();
		var o;
		try {
			o = JSON.parse(text);
		} catch (e) {
			$msg.text(e);
			return;
		}
		socket.emit('settings-set', o, function (err) {
			if (err) {
				$msg.text(err || 'Could not save settings');
			} else {
				$msg.text('settings saved');
			}
		});

	};

	var refresh = function () {
		socket.emit('settings-get', {}, function (err, sets) {
			if (!err) {
				$('textarea.settings').val(JSON.stringify(sets, null, ' '));
			} else {
				$('.err-message').text(err || 'Could not get settings');
			}
		});
	};

	handler();
	refresh();
};
