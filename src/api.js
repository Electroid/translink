const util = require('./util')
const translink = require('./translink')(env('TRANSLINK_API_KEY'))
const google = require('./google')(env('SQL_GOOGLE_KEY'))

/**
 * Fetch active buses from Translink and import
 * them into a BigQuery table.
 *
 * If the BigQuery tables does not exist, it will
 * automatically be created.
 *
 * @returns {promise} When the import is complete.
 */
function importBuses() {
    return translink.buses.then(buses =>
        google.insertRows('translink', 'bus', buses,
        {
            fields: [
                'vehicle',
                'trip',
                'route',
                'direction',
                'destination',
                'pattern',
                'location:geography',
                'time:timestamp'
            ],
            indexFields: [
                'vehicle',
                'time'
            ],
            timeField: 'time'
        }
    )) 
}

/**
 * Query BigTable to get a list of active buses.
 *
 * @param {integer} minutes Buses that have moved in last
 *                          X minutes are considered active.
 * @returns {promise<array<object>>} List of active buses.
 */
function queryBuses(minutes) {
    minutes = parseInt(minutes) || 3
    return google.submitQuery('active buses', `
        SELECT
          bus.*,
          ST_X(bus.location) as longitude,
          ST_Y(bus.location) as latitude
        FROM
          \`$.translink.bus\` AS bus
        RIGHT JOIN (
          SELECT
            vehicle,
            MAX(time) AS time
          FROM
            \`$.translink.bus\`
          WHERE
            time BETWEEN TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${minutes} MINUTE)
            AND CURRENT_TIMESTAMP()
          GROUP BY
            vehicle ) AS latest
        ON
          latest.vehicle = bus.vehicle
          AND latest.time = bus.time
        ORDER BY
          time DESC
    `)
}

module.exports = {
  importBuses,
  queryBuses
}
