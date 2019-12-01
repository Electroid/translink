import { load } from 'cheerio'
import { parse, Field } from './util'

/**
 * A {@link Vehicle} that is operated by Coast Mountain Bus Company.
 */
export interface Vehicle {
  id: number;                  // Unique identifier for the vehicle.
  vin: string | undefined;     // Vehicle identification number, that encodes manufacturer information.
  license: string | undefined; // License plate of the vehicle.
  model: string;               // Make and model of the vehicle.
  manufacturer: string;        // Name of the manufacturer for the vehicle.
  engine: string;              // Type of engine drive for the vehicle.
  transmission: string;        // Type of engine transmission for the vehicle.
  motor: string | undefined;   // Type of motor for the vehicle, reserved for trolley vehicles only.
  sign: string;                // Type of destination sign for the vehicle.
  ac: boolean;                 // Whether the vehicle has air conditioning.
  seats: number;               // Maximum number of seats in the vehicle.
  started: Date | undefined;   // Apprioximate date when the vehicle first entered revenue service.
  ended: Date | undefined;     // Approximate date when the vehicle was retired, or null if still active.
}

/**
 * Access the Coast Mountain Bus Company's {@link Vehicle} fleet.
 * @see https://cptdb.ca/wiki/index.php/Coast_Mountain_Bus_Company
 * @see https://cptdb.ca/wiki/index.php/West_Vancouver_Municipal_Transit
 */
export class Cmbc {
  private wikiUrl: string

  constructor(wikiUrl = 'https://cptdb.ca') {
    this.wikiUrl = wikiUrl
  }

  /**
   * Get all the {@link Vehicle}s operated by {@link Cmbc}.
   * @returns {Promise<Arrray<Vehicle>>} A promise of an array of {@link Vehicle}s.
   */
  public async getVehicles(): Promise<Array<Vehicle>> {
    const result = new Array()

    for(const authority of [
      { name: 'Coast Mountain Bus Company', fleets: [
        { i: 1, name: 'Conventional'},
        { i: 2, name: 'Trolley' },
        { i: 4, name: 'Shuttle' } ] },
      { name: 'West Vancouver Municipal Transit', fleets: [
        { i: 1, name: 'Shuttle' },
        { i: 2, name: 'Conventional' }
      ] } ]) {

      var fleet = await this.getFleet(authority.name, ...authority.fleets)
      for(const order of fleet) {

        const vehicles = await this.getOrder(authority.name, order.order)
        for(const vehicle of vehicles) {

          const res = Object.assign({}, order, vehicle)
          delete res.order
          delete res.numbers

          result.push(res)
        }
      }
    }

    return result
  }

  private async getFleet(authority: string, ...fleets: any[]): Promise<Array<any>> {
    const res = await fetch(`${this.wikiUrl}/wiki/index.php/${authority.replace(/ /g, '_')}`)
    const text = await res.text()

    if(!res.ok) {
      throw new Error(`Bad authority: ${res.status} ${res.url}`)
    }

    return fleets.flatMap(f => Object.assign(this.parseFleet(load(text)('table')[f.i]), { fleet: f.name }))
  }

