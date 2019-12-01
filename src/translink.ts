import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import { parse } from 'papaparse'
import { loadAsync } from 'jszip'
import { inflate } from 'pako'

/**
 * A point-in-time representation of a vehicle on the road.
 * @see https://developers.google.com/transit/gtfs-realtime/guides/vehicle-positions
 */
export interface Position {
  vehicle: number;   // Unique identifier for the vehicle.
  direction: number; // Ordinal representing the heading of the vehicle.
  route: number;     // Identifier for the route the vehicle is traveling along.
  trip: number;      // Identifier for the trip, which represents a route at a given time.
  stop: number;      // Ordinal representing the next stop along the trip the vehicle is approaching.
  location: string;  // Well-known text (WKT) representing the geography of the position.
  datetime: string;  // Date and time (ISO 8601) when the position was observed.
  date: string;      // Service date, which may not be the same date from the datetime.
}

/**
 * A public alert about service disruption.
 * @see https://developers.google.com/transit/gtfs-realtime/guides/service-alerts
 */
export interface Alert {
  id: number;       // Unique identifier for the alert.
  text: string;     // Human-readable description of what happened.
  start: string;    // Date and time (ISO 8601) when the alert was published.
  end: string;      // Date and time (ISO 8601) when the alert was last active.
  routes: number[]; // List of route identifiers that are affected.
  trips: number[];  // List of trip identifiers that are affected.
  stops: number[];  // List of stop identifiers that are affected. 
  cause: string;    // Enum representing the cause of the alert.
  effect: string;   // Enum representing the effect of the alert.
  severity: string; // Enum representing the severity of the effect of the alert.
}

/**
 * A bus stop along a route.
 * @see https://developers.google.com/transit/gtfs/reference#stopstxt
 */
export interface Stop {
  id: number;       // Internal unique identifier for the stop.
  code: number;     // External unique identifier for the stop.
  name: string;     // Name of the stop, typically an intersection.
  location: string; // Well-known text (WKT) representing the geography of the stop.
}

/**
 * A route that a provides regular bus service.
 * @see https://developers.google.com/transit/gtfs/reference#routestxt
 */
export interface Route {
  id: number;      // Internal unique identifier for the route.
  code: string;    // External unique identifier for the route.
  names: string[]; // List of terminus names for the route.
}

/**
 * Bus service at a specific time of day in the week.
 * @see https://developers.google.com/transit/gtfs/reference#tripstxt
 */
export interface Trip {
  id: number;        // Internal unique identifier for the trip.
  route: number;     // Identifier of the route providing service.
  headsign: string;  // Human-readable name of the trip that is displayed on the vehicle.
  direction: number; // Ordinal representing the heading of the trip.
  block: number;     // Identifier that references the vehicle schedule for the day.
  path: number;      // Identifier that references the road path of the trip.
}

/**
 * A list of coordinates representing the path of a {@link Trip}.
 * @see https://developers.google.com/transit/gtfs/reference#shapestxt
 */
export interface Path {
  id: number;       // Internal unique identifier for the path.
  location: string; // Well-known text (WKT) representing the geography of the path.
}

/**
 * Access to the Translink realtime and schedule APIs.
 * @see https://developer.translink.ca
 * @see https://developers.google.com/transit/gtfs-realtime
 * @see https://developers.google.com/transit/gtfs
 */
export class Translink {
  private apiUrl: string
  private apiKeys: string[]
  private apiCache: Cache

  constructor(apiKey: string, cache?: Cache) {
    this.apiUrl = 'https://gtfs.translink.ca'
    this.apiKeys = apiKey.split(',').map(key => key.trim())
    this.apiCache = cache || (<any>caches).default
  }

  /**
   * Get the API key to authenticate with Translink services.
   * If multiple keys are provided, a random one will be provided.
   * @returns {string} A Translink API key.
   */
  private get apiKey(): string {
    return this.apiKeys[Math.floor(Math.random() * this.apiKeys.length)]
  }

  /**
   * Get the rate limit for sending requests to Translink services.
   * Each API key has a limit of 1000 requests per day.
   * @returns {number} Number of seconds to wait between sending API requests.
   */
  private get apiTtl(): number {
    return Math.ceil(60 * 60 * 24 / (1000 * this.apiKeys.length))
  }

