/*global Materialize */

var consts = {
	msgs: {
		USERNAME_CHANGED: 'Username changed',
		USEREMAIL_CHANGED: 'User email changed',
		REQUEST_PASSWORD_RESET_COMPLETE: 'Please check your E-mail to complete the password reset.',
		REQUEST_PASSWORD_RESET_TITLE: 'Request password reset?',
		REQUEST_PASSWORD_RESET_LONG_FMT: 'Do you want send a password reset email to "%s"?',
		DELETE_GROUP_TITLE: 'Delete Group?',
		DELETE_GROUP_LONG_FMT: 'Do you really want to delete Group "%s"?',
		DELETE_PAD_TITLE: 'Delete Pad?',
		DELETE_PAD_LONG_FMT: 'Do you really want to delete Pad "%s"?',
		PASSWORDS_CHANGE_COMPLETE: 'Password changed',
		REGISTRATION_MAIL_SENT: 'Please check your E-mail to complete the registration',
		REMOVE_USER_TITLE: 'Remove User?',
		REMOVE_USER_LONG_FMT: 'Do you really want to remove User "%s" from the group?',
		REINVITE_USER_TITLE: 'Reinvite User?',
		REINVITE_USER_LONG_FMT: 'Do you really want to send an email to user "%s"?',
		MAKE_OWNER_TITLE: 'Change ownership?',
		MAKE_OWNER_LONG_FMT: 'Do you really want to make "%s" an owner?',
		DELETE_ACCOUNT_TITLE: 'Delete your account?',
		DELETE_ACCOUNT_LONG: 'Do you really want to delete your account? This can not be undone.'
	},
	errors: {
		CONNECTION_ERROR: 'Connection error, please try again',
		MAIL_NOT_CONFIGURED: 'Could not send email. Email sending is not configured.',
		NO_VALID_MAIL: 'Invalid Email',
		INVALID_USER_NAME: 'Invalid User Name',
		USER_EXISTS: 'Email address is in use',
		PASSWORD_WRONG: 'Passwords do not agree'
	}
};

var app = {};

app.utils = {};

app.utils.getBaseUrl = function () {
	return '/';
};

app.utils.post = function (data, url, cb) {
	var baseurl = app.utils.getBaseUrl();
	data.location = baseurl;
	$.ajax({
		type: 'POST',
		data: JSON.stringify(data),
		contentType: 'application/json',
		url: baseurl + url,
		success: function (response) {
			cb(response);
		},
		error: function (xhr, ajaxOptions, thrownError) {
			// eslint-disable-next-line no-console
			console.log(thrownError);
			cb(null);
		}
	});
};

app.utils.randomPadName = function () {
	var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
	var string_length = 10;
	var randomstring = '';
	var i, rnum;
	for (i = 0; i < string_length; i++) {
		rnum = Math.floor(Math.random() * chars.length);
		randomstring += chars.substring(rnum, rnum + 1);
	}
	return randomstring;
};

app.utils.logout = function () {
	var data = {};
	app.utils.post(data, 'logout', function (response) {
		if (response) {
			app.utils.redirectToIndex(1000);
		} else {
			app.utils.snack('Something went wrong', true);
		}
	});
};

app.utils.redirectToIndex = function (time) {
	setTimeout(function () {
		var url = app.utils.getBaseUrl();
		window.location = url + 'start'
	}, time || 3000);
};

app.utils.snack = function (msg, isError) {
	Materialize.toast(msg, 10000, isError ? 'snack-error' : '');
};

app.utils.dialog = function (title, msg, cb) {
	var modal = $('#modal-dialog');
	$('.modal-content h4', modal).text(title);
	$('.modal-content p', modal).text(msg);
	$('.modal-action-ok', modal).unbind('click').click(function (e) {
		modal.modal('close');
		cb(true);
	});
	modal.modal({
			dismissible: true, // Modal can be dismissed by clicking outside of the modal
			opacity: 0.5 // Opacity of modal background
			// inDuration: 300, // Transition in duration
			// outDuration: 200, // Transition out duration
			// // startingTop: '4%', // Starting top style attribute
			// endingTop: '10%', // Ending top style attribute
			// ready: function (modal, trigger) { // Callback for Modal open. Modal and trigger parameters available.
			// console.log(modal, trigger);
			// },
// -			complete: function () {
// 			}
		}
	);
	modal.modal('open');
};

