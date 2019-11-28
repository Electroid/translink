/**
 * A point-in-time {@link Weather} report at a specific gelocation.
 * @see https://darksky.net/dev/docs#data-point-object
 */
export interface Weather {
  time: Long; // Unix seconds of this weather report.        
  longitude: number; // Longitude geolocation of this weather report.
  latitude: number; // Latitude geolocation of this weather report.
  summary: string; // Human-readable text summary of this weather report.
  icon: string; // Human-viewable icon that describes the summary field.
  temperature: number; // Air temperature in degrees Celcius.
  temperature_apparent: number; // Apparent (or "feels like") temperature in degrees Celcius.
  dew_point: number; // Dew point in degrees Celcius.
  cloud_cover: number; // Percentage of sky occluded by clouds, between 0 and 1, inclusive.
  humidity: number; // Relative humidity, between 0 and 1, inclusive.
  pressure: number; // Sea-level air pressure in millibars.
  wind_speed: number; // Wind speed in kilometers per hour.
  wind_gust: number; // Wind gust speed in kilometers per hour.
  visibility: number; // Average visibility in kilometers.
  precipitation_probability: number; // Probability of precipitation occurring, between 0 and 1, inclusive.
  precipitation_intensity: number; // Intensity (in inches of liquid water per hour) of precipitation.
  precipitation_type: string; // Type of precipitation: "rain", "snow", or "sleet."
  uv_index: number; // The UV index.
  ozone: number; // Columnar density of total atmospheric ozone at the given time in Dobson units.
  nearest_storm: number; // Approximate distance to the nearest storm in kilometers.
}

/**
 * Access the {@link DarkSky} weather API to retrieve a {@link Weather} forecast.
 * @see https://darksky.net/dev/docs
 */ 
export class DarkSky {
  private apiUrl: string
  private apiKey: string

  constructor(apiKey: string) {
    this.apiUrl = 'https://api.darksky.net'
    this.apiKey = apiKey
  }

  /**
   * Fetches the current or forecasted {@link Weather} report at a specific geolocation.
   * @param {number} longitude The longitude of the forecast.
   * @param {number} latitude The latitude of the forecast.
   * @param {Long} time The unix seconds to get the forecast.
   * @throws If the API returns a non-2xx response.
   * @returns {Promise<Weather>} A promise of a {@link Weather} report.
   */
  public async getWeather(longitude: number, latitude: number, time?: Long): Promise<Weather> {
    const params = `${time ? `,${time}` : ''}?units=si&lang=en&exclude=minutely,hourly,daily,alerts,flags`
    const response = await fetch(`${this.apiUrl}/forecast/${this.apiKey}/${latitude},${longitude}${params}`)

    if(!response.ok) {
      throw new Error(`Bad forecast: ${response.status} ${response.url}`)
    }
    const raw = JSON.parse(await response.text()).currently
    
    return {
      time: raw.time,
      longitude: longitude,
      latitude: latitude,
      summary: raw.summary,
      icon: raw.icon,
      temperature: raw.temperature,
      temperature_apparent: raw.apparentTemperature,
      dew_point: raw.dewPoint,
      humidity: raw.humidity,
      pressure: raw.pressure,
      wind_speed: raw.windSpeed,
      wind_gust: raw.windGust,
      visibility: raw.visibility,
      precipitation_probability: raw.precipProbability,
      precipitation_intensity: raw.precipIntensity,
      precipitation_type: raw.precipType,
      uv_index: raw.uvIndex,
      ozone: raw.ozone,
      nearest_storm: raw.nearestStormDistance 
    } as Weather
  }
}
