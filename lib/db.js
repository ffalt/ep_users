var fs = require('fs');
var async = require('async');
var path = require('path');
var mysql = require('mysql');
var log = require('./log');

var format = {
	GroupPads: {
		Columns: {
			GroupID: 'int(11) NOT NULL',
			PadName: 'varchar(255) COLLATE utf8_bin NOT NULL'
		},
		PrimaryKeys: ['GroupID', 'PadName']
	},
	Groups: {
		Columns: {
			groupID: 'int(11) NOT NULL AUTO_INCREMENT',
			name: 'varchar(255) COLLATE utf8_bin NOT NULL DEFAULT \'\''
		},
		PrimaryKeys: ['groupID', 'name']
	},
	NotRegisteredUsersGroups: {
		Columns: {
			email: 'varchar(255) NOT NULL',
			groupID: 'int(11) NOT NULL'
		}
	},
	User: {
		Columns: {
			userID: 'int(11) NOT NULL AUTO_INCREMENT',
			name: 'varchar(255) COLLATE utf8_bin NOT NULL DEFAULT \'\'',
			pwd: 'varchar(255) COLLATE utf8_bin DEFAULT NULL',
			considered: 'tinyint(11) DEFAULT NULL',
			SSO: 'tinyint(4) DEFAULT NULL',
			FullName: 'varchar(255) COLLATE utf8_bin DEFAULT NULL',
			considerationString: 'varchar(50) COLLATE utf8_bin DEFAULT NULL',
			salt: 'varchar(255) COLLATE utf8_bin DEFAULT NULL',
			active: 'int(1) DEFAULT NULL'
		},
		PrimaryKeys: ['userID', 'name']
	},
	UserGroup: {
		Columns: {
			userID: 'int(11) NOT NULL DEFAULT \'0\'',
			groupID: 'int(11) NOT NULL DEFAULT \'0\'',
			Role: 'int(11) DEFAULT NULL'
		},
		PrimaryKeys: ['userID', 'groupID']
	}
};

var buildCreateTableSQL = function (spec) {
	return 'CREATE TABLE IF NOT EXISTS `' + spec + '` (' +
		Object.keys(format[spec].Columns).map(function (key) {
			return '`' + key + '` ' + format[spec].Columns[key];
		}).join(', ') +
		(format[spec].PrimaryKeys ?
			', PRIMARY KEY (' + format[spec].PrimaryKeys.map(function (pkey) {
				return '`' + pkey + '`';
			}).join(', ') + ')' : '') +
		');'
};


function Database(dbAuthParams) {
	var me = this;

	var connection = mysql.createConnection(dbAuthParams);
	connection.connect(function (err) {
		if (err) {
			log('error', 'failed connecting to database', err);
		} else {
			log('info', 'connected');
		}
		initDB()
	});

	var initDB = function () {
		//Test if table exists
		var sql = 'SELECT count(*) FROM User';
		connection.query(sql, function (err, rows) {
			if (err) {
				log('info', 'Tables seem to not exist, creating...');
				async.forEachSeries(Object.keys(format), function (key, next) {
					var query = buildCreateTableSQL(key);
					log('info', 'create table ' + key + ' if not exists');
					connection.query(query, function (err, result) {
						if (err) {
							log('error', 'Table creation fail - ' + err);
						}
						else {
							next();
						}
					});
				});
			}
		});
	};

	var mySqlErrorHandler = function (err) {
		var msg;
		if (err.fileName && err.lineNumber) {
			msg = 'MySQLError in ' + err.fileName + ' line ' + err.lineNumber + ': ';
		} else {
			msg = 'MySQLError: ';
		}
		if (err.fatal) {
			msg += '(FATAL) ';
		}
		msg += err.message;
		log('error', msg);
	};

	me.getOneValueSql = function (sql, params, cb) {
		connection.query(sql, params, function (err, results) {
			if (err) {
				mySqlErrorHandler(err);
			}
			cb(err, results);
		});
	};

	me.updateSql = function (sql, params, cb) {
		connection.query(sql, params, function (err, results) {
			if (err) {
				mySqlErrorHandler(err);
			}
			cb(err, !err);
		});
	};

	me.insertSql = function (sql, params, cb) {
		connection.query(sql, params, function (err, results) {
			if (err) {
				mySqlErrorHandler(err);
			}
			if (err) {
				return cb(err);
			}
			cb(err, results.insertId);
		});
	};

	me.deleteSql = function (sql, params, cb) {
		connection.query(sql, params, function (err, results) {
			if (err) {
				mySqlErrorHandler(err);
			}
			cb(err, !err);
		});
	};

	me.getSql = function (sql, params, cb) {
		connection.query(sql, params, function (err, results) {
			if (err) {
				mySqlErrorHandler(err);
			}
			cb(err, results);
		});
	};

	me.existValueInDatabase = function (sql, params, cb) {
		connection.query(sql, params, function (err, results) {
			if (err) {
				mySqlErrorHandler(err);
			}
			cb(err, (results && results.length > 0));
		});
	};

}

module.exports = Database;
