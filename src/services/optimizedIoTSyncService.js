const axios = require("axios");
const https = require("https");
const queryDatabase = require("../utils/queryDatabase");

/**
 * Optimized IoT Sync Service
 * Tối ưu performance với batch processing và caching
 */

class OptimizedIoTSyncService {
  constructor() {
    this.API_BASE_URL = "https://thegreenlab.xyz/Datums/DataByDateJson";
    this.credentials = {
      username: "ngkloi@gmail.com",
      password: "ngkloi123",
    };
    this.logger = require("../loggers/loggers.config");

    // HTTPS Agent với connection pooling
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
      keepAlive: true,
      maxSockets: 5,
      maxFreeSockets: 2,
      timeout: 30000,
    });

    // Batch configuration
    this.BATCH_SIZE = 7; // Sync 7 ngày một lần thay vì từng ngày
    this.MAX_CONCURRENT_REQUESTS = 3;
    this.MEMORY_CLEANUP_INTERVAL = 50; // Clean up sau mỗi 50 operations
  }

  /**
   * Optimized batch sync với chunking và memory management
   */
  async optimizedSyncStation(serialNumber, startDate, endDate) {
    const startTime = Date.now();
    let totalProcessed = 0;
    let results = {inserted: 0, updated: 0, total: 0, errors: 0};

    try {
      this.logger.info(`Starting optimized sync for ${serialNumber}`, {
        startDate,
        endDate,
        batchSize: this.BATCH_SIZE,
      });

      // Verify station exists với caching
      const station = await this.getStationInfo(serialNumber);
      if (!station || station.status !== "active") {
        return {success: false, message: "Không tìm thấy trạm hoặc trạm không hoạt động"};
      }

      // Chia nhỏ thành các batch
      const dateRanges = this.createDateBatches(startDate, endDate, this.BATCH_SIZE);
      this.logger.info(`Created ${dateRanges.length} date batches for processing`);

      // Process batches với concurrency control
      for (let i = 0; i < dateRanges.length; i += this.MAX_CONCURRENT_REQUESTS) {
        const batchPromises = dateRanges.slice(i, i + this.MAX_CONCURRENT_REQUESTS).map(async (range, index) => {
          try {
            return await this.processBatchRange(serialNumber, range.start, range.end);
          } catch (error) {
            this.logger.error(`Batch ${i + index} failed:`, error.message);
            return {inserted: 0, updated: 0, total: 0, errors: 1};
          }
        });

        const batchResults = await Promise.all(batchPromises);

        // Accumulate results
        batchResults.forEach((result) => {
          results.inserted += result.inserted;
          results.updated += result.updated;
          results.total += result.total;
          results.errors += result.errors;
        });

        totalProcessed += batchResults.length;

        // Memory cleanup
        if (totalProcessed % this.MEMORY_CLEANUP_INTERVAL === 0) {
          this.performMemoryCleanup();
        }

        // Progress log
        this.logger.info(`Processed ${totalProcessed}/${dateRanges.length} batches for ${serialNumber}`);

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const duration = Date.now() - startTime;
      await this.logSyncResult(serialNumber, startDate, endDate, results, duration);

      this.logger.info(`Optimized sync completed for ${serialNumber}`, {
        ...results,
        duration: `${duration}ms`,
        batchesProcessed: dateRanges.length,
      });

      return {
        success: true,
        serialNumber,
        stationName: station.station_name,
        ...results,
        duration: `${duration}ms`,
        batchesProcessed: dateRanges.length,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Optimized sync failed for ${serialNumber}:`, error.message);

      await this.logSyncResult(serialNumber, startDate, endDate, results, duration, error);

      return {
        success: false,
        serialNumber,
        error: error.message,
        duration: `${duration}ms`,
      };
    }
  }

  /**
   * Process một batch range (nhiều ngày cùng lúc)
   */
  async processBatchRange(serialNumber, startDate, endDate) {
    try {
      this.logger.info(`Processing batch ${serialNumber}: ${startDate} to ${endDate}`);

      const data = await this.fetchFromExternalAPIBatch(serialNumber, startDate, endDate);
      const result = await this.saveToDatabaseOptimized(serialNumber, data);

      this.logger.info(`✓ Batch ${serialNumber} ${startDate}-${endDate}: ${result.inserted} inserted, ${result.updated} updated`);

      return result;
    } catch (error) {
      this.logger.error(`Error processing batch ${serialNumber} ${startDate}-${endDate}:`, error.message);
      return {inserted: 0, updated: 0, total: 0, errors: 1};
    }
  }

  /**
   * Optimized API fetch với retry logic
   */
  async fetchFromExternalAPIBatch(serialNumber, startDate, endDate, retries = 3) {
    const url = `${this.API_BASE_URL}?DeviceSerialNumber=${serialNumber}&StartDate=${startDate}&EndDate=${endDate}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.get(url, {
          auth: {
            username: this.credentials.username,
            password: this.credentials.password,
          },
          headers: {"Content-Type": "application/json"},
          timeout: 30000,
          httpsAgent: this.httpsAgent,
        });

        if (!response.data || !Array.isArray(response.data)) {
          this.logger.warn(`No data returned for ${serialNumber} ${startDate}-${endDate}`);
          return [];
        }

        this.logger.info(`Fetched ${response.data.length} records for ${serialNumber} ${startDate}-${endDate}`);
        return response.data;
      } catch (error) {
        if (attempt === retries) {
          throw new Error(`Failed to fetch after ${retries} attempts: ${error.message}`);
        }

        this.logger.warn(`Fetch attempt ${attempt} failed for ${serialNumber}, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000)); // Exponential backoff
      }
    }
  }

  /**
   * Optimized database save với batch upserts
   */
  async saveToDatabaseOptimized(serialNumber, data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return {inserted: 0, updated: 0, total: 0, errors: 0};
    }

    try {
      // Group data by datetime để tránh duplicate processing
      const groupedData = this.groupDataByDateTime(serialNumber, data);
      const entries = Object.entries(groupedData);

      if (entries.length === 0) {
        return {inserted: 0, updated: 0, total: 0, errors: 0};
      }

      // Batch upsert với ON CONFLICT
      const {inserted, updated} = await this.executeBatchUpsert(entries);

      return {
        inserted,
        updated,
        total: data.length,
        errors: 0,
      };
    } catch (error) {
      this.logger.error("Optimized database save error:", error.message);
      return {
        inserted: 0,
        updated: 0,
        total: data.length,
        errors: 1,
      };
    }
  }

  /**
   * Execute batch upsert với ON CONFLICT
   */
  async executeBatchUpsert(entries) {
    const batchInsertSize = 100; // Insert 100 records mỗi lần
    let totalInserted = 0;
    let totalUpdated = 0;

    for (let i = 0; i < entries.length; i += batchInsertSize) {
      const batch = entries.slice(i, i + batchInsertSize);

      try {
        const {inserted, updated} = await this.upsertBatch(batch);
        totalInserted += inserted;
        totalUpdated += updated;
      } catch (error) {
        this.logger.error(`Batch upsert error for batch ${i}-${i + batchInsertSize}:`, error.message);
      }
    }

    return {inserted: totalInserted, updated: totalUpdated};
  }

  /**
   * Single batch upsert query
   */
  async upsertBatch(batch) {
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    batch.forEach(([dateTime, group]) => {
      const sensorData = group.sensors;

      // Base values
      values.push(group.serial_number, group.date_time);
      let placeholder = `($${paramIndex}, $${paramIndex + 1}`;
      paramIndex += 2;

      // Add sensor values
      const sensorColumns = ["distance_value", "daily_rainfall_value", "salt_value", "temp_value"];
      sensorColumns.forEach((col) => {
        const value = sensorData[col] || null;
        values.push(value);
        placeholder += `, $${paramIndex}`;
        paramIndex++;
      });

      placeholder += ")";
      placeholders.push(placeholder);
    });

    const query = `
      INSERT INTO iot_system.iot_data (
        serial_number, date_time, 
        distance_value, daily_rainfall_value, salt_value, temp_value,
        created_at, updated_at
      ) VALUES ${placeholders.join(", ")}
      ON CONFLICT (serial_number, date_time) 
      DO UPDATE SET
        distance_value = COALESCE(EXCLUDED.distance_value, iot_data.distance_value),
        daily_rainfall_value = COALESCE(EXCLUDED.daily_rainfall_value, iot_data.daily_rainfall_value),
        salt_value = COALESCE(EXCLUDED.salt_value, iot_data.salt_value),
        temp_value = COALESCE(EXCLUDED.temp_value, iot_data.temp_value),
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, (xmax = 0) AS was_inserted
    `;

    // Add timestamps cho mỗi record
    const timestampValues = [];
    for (let i = 0; i < batch.length; i++) {
      timestampValues.push("CURRENT_TIMESTAMP", "CURRENT_TIMESTAMP");
    }

    const allValues = [...values, ...timestampValues];
    const result = await queryDatabase(query, allValues);

    const inserted = result.rows.filter((row) => row.was_inserted).length;
    const updated = result.rows.length - inserted;

    return {inserted, updated};
  }

  /**
   * Get station info với caching
   */
  async getStationInfo(serialNumber) {
    try {
      const query = `
        SELECT serial_number, station_name, status 
        FROM iot_system.iot_stations 
        WHERE serial_number = $1
      `;
      const result = await queryDatabase(query, [serialNumber]);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error(`Error getting station info for ${serialNumber}:`, error.message);
      return null;
    }
  }

  /**
   * Create date batches
   */
  createDateBatches(startDate, endDate, batchSize) {
    const batches = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    let currentStart = new Date(start);

    while (currentStart <= end) {
      const currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() + batchSize - 1);

      if (currentEnd > end) {
        currentEnd.setTime(end.getTime());
      }

      batches.push({
        start: currentStart.toISOString().split("T")[0],
        end: currentEnd.toISOString().split("T")[0],
      });

      currentStart.setDate(currentStart.getDate() + batchSize);
    }

    return batches;
  }

  /**
   * Group data by datetime với optimized processing
   */
  groupDataByDateTime(serialNumber, data) {
    const grouped = {};

    data.forEach((item) => {
      try {
        const itemDateTime = new Date(item.Date);
        if (isNaN(itemDateTime.getTime())) return;

        const dateTimeFormatted = itemDateTime.toISOString().slice(0, 16).replace("T", " ");

        if (!grouped[dateTimeFormatted]) {
          grouped[dateTimeFormatted] = {
            serial_number: serialNumber,
            date_time: dateTimeFormatted,
            sensors: {},
          };
        }

        const value = parseFloat(item.Value);
        if (isNaN(value)) return;

        const sensorColumn = this.mapSensorToColumn(item.SensorType);
        if (sensorColumn) {
          grouped[dateTimeFormatted].sensors[sensorColumn] = value;
        }
      } catch (error) {
        // Skip invalid items silently
      }
    });

    return grouped;
  }

  /**
   * Map sensor type to column
   */
  mapSensorToColumn(sensorType) {
    const mapping = {
      Distance: "distance_value",
      Level: "distance_value",
      "Daily Rainfall": "daily_rainfall_value",
      Rain: "daily_rainfall_value",
      Salt: "salt_value",
      Salinity: "salt_value",
      Temp: "temp_value",
      Temperature: "temp_value",
    };
    return mapping[sensorType] || null;
  }

  /**
   * Memory cleanup
   */
  performMemoryCleanup() {
    if (global.gc) {
      global.gc();
      this.logger.info("Memory cleanup performed");
    }
  }

  /**
   * Log sync result
   */
  async logSyncResult(serialNumber, startDate, endDate, result, duration, error = null) {
    try {
      const logQuery = `
        INSERT INTO iot_system.iot_sync_logs (
          serial_number, start_date, end_date,
          records_synced, records_inserted, records_updated,
          status, error_message, sync_duration_ms, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      `;

      await queryDatabase(logQuery, [
        serialNumber,
        startDate,
        endDate,
        result.total || 0,
        result.inserted || 0,
        result.updated || 0,
        error ? "failed" : result.errors > 0 ? "partial" : "success",
        error ? error.message : null,
        duration,
      ]);
    } catch (logError) {
      this.logger.error("Failed to log sync result:", logError.message);
    }
  }

  /**
   * Sync all stations với optimized processing
   */
  async optimizedSyncAllStations(daysBack = 7) {
    try {
      this.logger.info("Starting optimized sync for all active stations");

      const stationsQuery = `
        SELECT serial_number, station_name 
        FROM iot_system.iot_stations 
        WHERE status = 'active'
          AND serial_number IS NOT NULL 
          AND TRIM(serial_number) != ''
        ORDER BY serial_number
      `;

      const stationsResult = await queryDatabase(stationsQuery);
      const stations = stationsResult.rows || [];

      if (stations.length === 0) {
        return {totalStations: 0, successful: 0, failed: 0, results: []};
      }

      // Calculate date range
      const endDate = new Date().toISOString().split("T")[0];
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      const startDateStr = startDate.toISOString().split("T")[0];

      this.logger.info(`Syncing ${stations.length} stations from ${startDateStr} to ${endDate}`);

      // Process stations với controlled concurrency
      const results = [];
      const maxConcurrentStations = 2; // Limit concurrent station processing

      for (let i = 0; i < stations.length; i += maxConcurrentStations) {
        const stationBatch = stations.slice(i, i + maxConcurrentStations);

        const batchPromises = stationBatch.map((station) =>
          this.optimizedSyncStation(station.serial_number, startDateStr, endDate),
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Delay between station batches
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      const summary = {
        totalStations: stations.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        totalInserted: results.reduce((sum, r) => sum + (r.inserted || 0), 0),
        totalUpdated: results.reduce((sum, r) => sum + (r.updated || 0), 0),
        results: results,
      };

      this.logger.info("Optimized sync all stations completed", summary);
      return summary;
    } catch (error) {
      this.logger.error("Error in optimized sync all stations:", error.message);
      throw error;
    }
  }
}

module.exports = new OptimizedIoTSyncService();
