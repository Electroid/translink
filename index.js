const sleep = require('sleep-promise')
const Translink = require('./src/translink')
const Sql = require('./src/sql_google')

function init() {
	var translink = new Translink(
		env('TRANSLINK_API_KEY')
	)
	var sql = new Sql(
		env('SQL_GOOGLE_ID'),
		env('SQL_HOSTNAME'),
		env('SQL_DATABASE'),
		env('SQL_USERNAME'),
		env('SQL_PASSWORD'),
		env('SQL_GOOGLE_KEY')
	)
	sql.assertTable('positions', [
		'vehicle INT NOT NULL',
		'trip BIGINT NOT NULL',
		'route SMALLINT NOT NULL',
		'direction CHAR(16) NOT NULL',
		'destination CHAR(64) NOT NULL',
		'pattern CHAR(16) NOT NULL',
		'latitude DECIMAL(9,6) NOT NULL',
		'longitude DECIMAL(9,6) NOT NULL',
		'time DATETIME NOT NULL',
		'PRIMARY KEY (trip, time)'
	]).then(() => query())
}

function save() {
	return sql.exportToBigQuery('positions', `positions/${time()}`)
}

function query(i = 1) {
	return translink.buses
		.then(buses => sql.insertRow('positions', buses))
		.then(status => log(`${status.affectedRows} buses moved + ${status.changedRows} buses stayed = ${status.warningCount} buses total`, i))
		.then(() => {if(i % 120 == 0) save().then(status => log(`${status.statistics.load.outputRows} buses exported`))})
		.then(sleep(30 * 1000))
		.then(() => query(i + 1))
}

function time() {
	return Translink.getLocalTime().format()
}

function log(message, prefix = '!') {
	console.log(`${prefix} > ${time()} >> ${message}`)
}

function env(name) {
	return process.env[name]
}

process.on('unhandledRejection', err => {
	console.error(err)
  	process.exit(1)
});

init()