$(document).ready(function () {

	// Materialize.updateTextFields();

	var fillError = function (input, msg) {
		$(input).addClass('invalid');
		$($('.collection-form-label', $(input).parent())).attr('data-error', msg);
	};

	var clearError = function (input) {
		$(input).removeClass('invalid');
	};

	var postForm = function (e, input, postname, getPostValue, success) {
		e.preventDefault();
		var $input = $(input);
		clearError($input);
		$input.on('keyup paste', function () {
			clearError($input);
		});
		app.utils.post(getPostValue($input.val()), postname, function (data) {
			if (!data) {
				app.utils.snack(consts.errors.CONNECTION_ERROR);
				return;
			}
			if (data.success) {
				if (success) {
					success();
				} else {
					$input.val('');
					window.location.reload();
				}
			} else {
				fillError($input, data.error);
			}
		});
	};

	$('#formUsername').submit(function (e) {
		postForm(e, '#newUserName', 'changeUserName', function (val) {
			return {
				newUserName: val
			};
		}, function () {
			app.utils.snack(consts.msgs.USERNAME_CHANGED);
		});
	});

	$('#formUseremail').submit(function (e) {
		postForm(e, '#email', 'changeEmail', function (val) {
			return {
				newEmail: val
			};
		}, function () {
			app.utils.snack(consts.msgs.USEREMAIL_CHANGED);
		});
	});

	$('#formCreatePrivateGroup').submit(function (e) {
		postForm(e, '#groupName', 'createGroup', function (val) {
			return {
				groupName: val
			};
		});
	});

	$('#formCreatePrivatePad').submit(function (e) {
		var groupID = $(this).data('groupid');
		postForm(e, '#createGroupPad', 'createPad', function (val) {
			return {
				padName: val,
				groupID: groupID
			};
		});
	});

	$('#formAddUserToGroup').submit(function (e) {
		var groupID = $(this).data('groupid');
		postForm(e, '#usernames', 'inviteUsers', function (val) {
			return {
				users: val.split(';'),
				groupID: groupID
			};
		});
	});

	$('#formOpenPublicPad').submit(function (e) {
		e.preventDefault();
		var $input = $('#openPadName');
		clearError($input);
		$input.on('keyup paste', function () {
			clearError($input);
		});
		var padname = $input.val();
		if (padname.length > 0) {
			window.location = 'p/' + padname;
		} else {
			window.location = 'p/' + app.utils.randomPadName();
		}
	});

	$('#passwordreset').unbind('click').click(function (e) {
		e.preventDefault();
		var $input = $('#email');
		var s = ($input.val() || '').trim();
		if (s.length === 0) {
			fillError($input, consts.errors.INVALID_USER_NAME);
			return;
		}
		app.utils.dialog(consts.msgs.REQUEST_PASSWORD_RESET_TITLE, consts.msgs.REQUEST_PASSWORD_RESET_LONG_FMT.replace('%s', $input.val()), function (ok) {
			if (!ok) {
				return;
			}
			clearError($input);
			$input.on('keyup paste', function () {
				clearError($input);
			});
			app.utils.post({
				email: $input.val()
			}, 'pwreset', function (data) {
				if (!data) {
					app.utils.snack(consts.errors.CONNECTION_ERROR);
					return;
				}
				if (data.success) {
					app.utils.snack(consts.msgs.REQUEST_PASSWORD_RESET_COMPLETE);
				} else {
					fillError($input, data.error);
				}
			});
		});
	});

	$('#formEtherpadLogin').submit(function (e) {
		e.preventDefault();
		var url = app.utils.getBaseUrl();
		var $input = $('#email');
		var $pass_input = $('#password');
		clearError($input);
		$input.on('keyup paste', function () {
			clearError($input);
		});
		app.utils.post({
			email: $input.val(),
			password: $pass_input.val(),
			url: url
		}, 'login', function (data) {
			if (!data) {
				app.utils.snack(consts.errors.CONNECTION_ERROR);
				return;
			}
			if (data.success) {
				window.location = url + 'home';
			} else {
				fillError($input, data.error);
			}
		});
	});

	$('#formUserpassword').submit(function (e) {
		e.preventDefault();
		var $pass_old_input = $('#oldPW');
		var $pass_input = $('#password');
		var $pass_repeat_input = $('#newRepPW');

		clearError($pass_old_input);
		clearError($pass_input);
		clearError($pass_repeat_input);

		var oldPW = $pass_old_input.val();
		var newPW = $pass_input.val();
		var newRepPW = $pass_repeat_input.val();

		$pass_input.on('keyup paste', function () {
			clearError($pass_input);
		});
		$pass_old_input.on('keyup paste', function () {
			clearError($pass_input);
		});
		$pass_repeat_input.on('keyup paste', function () {
			clearError($pass_input);
		});

		if (newPW !== newRepPW) {
			fillError($pass_input, consts.errors.PASSWORD_WRONG);
		} else {
			app.utils.post({newPW: newPW, oldPW: oldPW}, 'changeUserPw', function (data) {
				if (data.success) {
					$pass_old_input.val('');
					$pass_input.val('');
					$pass_repeat_input.val('');
					app.utils.snack(consts.msgs.PASSWORDS_CHANGE_COMPLETE);
				} else {
					fillError($pass_input, data.error);
				}
			});
		}
	});

	$('#formEtherpadRegister').submit(function (e) {
		e.preventDefault();
		var url = app.utils.getBaseUrl();
		var $input = $('#email');
		var $input_fullname = $('#fullname');
		var $pass_input = $('#password');
		var $pass_repeat_input = $('#passwordrepeat');
		clearError($input);
		clearError($pass_input);
		clearError($pass_repeat_input);
		$input.on('keyup paste', function () {
			clearError($input);
		});
		$input_fullname.on('keyup paste', function () {
			clearError($input_fullname);
		});
		$pass_input.on('keyup paste', function () {
			clearError($pass_input);
		});
		$pass_repeat_input.on('keyup paste', function () {
			clearError($pass_input);
		});
		app.utils.post({
			email: $input.val(),
			password: $pass_input.val(),
			fullname: $input_fullname.val(),
			passwordrepeat: $pass_repeat_input.val()
		}, 'register', function (data) {
			if (!data) {
				app.utils.snack(consts.errors.CONNECTION_ERROR);
				return;
			}
			if (data.success) {
				app.utils.snack(consts.msgs.REGISTRATION_MAIL_SENT);
				$input.val('');
				$pass_input.val('');
				$input_fullname.val('');
				$pass_repeat_input.val('');
				setTimeout(function () {
					window.location = url + 'start';
				}, 3000);
			} else if (data.error === consts.errors.MAIL_NOT_CONFIGURED) {
				app.utils.snack(consts.errors.MAIL_NOT_CONFIGURED, true);
			} else if (data.error === consts.errors.INVALID_USER_NAME) {
				fillError($input_fullname, data.error)
			} else if (data.error === consts.errors.USER_EXISTS || data.error === consts.errors.NO_VALID_MAIL) {
				fillError($input, data.error)
			}
			else {
				fillError($pass_input, data.error)
			}
		});
	});

	$('#formPasswordReset').submit(function (e) {
		e.preventDefault();
		var confirmation = $(this).data('confirmation');
		var url = app.utils.getBaseUrl();
		var $pass_input = $('#password');
		var $pass_repeat_input = $('#passwordrepeat');
		clearError($pass_input);
		$pass_input.on('keyup paste', function () {
			clearError($pass_input);
		});
		$pass_repeat_input.on('keyup paste', function () {
			clearError($pass_input);
		});
		app.utils.post({
			confirmation: confirmation,
			password: $pass_input.val(),
			passwordrepeat: $pass_repeat_input.val()
		}, 'pwreset', function (data) {
			if (!data) {
				app.utils.snack(consts.errors.CONNECTION_ERROR);
				return;
			}
			if (data.success) {
				app.utils.snack(consts.msgs.PASSWORDS_CHANGE_COMPLETE);
				$pass_input.val('');
				$pass_repeat_input.val('');
				setTimeout(function () {
					window.location = url + 'login';
				}, 3000);
			} else {
				fillError($pass_input, data.error)
			}
		});
	});

	$('#createPublicPadRandomName').unbind('click').click(function (e) {
		e.preventDefault();
		window.location = 'public_pad/' + app.utils.randomPadName();
	});

	$('.btn-logout').unbind('click').click(function (e) {
		e.preventDefault();
		app.utils.logout();
	});

	$('.btn-group_delete').unbind('click').click(function (e) {
		e.preventDefault();
		var groupID = $(this).data('groupid');
		var groupName = $(this).data('name');
		app.utils.dialog(consts.msgs.DELETE_GROUP_TITLE, consts.msgs.DELETE_GROUP_LONG_FMT.replace('%s', groupName), function (ok) {
			if (!ok) {
				return;
			}
			app.utils.post({groupID: groupID, groupName: groupName}, 'deleteGroup', function (data) {
				if (data.success) {
					document.location.reload();
				} else {
					app.utils.snack(data.error, true);
				}
			});
		});
	});

	$('.btn-user_remove').unbind('click').click(function (e) {
		e.preventDefault();
		var groupID = $(this).data('groupid');
		var username = $(this).data('username');
		var userID = $(this).data('userid');
		var isNotRegistered = $(this).data('userreg') !== 1;
		app.utils.dialog(consts.msgs.REMOVE_USER_TITLE, consts.msgs.REMOVE_USER_LONG_FMT.replace('%s', username), function (ok) {
			if (!ok) {
				return;
			}
			if (isNotRegistered) {
				app.utils.post({username: username, groupID: groupID}, 'deleteNotRegUser', function (data) {
					if (data.success) {
						document.location.reload();
					} else {
						app.utils.snack(data.error, true);
					}
				});
			} else {
				app.utils.post({userID: userID, groupID: groupID}, 'deleteUserFromGroup', function (data) {
					if (data.success) {
						document.location.reload();
					} else {
						app.utils.snack(data.error, true);
					}
				});
			}
		});
	});

	$('.user-reinvite').unbind('click').click(function (e) {
		e.preventDefault();
		var groupID = $(this).data('groupid');
		var userID = $(this).data('userid');
		var username = $(this).data('username');
		app.utils.dialog(consts.msgs.REINVITE_USER_TITLE, consts.msgs.REINVITE_USER_LONG_FMT.replace('%s', username), function (ok) {
			if (!ok) {
				return;
			}
			app.utils.post({userID: userID, groupID: groupID}, 'reinviteUser', function (data) {
				if (data.success) {
					document.location.reload();
				} else {
					app.utils.snack(data.error, true);
				}
			});
		});
	});

	$('.pad-delete').unbind('click').click(function (e) {
		e.preventDefault();
		var groupID = $(this).data('groupid');
		var padName = $(this).data('padname');
		app.utils.dialog(consts.msgs.DELETE_PAD_TITLE, consts.msgs.DELETE_PAD_LONG_FMT.replace('%s', padName), function (ok) {
			if (!ok) {
				return;
			}
			app.utils.post({groupID: groupID, padName: padName}, 'deletePad', function (data) {
				if (data.success) {
					document.location.reload();
				} else {
					app.utils.snack(data.error, true);
				}
			});
		});
	});

	$('.user-makeowner').unbind('click').click(function (e) {
		e.preventDefault();
		var groupID = $(this).data('groupid');
		var userID = $(this).data('userid');
		var username = $(this).data('username');
		app.utils.dialog(consts.msgs.MAKE_OWNER_TITLE, consts.msgs.MAKE_OWNER_LONG_FMT.replace('%s', username), function (ok) {
			if (!ok) {
				return;
			}
			app.utils.post({userID: userID, groupID: groupID}, 'makeOwner', function (data) {
				if (data.success) {
					document.location.reload();
				} else {
					app.utils.snack(data.error, true);
				}
			});
		});
	});

	$('#btn-deleteAllData').unbind('click').click(function (e) {
		e.preventDefault();
		app.utils.dialog(consts.msgs.DELETE_ACCOUNT_TITLE, consts.msgs.DELETE_ACCOUNT_LONG, function (ok) {
			if (!ok) {
				return;
			}
			app.utils.post({}, 'deleteUser', function (data) {
				if (data.success) {
					window.location = app.utils.getBaseUrl() + 'start';
				} else {
					app.utils.snack(data.error, true);
				}
			});
		});
	});

});
