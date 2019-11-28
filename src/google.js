/**
 * Independent HTTP API deployed as a Google Cloud Function to
 * insert streaming data into BigQuery. Unfortunately, the 'bigquery'
 * npm package cannot run in a browser environment.
 */
const { BigQuery } = require('@google-cloud/bigquery')

async function bigQuery(req, res, callback) {
  if('Basic ' + process.env.SECRET !== req.get('Authorization')) {
    res.status(401).send('Bad secret, see logs for more info')
    return
  }

  if(!req.body) {
    req.body = {}
  }

  try {
    const bq = new BigQuery()
      .dataset(req.body.dataset)
      .table(req.body.table)

    await callback(bq)
  } catch(err) {
    console.debug(JSON.stringify(req.body))
    console.error(err)
    if(err.errors) {
      console.error(JSON.stringify(err.errors))
    }
    res.status(400).send(err)
  }
}

exports.insert = async (req, res) => {
  await bigQuery(req, res, async bq => {
    const op = await bq.insert(req.body.rows, {
      skipInvalidRows: true, ignoreUnknownValues: true })
    if(op.err) {
      throw op.err
    }

    console.log(op)
    res.status(200).send(JSON.stringify(op.apiResponse))
  })  
}

exports.query = async (req, res) => {
  await bigQuery(req, res, async bq => {
    const op = await bq.createQueryJob({
      query: req.body.query,
      location: 'US' })
    const rows = await op.getQueryResults()
  
    res.status(200).send(JSON.stringify(rows))
  })
}
