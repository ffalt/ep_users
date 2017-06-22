var nodemailer = require('nodemailer');
var consts = require('./consts');

function Mail(eMailAuth) {
	eMailAuth = eMailAuth || {};
	var me = this;
	var enabled = (eMailAuth && !eMailAuth.disabled && Object.keys(eMailAuth).length > 0);

	var transport;

	if (enabled) {
		var settings = eMailAuth[eMailAuth.mode];
		if (settings) {
			transport = nodemailer.createTransport(settings);
		} else {
			enabled = false;
		}
	}

	me.sendMail = function (msg, from, to, subject, cb) {
		if (!transport) return cb(consts.errors.MAIL_NOT_CONFIGURED);
		var message = {
			text: msg,
			from: from,
			to: to + ' <' + to + '>',
			subject: (eMailAuth.text.subjectprefix ? eMailAuth.text.subjectprefix + ' ' : '') + subject
		};
		transport.sendMail(message, function (err, info) {
			// console.log(err, info);
			cb(err);
		});
	};

	me.sendInviteRegistered = function (email, groupname, fromname, cb) {
		if (!enabled) return cb(consts.errors.MAIL_NOT_CONFIGURED);
		var text = eMailAuth.text.invitation;
		var msg = text.msg.replace(/<groupname>/, groupname).replace(/<fromuser>/, fromname).replace(/<url>/, eMailAuth.location);
		me.sendMail(msg, eMailAuth.sender, email, text.subject, cb);
	};

	me.sendInviteUnregistered = function (email, groupname, fromname, cb) {
		if (!enabled) return cb(consts.errors.MAIL_NOT_CONFIGURED);
		var text = eMailAuth.text.invitateunregistered;
		var msg = text.msg.replace(/<groupname>/, groupname).replace(/<fromuser>/, fromname).replace(/<url>/, eMailAuth.location);
		me.sendMail(msg, eMailAuth.sender, email, text.subject, cb);
	};

	me.sendRegistrationMail = function (email, consString, cb) {
		if (!enabled) return cb(consts.errors.MAIL_NOT_CONFIGURED);
		var text = eMailAuth.text.registration;
		var msg = text.msg.replace(/<url>/, eMailAuth.location + '/confirm/' + consString);
		me.sendMail(msg, eMailAuth.sender, email, text.subject, cb);
	};

	me.sendPasswordReset = function (email, consString, cb) {
		if (!enabled) return cb(consts.errors.MAIL_NOT_CONFIGURED);
		var text = eMailAuth.text.resetpw;
		var msg = text.msg.replace(/<url>/, eMailAuth.location + '/pwreset/' + consString);
		me.sendMail(msg, eMailAuth.sender, email, text.subject, cb);
	};

	me.sendNewPassword = function (email, pw, cb) {
		if (!enabled) return cb(consts.errors.MAIL_NOT_CONFIGURED);
		var text = eMailAuth.text.newpw;
		var msg = text.msg.replace(/<password>/, pw);
		me.sendMail(msg, eMailAuth.sender, email, text.subject, cb);
	};

}

module.exports = Mail;