  private async getOrder(authority: string, order: string): Promise<Array<any>> {
    authority = authority.replace(/ /g, '_')
    order = order.replace(/ /g, '_').replace(/–|–/g, '-')

    // Weird exceptions, send a wiki request to fix them
    if(order === '7301-7374') {
      order = '7299,7301-7374'
    } else if(order === '9605-9699,9701-9725') {
      order = '9601-9699,9701-9725'
    } else if(order === '16101-16130,_16137') {
      order = '16101-16140'
    } else if(order === '19301-19302' || order === '19303-19304') {
      order = order.replace(/-/g, encodeURIComponent('–'))
    } else if(order === 'S1302,_S1320') {
      authority = 'Coast_Mountain_Bus_Company'
      order = 'S1301-S1320'
    } else if(order === '19501-19502') {
      authority = 'Coast_Mountain_Bus_Company'
      order = '19501-19549'
    }

    const res = await fetch(`${this.wikiUrl}/wiki/index.php/${authority}_${order.replace(/,/g, ',_')}`)
    const text = await res.text()

    if(!res.ok) {

      if(res.status == 404 && order.includes(',')) {
        const both = order.split(',')
        const second = both.pop() || ''
        const first = both.join(',_')

        const retry = await Promise.all([
          this.getOrder(authority, first).catch(() => []),
          this.getOrder(authority, second).catch(() => []) ])
        
        if(retry[0].length || retry[1].length) {
          return retry.flatMap(r => r)
        }
      }

      throw new Error(`Bad order: ${res.status} ${res.url}`)
    }

    const tables = load(text)('table')
    const summaries = this.parseOrderSummary(tables[0])
    const details = this.parseOrderDetails(tables[1])

    for(const detail of details) {
      for(const summary of summaries) {
        if(!summary.numbers || summary.numbers.has(detail.number)) {
          Object.assign(detail, Object.assign({}, summary, detail))
          delete detail.numbers
          break
        }
      }
    }

    return details
  }

  private parseFleet(html: CheerioElement): any {
    return parse(html, ...[
      { input: 'fleet', output: 'order' },
      { input: 'fleet', output: 'numbers', parser: this.parseRange },
      { input: 'years', parser: this.parseRange },
      { input: 'manufacturer', parser: this.parseString },
      { input: 'model', parser: this.parseString },
      { input: 'motor', parser: this.parseString },
      { input: 'engine', parser: this.parseString },
      { input: 'transmission', parser: this.parseString },
      { input: 'destination', output: 'sign', parser: this.parseString },
      { input: 'ac', parser: this.parseBoolean }
    ] as Field[])
  }

  private parseOrderSummary(html: CheerioElement): any {
    return parse(html, ...[
      { input: 'unit', output: 'numbers', parser: this.parseRange },
      { input: 'motor', parser: this.parseString },
      { input: 'engine', parser: this.parseString },
      { input: 'transmission', parser: this.parseString },
      { input: 'destination', output: 'sign', parser: this.parseString },
      { input: 'seating', output: 'seats', parser: this.parseSeats }
    ] as Field[])
  }

  private parseOrderDetails(html: CheerioElement): any {
    return parse(html, ...[
      { input: 'fleet', output: 'number', parser: (text: string) => this.parseRange(text).values().next().value },
      { input: 'date|service', output: 'date', parser: this.parseDate },
      { input: 'vin', parser: this.parseString },
      { input: 'license', parser: this.parseString },
      { input: 'centre|center', output: 'center', parser: this.parseCenter }
    ] as Field[])
  }

  private parseSeats(raw: string): number {
    return parseInt(raw.split(/–|-/g).shift() || '0')
  }

  private parseString(raw: string): string | undefined {
    const str = raw.split('\n').shift()
    if(str === '') {
      return undefined
    }
    return str
  }

  private parseBoolean(raw: string): boolean {
    return raw.toLowerCase() === 'yes'
  }

  private parseDate(raw: string): Date | undefined {
    const date = new Date(raw)
    if(Number.isNaN(date.getTime())) {
      return undefined
    }
    return date
  }

  private parseCenter(raw: string): string {
    if(!raw || raw === 'WVMT') {
      return 'West Vancouver'
    } else if(raw === 'First Transit') {
      return 'Victoria'
    }
    return raw
  }

  /**
   * Given ranges of numbers, return all the numbers within the ranges.
   * @example 3309-3358,1024-1029,1001
   * @param raw The ranges of numbers.
   */
  private parseRange(raw: string): Set<number> {
    return new Set(raw.split(',')
      .map(pair => pair.split(/–|-/g, 2)
        .map(num => parseInt(num.replace(/S/g, '').trim())))
      .flatMap(([first, last]) => {
        last = last || first
        if(Number.isNaN(first) || Number.isNaN(last)) {
          return []
        }
        const batch = new Array(last - first + 1)
        for(var i = first; i < last + 1; i++) {
          batch.push(i)
        }
        return batch
    }))
  }
}
