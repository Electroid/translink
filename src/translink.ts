import GtfsRealtimeBindings from 'gtfs-realtime-bindings'
import { parse } from 'papaparse'
import { unzip } from './zip'

/**
 * A point-in-time representation of a vehicle on the road.
 * @see https://developers.google.com/transit/gtfs-realtime/guides/vehicle-positions
 */
export interface Position {
  insertId: string;  // Primary key for this position: "vehicle-timestamp".
  vehicle: number;   // Unique identifier for the vehicle.
  direction: number; // Ordinal representing the heading of the vehicle.
  route: number;     // Identifier for the route the vehicle is traveling along.
  trip: number;      // Identifier for the trip, which represents a route at a given time.
  stop: number;      // Ordinal representing the next trip stop the vehicle is approaching.
  longitude: number; // Geographic longitude the vehicle is currently present.
  latitude: number;  // Geographic latitude the vehicle is currently present.
  timestamp: Long;   // Unix seconds that the position was observed from the vehicle.
  date: string;      // Service date, which may not be the same date from the timestamp.
}

/**
 * A public alert about service disruption.
 * @see https://developers.google.com/transit/gtfs-realtime/guides/service-alerts
 */
export interface Alert {
  id: number;       // Primary key for this alert.
  text: string;     // Human-readable description of what happened.
  start: Long;      // Unix seconds when the alert was first published.
  end: Long;        // Unix seconds when the alert was last confimed to be active.
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
  id: number;        // Internal unique identifier for the stop.
  code: number;      // External unique identifier for the stop.
  name: string;      // Name of the stop, typically an intersection.
  longitude: number; // Geographic longitude where the stop is located.
  latitude: number;  // Geographic latitude where the stop is located.
}

/**
 * A route that a provides regular bus service.
 * @see https://developers.google.com/transit/gtfs/reference#routestxt
 */
export interface Route {
  id: number;             // Internal unique identifier for the route.
  code: string;           // External unique identifier for the route.
  destinations: string[]; // List of terminus destinations for the route.
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
 * Access to the Translink static and real-time APIs.
 * @see https://developer.translink.ca
 * @see https://developers.google.com/transit/gtfs-realtime
 * @see https://developers.google.com/transit/gtfs
 */
export class Translink {
  private apiUrl: string
  private apiKeys: string[]

  constructor(apiKey: string) {
    this.apiUrl = 'https://gtfs.translink.ca'
    this.apiKeys = apiKey.split(',').map(key => key.trim())
  }

  /**
   * Returns the API key to authenticate with Translink services.
   * If multiple keys are provided, a random one will be selected.
   * @returns {string} A Translink API key.
   */
  private get apiKey(): string {
    return this.apiKeys[Math.floor(Math.random() * this.apiKeys.length)]
  }

  /**
   * Fetches an array of the latest {@link Position}s.
   * @throws If the real-time API returns a non-2xx response.
   * @returns {Promise<Position[]>} A promise of an array of {@link Position}s.
   */
  public async getPositions(): Promise<Position[]> {
    const response = await this.getFeed('gtfsposition')

    return response.map(entity => {
      const raw = entity.vehicle

      return {
        insertId: `${raw.vehicle.id}-${raw.timestamp}`,
        vehicle: parseInt(raw.vehicle.id),
        trip: parseInt(raw.trip.tripId),
        route: parseInt(raw.trip.routeId),
        direction: raw.trip.directionId,
        stop: raw.currentStopSequence,
        longitude: raw.position.longitude,
        latitude: raw.position.latitude,
        timestamp: raw.timestamp,
        date: [
          raw.trip.startDate.slice(0, 4),
          raw.trip.startDate.slice(4, 6),
          raw.trip.startDate.slice(6, 8)
        ].join('-'),
      } as Position
    })
  }

