const Translink = require('./src/translink')
const Sql = require('./src/sql_google')

var translink
var sql

function init() {
    translink = new Translink(env('TRANSLINK_API_KEY'))
    sql = new Sql(env('SQL_GOOGLE_ID'), env('SQL_HOSTNAME'), env('SQL_DATABASE'), env('SQL_USERNAME'), env('SQL_PASSWORD'), env('SQL_GOOGLE_KEY'))
}

function download() {
    return sql.assertTable('bus', [
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
    ]).then(() => translink.buses)
      .then((list) => {console.log(list); return list;})
      .then((list) => sql.insertRow('bus', list))
      .then(() => sql.close())
}

function upload() {
    return sql.exportToBigQuery('bus', `bus/${Translink.getLocalTime().format()}`)
}

function event(event, context) {
    var data = null
    if(event) {
        try {
            data = Buffer.from(event.data, 'base64').toString()
        } catch(err) {
            data = event.toString()
        }
    }
    if(data === 'download') {
        return download()
    } else if(data === 'upload') {
        return upload()
    } else {
        return Promise.reject(new Error(`Unknown message: ${data}`))
    }
}

require('./src/util')

// HACK(ashcon): bundle but do not run
if(new Date() < 0) {
    require('./sql/table/bus.sql')
}

init()

if(production()) {
    exports.event = event
} else {
    download().catch((err) => console.error(err))
}
