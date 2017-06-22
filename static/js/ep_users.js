/*global exports ep_users_admin window $ */

exports.documentReady = function (hooks, context) {
	// if (context === 'ep_users/admin') {
	// ep_users_admin.---(hooks, context);
	// } else
	if (context === 'ep_users/admin/groups') {
		ep_users_admin.groups(hooks, context);
	}
	else if (context === 'ep_users/admin/group') {
		ep_users_admin.group(hooks, context);
	}
	else if (context === 'ep_users/admin/users') {
		ep_users_admin.users(hooks, context);
	}
	else if (context === 'ep_users/admin/user') {
		ep_users_admin.user(hooks, context);
	}
	else if (context === 'ep_users/admin/settings') {
		ep_users_admin.settings(hooks, context);
	}
};

exports.postAceInit = function (hooks, context) {

	var inIframe = function () {
		try {
			return window.self !== window.top;
		} catch (e) {
			return true;
		}
	};

	if (!inIframe()) {
		var $body = $('body');
		$body.addClass('header-visible');
		// TODO: use base url
		$.getJSON('/user-status', function (data) {
			if (data.user) {
				$body.addClass('logged-in');
			} else {
				$body.addClass('logged-out');
			}
		});
	}
};


