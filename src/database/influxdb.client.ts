import { InfluxDB, Point, WriteApi, QueryApi } from '@influxdata/influxdb-client';
import { DeleteAPI } from '@influxdata/influxdb-client-apis';

/**
 * InfluxDB Client for timeseries metrics storage
 *
 * Handles high-frequency BMS data with batch writing and automatic flushing
 */
export class InfluxDBClient {
  private client: InfluxDB | null = null;
  private writeApi: WriteApi | null = null;
  private queryApi: QueryApi | null = null;

  private url: string;
  private token: string;
  private org: string;
  private bucket: string;

  constructor(
    url: string = process.env.INFLUXDB_URL || 'http://localhost:8086',
    token: string = process.env.INFLUXDB_TOKEN || '',
    org: string = process.env.INFLUXDB_ORG || 'bms-org',
    bucket: string = process.env.INFLUXDB_BUCKET || 'bms-metrics'
  ) {
    this.url = url;
    this.token = token;
    this.org = org;
    this.bucket = bucket;
  }

  /**
   * Connect to InfluxDB
   */
  connect(): void {
    try {
      this.client = new InfluxDB({ url: this.url, token: this.token });
      this.writeApi = this.client.getWriteApi(this.org, this.bucket);
      this.queryApi = this.client.getQueryApi(this.org);

      // Configure batch writing (1000 points or 1 second, whichever comes first)
      this.writeApi.useDefaultTags({ source: 'westack-bms' });

      console.log('✅ Connected to InfluxDB');
    } catch (error) {
      console.error('❌ Failed to connect to InfluxDB:', error);
      throw error;
    }
  }

  /**
   * Disconnect and flush pending writes
   */
  async disconnect(): Promise<void> {
    if (this.writeApi) {
      try {
        await this.writeApi.close();
        console.log('🔌 Disconnected from InfluxDB');
      } catch (error) {
        console.error('Error closing InfluxDB connection:', error);
      }
    }
  }

  /**
   * Write a single point to InfluxDB
   */
  writePoint(point: Point): void {
    if (!this.writeApi) {
      throw new Error('InfluxDB not connected. Call connect() first.');
    }
    this.writeApi.writePoint(point);
  }

  /**
   * Write multiple points to InfluxDB
   */
  writePoints(points: Point[]): void {
    if (!this.writeApi) {
      throw new Error('InfluxDB not connected. Call connect() first.');
    }
    this.writeApi.writePoints(points);
  }

  /**
   * Flush pending writes immediately
   */
  async flush(): Promise<void> {
    if (!this.writeApi) {
      throw new Error('InfluxDB not connected. Call connect() first.');
    }
    await this.writeApi.flush();
  }

  /**
   * Query data from InfluxDB using Flux
   */
  async query<T = any>(fluxQuery: string): Promise<T[]> {
    if (!this.queryApi) {
      throw new Error('InfluxDB not connected. Call connect() first.');
    }

    const results: T[] = [];

    return new Promise((resolve, reject) => {
      this.queryApi!.queryRows(fluxQuery, {
        next: (row, tableMeta) => {
          const result = tableMeta.toObject(row);
          results.push(result as T);
        },
        error: (error) => {
          console.error('Query error:', error);
          reject(error);
        },
        complete: () => {
          resolve(results);
        },
      });
    });
  }

  /**
   * Health check for InfluxDB
   */
  async healthCheck(): Promise<boolean> {
    if (!this.client || !this.queryApi) {
      return false;
    }

    try {
      // Perform a simple query to verify connectivity
      const testQuery = `from(bucket: "${this.bucket}") |> range(start: -1m) |> limit(n: 1)`;
      await this.query(testQuery);
      return true;
    } catch (error) {
      console.error('InfluxDB health check failed:', error);
      return false;
    }
  }

  /**
   * Get latest metrics for a specific equipment
   */
  async getLatestMetrics(equipmentId: string): Promise<any[]> {
    const fluxQuery = `
      from(bucket: "${this.bucket}")
        |> range(start: -1h)
        |> filter(fn: (r) => r.equipment_id == "${equipmentId}")
        |> last()
    `;

    return this.query(fluxQuery);
  }

  /**
   * Get metrics history for a time range
   */
  async getMetricsHistory(
    equipmentId: string,
    start: string,
    stop: string = 'now()'
  ): Promise<any[]> {
    const fluxQuery = `
      from(bucket: "${this.bucket}")
        |> range(start: ${start}, stop: ${stop})
        |> filter(fn: (r) => r.equipment_id == "${equipmentId}")
    `;

    return this.query(fluxQuery);
  }

  /**
   * Get bucket name
   */
  getBucket(): string {
    return this.bucket;
  }

  /**
   * Delete data from InfluxDB
   * @param measurement - The measurement name to filter (optional, can be part of predicate)
   * @param start - Start date for deletion range
   * @param end - End date for deletion range
   * @param predicate - Optional predicate for filtering data (e.g., '_measurement="temperature"')
   */
  async deleteData(
    measurement: string,
    start: Date,
    end: Date,
    predicate?: string
  ): Promise<void> {
    if (!this.client) {
      throw new Error('InfluxDB not connected. Call connect() first.');
    }

    const deleteAPI = new DeleteAPI(this.client);

    // Build predicate: use provided predicate or default to measurement filter
    const deletePredicate = predicate || `_measurement="${measurement}"`;

    try {
      await deleteAPI.postDelete({
        org: this.org,
        bucket: this.bucket,
        body: {
          start: start.toISOString(),
          stop: end.toISOString(),
          predicate: deletePredicate,
        },
      });

      console.log(`✅ Deleted data from ${this.bucket} (${deletePredicate}) between ${start.toISOString()} and ${end.toISOString()}`);
    } catch (error) {
      console.error('❌ Failed to delete data from InfluxDB:', error);
      throw error;
    }
  }
}

// Singleton instance
let influxDBClient: InfluxDBClient | null = null;

/**
 * Get or create the InfluxDB client singleton
 */
export function getInfluxDBClient(): InfluxDBClient {
  if (!influxDBClient) {
    influxDBClient = new InfluxDBClient();
  }
  return influxDBClient;
}

/**
 * Initialize and connect to InfluxDB
 */
export function initInfluxDB(): InfluxDBClient {
  const client = getInfluxDBClient();
  client.connect();
  return client;
}