  /**
   * Get a list of the latest {@link Position}s.
   * @returns {Promise<Position[]>} A list of {@link Position}s.
   */
  public async getPositions(): Promise<Position[]> {
    const response = await this.getRealtime('gtfsposition')

    return response.map(entity => {
      const raw = entity.vehicle

      // Convert start date of 'YYYYMMDD' to 'YYYY-MM-DD'.
      var date = raw.trip.startDate
          date = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`

      return {
        vehicle: parseInt(raw.vehicle.id),
        trip: parseInt(raw.trip.tripId),
        route: parseInt(raw.trip.routeId),
        direction: parseInt(raw.trip.directionId),
        stop: parseInt(raw.currentStopSequence),
        location: `POINT(${raw.position.longitude} ${raw.position.latitude})`,
        datetime: this.getLocalTime(raw.timestamp),
        date,
      } as Position
    })
  }

  /**
   * Get a list of the latest {@link Alert}s.
   * @returns {Promise<Alert[]>} A list of {@link Alert}s.
   */
  public async getAlerts(): Promise<Alert[]> {
    const response = await this.getRealtime('gtfsalerts')

    return response.flatMap(res => {
      // JSON back-and-forth coerces enums ordinals to strings.
      const raw = JSON.parse(JSON.stringify(res.alert))
      const id = parseInt(res.id)

      // Only include alerts related to buses, which have an ordinal of 3.
      const entity = raw.informedEntity
        .filter((entity: any) => entity.routeType == 3)
      if(entity.length <= 0) {
        return []
      }

      // Combine the English title and description into one text.
      const text = [raw.headerText, raw.descriptionText]
        .map(text => text.translation.filter((part: any) => part.language == 'en')[0].text)
        .join(' ')
        .trim()
      
      // Extract trip, route, or stop selectors into an array.
      const selector = (entity: any, func: any) => {
        return Array.from(new Set(entity.map((each: any) =>
          parseInt(func(each))).filter(Boolean)))
      }

      return [{
        id: id,
        text: text,
        cause: raw.cause,
        effect: raw.effect,
        severity: raw.severityLevel,
        start: this.getLocalTime(raw.activePeriod[0].start),
        end: this.getLocalTime(raw.activePeriod[0].end),
        routes: selector(entity, (e: any) => e.routeId),
        trips: selector(entity, (e: any) => (e.trip || {}).tripId),
        stops: selector(entity, (e: any) => e.stopId),
      } as Alert]
    })
  }

  /**
   * Get a list of {@link Trip}s from the schedule data.
   * @param {Date} date The date of the schedule, usually a Friday.
   * @returns {Promise<Trip[]>} A list of {@link Trip}s.
   */
  public async getTrips(date: Date): Promise<Trip[]> {
    const raw = await this.getSchedule(date, 'trips.txt')
    const excludes = new Set(['CANADA LINE', 'EXPO LINE', 'MILLENNIUM LINE', 'SEABUS', 'WEST COAST EXPRESS'])

    return raw.flatMap(trip => {

      // Exclude trips that are not serviced by buses.
      for(const exclude of excludes) {
        if(exclude.startsWith(trip.trip_headsign)) {
          return []
        }
      }

      return {
        id: parseInt(trip.trip_id),
        route: parseInt(trip.route_id),
        headsign: trip.trip_headsign,
        direction: parseInt(trip.direction_id),
        block: parseInt(trip.block_id),
        path: parseInt(trip.shape_id)
      } as Trip
    })
  }

  /**
   * Get a list of {@link Stop}s from the schedule data.
   * @param {Date} date The date of the schedule, usually a Friday.
   * @returns {Promise<Stop[]>} A list of {@link Stop}s.
   */
  public async getStops(date: Date): Promise<Stop[]> {
    const raw = await this.getSchedule(date, 'stops.txt')

    return raw.flatMap(stop => {

      // Exclude stops that are not intended for buses.
      if(!stop.zone_id.startsWith('BUS')) {
        return []
      }

      return {
        id: parseInt(stop.stop_id),
        code: parseInt(stop.stop_code),
        name: stop.stop_name,
        location: `POINT(${stop.stop_lon} ${stop.stop_lat})`
      } as Stop
    })
  }

  /**
   * Get a list of {@link Route}s from the schedule data.
   * @param {Date} date The date of the schedule, usually a Friday.
   * @returns {Promise<Route[]>} A list of {@link Route}s.
   */
  public async getRoutes(date: Date): Promise<Route[]> {
    const raw = await this.getSchedule(date, 'routes.txt')

    return raw.flatMap(route => {

      // Exclude routes that are not serviced by buses.
      if(parseInt(route.route_type) != 3) {
        return []
      }

      return {
        id: parseInt(route.route_id),
        code: route.route_short_name,
        names: route.route_long_name.split('/')
      } as Route
    })
  }

  /**
   * Get a list of {@link Path}s from the schedule data.
   * @param {Date} date The date of the schedule, usually a Friday.
   * @returns {Promise<Path[]>} A list of {@link Path}s.
   */
  public async getPaths(date: Date): Promise<Path[]> {
    const points = await this.getSchedule(date, 'shapes.txt'); points.push({})
    const paths = new Array()

    var id = points[0].shape_id
    var path = new Array()

    // Since points are provided in order, add them to a running list.
    for(const point of points) {
      const pid = point.shape_id

      // When the path id has changed, commit to the result list.
      if(id != pid) {
        paths.push({ id: parseInt(id), location: `LINESTRING(${path.join(', ')})`})
        id = pid
        path = new Array()
      }

      path.push(point.shape_pt_lon + ' ' + point.shape_pt_lat)
    }

    return paths
  }

  /**
   * Get and decode a Gtfs realtime data feed.
   * Results will be cached based on {@link #apiTtl} to avoid rate limits.
   * @param {string} resource Name of the realtime resource.
   * @returns {Promise<any[]>} A list of realtime objects.
   */
  private async getRealtime(resource: string): Promise<any[]> {
    const url = `${this.apiUrl}/v2/${resource}?apikey=${this.apiKey}`
    const response = await this.fetch(url, this.apiTtl)

    if(!response.ok) {
      throw new Error(`Bad realtime ${resource}: ${response.status}`)
    }

    return GtfsRealtimeBindings.transit_realtime.FeedMessage
      .decode(new Uint8Array(await response.arrayBuffer()))
      .entity
  }

  /**
   * Get and decode a Gtfs static schedule data.
   * @param {Date} date The date of the schedule, usually a Friday.
   * @param {string} resource The name of the specific resource file.
   * @returns {Promise<any[]>} A list of schedule objects.
   */
  private async getSchedule(date: Date, resource: string): Promise<any[]> {
    const version = date.toISOString().split('T')[0]
    const url = `https://translinkweb.blob.core.windows.net/gtfs/History/${version}/google_transit.zip`
    const response = await this.fetch(url, 60 * 60 * 24 * 7 * 52)

    if(!response.ok) {
      throw new Error(`Bad schedule ${resource} for ${date.toISOString()}: ${response.status}`)
    }

    const raw = await this.unzip(await response.arrayBuffer(), resource)
    const result = parse(raw, { header: true, skipEmptyLines: 'greedy' })

    if(result.errors && result.errors.length > 0) {
      throw new Error(`Bad schedule ${resource} format for ${date.toISOString()}: ${JSON.stringify(result.errors)}`)
    }

    return result.data
  }

  /**
   * Convert unix seconds since epoch to an ISO-8601 date in Vancouver.
   * @param epoch Number of seconds since epoch.
   * @returns {string} An ISO-8601 date.
   */
  private getLocalTime(epoch?: number): string {
    var date = epoch ? new Date(epoch * 1000) : new Date()
    var parts = date.toLocaleString('en-GB', { timeZone: 'America/Vancouver' }).split(/\D/)

    return `${parts.slice(0, 3).reverse().join('-')}T${parts.slice(4, 7).join(':')}`
  }

  /**
   * Sends a fetch {@link Request} using the {@link Cache} API. 
   * @param url The url to fetch.
   * @param ttl The number of seconds to cache the {@link Response}.
   * @returns {Promise<Response>} The {@link Response} from the fetch.
   */
  private async fetch(url: string, ttl: number): Promise<Response> {
    const key = url.split('?')[0] // Exclude query parameters from key.
    var response = await this.apiCache.match(key)

    if(!response) {
      response = await fetch(url)

      if(response.ok) {
        response = new Response(response.body, response)
        response.headers.set('Cache-Control', `public max-age=${ttl}`)

        await this.apiCache.put(key, response.clone())
      }
    }

    return response
  }

  /**
   * Decompress a specific file in a zip archive.
   * @param archive The archive, as a buffer.
   * @param path The absolute path of file to decompress.
   * @returns {Promise<string>} Decompressed content from the path.
   */
  private async unzip(archive: ArrayBuffer, path: string): Promise<string> {
    const zip = await loadAsync(archive)
    const entry = zip.file(path)

    if(!entry) {
      throw new Error(`Bad unzip: ${path} not found in ${Object.keys(zip.files)}`)
    }

    return inflate((<any>entry)._data.compressedContent, { raw: true, to: 'string' })
  }
}
