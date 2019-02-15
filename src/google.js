const fs = require('fs')
const BigQuery = require('@google-cloud/bigquery')
const {PubSub} = require('@google-cloud/pubsub')

/**
 * Omnibus client for interacting with the Google Cloud APIs.
 *
 * @see https://cloud.google.com/bigquery/docs
 */
class Google {

    /**
     * Create a Google cloud client with Google key authentication.
     *
     * @param {string} key Base64 encoded 'google.json' secret file.
     */
    constructor(key) {
        var key = JSON.parse(Buffer.from(key, 'base64'))
        this.id = key.project_id
        var config
        if(production()) {
            config = {projectId: this.id}
        } else {
            var path = `google-${this.id}.json`
            config = {projectId: this.id, keyFilename: path}
            fs.writeFileSync(path, JSON.stringify(key))
            process.on('exit', () => fs.unlinkSync(path))
        }
        this.bigQuery = new BigQuery(config)
        this.pubSub = new PubSub(config)
        this.tables = {}
    }

    /**
     * Get or create a BigQuery table.
     *
     * @example
     * #assertTable('animals', 'dogs', {
     *    fields: ['name', 'age:integer', 'birthday:timestamp'],
     *    indexFields: ['name', 'birthday'], 
     *    timeField: 'birthday',  
     * })
     *
     * @param {string} dataset Name of the parent dataset.
     * @param {string} table Name of the table.
     * @param {object} options Options when creating the table.
     * @returns {promise<object>} BigQuery table.
     */
    // FIXME(ashcon): make creation of table nicer
    assertTable(dataset, table, options = {}) {
        // Short-circuit check if table is cached.
        var key = `${dataset}:${table}`
        if(this.tables[key]) {
            return Promise.resolve(this.tables[key])
        }
        // Convert in-line field schema to json format.
        var fields = options.fields
        if(fields) {
            fields = fields.map(field => {
                field = field.replace(/\s/g, '').split(':')
                return {
                    name: field[0],
                    type: field[1] || 'string',
                    mode: 'REQUIRED'
                }
            })
        }
        // Get or create the table with the provided options.
        // If the table does not exist and no options were provided,
        // a user error will be thrown.
        return this.bigQuery.dataset(dataset).get({autoCreate: true})
            .then(data => data[0].createTable(table, options = {
                schema: fields,
                clustering: {
                    fields: options.indexFields
                },
                timePartitioning: {
                    expirationMs: Number.POSITIVE_INFINITY,
                    type: 'DAY',
                    field: options.timeField  
                },
                original: options
            })
            .then(data => {
                console.log(`Created table ${key} with ${JSON.stringify(options)}`)
                return data
            })
            .catch(err => {
               if(err.message.includes('Already Exists')) {
                    return data[0].table(table).get()
                } else if(Object.keys(options.original).length <= 0) {
                    throw Error(`Table ${key} does not exist and no options were provided`)
                } else {
                    throw err
                } 
            }))
            .then(data => {
                return this.tables[key] = data[0] 
            })
    }

    /**
     * Stream insert rows into a BigQuery table.
     *
     * @param {string} dataset Name of the parent dataset.
     * @param {string} table Name of the table.
     * @param {array<object>} rows Rows of data to insert.
     * @param {object} options Options when creating the table.
     * @returns {promise} Response when the operation is complete.
     */
    insertRows(dataset, table, rows, options = {}) {
        console.log(`Inserting ${rows.length} rows into ${dataset}:${table}`)
        if(rows.length <= 0) return Promise.resolve()
        return this.assertTable(dataset, table, options)
            .then(table => table.insert(
                rows.map(row => {return {insertId: row.id || JSON.stringify(row), json: row}}),
                {raw: true, skipInvalidRows: true, ignoreUnknownValues: true}
            ))
    }

    /**
     * Submit an SQL query to BigQuery.
     *
     * @param {string} name The name of the query, for logging purposes.
     * @param {string} query The query to execute, use '$' for the project id.
     * @returns {promise<array<object>>} Rows returned from the query. 
     */
    submitQuery(name, query) {
        var start = new Date()
        query = query.replace(/\$/g, this.id)
        return this.bigQuery.query({query}).then(rows => {
            console.log(`Query ${name} took ${(new Date() - start) / 1000} seconds with ${rows[0].length} rows`)
            return rows[0]
        })
    }

    /**
     * Publish a message to a PubSub topic.
     *
     * @param {string} topic Name of the topic.
     * @param {object} message String or object to send as the message.
     * @param {promise} When the message has been published.
     */
    publishMessage(topic, message) {
        topic = `projects/${this.id}/topics/${topic}`
        if(!message) {
            return Promise.resolve()
        } else if(typeof message === 'object') {
            message = JSON.stringify(message)
        } else {
            message = message.toString()
        }
        console.log(`Publishing message '${message}' to ${topic}`)
        return this.pubSub.topic(topic)
            .get({autoCreate: true})
            .then(topic => topic[0].publish(Buffer.from(message)))
    }

}

module.exports = exports = function() {
    return new Google(arguments['0'])
}
