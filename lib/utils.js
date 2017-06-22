var crypto = require('crypto');

var Utils = {};

Utils.encryptPassword = function (password, salt) {
	return crypto.createHmac('sha256', salt).update(password).digest('hex');
};

Utils.getRandomNum = function (lbound, ubound) {
	return (Math.floor(Math.random() * (ubound - lbound)) + lbound);
};

Utils.getRandomChar = function (number, lower, upper, other, extra) {
	var numberChars = '0123456789';
	var lowerChars = 'abcdefghijklmnopqrstuvwxyz';
	var upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	var otherChars = '`~!@#$%^&*()-_=+[{]}\\|;:\'",<.>/? ';
	var charSet = extra;
	if (number == true)
		charSet += numberChars;
	if (lower == true)
		charSet += lowerChars;
	if (upper == true)
		charSet += upperChars;
	if (other == true)
		charSet += otherChars;
	return charSet.charAt(Utils.getRandomNum(0, charSet.length));

};

Utils.randomString = function (length) {
	var myextraChars = '';
	var myfirstNumber = true;
	var myfirstLower = true;
	var myfirstUpper = true;
	var myfirstOther = false;
	var mylatterNumber = true;
	var mylatterLower = true;
	var mylatterUpper = true;
	var mylatterOther = false;

	var rc = '';
	if (length > 0) {
		rc += Utils.getRandomChar(myfirstNumber, myfirstLower, myfirstUpper, myfirstOther, myextraChars);
	}
	for (var idx = 1; idx < length; ++idx) {
		rc += Utils.getRandomChar(mylatterNumber, mylatterLower, mylatterUpper, mylatterOther, myextraChars);
	}
	return rc;
};

Utils.createSalt = function () {
	return Utils.randomString(10);
};

Utils.createID = function () {
	return Utils.randomString(40);
};

Utils.isValidMail = function (email) {
	return email.toString().match(/[a-zA-Z0-9._-]+@[a-zA-Z0-9-]+.[a-zA-Z]{2,4}/);
};

Utils.convertPadTimestamp = function (UNIX_timestamp) {
	var a = new Date(UNIX_timestamp);
	var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	var year = a.getFullYear();
	var month = months[a.getMonth()];
	var date = a.getDate();
	var hour = (( a.getHours() < 10) ? '0' : '') + a.getHours();
	var min = ((a.getMinutes() < 10) ? '0' : '') + a.getMinutes();
	return date + '. ' + month + ' ' + year + ' ' + hour + ':' + min + ' Uhr';
};

module.exports = Utils;
