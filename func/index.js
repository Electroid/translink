const { GoogleAuth } = require('google-auth-library')

var secret = `Basic ${process.env.SECRET}`
var client = null

exports.proxy = async (req, res) => {

  if(req.get('Authorization') !== secret) {
    res.status(401).send()
    return
  }

  if(!client) {
    const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/bigquery' })
    client = await auth.getClient()
  }

  try {
    const response = await client.request({
      url: `https://bigquery.googleapis.com/bigquery${req.path}`,
      method: req.method,
      data: req.method === 'POST' ? req.body : null
    })
  
    res.status(response.status).send(response.data)
  } catch(err) {
    res.status(err.code || 500).send(err.message)
  }

}
