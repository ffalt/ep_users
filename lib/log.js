/* eslint-disable no-console */

var pkg = require('../package.json');

var DEBUG_ENABLED = false;

var log = function (type, message) {
	if (typeof message === 'string') {
		if (type === 'error') {
			console.error(pkg.name + ': ' + message);
		} else if (type === 'debug') {
			if (DEBUG_ENABLED) {
				console.log('(debug) ' + pkg.name + ': ' + message);
			}
		} else {
			console.log(pkg.name + ': ' + message);
		}
	}
	else console.log(message);
};

module.exports = log;