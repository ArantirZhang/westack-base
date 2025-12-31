/**
 * InfluxDB Writer Service
 *
 * Batch writer for timeseries data to InfluxDB.
 * Buffers points and flushes periodically or when buffer is full.
 */

import { Point } from '@influxdata/influxdb-client';
import { getInfluxDBClient } from '../../database/influxdb.client';
import { InfluxPoint, TimeseriesDataPoint, MetricsQueryParams } from '../../models/timeseries.model';

export class InfluxWriterService {
  private client = getInfluxDBClient();
  private buffer: Point[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  private readonly BATCH_SIZE = 1000;           // Max points per batch
  private readonly FLUSH_INTERVAL_MS = 1000;    // Flush every 1 second
  private readonly MEASUREMENT = 'entity_metrics';

  constructor() {
    // Start periodic flush
    this.startPeriodicFlush();
  }

  /**
   * Write a single data point (buffered)
   */
  writePoint(data: InfluxPoint): void {
    const point = new Point(data.measurement || this.MEASUREMENT)
      .timestamp(data.timestamp);

    // Add tags
    for (const [key, value] of Object.entries(data.tags)) {
      if (value !== undefined) {
        point.tag(key, value);
      }
    }

    // Add fields
    for (const [key, value] of Object.entries(data.fields)) {
      if (typeof value === 'number') {
        point.floatField(key, value);
      } else if (typeof value === 'string') {
        point.stringField(key, value);
      } else if (typeof value === 'boolean') {
        point.booleanField(key, value);
      }
    }

    this.buffer.push(point);

    // Flush if buffer is full
    if (this.buffer.length >= this.BATCH_SIZE) {
      this.flush().catch(error => {
        console.error('Error flushing InfluxDB buffer:', error);
      });
    }
  }

  /**
   * Write multiple data points (buffered)
   */
  writePoints(dataPoints: InfluxPoint[]): void {
    for (const data of dataPoints) {
      this.writePoint(data);
    }
  }

  /**
   * Write entity metrics
   */
  writeEntityMetrics(
    entityId: string,
    metrics: Record<string, number | string | boolean>,
    timestamp: Date = new Date(),
    componentType?: string
  ): void {
    const tags: { entity_id: string; component_type?: string; [key: string]: string | undefined } = {
      entity_id: entityId,
      component_type: componentType,
    };

    // Ensure at least one field with value
    const fields: { value: number; [key: string]: number | string | boolean } = {
      value: 0, // Default value
    };

    for (const [key, value] of Object.entries(metrics)) {
      fields[key] = value;
      if (typeof value === 'number' && key !== 'value') {
        fields.value = value; // Use first numeric value as default
      }
    }

    this.writePoint({
      measurement: this.MEASUREMENT,
      tags,
      fields,
      timestamp,
    });
  }

  /**
   * Flush buffer to InfluxDB
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const pointsToWrite = [...this.buffer];
    this.buffer = [];

    try {
      await this.client.writePoints(pointsToWrite);
      console.log(`✅ Flushed ${pointsToWrite.length} points to InfluxDB`);
    } catch (error) {
      console.error('❌ Failed to write to InfluxDB:', error);
      // Re-add points to buffer on failure
      this.buffer.unshift(...pointsToWrite);
      throw error;
    }
  }

  /**
   * Query entity metrics
   */
  async queryEntityMetrics(params: MetricsQueryParams): Promise<TimeseriesDataPoint[]> {
    const { entityId, start, end, interval, aggregation, fields } = params;

    let query = `
      from(bucket: "${this.client.getBucket()}")
        |> range(start: ${typeof start === 'string' ? start : start.toISOString()})
    `;

    if (end) {
      query += `\n        |> filter(fn: (r) => r._time <= ${typeof end === 'string' ? end : end.toISOString()})`;
    }

    query += `
        |> filter(fn: (r) => r._measurement == "${this.MEASUREMENT}")
        |> filter(fn: (r) => r.entity_id == "${entityId}")
    `;

    if (fields && fields.length > 0) {
      const fieldFilters = fields.map(f => `r._field == "${f}"`).join(' or ');
      query += `\n        |> filter(fn: (r) => ${fieldFilters})`;
    }

    if (interval && aggregation) {
      query += `
        |> aggregateWindow(every: ${interval}, fn: ${aggregation}, createEmpty: false)
      `;
    }

    query += `
        |> yield(name: "results")
    `;

    const results = await this.client.query(query);
    const dataPoints: TimeseriesDataPoint[] = [];

    for (const record of results) {
      dataPoints.push({
        timestamp: new Date(record._time),
        value: record._value as number,
        tags: {
          entity_id: record.entity_id,
          field: record._field,
        },
      });
    }

    return dataPoints;
  }

  /**
   * Get latest metrics for an entity
   */
  async getLatestMetrics(entityId: string, fields?: string[]): Promise<Record<string, number>> {
    let query = `
      from(bucket: "${this.client.getBucket()}")
        |> range(start: -1h)
        |> filter(fn: (r) => r._measurement == "${this.MEASUREMENT}")
        |> filter(fn: (r) => r.entity_id == "${entityId}")
    `;

    if (fields && fields.length > 0) {
      const fieldFilters = fields.map(f => `r._field == "${f}"`).join(' or ');
      query += `\n        |> filter(fn: (r) => ${fieldFilters})`;
    }

    query += `
        |> last()
        |> yield(name: "latest")
    `;

    const results = await this.client.query(query);
    const metrics: Record<string, number> = {};

    for (const record of results) {
      metrics[record._field] = record._value as number;
    }

    return metrics;
  }

  /**
   * Delete entity metrics
   */
  async deleteEntityMetrics(entityId: string, start: Date, end: Date): Promise<void> {
    const predicate = `entity_id="${entityId}"`;
    await this.client.deleteData(this.MEASUREMENT, start, end, predicate);
  }

  /**
   * Get buffer status
   */
  getBufferStatus(): { size: number; maxSize: number; percentFull: number } {
    return {
      size: this.buffer.length,
      maxSize: this.BATCH_SIZE,
      percentFull: (this.buffer.length / this.BATCH_SIZE) * 100,
    };
  }

  /**
   * Start periodic flush timer
   */
  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        console.error('Error in periodic flush:', error);
      });
    }, this.FLUSH_INTERVAL_MS);
  }

  /**
   * Stop periodic flush and flush remaining points
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush remaining points
    await this.flush();
  }
}
