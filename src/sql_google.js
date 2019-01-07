const fs = require('fs')
const http = require('request-promise')
const sleep = require('sleep-promise')
const Auth = require('google-auth-library')
const BigQuery = require('@google-cloud/bigquery')
const {Storage} = require('@google-cloud/storage')
const Sql = require('./sql')

/**
 * Google-managed SQL cloud database.
 *
 * @see https://cloud.google.com/sql/docs
 */
class SqlGoogle extends Sql {

    /**
     * Connect to the SQL database with Google and password authentication.
     *
     * @param {string} id Internal ID of the SQL instance.
     * @param {string} host Hostname or IP address of the SQL instance.
     * @param {string} db Name of the database to access, not the instance name.
     * @param {string} user Name of the user logging in.
     * @param {string} pwd Password of the user logging in.
     * @param {string} key Base64 encoded 'google.json' secret file.
     */
    constructor(id, host, db, user, pwd, key) {
        super(host, db, user, pwd)
        this.id = id
        this.name = db
        var key = JSON.parse(Buffer.from(key, 'base64'))
        var keyPath = `google-${id}.json`
        this.projectId = key.project_id
        this.client = new Auth.JWT(
            key.client_email,
            null,
            key.private_key,
            ['https://www.googleapis.com/auth/sqlservice.admin',
             'https://www.googleapis.com/auth/cloud-platform'],
            null
        )
        var config
        if(process.env.GOOGLE) {
            config = {projectId: this.projectId}
        } else {
            config = {projectId: this.projectId, keyFilename: keyPath}
            fs.writeFileSync(keyPath, key)
        }
        this.bigQuery = new BigQuery(config)
        this.storage = new Storage(config)
    }

    /**
     * Send a request to Google's API with token authentication.
     *
     * @param {string} url URL of the request.
     * @param {object} data Optional data to be POST-ed with the request.
     * @returns {promise<object>} Response from the API.
     */
    request(url, data = null) {
        return this.client.authorize()
            .then(token => http({
                url: url,
                json: data,
                headers: {'content-type': 'application/json'},
                auth: {'bearer': token.access_token},
                method: data ? 'POST' : 'GET',
                simple: true
            }))
            .then(body => {
                if(typeof body === 'string') {
                    return JSON.parse(body)
                } else {
                    return body
                }
            })
    }

    /**
     * Wait for a SQL operation to finish.
     *
     * @param {string} operationId ID of the SQL operation to wait for.
     * @param {integer} seconds Number of seconds to wait if not yet done.
     * @returns {promise} Promise when the operation successfully completed.
     */
    wait(operationId, seconds = 10) {
        return this.request(`https://www.googleapis.com/sql/v1beta4/projects/${this.projectId}/operations/${operationId}`)
            .then(operation => {
                if(operation.error) {
                    throw new Error(operation.error.errors[0].message)
                } else if(operation.endTime) {
                    return operation
                } else {
                    return sleep(seconds * 1000).then(done => this.wait(operationId, 2 * seconds))
                }
            })  
    }

    /**
     * Get or create a Google BigQuery dataset.
     *
     * @param {string} name Name of the dataset.
     * @returns {promise<object>} BigQuery dataset.
     */
    getDataset(name) {
        return this.bigQuery.dataset(this.name).get({autoCreate: true})
            .then(data => data[0].table(name).get({autoCreate: true}))
            .then(data => data[0])
    }

    /**
     * Get or create a Google Storage bucket using the name of the SQL database.
     *
     * @returns {promise<object>} Storage bucket.
     */
    getBucket() {
        return this.storage.bucket(this.name).get({autoCreate: true})
            .then(data => data[0])
    }

    /**
     * Export a SQL table to a CSV file in the Google Storage bucket.
     *
     * @param {string} table Name of the table to export.
     * @param {string} file Name of the exported CSV file.
     * @returns {promise} Promise when the operation successfully finished.
     */
    exportToCsv(table, file) {
        return this.request(`https://www.googleapis.com/sql/v1beta4/projects/${this.projectId}/instances/${this.id}`)
            .then(sql => this.getBucket()
                .then(bucket => bucket.acl.update({
                    entity: `user-${sql.serviceAccountEmailAddress}`,
                    role: 'WRITER'
                })))
            .then(ok => this.request(
                `https://www.googleapis.com/sql/v1beta4/projects/${this.projectId}/instances/${this.id}/export`,
                {
                    exportContext: {
                        fileType: 'CSV',
                        uri: `gs://${this.name}/${file}.csv`,
                        databases: [this.name],
                        csvExportOptions: {
                            selectQuery: [
                                // #assertTable(name, fields) must have been called for fields to exist.
                                `SELECT '${this.fields[table].join("','")}'`,
                                `UNION ALL`,
                                `SELECT * FROM ${table}`
                            ].join("\n")
                        }
                    }
                }
            ))
            .then(operation => this.wait(operation.name))
    }

    /**
     * Export a SQL table to a Google BigQuery dataset.
     *
     * @param {string} table Name of the table to export.
     * @param {string} file Name of the exported CSV file.
     * @returns {promise} Promise when the operation successfully finished.
     */
    exportToBigQuery(table, file) {
        return this.exportToCsv(table, file)
            .then(ok => this.getDataset(table)
                .then(table => this.getBucket()
                    .then(bucket => table.load(
                        bucket.file(`${file}.csv`),
                        {
                            autodetect: true,
                            maxBadRecords: 100,
                            sourceFormat: 'CSV',
                            writeDisposition: 'WRITE_TRUNCATE',
                            nullMarker: 'null',
                            skipLeadingRows: 1
                        }
                    ))
                ))
            .then(data => data[0])
    }

}

module.exports = SqlGoogle
