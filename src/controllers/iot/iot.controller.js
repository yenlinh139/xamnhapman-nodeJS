const queryDatabase = require("../../utils/queryDatabase");
const iotSyncService = require("../../services/iotSyncService");

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
        d.salt_unit,
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
 * - groupBy: Group results (date, none) - default: none
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

    if (groupBy === "date") {
      // Group by date
      dataQuery = `
        SELECT 
          DATE(date_time) as date,
          json_agg(
            json_build_object(
              'time', TO_CHAR(date_time, 'HH24:MI:SS'),
              'sensors', json_build_object(
                'distance', json_build_object('value', distance_value, 'unit', distance_unit, 'status', distance_status),
                'daily_rainfall', json_build_object('value', daily_rainfall_value, 'unit', daily_rainfall_unit, 'status', daily_rainfall_status),
                'salt', json_build_object('value', salt_value, 'unit', salt_unit, 'status', salt_status),
                'temp', json_build_object('value', temp_value, 'unit', temp_unit, 'status', temp_status),
              )
            ) ORDER BY date_time
          ) as readings
        FROM iot_system.iot_data
        ${whereClause}
        GROUP BY DATE(date_time)
        ORDER BY DATE(date_time) DESC
      `;
    } else {
      // No grouping - return all data
      dataQuery = `
        SELECT 
          id,
          date_time,
          -- Distance Sensor
          distance_value, distance_unit, distance_status,
          -- Daily Rainfall Sensor  
          daily_rainfall_value, daily_rainfall_unit, daily_rainfall_status,
          -- Salt Sensor
          salt_value, salt_unit, salt_status,
          -- Temperature Sensor
          temp_value, temp_unit, temp_status,
          updated_at,
          deleted_at
        FROM iot_system.iot_data
        ${whereClause}
        ORDER BY date_time DESC
      `;
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
        groupBy,
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
        s.status,
        s.updated_at,
        s.deleted_at,
        -- Subquery để đếm chính xác số records
        (SELECT COUNT(*) FROM iot_system.iot_data d WHERE d.serial_number = s.serial_number) as total_records,
        -- Subquery để lấy thời gian data cuối cùng
        (SELECT MAX(date_time) FROM iot_system.iot_data d WHERE d.serial_number = s.serial_number) as last_data_time,
        -- Subquery để lấy thời gian data đầu tiên  
        (SELECT MIN(date_time) FROM iot_system.iot_data d WHERE d.serial_number = s.serial_number) as first_data_time,
        -- Subquery để lấy giá trị độ mặn mới nhất
        (SELECT d.salt_value FROM iot_system.iot_data d WHERE d.serial_number = s.serial_number AND d.salt_value IS NOT NULL ORDER BY d.date_time DESC LIMIT 1) as latest_salt_value,
        (SELECT d.salt_unit FROM iot_system.iot_data d WHERE d.serial_number = s.serial_number AND d.salt_value IS NOT NULL ORDER BY d.date_time DESC LIMIT 1) as latest_salt_unit
      FROM iot_system.iot_stations s
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
  manualSync,
  getStations,
  getAllStations: getStations, // Alias cho tương thích
  getSyncLogs,
  getStats,
  getHealthCheck,
  clearAllData,
};
