const queryDatabase = require("../../utils/queryDatabase");
const iotSyncService = require("../../services/iotSyncService");

const VIETNAM_NOW_SQL = "timezone('Asia/Ho_Chi_Minh', CURRENT_TIMESTAMP)";

/**
 * GET /api/iot/data
 * Get all IoT data with pagination (wide format)
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 100, max: 1000)
 * - serialNumber: Filter by station
 * - startDate: Filter from date (YYYY-MM-DD)
 * - endDate: Filter to date (YYYY-MM-DD)
 * - sortBy: Sort field (date_time) - default: date_time
 * - sortOrder: asc or desc (default: desc)
 */
const getAllData = async (request, reply) => {
  try {
    const {page = 1, limit = 100, serialNumber, startDate, endDate, sortBy = "date_time", sortOrder = "desc"} = request.query;

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(1000, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Validate sort
    const validSortFields = ["date_time", "serial_number"];
    const validSortOrders = ["asc", "desc"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "date_time";
    const sortDir = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : "desc";

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (serialNumber) {
      conditions.push(`d.serial_number = $${paramCount++}`);
      params.push(serialNumber);
    }

    if (startDate) {
      conditions.push(`d.date_time >= $${paramCount++}::date`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`d.date_time <= $${paramCount++}::date + interval '1 day'`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM iot_system.iot_data d
      ${whereClause}
    `;
    const countResult = await queryDatabase(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get data with station info (wide format)
    const dataQuery = `
      SELECT 
        d.id,
        d.serial_number,
        s.station_name,
        s.station_code,
        d.date_time,
        -- Distance Sensor (4 main sensor types)
        d.distance_value,
        d.distance_unit,
        d.distance_status,
        -- Daily Rainfall Sensor  
        d.daily_rainfall_value,
        d.daily_rainfall_unit,
        d.daily_rainfall_status,
        -- Salt Sensor
        d.salt_value,
        '‰' AS salt_unit,
        d.salt_status,
        -- Temperature Sensor
        d.temp_value,
        d.temp_unit,
        d.temp_status,
        -- Timestamps
        d.updated_at,
        d.deleted_at
      FROM iot_system.iot_data d
      LEFT JOIN iot_system.iot_stations s ON d.serial_number = s.serial_number
      ${whereClause}
      ORDER BY d.${sortField} ${sortDir}
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `;

    params.push(limitNum, offset);
    const dataResult = await queryDatabase(dataQuery, params);

    // Response
    reply.code(200).send({
      success: true,
      data: dataResult.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total,
        totalPages: Math.ceil(total / limitNum),
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
      },
      filters: {
        serialNumber,
        startDate,
        endDate,
        sortBy: sortField,
        sortOrder: sortDir,
      },
    });
  } catch (error) {
    request.log.error("Error getting all IoT data:", error);
    reply.code(500).send({
      success: false,
      message: "Failed to get IoT data",
      error: error.message,
    });
  }
};

/**
 * GET /api/iot/data/:serialNumber
 * Get data by station with date range filters (wide format)
 *
 * Params:
 * - serialNumber: Station serial number
 *
 * Query params:
 * - startDate: From date (YYYY-MM-DD)
 * - endDate: To date (YYYY-MM-DD)
 * - groupBy: Group results (none=5m, hour, day/date) - default: none
 */
const getDataByStation = async (request, reply) => {
  try {
    const {serialNumber} = request.params;
    const {startDate, endDate, groupBy = "none"} = request.query;

    // Verify station exists
    const stationQuery = `
      SELECT 
        serial_number, 
        "station_name", 
        "latitude", 
        "longitude", 
        "station_code",
        status 
      FROM iot_system.iot_stations 
      WHERE serial_number = $1
    `;
    const stationResult = await queryDatabase(stationQuery, [serialNumber]);

    if (stationResult.rows.length === 0) {
      return reply.code(404).send({
        success: false,
        message: `Station ${serialNumber} not found`,
      });
    }

    const station = stationResult.rows[0];

    // Build WHERE conditions
    const conditions = [`serial_number = $1`];
    const params = [serialNumber];
    let paramCount = 2;

    if (startDate) {
      conditions.push(`date_time >= $${paramCount++}::date`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`date_time <= $${paramCount++}::date + interval '1 day'`);
      params.push(endDate);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    let dataQuery;
    const normalizedGroupBy = groupBy === "date" ? "day" : groupBy;

    if (normalizedGroupBy === "none") {
      // none = gom theo cửa sổ đồng bộ 5 phút (00:01-00:05, 00:06-00:10, ...)
      dataQuery = `
        WITH base AS (
          SELECT
            date_time,
            distance_value, distance_unit,
            daily_rainfall_value, daily_rainfall_unit,
            salt_value, salt_unit,
            temp_value, temp_unit,
            CASE
              WHEN EXTRACT(EPOCH FROM (date_time - date_trunc('hour', date_time))) = 0
                THEN date_trunc('hour', date_time)
              ELSE date_trunc('hour', date_time)
                   + (CEIL(EXTRACT(EPOCH FROM (date_time - date_trunc('hour', date_time))) / 300.0) * interval '5 minute')
            END AS sync_5m_end_time
          FROM iot_system.iot_data
          ${whereClause}
        )
        SELECT
          sync_5m_end_time,
          ROUND(AVG(distance_value)::numeric, 3) AS distance_value_avg,
          MAX(distance_unit) FILTER (WHERE distance_unit IS NOT NULL) AS distance_unit,
          CASE
            WHEN COUNT(daily_rainfall_value) > 0 THEN ROUND(SUM(daily_rainfall_value)::numeric, 3)
            ELSE NULL
          END AS daily_rainfall_value_sum,
          MAX(daily_rainfall_unit) FILTER (WHERE daily_rainfall_unit IS NOT NULL) AS daily_rainfall_unit,
          ROUND(AVG(salt_value)::numeric, 3) AS salt_value_avg,
          '‰' AS salt_unit,
          ROUND(AVG(temp_value)::numeric, 3) AS temp_value_avg,
          MAX(temp_unit) FILTER (WHERE temp_unit IS NOT NULL) AS temp_unit,
          COUNT(*) AS records_in_bucket
        FROM base
        WHERE sync_5m_end_time <= ${VIETNAM_NOW_SQL}
        GROUP BY sync_5m_end_time
        ORDER BY sync_5m_end_time DESC
      `;
    } else if (normalizedGroupBy === "hour") {
      // Giờ theo quy ước: 00:01-01:00 là giờ 1; 01:01-02:00 là giờ 2
      dataQuery = `
        WITH base AS (
          SELECT
            date_time,
            distance_value, distance_unit,
            daily_rainfall_value, daily_rainfall_unit,
            salt_value, salt_unit,
            temp_value, temp_unit,
            CASE
              WHEN date_time = date_trunc('hour', date_time)
                THEN date_trunc('hour', date_time)
              ELSE date_trunc('hour', date_time) + interval '1 hour'
            END AS hour_end_time
          FROM iot_system.iot_data
          ${whereClause}
        )
        SELECT
          hour_end_time,
          ROUND(AVG(distance_value)::numeric, 3) AS distance_value_avg,
          MAX(distance_unit) FILTER (WHERE distance_unit IS NOT NULL) AS distance_unit,
          CASE
            WHEN COUNT(daily_rainfall_value) > 0 THEN ROUND(SUM(daily_rainfall_value)::numeric, 3)
            ELSE NULL
          END AS daily_rainfall_value_sum,
          MAX(daily_rainfall_unit) FILTER (WHERE daily_rainfall_unit IS NOT NULL) AS daily_rainfall_unit,
          ROUND(AVG(salt_value)::numeric, 3) AS salt_value_avg,
          '‰' AS salt_unit,
          ROUND(AVG(temp_value)::numeric, 3) AS temp_value_avg,
          MAX(temp_unit) FILTER (WHERE temp_unit IS NOT NULL) AS temp_unit,
          COUNT(*) AS records_in_bucket
        FROM base
        WHERE hour_end_time <= ${VIETNAM_NOW_SQL}
        GROUP BY hour_end_time
        ORDER BY hour_end_time DESC
      `;
    } else if (normalizedGroupBy === "day") {
      dataQuery = `
        SELECT
          DATE(date_time) AS day,
          ROUND(AVG(distance_value)::numeric, 3) AS distance_value_avg,
          MAX(distance_unit) FILTER (WHERE distance_unit IS NOT NULL) AS distance_unit,
          CASE
            WHEN COUNT(daily_rainfall_value) > 0 THEN ROUND(SUM(daily_rainfall_value)::numeric, 3)
            ELSE NULL
          END AS daily_rainfall_value_sum,
          MAX(daily_rainfall_unit) FILTER (WHERE daily_rainfall_unit IS NOT NULL) AS daily_rainfall_unit,
          ROUND(AVG(salt_value)::numeric, 3) AS salt_value_avg,
          '‰' AS salt_unit,
          ROUND(AVG(temp_value)::numeric, 3) AS temp_value_avg,
          MAX(temp_unit) FILTER (WHERE temp_unit IS NOT NULL) AS temp_unit,
          COUNT(*) AS records_in_bucket
        FROM iot_system.iot_data
        ${whereClause}
        GROUP BY DATE(date_time)
        ORDER BY DATE(date_time) DESC
      `;
    } else {
      return reply.code(400).send({
        success: false,
        message: "Invalid groupBy. Supported values: none, hour, day, date",
      });
    }

    const dataResult = await queryDatabase(dataQuery, params);

    // Response
    reply.code(200).send({
      success: true,
      station: station,
      data: dataResult.rows,
      count: dataResult.rows.length,
      filters: {
        startDate,
        endDate,
        groupBy: normalizedGroupBy,
      },
    });
  } catch (error) {
    request.log.error("Error getting station data:", error);
    reply.code(500).send({
      success: false,
      message: "Failed to get station data",
      error: error.message,
    });
  }
};

/**
 * POST /api/iot/sync/:serialNumber
 * Trigger manual sync for a station
 *
 * Params:
 * - serialNumber: Station serial number (hoặc 'all' để sync tất cả)
 *
 * Body (optional):
 * - startDate: Start date (YYYY-MM-DD) - default: 7 days ago
 * - endDate: End date (YYYY-MM-DD) - default: today
 */
const manualSync = async (request, reply) => {
  try {
    const {serialNumber} = request.params;
    const {startDate, endDate} = request.body || {};

    let result;

    if (serialNumber.toLowerCase() === "all") {
      // Sync all stations
      const daysBack = startDate ? Math.ceil((new Date() - new Date(startDate)) / (1000 * 60 * 60 * 24)) : 7;

      result = await iotSyncService.syncAllStations(daysBack);

      reply.code(200).send({
        success: true,
        message: "Manual sync completed for all stations",
        result: {
          totalStations: result.totalStations,
          successful: result.successful,
          failed: result.failed,
          totalInserted: result.totalInserted,
          totalUpdated: result.totalUpdated,
          results: result.results,
        },
      });
    } else {
      // Sync single station
      const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const end = endDate || new Date().toISOString().split("T")[0];

      result = await iotSyncService.syncStation(serialNumber, start, end);

      if (result.success) {
        reply.code(200).send({
          success: true,
          message: `Manual sync completed for station ${serialNumber}`,
          result: {
            serialNumber: result.serialNumber,
            period: `${start} to ${end}`,
            inserted: result.inserted,
            updated: result.updated,
            total: result.total,
            errors: result.errors,
          },
        });
      } else {
        reply.code(400).send({
          success: false,
          message: `Sync failed for station ${serialNumber}`,
          error: result.error,
        });
      }
    }
  } catch (error) {
    request.log.error("Error during manual sync:", error);
    reply.code(500).send({
      success: false,
      message: "Manual sync failed",
      error: error.message,
    });
  }
};

const getStationBySerial = async (request, reply) => {
  try {
    const {serialNumber} = request.params;

    const query = `
      SELECT
        s.id,
        s.station_code,
        s.serial_number,
        s.station_name,
        s.longitude,
        s.latitude,
        s.station_type,
        s.frequency,
        s.time_period,
        s.note,
        s.status,
        COALESCE(iot_counts.total_records, 0) AS total_records,
        iot_counts.start_time,
        iot_counts.end_time
      FROM iot_system.iot_stations s
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total_records,
          MIN(d.date_time) AS start_time,
          MAX(d.date_time) AS end_time
        FROM iot_system.iot_data d
        WHERE d.serial_number = s.serial_number
      ) iot_counts ON TRUE
      WHERE s.serial_number = $1 OR s.station_code = $1
      LIMIT 1
    `;

    const result = await queryDatabase(query, [serialNumber]);
    if (result.rows.length === 0) {
      return reply.code(404).send({success: false, message: `Station ${serialNumber} not found`});
    }

    return reply.code(200).send({success: true, data: result.rows[0]});
  } catch (error) {
    request.log.error("Error getting station by serial:", error);
    return reply.code(500).send({success: false, message: "Failed to get station", error: error.message});
  }
};

const createStation = async (request, reply) => {
  try {
    const {
      station_code = null,
      serial_number,
      station_name,
      longitude = null,
      latitude = null,
      station_type = "Trạm IoT",
      frequency = "5 phút",
      time_period = null,
      note = "",
      status = "active",
    } = request.body || {};

    if (!serial_number || !station_name) {
      return reply.code(400).send({
        success: false,
        message: "serial_number và station_name là bắt buộc",
      });
    }

    const result = await queryDatabase(
      `
      INSERT INTO iot_system.iot_stations (
        station_code, serial_number, station_name, longitude, latitude,
        station_type, frequency, time_period, note, status, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      RETURNING *
      `,
      [station_code, serial_number, station_name, longitude, latitude, station_type, frequency, time_period, note, status],
    );

    return reply.code(201).send({
      success: true,
      message: "IoT station created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    request.log.error("Error creating IoT station:", error);
    const message = error.code === "23505" ? "serial_number đã tồn tại" : "Failed to create IoT station";
    const statusCode = error.code === "23505" ? 409 : 500;
    return reply.code(statusCode).send({success: false, message, error: error.message});
  }
};

const updateStation = async (request, reply) => {
  try {
    const {serialNumber} = request.params;
    const allowedFields = [
      "station_code",
      "serial_number",
      "station_name",
      "longitude",
      "latitude",
      "station_type",
      "frequency",
      "time_period",
      "note",
      "status",
    ];

    const updates = [];
    const params = [];

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(request.body || {}, field)) {
        params.push(request.body[field]);
        updates.push(`${field} = $${params.length}`);
      }
    });

    if (updates.length === 0) {
      return reply.code(400).send({success: false, message: "Không có dữ liệu để cập nhật"});
    }

    params.push(serialNumber);
    const result = await queryDatabase(
      `
      UPDATE iot_system.iot_stations
      SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE serial_number = $${params.length} OR station_code = $${params.length}
      RETURNING *
      `,
      params,
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({success: false, message: `Station ${serialNumber} not found`});
    }

    return reply.code(200).send({
      success: true,
      message: "IoT station updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    request.log.error("Error updating IoT station:", error);
    const message = error.code === "23505" ? "serial_number đã tồn tại" : "Failed to update IoT station";
    const statusCode = error.code === "23505" ? 409 : 500;
    return reply.code(statusCode).send({success: false, message, error: error.message});
  }
};

const deleteStation = async (request, reply) => {
  try {
    const {serialNumber} = request.params;

    const result = await queryDatabase(
      `
      DELETE FROM iot_system.iot_stations
      WHERE serial_number = $1 OR station_code = $1
      RETURNING id, station_code, serial_number, station_name
      `,
      [serialNumber],
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({success: false, message: `Station ${serialNumber} not found`});
    }

    return reply.code(200).send({
      success: true,
      message: "IoT station deleted successfully",
      data: result.rows[0],
    });
  } catch (error) {
    request.log.error("Error deleting IoT station:", error);
    return reply.code(500).send({success: false, message: "Failed to delete IoT station", error: error.message});
  }
};

const createIoTData = async (request, reply) => {
  try {
    const {
      serial_number,
      date_time,
      distance_value = null,
      distance_unit = "m",
      distance_status = null,
      daily_rainfall_value = null,
      daily_rainfall_unit = "mm",
      daily_rainfall_status = null,
      salt_value = null,
      salt_unit = "ppt",
      salt_status = null,
      temp_value = null,
      temp_unit = "°C",
      temp_status = null,
    } = request.body || {};

    if (!serial_number || !date_time) {
      return reply.code(400).send({success: false, message: "serial_number và date_time là bắt buộc"});
    }

    const stationCheck = await queryDatabase(`SELECT serial_number FROM iot_system.iot_stations WHERE serial_number = $1`, [serial_number]);
    if (stationCheck.rows.length === 0) {
      return reply.code(404).send({success: false, message: `Station ${serial_number} not found`});
    }

    const result = await queryDatabase(
      `
      INSERT INTO iot_system.iot_data (
        serial_number, date_time,
        distance_value, distance_unit, distance_status,
        daily_rainfall_value, daily_rainfall_unit, daily_rainfall_status,
        salt_value, salt_unit, salt_status,
        temp_value, temp_unit, temp_status,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
      RETURNING *
      `,
      [
        serial_number,
        date_time,
        distance_value,
        distance_unit,
        distance_status,
        daily_rainfall_value,
        daily_rainfall_unit,
        daily_rainfall_status,
        salt_value,
        salt_unit,
        salt_status,
        temp_value,
        temp_unit,
        temp_status,
      ],
    );

    return reply.code(201).send({
      success: true,
      message: "IoT data created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    request.log.error("Error creating IoT data:", error);
    const message = error.code === "23505" ? "Bản ghi serial_number + date_time đã tồn tại" : "Failed to create IoT data";
    const statusCode = error.code === "23505" ? 409 : 500;
    return reply.code(statusCode).send({success: false, message, error: error.message});
  }
};

const updateIoTData = async (request, reply) => {
  try {
    const {id} = request.params;
    const allowedFields = [
      "serial_number",
      "date_time",
      "distance_value",
      "distance_unit",
      "distance_status",
      "daily_rainfall_value",
      "daily_rainfall_unit",
      "daily_rainfall_status",
      "salt_value",
      "salt_unit",
      "salt_status",
      "temp_value",
      "temp_unit",
      "temp_status",
    ];

    const updates = [];
    const params = [];

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(request.body || {}, field)) {
        params.push(request.body[field]);
        updates.push(`${field} = $${params.length}`);
      }
    });

    if (updates.length === 0) {
      return reply.code(400).send({success: false, message: "Không có dữ liệu để cập nhật"});
    }

    params.push(id);
    const result = await queryDatabase(
      `
      UPDATE iot_system.iot_data
      SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${params.length}
      RETURNING *
      `,
      params,
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({success: false, message: `IoT data id ${id} not found`});
    }

    return reply.code(200).send({
      success: true,
      message: "IoT data updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    request.log.error("Error updating IoT data:", error);
    const message = error.code === "23505" ? "Bản ghi serial_number + date_time đã tồn tại" : "Failed to update IoT data";
    const statusCode = error.code === "23505" ? 409 : 500;
    return reply.code(statusCode).send({success: false, message, error: error.message});
  }
};

const deleteIoTData = async (request, reply) => {
  try {
    const {id} = request.params;

    const result = await queryDatabase(
      `DELETE FROM iot_system.iot_data WHERE id = $1 RETURNING id, serial_number, date_time`,
      [id],
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({success: false, message: `IoT data id ${id} not found`});
    }

    return reply.code(200).send({
      success: true,
      message: "IoT data deleted successfully",
      data: result.rows[0],
    });
  } catch (error) {
    request.log.error("Error deleting IoT data:", error);
    return reply.code(500).send({success: false, message: "Failed to delete IoT data", error: error.message});
  }
};

/**
 * GET /api/iot/stations
 * Get all stations with data summary
 *
 * Query params:
 * - status: Filter by status (active, inactive)
 */
const getStations = async (request, reply) => {
  try {
    const {status} = request.query;

    let query = `
      SELECT 
        s.id,
        s.station_code,
        s.serial_number,
        s.station_name,
        s.longitude,
        s.latitude,
        s.station_type,
        s.frequency,
        s.time_period,
        s.note,
        COALESCE(iot_counts.total_records, 0) AS total_records,
        iot_counts.start_time,
        iot_counts.end_time,
        -- Đơn vị độ mặn mới nhất
        '‰' AS latest_salt_unit,
        -- Mốc kết thúc của giờ mới nhất (quy ước: 00:01-01:00 là giờ 1, 01:01-02:00 là giờ 2...)
        salt_stats.latest_hour_end_time,
        -- Mốc kết thúc của giờ liền trước để so sánh
        salt_stats.previous_hour_end_time,
        -- Trung bình độ mặn của giờ mới nhất
        salt_stats.latest_hour_avg_salt,
        -- Trung bình độ mặn của giờ liền trước
        salt_stats.previous_hour_avg_salt,
        -- Ngày liền trước dùng để tính trung bình ngày
        salt_stats.previous_day,
        -- Trung bình độ mặn của ngày liền trước
        salt_stats.previous_day_avg_salt
      FROM iot_system.iot_stations s
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total_records,
          MIN(d_count.date_time) AS start_time,
          MAX(d_count.date_time) AS end_time
        FROM iot_system.iot_data d_count
        WHERE d_count.serial_number = s.serial_number
      ) iot_counts ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          latest_slot.latest_hour_end_time,
          (latest_slot.latest_hour_end_time - interval '1 hour') AS previous_hour_end_time,
          (
            SELECT ROUND(AVG(d1.salt_value)::numeric, 3)
            FROM iot_system.iot_data d1
            WHERE d1.serial_number = s.serial_number
              AND d1.salt_value IS NOT NULL
              AND (
                CASE
                  WHEN d1.date_time = date_trunc('hour', d1.date_time)
                    THEN date_trunc('hour', d1.date_time)
                  ELSE date_trunc('hour', d1.date_time) + interval '1 hour'
                END
              ) = latest_slot.latest_hour_end_time
          ) AS latest_hour_avg_salt,
          (
            SELECT ROUND(AVG(d2.salt_value)::numeric, 3)
            FROM iot_system.iot_data d2
            WHERE d2.serial_number = s.serial_number
              AND d2.salt_value IS NOT NULL
              AND (
                CASE
                  WHEN d2.date_time = date_trunc('hour', d2.date_time)
                    THEN date_trunc('hour', d2.date_time)
                  ELSE date_trunc('hour', d2.date_time) + interval '1 hour'
                END
              ) = (latest_slot.latest_hour_end_time - interval '1 hour')
          ) AS previous_hour_avg_salt,
          (latest_slot.latest_hour_end_time::date - interval '1 day')::date AS previous_day,
          (
            SELECT ROUND(AVG(d3.salt_value)::numeric, 3)
            FROM iot_system.iot_data d3
            WHERE d3.serial_number = s.serial_number
              AND d3.salt_value IS NOT NULL
              AND d3.date_time::date = (latest_slot.latest_hour_end_time::date - interval '1 day')::date
          ) AS previous_day_avg_salt
        FROM (
          SELECT MAX(
            CASE
              WHEN d0.date_time = date_trunc('hour', d0.date_time)
                THEN date_trunc('hour', d0.date_time)
              ELSE date_trunc('hour', d0.date_time) + interval '1 hour'
            END
          ) AS latest_hour_end_time
          FROM iot_system.iot_data d0
          WHERE d0.serial_number = s.serial_number
            AND d0.salt_value IS NOT NULL
            AND (
              CASE
                WHEN d0.date_time = date_trunc('hour', d0.date_time)
                  THEN date_trunc('hour', d0.date_time)
                ELSE date_trunc('hour', d0.date_time) + interval '1 hour'
              END
            ) <= ${VIETNAM_NOW_SQL}
        ) latest_slot
      ) salt_stats ON TRUE
    `;
    const params = [];

    if (status) {
      query += " WHERE s.status = $1";
      params.push(status);
    }

    query += " ORDER BY s.serial_number";

    const result = await queryDatabase(query, params);

    reply.code(200).send({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    request.log.error("Error getting stations:", error);
    reply.code(500).send({
      success: false,
      message: "Failed to get stations",
      error: error.message,
    });
  }
};

/**
 * GET /api/iot/sync/logs
 * Get sync history logs
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 * - serialNumber: Filter by station
 * - status: Filter by status (success, error)
 */
const getSyncLogs = async (request, reply) => {
  try {
    const {page = 1, limit = 50, serialNumber, status} = request.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (serialNumber) {
      conditions.push(`serial_number = $${paramCount++}`);
      params.push(serialNumber);
    }

    if (status) {
      conditions.push(`status = $${paramCount++}`);
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM iot_system.iot_sync_logs ${whereClause}`;
    const countResult = await queryDatabase(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get logs
    const logsQuery = `
      SELECT * FROM iot_system.iot_sync_logs
      ${whereClause}
      ORDER BY sync_time DESC
      LIMIT $${paramCount++} OFFSET $${paramCount++}
    `;

    params.push(limitNum, offset);
    const logsResult = await queryDatabase(logsQuery, params);

    reply.code(200).send({
      success: true,
      data: logsResult.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    request.log.error("Error getting sync logs:", error);
    reply.code(500).send({
      success: false,
      message: "Failed to get sync logs",
      error: error.message,
    });
  }
};

/**
 * GET /api/iot/stats
 * Get statistics about IoT data (updated for wide format)
 */
const getStats = async (request, reply) => {
  try {
    // Total records per station
    const stationStatsQuery = `
      SELECT 
        d.serial_number,
        s."station_name",
        s."station_code",
        COUNT(*) as total_records,
        MIN(d.date_time) as first_date,
        MAX(d.date_time) as last_date,
        -- Count non-null values for each sensor type
        COUNT(CASE WHEN distance_value IS NOT NULL THEN 1 END) as distance_readings,
        COUNT(CASE WHEN daily_rainfall_value IS NOT NULL THEN 1 END) as daily_rainfall_readings,
        COUNT(CASE WHEN salt_value IS NOT NULL THEN 1 END) as salt_readings,
        COUNT(CASE WHEN temp_value IS NOT NULL THEN 1 END) as temp_readings
      FROM iot_system.iot_data d
      LEFT JOIN iot_system.iot_stations s ON d.serial_number = s.serial_number
      GROUP BY d.serial_number, s."station_name", s."station_code"
      ORDER BY d.serial_number
    `;

    // Overall stats
    const overallStatsQuery = `
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT serial_number) as total_stations,
        MIN(date_time) as first_date,
        MAX(date_time) as last_date,
        -- Count total sensor readings across all sensor types
        COUNT(CASE WHEN distance_value IS NOT NULL THEN 1 END) as total_distance_readings,
        COUNT(CASE WHEN daily_rainfall_value IS NOT NULL THEN 1 END) as total_daily_rainfall_readings,
        COUNT(CASE WHEN salt_value IS NOT NULL THEN 1 END) as total_salt_readings,
        COUNT(CASE WHEN temp_value IS NOT NULL THEN 1 END) as total_temp_readings
      FROM iot_system.iot_data
    `;

    // Recent sync status
    const recentSyncQuery = `
      SELECT 
        serial_number,
        status,
        records_synced,
        sync_time,
        error_message
      FROM iot_system.iot_sync_logs
      WHERE id IN (
        SELECT MAX(id) 
        FROM iot_system.iot_sync_logs 
        GROUP BY serial_number
      )
      ORDER BY sync_time DESC
    `;

    const [stationStats, overallStats, recentSync] = await Promise.all([
      queryDatabase(stationStatsQuery, []),
      queryDatabase(overallStatsQuery, []),
      queryDatabase(recentSyncQuery, []),
    ]);

    reply.code(200).send({
      success: true,
      overall: overallStats.rows[0],
      byStation: stationStats.rows,
      recentSync: recentSync.rows,
    });
  } catch (error) {
    request.log.error("Error getting stats:", error);
    reply.code(500).send({
      success: false,
      message: "Failed to get stats",
      error: error.message,
    });
  }
};

/**
 * DELETE /api/iot/data/clear-all
 * Clear all IoT data and optionally re-sync
 *
 * Body (optional):
 * - resync: boolean - Trigger full sync after clearing (default: false)
 * - daysBack: number - Days to sync back (default: 30)
 */
const clearAllData = async (request, reply) => {
  try {
    const {resync = false, daysBack = 30} = request.body || {};

    // Xóa tất cả dữ liệu IoT
    const deleteQuery = `DELETE FROM iot_system.iot_data`;
    await queryDatabase(deleteQuery, []);

    // Xóa sync logs cũ
    const deleteSyncLogsQuery = `DELETE FROM iot_system.iot_sync_logs`;
    await queryDatabase(deleteSyncLogsQuery, []);

    let syncResult = null;

    if (resync) {
      // Trigger sync lại toàn bộ dữ liệu
      request.log.info(`Starting full resync for ${daysBack} days back`);
      syncResult = await iotSyncService.syncAllStations(daysBack);
    }

    reply.code(200).send({
      success: true,
      message: "All IoT data cleared successfully",
      cleared: true,
      resync: resync,
      syncResult: syncResult,
    });
  } catch (error) {
    request.log.error("Error clearing all IoT data:", error);
    reply.code(500).send({
      success: false,
      message: "Failed to clear IoT data",
      error: error.message,
    });
  }
};

/**
 * GET /api/iot/health
 * Health check for IoT system
 */
const getHealthCheck = async (request, reply) => {
  try {
    // Check database connectivity
    const dbCheck = await queryDatabase("SELECT COUNT(*) FROM iot_system.iot_stations", []);

    // Check recent data
    const recentDataCheck = await queryDatabase(
      `
      SELECT COUNT(*) as recent_count 
      FROM iot_system.iot_data 
      WHERE date_time >= NOW() - INTERVAL '24 hours'
    `,
      [],
    );

    reply.code(200).send({
      success: true,
      status: "healthy",
      checks: {
        database: "connected",
        total_stations: parseInt(dbCheck.rows[0].count),
        recent_data_24h: parseInt(recentDataCheck.rows[0].recent_count),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    request.log.error("Health check failed:", error);
    reply.code(500).send({
      success: false,
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

module.exports = {
  getAllData,
  getDataByStation,
  createIoTData,
  updateIoTData,
  deleteIoTData,
  manualSync,
  getStations,
  getAllStations: getStations, // Alias cho tương thích
  getStationBySerial,
  createStation,
  updateStation,
  deleteStation,
  getSyncLogs,
  getStats,
  getHealthCheck,
  clearAllData,
};
