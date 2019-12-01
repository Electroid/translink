import { AwsClient } from 'aws4fetch'
import { unparse } from 'papaparse'

/**
 * Represents a cloud {@link Storage} device to save objects.
 * @see AwsStorage saves objects as '.csv' files in S3.
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
 * A {@link Storage} device that saves objects as '.csv' files in S3.
 */
export class AwsStorage implements Storage {
  private client: AwsClient

  constructor(id: string, secret: string) {
    this.client = new AwsClient({ accessKeyId: id, secretAccessKey: secret })
  }

  public async put(namespace: string, key: string, ...rows: any[]): Promise<boolean> {
    if(!rows || rows.length <= 0) return false
    const columns = Object.keys(rows[0])

    const res = await this.client.fetch(
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

    if(!res.ok) {
      throw new Error(`${res.status}: ${await res.text()}`)
    }

    return res.ok
  }
}

/**
 * A {@link Storage} device that saves objects as SQL rows in BigQuery.
 * @see google.js for implementation details of this API.
 */
export class GoogleStorage implements Storage {
  private endpoint: string
  private secret: string

  constructor(endpoint: string, secret: string) {
    this.endpoint = endpoint
    this.secret = secret
  }

  public async put(namespace: string, key: string, ...rows: any[]): Promise<boolean> {
    if(!rows || rows.length <= 0) return false
    if(!rows[0].insertId) {
      rows = rows.map(row => Object.assign({ insertId: JSON.stringify(row) }, row))
    }
    const res = await fetch(
      this.endpoint,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.secret}`
        },
        body: JSON.stringify({
          rows,
          dataset: namespace,
          table: key
        })
      }
    )

    if(!res.ok) {
      throw new Error(`${res.status}: ${await res.text()}`)
    }

    return res.ok
  }
}
