const Translink = require('./src/translink')
const Sql = require('./src/sql_google')

function env(name) {
    return process.env[name]
}

exports.event = (event, context) => {
    var translink = new Translink(env('TRANSLINK_API_KEY'))
    var sql = new Sql(env('SQL_GOOGLE_ID'), env('SQL_HOSTNAME'), env('SQL_DATABASE'), env('SQL_USERNAME'), env('SQL_PASSWORD'), env('SQL_GOOGLE_KEY'))
    sql.assertTable('bus', [
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
    ]).then(() => {
        var message = Buffer.from(event.data, 'base64').toString()
        if(message === 'import') {
            translink.buses.then(list => sql.insertRow('bus', list))
        } else if(message === 'export') {
            sql.exportToBigQuery('bus', `bus/${Translink.getLocalTime().format()}`)
        }
    })
}
