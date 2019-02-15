const api = require('./src/api')

function event(event, context) {
    var data = Buffer.from(event.data, 'base64').toString()
    if(data === 'import') {
        return api.importBuses()
    } else {
        return Promise.reject(new Error(`Unknown message of ${data}`))
    }
}

if(production()) {
    exports.event = event
} else {
    api.importBuses()
}