  /**
   * Fetches an array of the latest {@link Alert}s.
   * @throws If the real-time API returns a non-2xx response.
   * @returns {Promise<Alert[]>} A promise of an array of {@link Alert}s.
   */
  public async getAlerts(): Promise<Alert[]> {
    const response = await this.getFeed('gtfsalerts')

    return response.flatMap(res => {
      // JSON back-and-forth coerces enums ordinals to strings.
      const raw = JSON.parse(JSON.stringify(res.alert))
      const id = parseInt(res.id)

      // Filter alerts to only include bus related events (ordinal of 3).
      const entity = raw.informedEntity
        .filter((entity: any) => entity.routeType == 3)
      if(entity.length <= 0) {
        return []
      }

      // Extract and combine title and description from English translations.
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
        insertId: id,
        id: id,
        text: text,
        cause: raw.cause,
        effect: raw.effect,
        severity: raw.severityLevel,
        start: raw.activePeriod[0].start,
        end: raw.activePeriod[0].end ||
          Math.floor(new Date().getTime() / 1000),
        routes: selector(entity, (e: any) => e.routeId),
        trips: selector(entity, (e: any) => (e.trip || {}).tripId),
        stops: selector(entity, (e: any) => e.stopId),
      } as Alert]
    })
  }

  /**
   * Fetches an array of the latest {@link Trip}s.
   * @param {Date} date The date of the static resource publication.
   * @throws If the real-time API returns a non-2xx response.
   * @returns {Promise<Trip[]>} A promise of an array of {@link Trip}s.
   */
  public async getTrips(date: Date): Promise<Trip[]> {
    const raw = await this.getStatic(date, 'trips.txt')
    const excludes = new Set(['CANADA LINE', 'EXPO LINE', 'MILLENNIUM LINE', 'SEABUS', 'WEST COAST EXPRESS'])

    return raw.flatMap(trip => {
      for(const exclude of excludes) {
        if(exclude.startsWith(trip.trip_headsign)) {
          return []
        }
      }

      return {
        id: parseInt(trip.trip_id),
        route: trip.route_id,
        headsign: trip.trip_headsign,
        direction: parseInt(trip.direction_id),
        block: parseInt(trip.block_id),
        path: parseInt(trip.shape_id)
      } as Trip
    })
  }

  /**
   * Fetches an array of the latest {@link Stop}s.
   * @param {Date} date The date of the static resource publication.
   * @throws If the real-time API returns a non-2xx response.
   * @returns {Promise<Stop[]>} A promise of an array of {@link Stop}s.
   */
  public async getStops(date: Date): Promise<Stop[]> {
    const raw = await this.getStatic(date, 'stops.txt')

    return raw.flatMap(stop => {
      if(!stop.zone_id.startsWith('BUS')) {
        return []
      }

      return {
        id: parseInt(stop.stop_id),
        code: parseInt(stop.stop_code),
        name: stop.stop_name,
        longitude: parseFloat(stop.stop_lon),
        latitude: parseFloat(stop.stop_lat)
      } as Stop
    })
  }

  /**
   * Fetches an array of the latest {@link Route}s.
   * @param {Date} date The date of the static resource publication.
   * @throws If the real-time API returns a non-2xx response.
   * @returns {Promise<Route[]>} A promise of an array of {@link Route}s.
   */
  public async getRoutes(date: Date): Promise<Route[]> {
    const raw = await this.getStatic(date, 'routes.txt')

    return raw.flatMap(route => {
      if(parseInt(route.route_type) != 3) {
        return []
      }

      return {
        id: parseInt(route.route_id),
        code: route.route_short_name,
        destinations: route.route_long_name.split('/')
      } as Route
    })
  }

  /**
   * Fetches and decodes a Gtfs realtime resource feed.
   * @param {string} resource The name of the resource to fetch.
   * @throws If the real-time API returns a non-2xx response.
   * @returns {Promise<any[]>} A promise of an array of feed objects.
   */
  private async getFeed(resource: string): Promise<any[]> {
    const response = await fetch(`${this.apiUrl}/v2/${resource}?apikey=${this.apiKey}`)
  
    if(!response.ok) {
      throw new Error(`Bad ${resource}: ${response.status} ${response.url}}`)
    }

    return GtfsRealtimeBindings.transit_realtime.FeedMessage
      .decode(new Uint8Array(await response.arrayBuffer()))
      .entity
  }

  /**
   * Fetches and decodes a Gtfs static resource.
   * @param {Date} date The date of the resource to fetch.
   * @param {string} resource The name of the resource file to fetch.
   * @throws If the static API returns a non-2xx response.
   * @returns {Promise<any[]>} A promise of an array of resource objects.
   */
  private async getStatic(date: Date, resource: string): Promise<any[]> {
    const options = { cf: { cacheTtl: 60 * 60, cacheEverything: true } }
    const version = date.toISOString().split('T')[0]
    const response = await fetch(`https://translinkweb.blob.core.windows.net/gtfs/History/${version}/google_transit.zip`, <any>options)

    if(!response.ok) {
      throw new Error(`Bad static data: ${date} ${response.statusText} (are you sure the date is a friday?)`)
    }

    const buffer = await response.arrayBuffer()
    const manifest = await unzip(buffer, resource)

    const data = manifest.get(resource)
    if(!data) {
      throw new Error(`Unknown static file: ${date} ${resource}`)
    }

    const result = parse(data, { header: true, skipEmptyLines: 'greedy' })
    if(result.errors && result.errors.length > 0) {
      throw new Error(`Bad static data: ${date} ${JSON.stringify(result.errors)}`)
    }

    return result.data
  }
}
