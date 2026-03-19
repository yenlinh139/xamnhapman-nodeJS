const axios = require("axios");
const https = require("https");
const queryDatabase = require("../utils/queryDatabase");

/**
 * IoT Sync Service
 * Fetch data từ external IoT API và lưu vào database
 */

class IoTSyncService {
  constructor() {
    this.API_BASE_URL = "https://thegreenlab.xyz/Datums/DataByDateJson";
    this.credentials = {
      username: "nguyenduyliem@hcmuaf.edu.vn",
      password: "DHNL@2345",
    };
    this.logger = require("../loggers/loggers.config");

    // HTTPS Agent để bỏ qua SSL certificate expired
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });
  }

  /**
   * Lấy ngày mới nhất có data trong DB cho từng trạm
   */
  async getLatestDateByStation(serialNumber) {
    try {
      const query = `
        SELECT MAX(DATE(date_time)) as latest_date
        FROM iot_system.iot_data 
        WHERE serial_number = $1
      `;

      const result = await queryDatabase(query, [serialNumber]);

      if (result.rows && result.rows[0] && result.rows[0].latest_date) {
        return result.rows[0].latest_date;
      }

      // Nếu chưa có data, trả về 25/8/2025 (ngày bắt đầu)
      return new Date("2025-08-25");
    } catch (error) {
      this.logger.error(`Error getting latest date for ${serialNumber}:`, error.message);
      return new Date("2025-08-25"); // fallback
    }
  }

  /**
   * Lấy ngày mới nhất từ tất cả data trong iot_data
   */
  async getLatestDateForAllStations() {
    try {
      const query = `
        SELECT MAX(DATE(date_time)) as latest_date
        FROM iot_system.iot_data
      `;

      const result = await queryDatabase(query);

      if (result.rows && result.rows[0] && result.rows[0].latest_date) {
        return result.rows[0].latest_date;
      }

      // Nếu chưa có data, trả về 25/8/2025 (ngày bắt đầu)
      return new Date("2025-08-25");
    } catch (error) {
      this.logger.error("Error getting latest date for all stations:", error.message);
      return new Date("2025-08-25"); // fallback
    }
  }

  /**
   * Fetch data từ external API
   */
  async fetchFromExternalAPI(serialNumber, startDate, endDate) {
    try {
      const url = `${this.API_BASE_URL}?DeviceSerialNumber=${serialNumber}&StartDate=${startDate}&EndDate=${endDate}`;

      this.logger.info(`Fetching IoT data from external API:`, {
        serialNumber,
        startDate,
        endDate,
        url,
      });

      const response = await axios.get(url, {
        auth: {
          username: this.credentials.username,
          password: this.credentials.password,
        },
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000, // 30 seconds timeout
        httpsAgent: this.httpsAgent, // Bỏ qua SSL certificate
      });

      if (!response.data || !Array.isArray(response.data)) {
        this.logger.warn("External API returned no data or invalid format");
        return [];
      }

      this.logger.info(`Fetched ${response.data.length} records from external API`);
      return response.data;
    } catch (error) {
      this.logger.error(`Error fetching data from external API:`, {
        serialNumber,
        error: error.message,
        response: error.response?.data,
      });
      throw new Error(`Failed to fetch from external API: ${error.message}`);
    }
  }

  /**
   * Lưu data vào database (upsert) với wide format schema
   */
  async saveToDatabase(serialNumber, data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return {inserted: 0, updated: 0, total: 0};
    }

    let inserted = 0;
    let updated = 0;
    const errors = [];

    // Nhóm data theo datetime để gộp nhiều sensor vào 1 record
    const groupedData = {};

    for (const item of data) {
      try {
        // Parse datetime từ API
        const itemDateTime = new Date(item.Date);
        if (isNaN(itemDateTime.getTime())) {
          errors.push(`Invalid date: ${item.Date}`);
          continue;
        }

        // Format thành YYYY-MM-DD HH:MM (chỉ giờ phút)
        const year = itemDateTime.getFullYear();
        const month = (itemDateTime.getMonth() + 1).toString().padStart(2, "0");
        const day = itemDateTime.getDate().toString().padStart(2, "0");
        const hours = itemDateTime.getHours().toString().padStart(2, "0");
        const minutes = itemDateTime.getMinutes().toString().padStart(2, "0");

        const dateTimeFormatted = `${year}-${month}-${day} ${hours}:${minutes}`;

        if (!groupedData[dateTimeFormatted]) {
          groupedData[dateTimeFormatted] = {
            serial_number: serialNumber,
            date_time: dateTimeFormatted,
            sensors: {},
          };
        }

        // Parse value
        const value = parseFloat(item.Value);
        if (isNaN(value)) {
          errors.push(`Invalid value: ${item.Value} for ${item.SensorType}`);
          continue;
        }

        // Map sensor types to wide format columns
        const sensorColumn = this.mapSensorToColumn(item.SensorType);
        if (sensorColumn) {
          groupedData[dateTimeFormatted].sensors[sensorColumn] = value;

          // Lưu status vào cột tương ứng
          const statusColumn = this.mapSensorToStatusColumn(item.SensorType);
          if (statusColumn && item.Status) {
            groupedData[dateTimeFormatted].sensors[statusColumn] = item.Status;
          }
        }
      } catch (error) {
        errors.push(`Error processing item: ${error.message}`);
        continue;
      }
    }

    // Lưu từng group vào database
    for (const dateTime in groupedData) {
      const group = groupedData[dateTime];

      try {
        // Check if record exists
        const checkQuery = `
          SELECT id FROM iot_system.iot_data
          WHERE serial_number = $1 AND date_time = $2
        `;

        const existing = await queryDatabase(checkQuery, [group.serial_number, group.date_time]);

        if (existing.rows && existing.rows.length > 0) {
          // Update existing record với các cột sensor có giá trị
          const updateParts = [];
          const updateValues = [];
          let paramIndex = 1;

          for (const [column, value] of Object.entries(group.sensors)) {
            updateParts.push(`${column} = $${paramIndex}`);
            updateValues.push(value);
            paramIndex++;
          }

          updateParts.push(`updated_at = CURRENT_TIMESTAMP`);
          updateValues.push(group.serial_number, group.date_time);

          const updateQuery = `
            UPDATE iot_system.iot_data
            SET ${updateParts.join(", ")}
            WHERE serial_number = $${paramIndex} 
            AND date_time = $${paramIndex + 1}
            RETURNING id
          `;

          await queryDatabase(updateQuery, updateValues);
          updated++;
        } else {
          // Insert new record
          const columns = ["serial_number", "date_time"];
          const values = [group.serial_number, group.date_time];
          const placeholders = ["$1", "$2"];
          let paramIndex = 3;

          // Thêm các cột sensor có giá trị
          for (const [column, value] of Object.entries(group.sensors)) {
            columns.push(column);
            values.push(value);
            placeholders.push(`$${paramIndex}`);
            paramIndex++;
          }

          const insertQuery = `
            INSERT INTO iot_system.iot_data (${columns.join(", ")})
            VALUES (${placeholders.join(", ")})
            RETURNING id
          `;

          await queryDatabase(insertQuery, values);
          inserted++;
        }
      } catch (error) {
        errors.push(`Error saving group ${dateTime}: ${error.message}`);
        this.logger.error("Error saving data group:", {
          dateTime,
          group,
          error: error.message,
        });
      }
    }

    if (errors.length > 0) {
      this.logger.warn(`Encountered ${errors.length} errors while saving data:`, {
        sampleErrors: errors.slice(0, 5),
      });
    }

    return {
      inserted,
      updated,
      total: data.length,
      errors: errors.length,
    };
  }

  /**
   * Map sensor type từ API sang column name trong wide format
   */
  mapSensorToColumn(sensorType) {
    // Quy đổi 4 loại dữ liệu chính: Distance, Daily Rainfall, Salt, Temp
    const mapping = {
      // Khoảng cách/Mực nước
      Distance: "distance_value",
      Level: "distance_value",
      Height: "distance_value",
      Depth: "distance_value",

      // Lượng mưa hàng ngày (chú ý có space)
      "Daily Rainfall": "daily_rainfall_value",
      Rain: "daily_rainfall_value",
      Rainfall: "daily_rainfall_value",
      DailyRainfall: "daily_rainfall_value",
      Precip: "daily_rainfall_value",

      // Độ mặn
      Salt: "salt_value",
      Salinity: "salt_value",
      TDS: "salt_value",
      EC: "salt_value",

      // Nhiệt độ
      Temp: "temp_value",
      Temperature: "temp_value",
      Celsius: "temp_value",
    };

    return mapping[sensorType] || null;
  }

  /**
   * Map sensor type từ API sang status column name trong wide format
   */
  mapSensorToStatusColumn(sensorType) {
    // Quy đổi 4 loại dữ liệu chính: Distance, Daily Rainfall, Salt, Temp
    const mapping = {
      // Khoảng cách/Mực nước
      Distance: "distance_status",
      Level: "distance_status",
      Height: "distance_status",
      Depth: "distance_status",

      // Lượng mưa hàng ngày (chú ý có space)
      "Daily Rainfall": "daily_rainfall_status",
      Rain: "daily_rainfall_status",
      Rainfall: "daily_rainfall_status",
      DailyRainfall: "daily_rainfall_status",
      Precip: "daily_rainfall_status",

      // Độ mặn
      Salt: "salt_status",
      Salinity: "salt_status",
      TDS: "salt_status",
      EC: "salt_status",

      // Nhiệt độ
      Temp: "temp_status",
      Temperature: "temp_status",
      Celsius: "temp_status",
    };

    return mapping[sensorType] || null;
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
                    status, error_message, sync_duration_ms
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
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
   * Sync data cho 1 trạm trong khoảng thời gian với daily chunking
   */
  async syncStation(serialNumber, startDate, endDate) {
    const startTime = Date.now();

    try {
      this.logger.info(`Starting sync for station ${serialNumber}`, {
        startDate,
        endDate,
      });

      // Verify station exists
      const stationQuery = `
                SELECT serial_number, station_name, status 
                FROM iot_system.iot_stations 
                WHERE serial_number = $1
            `;
      const stationResult = await queryDatabase(stationQuery, [serialNumber]);

      if (!stationResult.rows || stationResult.rows.length === 0) {
        throw new Error(`Station ${serialNumber} not found in database`);
      }

      const station = stationResult.rows[0];
      if (station.status !== "active") {
        this.logger.warn(`Station ${serialNumber} is not active, skipping sync`);
        return {
          success: false,
          serialNumber,
          message: "Station is not active",
          inserted: 0,
          updated: 0,
        };
      }

      // Chia nhỏ theo từng ngày để tránh timeout và giảm tải
      const dailyResults = await this.syncStationByDays(serialNumber, startDate, endDate);

      const totalResult = {
        inserted: dailyResults.reduce((sum, r) => sum + r.inserted, 0),
        updated: dailyResults.reduce((sum, r) => sum + r.updated, 0),
        total: dailyResults.reduce((sum, r) => sum + r.total, 0),
        errors: dailyResults.reduce((sum, r) => sum + r.errors, 0),
      };

      const duration = Date.now() - startTime;

      // Log sync result
      await this.logSyncResult(serialNumber, startDate, endDate, totalResult, duration);

      this.logger.info(`Sync completed for ${serialNumber}`, {
        duration: `${duration}ms`,
        days: dailyResults.length,
        ...totalResult,
      });

      return {
        success: true,
        serialNumber,
        stationName: station.station_name,
        ...totalResult,
        duration: `${duration}ms`,
        dailyChunks: dailyResults.length,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(`Sync failed for ${serialNumber}:`, {
        error: error.message,
        duration: `${duration}ms`,
      });

      // Log failed sync
      await this.logSyncResult(serialNumber, startDate, endDate, {total: 0, inserted: 0, updated: 0}, duration, error);

      return {
        success: false,
        serialNumber,
        error: error.message,
        duration: `${duration}ms`,
      };
    }
  }

  /**
   * Sync station theo từng ngày để giảm tải
   */
  async syncStationByDays(serialNumber, startDate, endDate) {
    const results = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    let currentDate = new Date(start);

    while (currentDate <= end) {
      const dayStr = currentDate.toISOString().split("T")[0];

      try {
        this.logger.info(`Syncing ${serialNumber} for date: ${dayStr}`);

        // Fetch data cho ngày hiện tại
        const data = await this.fetchFromExternalAPI(serialNumber, dayStr, dayStr);

        // Save data cho ngày này
        const result = await this.saveToDatabase(serialNumber, data);

        results.push({
          date: dayStr,
          ...result,
        });

        this.logger.info(`✓ ${serialNumber} ${dayStr}: ${result.inserted} inserted, ${result.updated} updated`);

        // Delay nhỏ giữa các ngày để tránh rate limit
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        this.logger.error(`Error syncing ${serialNumber} for ${dayStr}:`, error.message);
        results.push({
          date: dayStr,
          inserted: 0,
          updated: 0,
          total: 0,
          errors: 1,
        });
      }

      // Chuyển sang ngày tiếp theo
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return results;
  }

  /**
   * Sync tất cả các trạm active từ ngày mới nhất trong DB đến hiện tại
   */
  async syncAllStations(daysBack = null) {
    try {
      this.logger.info("Starting sync for all active stations");

      // Lấy danh sách tất cả trạm active và có serial_number
      const stationsQuery = `
                SELECT serial_number, station_name 
                FROM iot_system.iot_stations 
                WHERE status = 'active'
                AND serial_number IS NOT NULL 
                AND TRIM(serial_number) != ''
                AND serial_number != ''
                ORDER BY serial_number
            `;

      const stationsResult = await queryDatabase(stationsQuery);
      const stations = stationsResult.rows || [];

      if (stations.length === 0) {
        this.logger.warn("No active stations found");
        return {
          totalStations: 0,
          successful: 0,
          failed: 0,
          totalInserted: 0,
          totalUpdated: 0,
          results: [],
        };
      }

      this.logger.info(`Found ${stations.length} active stations to sync`);

      // Tính toán date range
      const endDate = new Date();
      let startDate;

      if (daysBack !== null) {
        // Nếu có daysBack thì dùng logic cũ (cho manual sync)
        startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        this.logger.info(`Using manual sync mode: ${daysBack} days back`);
      } else {
        // Logic mới: lấy từ ngày mới nhất trong DB đến hiện tại
        const latestDate = await this.getLatestDateForAllStations();
        startDate = new Date(latestDate);

        // Nếu ngày mới nhất là hôm nay, sync từ hôm qua để đảm bảo không miss data
        const today = new Date().toISOString().split("T")[0];
        const latestDateStr = startDate.toISOString().split("T")[0];

        if (latestDateStr === today) {
          startDate.setDate(startDate.getDate() - 1);
        }

        this.logger.info(
          `Using smart sync mode: from ${startDate.toISOString().split("T")[0]} (latest in DB) to ${endDate.toISOString().split("T")[0]}`,
        );
      }

      const formatDate = (date) => {
        return date.toISOString().split("T")[0]; // YYYY-MM-DD
      };

      // Sync từng station
      const results = [];
      for (const station of stations) {
        // Với mỗi station, có thể có ngày mới nhất khác nhau
        let stationStartDate = startDate;

        if (daysBack === null) {
          // Lấy ngày mới nhất cho station này
          const stationLatestDate = await this.getLatestDateByStation(station.serial_number);
          stationStartDate = new Date(stationLatestDate);

          // Nếu ngày mới nhất là hôm nay, sync từ hôm qua
          const today = new Date().toISOString().split("T")[0];
          const stationLatestDateStr = stationStartDate.toISOString().split("T")[0];

          if (stationLatestDateStr === today) {
            stationStartDate.setDate(stationStartDate.getDate() - 1);
          }
        }

        const result = await this.syncStation(station.serial_number, formatDate(stationStartDate), formatDate(endDate));
        results.push(result);

        // Delay nhỏ giữa các requests để tránh overload API
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Summary
      const summary = {
        totalStations: stations.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        totalInserted: results.reduce((sum, r) => sum + (r.inserted || 0), 0),
        totalUpdated: results.reduce((sum, r) => sum + (r.updated || 0), 0),
        results: results,
      };

      this.logger.info("Sync all stations completed", summary);

      return summary;
    } catch (error) {
      this.logger.error("Error syncing all stations:", error.message);
      throw error;
    }
  }

  /**
   * Sync specific stations
   */
  async syncSpecificStations(stationSerials, daysBack = 7) {
    try {
      this.logger.info("Starting sync for specific stations", {stations: stationSerials});

      // Validate stations exist và có serial_number
      const placeholders = stationSerials.map((_, idx) => `$${idx + 1}`).join(",");
      const stationsQuery = `
                SELECT serial_number, station_name, status 
                FROM iot_system.iot_stations 
                WHERE serial_number IN (${placeholders})
                AND serial_number IS NOT NULL 
                AND TRIM(serial_number) != ''
                ORDER BY serial_number
            `;

      const stationsResult = await queryDatabase(stationsQuery, stationSerials);
      const stations = stationsResult.rows || [];

      if (stations.length === 0) {
        this.logger.warn("No valid stations found");
        return {
          totalStations: 0,
          successful: 0,
          failed: 0,
          totalInserted: 0,
          totalUpdated: 0,
          results: [],
        };
      }

      this.logger.info(`Found ${stations.length} stations to sync`);

      // Tính toán date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      const formatDate = (date) => {
        return date.toISOString().split("T")[0]; // YYYY-MM-DD
      };

      // Sync từng station
      const results = [];
      for (const station of stations) {
        if (station.status !== "active") {
          this.logger.warn(`Skipping inactive station: ${station.serial_number}`);
          results.push({
            success: false,
            serialNumber: station.serial_number,
            error: "Station is not active",
            inserted: 0,
            updated: 0,
          });
          continue;
        }

        const result = await this.syncStation(station.serial_number, formatDate(startDate), formatDate(endDate));
        results.push(result);

        // Delay nhỏ giữa các requests để tránh overload API
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Summary
      const summary = {
        totalStations: stations.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        totalInserted: results.reduce((sum, r) => sum + (r.inserted || 0), 0),
        totalUpdated: results.reduce((sum, r) => sum + (r.updated || 0), 0),
        results: results,
      };

      this.logger.info("Sync specific stations completed", summary);

      return summary;
    } catch (error) {
      this.logger.error("Error syncing specific stations:", error.message);
      throw error;
    }
  }

  /**
   * Initial full sync từ 25/08/2025 đến hiện tại
   * Chia nhỏ thành các chunks 30 ngày để tránh timeout
   */
  async initialFullSync(serialNumber, chunkDays = 30) {
    try {
      const startDate = new Date("2025-08-25");
      const endDate = new Date();

      this.logger.info(`Starting initial full sync for ${serialNumber}`, {
        from: startDate.toISOString(),
        to: endDate.toISOString(),
        chunkDays,
      });

      const results = [];
      let currentStart = new Date(startDate);

      while (currentStart < endDate) {
        const currentEnd = new Date(currentStart);
        currentEnd.setDate(currentEnd.getDate() + chunkDays);

        if (currentEnd > endDate) {
          currentEnd.setTime(endDate.getTime());
        }

        const formatDate = (date) => date.toISOString().split("T")[0];

        this.logger.info(`Syncing chunk: ${formatDate(currentStart)} to ${formatDate(currentEnd)}`);

        const result = await this.syncStation(serialNumber, formatDate(currentStart), formatDate(currentEnd));

        results.push(result);

        // Delay giữa các chunks
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Move to next chunk
        currentStart = new Date(currentEnd);
        currentStart.setDate(currentStart.getDate() + 1);
      }

      const summary = {
        serialNumber,
        totalChunks: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        totalInserted: results.reduce((sum, r) => sum + (r.inserted || 0), 0),
        totalUpdated: results.reduce((sum, r) => sum + (r.updated || 0), 0),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      };

      this.logger.info("Initial full sync completed", summary);

      return summary;
    } catch (error) {
      this.logger.error("Initial full sync failed:", error.message);
      throw error;
    }
  }
}

module.exports = new IoTSyncService();
