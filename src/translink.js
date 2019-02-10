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
        return http(`https://api.translink.ca/rttiapi/v1/${resource}?${query}`, {simple: true, json: true, timeout: 5 * 1000})
    }

    /**
     * Fetch the location of all buses managed by Translink.
     *
     * @returns {promise<object>} Promise of a list of parsed bus objects.
     */
    get buses() {
        return this.fetch('buses').then(buses => buses.map(bus => Translink.parseBus(bus)).filter(Boolean))
    }

    /**
     * Parse and validate raw bus data from the Translink API.
     *
     * @param {object} data Raw bus object.
     * @returns {object} Parsed bus object or null if invalid.
     */
    static parseBus(data) {
        try {
            var bus = {
                vehicle: parseInt(data.VehicleNo),
                trip: parseInt(data.TripId),
                // Use negative numbers for NightBus to avoid route collision.
                route: parseInt(data.RouteNo.replace('N', '-')),
                direction: data.Direction,
                destination: data.Destination,
                pattern: data.Pattern,
                latitude: parseFloat(data.Latitude),
                longitude: parseFloat(data.Longitude),
                time: Translink.parseLocalTime(data.RecordedTime)
            }
            // Buses occasionally ping a location of (0, 0) on startup.
            if(bus.longitude != 0 && bus.latitude != 0) {
                return bus
            }
        } catch(err) {
            console.error(`Could not process bus ${data} because of ${err}`)
        }
        return null
    }

    /**
     * Get or convert to the local time in Vancouver.
     *
     * @param {object} input Optional date to convert to local time.
     * @returns {date} Local time in Vancouver.
     */
    static getLocalTime(input = null) {
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
    static parseLocalTime(input) {
        var day = Translink.getLocalTime().format('YYYY-MM-DD')
        var unix = Translink.getLocalTime(day).unix()
        if(production()) {
            unix += 28800 // HACK(ashcon): mysterious offset, also seen in Google SQL
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
        return Translink.getLocalTime(unix * 1000).format()
    }

}

module.exports = Translink
