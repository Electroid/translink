const sql = require('promise-mysql')

/**
 * Standard SQL database that can send queries.
 */
class Sql {

    /**
     * Connect to the SQL database with password authentication.
     *
     * @param {string} host Hostname or IP address of the SQL database.
     * @param {string} db Name of the database to access.
     * @param {string} user Name of the user logging in.
     * @param {string} pwd Password of the user logging in.
     */
    constructor(host, db, user, pwd) {
        this.fields = {}
        this.db = sql.createPool({
            host: host,
            database: db,
            user: user,
            password: pwd,
            connectionLimit: 5
        })
    }

    /**
     * Send a query to the SQL database and await a response.
     *
     * @param {string} statement The SQL statement to query.
     * @returns {promise<object>} The response from the SQL database.
     */
    query(statement) {
        return this.db.query(statement)
    }

    /**
     * Ensure that a table is created with a set of fields.
     *
     * @example
     * assertTable('dogs', ['name CHAR(12) NOT NULL', 'age SMALLINT', 'PRIMARY KEY (name, age)'])
     *
     * @param {string} name Name of the table.
     * @param {array<string>} fields List of fields to create the table schema.
     * @returns {promise<array<string>} Array of field name from the table.
     */
    assertTable(name, fields) {
        return this.query(`CREATE TABLE IF NOT EXISTS ${name} (${fields.join(',')});`)
            .then(response => this.query(`SHOW COLUMNS FROM ${name}`)
                .then(fields => this.fields[name] = fields.map(field => field.Field)))
    }

    /**
     * Insert a row or multiple rows into a table.
     *
     * @example
     * insertRow('dogs', [['mars', 6], ['penny', 3]])
     *
     * @param {string} name Name of the table.
     * @param {object|array<object>} values A single row or array of rows.
     * @returns {promise<object>} The response from the SQL database.
     */
    insertRow(name, values) {
        values = values.map(val => Sql.normalize(val))
        if(!(values[0] instanceof Array)) {
            values = [values]
        }
        values = values.map(val => `(${val.join(',')})`)
        return this.query(`INSERT IGNORE INTO ${name} VALUES ${values.join(',')};`)
    }

    /**
     * Convert an object into a SQL-friendly value.
     *
     * @param {object} Any object.
     * @returns {object} SQL-friendly representation of the object.
     */
    static normalize(object) {
        return Object.values(object).map(obj => {
            if(obj == null || obj == undefined) {
                return 'null'
            } else if(typeof obj === 'string') {
                return `\'${obj.replace('\'', '\'\'')}\'`
            } else if(isNaN(obj)) {
                return 0
            }
            return obj
        })
    }

}

module.exports = Sql
