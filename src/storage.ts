import { AwsClient } from 'aws4fetch'
import { unparse } from 'papaparse'

/**
 * Represents a cloud {@link Storage} device to save objects.
 * @see AwsStorage saves objects as csv files in S3.
 * @see GoogleStorage saves objects as SQL rows in BigQuery.
 */
export interface Storage {
  /**
   * Save an array of objects to a {@link Storage} device.
   * @param namespace The namespace of the {@link Storage} location.
   * @param key The specific key or path for where to save the objects.
   * @param rows An array of objects to save.
   * @returns {Promise<boolean>} Whether the operation was successful.
   */
  put(namespace: string, key: string, ...rows: any[]): Promise<boolean>;
}

/**
 * A {@link Storage} device that saves objects as csv files in S3.
 */
export class AwsStorage implements Storage {
  private client: AwsClient

  constructor(id: string, secret: string) {
    this.client = new AwsClient({ accessKeyId: id, secretAccessKey: secret })
  }

  public async put(namespace: string, key: string, ...rows: any[]): Promise<boolean> {
    if(!rows || rows.length <= 0) return false
    const columns = Object.keys(rows[0])

    const response = await this.client.fetch(
      `https://${namespace}.s3.amazonaws.com/${key}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment;filename=${key}.csv`
        },
        body: unparse(rows, { columns })
      }
    )

    if(!response.ok) {
      throw new Error(`${response.status}: ${await response.text()}`)
    }

    return response.ok
  }
}

/**
 * A {@link Storage} device that saves objects as SQL rows in BigQuery.
 */
export class GoogleStorage implements Storage {
  private client: GoogleClient

  constructor(proxyUrl: string, serviceAccountEncoded: string) {
    this.client = new GoogleClient(serviceAccountEncoded, proxyUrl)
  }

  public async put(namespace: string, key: string, ...rows: any[]): Promise<boolean> {
    if(!rows || rows.length <= 0) return false
    rows = rows.map(row => { return { insertId: row.id || JSON.stringify(row), json: row } })

    const chunk = 10_000
    if(rows.length > chunk) {
      const chunks = new Array()
      for(var i = 0; i < rows.length; i += chunk) {
        chunks.push(this.put(namespace, key, ...rows.slice(i, i + chunk)))
      }

      return Promise.all(chunks).then(() => true)
    }

    const [table, templateSuffix] = key.split(':', 2)
    const response = await this.client.fetch(
      `https://www.googleapis.com/bigquery/v2/projects/${this.client.projectId}/datasets/${namespace}/tables/${table}/insertAll`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          kind: [ 'bigquery#tableDataInsertAllRequest' ],
          skipInvalidRows: true,
          ignoreUnknownValues: true,
          templateSuffix,
          rows,
        })
      }
    )

    if(!response.ok) {
      throw new Error(`${response.status}: ${await response.text()}`)
    }

    return response.ok
  }
}

/**
 * A simple HTTP client to authenticate with Google APIs.
 * @see func/index.js for credentialUrl implementation details.
 * @see AwsClient for inspiration.
 */
class GoogleClient {
  private credentialUrl: string
  private credentialCache: Cache
  private serviceAccount: any

  constructor(serviceAccountEncoded: string, credentialUrl: string, credentialCache?: Cache) {
    this.serviceAccount = JSON.parse(atob(serviceAccountEncoded))
    this.credentialUrl = credentialUrl;
    this.credentialCache = credentialCache || (<any>caches).default
  }

  /**
   * Get the project id for the client.
   * @returns {string} The project id.
   */
  public get projectId(): string {
    return this.serviceAccount.project_id
  }

  /**
   * Get an internal cache key for the client.
   * @returns {string} A cache key.
   */
  private get credentialKey(): string {
    return `${this.credentialUrl}/${this.projectId}/${this.serviceAccount.private_key_id}`
  }

  /**
   * Get the oauth token for the client.
   * Will attempt to retrieve from {@link Cache} before calling {@link #refreshToken}.
   * @returns {Promise<string>} An oauth token.
   */
  public async getToken(): Promise<string> {
    const response = await this.credentialCache.match(this.credentialKey)

    if(!response) {
      return this.refreshToken()
    }

    return response.text()
  }
  
  /**
   * Get a fresh oauth token for the client.
   * @returns {Promise<string>} An oauth token.
   */
  public async refreshToken(): Promise<string> {
    const body = JSON.stringify({
      credentials: {
        client_email: this.serviceAccount.client_email,
        private_key: this.serviceAccount.private_key
      },
      projectId: this.serviceAccount.project_id,
      scopes: 'https://www.googleapis.com/auth/cloud-platform'
    })
    const response = await fetch(this.credentialUrl, { method: 'POST', body })
    const token = await response.text()

    if(!response.ok) {
      throw new Error(`Could not refresh oauth token: ${token}`)
    }

    const credential = new Response(token, { headers: { 'Cache-Control': 'public max-age=3600' } })
    return this.credentialCache
      .put(this.credentialKey, credential)
      .then(() => token)
  }

  /**
   * Fetch a resource with a Google oauth token.
   * @param input The url or resource to fetch.
   * @param init The options to fetch the resource with.
   */
  public async fetch(input: RequestInfo, init: RequestInit): Promise<Response> {
    const headers = { 'Authorization': `Bearer ${await this.getToken()}` }
    init.headers = Object.assign(headers, init.headers || {})

    const response = await fetch(input, init)
    if(response.status === 401) {
      return this.fetch(input, init)
    }

    return response
  }

}