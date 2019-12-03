import * as Pigeon from 'pigeon'
import { Translink } from './translink'
import { AwsStorage, GoogleStorage } from './storage'

var translink: Translink
var google: GoogleStorage
var aws: AwsStorage

addEventListener('fetch', event => {
  event.respondWith(onFetch(event))
})

async function onFetch(event: FetchEvent): Promise<Response> {
  try {
    await onInit(event)
    const [response, ...tasks] = await getResponse(new URL(event.request.url))

    for(const task of tasks) {
      event.waitUntil(task.catch(Pigeon.captureException))
    }
    return response
  } catch(err) {
    event.waitUntil(Pigeon.captureException(err))
    return new Response(err, { status: 500 })
  }
}

async function onInit(event: FetchEvent): Promise<void> {
  Pigeon.init({
    dsn: await getEnv('SENTRY_DSN'), event })

  if(!translink) {
    translink = new Translink(
      await getEnv('TRANSLINK_API'))
  }

  if(!google) {
    google = new GoogleStorage(
      await getEnv('GOOGLE_ENDPOINT'),
      await getEnv('GOOGLE_SECRET'))
  }

  if(!aws) {
    aws = new AwsStorage(
      await getEnv('AWS_ID'),
      await getEnv('AWS_SECRET'))
  }
}

async function getEnv(key: string): Promise<string> {
  const value = await vault.get(key, 'text')
  if(!value) {
    throw new Error(`Could not find environment variable: ${key}`)
  }
  return value
}

async function getResponse(url: URL): Promise<[Response, ...Promise<any>[]]> {
  var results = []
  var [namespace, key] = url.pathname
    .split('/')
    .filter(path => path.length > 0)
    .slice(-2)

  switch(namespace) {
    case 'positions':
      results = await translink.getPositions()
      break
    case 'routes':
      results = await translink.getRoutes(key)
      break
    case 'trips':
      results = await translink.getTrips(key)
      break
    case 'stops':
      results = await translink.getStops(key)
      break
    case 'paths':
      results = await translink.getPaths(key)
      break
    default:
      return [ new Response('Not Found', { status: 404 }) ]
  }

  if(namespace === 'positions') {
    key = 'raw'
  } else {
    key = namespace
    namespace = 'schedule'
  }

  // TODO: aws.put('translink-s3', `positions/raw/${time.replace('T', '/')}.csv`, ...positions)

  return [
    new Response(JSON.stringify(results)),
    google.put(namespace, key, ...results)
  ]
}

