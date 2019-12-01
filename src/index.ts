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
    const [response, ...tasks] = await getPositions()

    for(const task of tasks) {
      event.waitUntil(task.catch(Pigeon.captureException))
    }
    return new Response(JSON.stringify(response))
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

async function getPositions(): Promise<[object, ...Promise<any>[]]> {
  const positions = await translink.getPositions()

  return [
    positions,
    google.put('realtime', 'positions', ...positions),
    aws.put('translink-s3', `realtime/positions/${Date.now()}.csv`, ...positions)
  ]
}
