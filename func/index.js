const { GoogleAuth } = require('google-auth-library')

/**
 * Simple HTTP proxy that generates a Google oauth token.
 * 
 * @example
 * {
 *   credentials: {
 *     client_email: '...',
 *     private_key: '...'
 *   },
 *   projectId: '...',
 *   scopes: '...'
 * }
 * 
 * @see https://github.com/googleapis/google-auth-library-nodejs/blob/master/samples/credentials.js
 */
exports.proxy = async (req, res) => {
  try {
    const opts = JSON.parse(req.body)
    if(!opts || !opts.credentials || !opts.credentials.private_key) {
      throw new Error('Must provide credentials in the body')
    }

    const auth = new GoogleAuth(req.body)
    const client = await auth.getClient()
    const url = `https://www.googleapis.com${req.path}`
    const headers = await client.getRequestHeaders(url)
  
    res.status(200).send(headers['Authorization'].split('Bearer ').pop())
  } catch(err) {
    res.status(400).send(err.message)
  }
}
