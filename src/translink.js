const http = require('request-promise')
const time = require('moment-timezone')
const timezone = 'America/Vancouver'

/**
 * Represents access to real-time location data from Translink buses.
 *
 * @see https://developer.translink.ca/ServicesRtti/ApiReference#Buses
 */
class Translink {

    constructor(apiKeys) {
        this.apiKeys = apiKeys.split(',')
    }

    /**
     * Gets the next API key by cycling between all the keys.
     */
    get apiKey() {
        return this.apiKeys[Math.floor(Math.random() * this.apiKeys.length)]
    }

    /**
     * Send a raw http request to the Tranlink API.
     *
     * @param {string} resource Type of resource to fetch (ie. stops, estimates, buses).
     * @param {object} params Map of keys and values for the request query string.
     * @returns {promise<object>} Promise of the API response as JSON.
     */
    fetch(resource, params = {}) {
        params.apikey = this.apiKey
        var query = Object.keys(params).map(key => `${key}=${params[key]}`).join('&')
        return http(
        	`https://api.translink.ca/rttiapi/v1/${resource}?${query}`,
        	{simple: true, json: true, timeout: 5 * 1000}
        )
    }

    /**
     * Fetch the location of all buses managed by Translink.
     *
     * @returns {promise<object>} Promise of a list of parsed bus objects.
     */
    get buses() {
        return this.fetch('buses').then(buses => buses.map(bus => this.parseBus(bus)).filter(Boolean))
    }
    /**
     * Parse and validate raw bus data from the Translink API.
     *
     * @param {object} data Raw bus object.
     * @returns {object} Parsed bus object or null if invalid.
     */
    parseBus(data) {
        try {
            var bus = {
                vehicle: data.VehicleNo,
                trip: data.TripId,
                route: data.RouteNo.replace(/^0+/, ''),
                direction: data.Direction,
                destination: data.Destination,
                pattern: data.Pattern,
                longitude: parseFloat(data.Longitude),
                latitude: parseFloat(data.Latitude),
                time: this.parseLocalTime(data.RecordedTime)
            }
            // Buses occasionally ping a location of (0, 0) on startup.
            if(bus.longitude == 0 || bus.latitude == 0) return null
            // Add synthetic fields for BigQuery analysis.
            bus.id = `${bus.vehicle}-${bus.time}`
            bus.location = `POINT(${bus.longitude} ${bus.latitude})`
            return bus
        } catch(err) {
            console.error(`Could not process bus ${JSON.stringify(data)} because of ${err}`)
        }
        return null
    }

    /**
     * Get or convert to the local time in Vancouver.
     *
     * @param {object} input Optional date to convert to local time.
     * @returns {date} Local time in Vancouver.
     */
    getLocalTime(input = null) {
        if(input) {
            return time(input).tz(timezone)
        } else {
            return time().tz(timezone)
        }
    }

    /**
     * Parse human-readable timestamp into ISO format.
     *
     * @param {date} input Historical timestamp in Vancouver time (ie. '09:27:25 pm').
     * @returns {date} ISO-formated timestamp.
     */
    parseLocalTime(input) {
        var day = this.getLocalTime().format('YYYY-MM-DD')
        var unix = this.getLocalTime(day).unix()
        // HACK(ashcon): mysterious offset, also seen in Google SQL,
        //               possibly due to timezone differences
        if(production()) {
            unix += 28800
        }
        var [iso, xm] = input.split(' ')
        var [hours, minutes, seconds] = iso.split(':').map((i) => parseInt(i))
        // Convert from am-pm to 24-hour format.
        if(xm === 'pm' && hours < 12) {
            hours += 12
        } else if(xm === 'am' && hours == 12) {
            hours -= 12
        }
        unix += hours * 60 * 60
        unix += minutes * 60
        unix += seconds
        // Since dates are always historical, future dates are the result
        // of date overflow when the string is from the previous day and the
        // computer is in the next day.
        if(unix > Date.now() / 1000) {
            unix -= 24 * 60 * 60
        }
        return this.getLocalTime(unix * 1000).format()
    }

}

module.exports = exports = function() {
    return new Translink(arguments['0'])
}
