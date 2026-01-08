const iotSyncService = require("../../services/iotSyncService");
const queryDatabase = require("../../utils/queryDatabase");

/**
 * POST /api/iot/initial-sync
 * Sync toàn bộ data từ 25/8/2025 đến hiện tại cho tất cả trạm
 *
 * Body (optional):
 * - stations: Array of serial numbers to sync (e.g., ['CKC_IoT', 'CAH_IoT'])
 * - startDate: Start date (default: '2025-08-25')
 * - chunkDays: Chunk size in days (default: 30)
 */
const initialSync = async (request, reply) => {
  try {
    const {stations = null, startDate = "2025-08-25", chunkDays = 30} = request.body || {};

    request.log.info("Starting initial sync", {stations, startDate, chunkDays});

    // Lấy danh sách trạm cần sync
    let stationsToSync;

    if (stations && Array.isArray(stations)) {
      // Sync specific stations
      const placeholders = stations.map((_, idx) => `$${idx + 1}`).join(",");
      const stationsResult = await queryDatabase(
        `SELECT serial_number, TenTram, status 
                 FROM iot_system.iot_stations 
                 WHERE serial_number IN (${placeholders})
                 ORDER BY serial_number`,
        stations,
      );
      stationsToSync = stationsResult.rows;
    } else {
      // Sync all active stations
      const stationsResult = await queryDatabase(
        `SELECT serial_number, TenTram, status 
                 FROM iot_system.iot_stations 
                 WHERE status = 'active'
                 ORDER BY serial_number`,
        [],
      );
      stationsToSync = stationsResult.rows;
    }

    if (stationsToSync.length === 0) {
      return reply.code(404).send({
        success: false,
        message: "No active stations found to sync",
      });
    }

    request.log.info(`Found ${stationsToSync.length} station(s) to sync`, {
      stations: stationsToSync.map((s) => s.serial_number),
    });

    // Sync từng station
    const results = [];
    let totalInserted = 0;
    let totalUpdated = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const station of stationsToSync) {
      try {
        request.log.info(`Syncing station: ${station.serial_number} - ${station.TenTram}`);

        const result = await iotSyncService.initialFullSync(station.serial_number, chunkDays);

        if (result.success) {
          successCount++;
          totalInserted += result.totalInserted;
          totalUpdated += result.totalUpdated;

          results.push({
            serialNumber: station.serial_number,
            TenTram: station.TenTram,
            success: true,
            inserted: result.totalInserted,
            updated: result.totalUpdated,
            chunks: result.chunks.length,
            duration: result.duration,
          });

          request.log.info(`✓ ${station.serial_number}: ${result.totalInserted} inserted, ${result.totalUpdated} updated`);
        } else {
          failedCount++;
          results.push({
            serialNumber: station.serial_number,
            TenTram: station.TenTram,
            success: false,
            error: result.error,
          });

          request.log.error(`✗ ${station.serial_number}: ${result.error}`);
        }

        // Delay 2 giây giữa các stations
        if (station !== stationsToSync[stationsToSync.length - 1]) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        failedCount++;
        results.push({
          serialNumber: station.serial_number,
          TenTram: station.TenTram,
          success: false,
          error: error.message,
        });
        request.log.error(`Error syncing ${station.serial_number}:`, error);
      }
    }

    // Response
    reply.code(200).send({
      success: true,
      message: `Initial sync completed for ${stationsToSync.length} station(s)`,
      summary: {
        totalStations: stationsToSync.length,
        successful: successCount,
        failed: failedCount,
        totalInserted,
        totalUpdated,
        startDate,
        endDate: new Date().toISOString().split("T")[0],
      },
      results,
    });
  } catch (error) {
    request.log.error("Error during initial sync:", error);
    reply.code(500).send({
      success: false,
      message: "Initial sync failed",
      error: error.message,
    });
  }
};

/**
 * POST /api/iot/sync-date-range
 * Sync data cho khoảng thời gian cụ thể
 *
 * Body:
 * - serialNumber: Station serial number (required)
 * - startDate: Start date YYYY-MM-DD (required)
 * - endDate: End date YYYY-MM-DD (required)
 */
const syncDateRange = async (request, reply) => {
  try {
    const {serialNumber, startDate, endDate} = request.body;

    // Validate required fields
    if (!serialNumber || !startDate || !endDate) {
      return reply.code(400).send({
        success: false,
        message: "Missing required fields: serialNumber, startDate, endDate",
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return reply.code(400).send({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD",
      });
    }

    // Check if start date is before end date
    if (new Date(startDate) > new Date(endDate)) {
      return reply.code(400).send({
        success: false,
        message: "Start date must be before end date",
      });
    }

    // Verify station exists
    const stationQuery = `
            SELECT serial_number, TenTram, status 
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

    request.log.info(`Syncing date range for ${serialNumber}`, {
      startDate,
      endDate,
    });

    // Sync data
    const result = await iotSyncService.syncStation(serialNumber, startDate, endDate);

    if (result.success) {
      reply.code(200).send({
        success: true,
        message: `Data synced successfully for ${station.TenTram}`,
        result: {
          serialNumber: station.serial_number,
          TenTram: station.TenTram,
          startDate,
          endDate,
          inserted: result.inserted,
          updated: result.updated,
          total: result.total,
          errors: result.errors,
        },
      });
    } else {
      reply.code(400).send({
        success: false,
        message: `Sync failed for ${station.TenTram}`,
        error: result.error,
      });
    }
  } catch (error) {
    request.log.error("Error syncing date range:", error);
    reply.code(500).send({
      success: false,
      message: "Failed to sync date range",
      error: error.message,
    });
  }
};

/**
 * GET /api/iot/sync/status
 * Get current sync status and next scheduled sync time
 */
const getSyncStatus = async (request, reply) => {
  try {
    // Get last sync for each station
    const lastSyncQuery = `
            SELECT DISTINCT ON (serial_number)
                serial_number,
                start_date,
                end_date,
                records_synced,
                status,
                synced_at
            FROM iot_sync_logs
            ORDER BY serial_number, synced_at DESC
        `;

    const lastSyncResult = await queryDatabase(lastSyncQuery, []);

    // Get total records per station
    const statsQuery = `
            SELECT 
                s.serial_number,
                s.TenTram,
                s.status,
                COUNT(d.id) as total_records,
                MIN(d.date) as earliest_date,
                MAX(d.date) as latest_date
            FROM iot_system.iot_stations s
            LEFT JOIN iot_system.iot_data d ON s.serial_number = d.serial_number
            GROUP BY s.serial_number, s.TenTram, s.status
            ORDER BY s.serial_number
        `;

    const statsResult = await queryDatabase(statsQuery, []);

    // Combine data
    const stationStatus = statsResult.rows.map((station) => {
      const lastSync = lastSyncResult.rows.find((log) => log.serial_number === station.serial_number);

      return {
        serialNumber: station.serial_number,
        TenTram: station.TenTram,
        status: station.status,
        totalRecords: parseInt(station.total_records),
        earliestDate: station.earliest_date,
        latestDate: station.latest_date,
        lastSync: lastSync
          ? {
              date: lastSync.synced_at,
              recordsSynced: lastSync.records_synced,
              status: lastSync.status,
            }
          : null,
      };
    });

    reply.code(200).send({
      success: true,
      cronSchedule: "Every 3 hours (at minute 0 of every 3rd hour)",
      nextRun: getNextCronRun(),
      stations: stationStatus,
    });
  } catch (error) {
    request.log.error("Error getting sync status:", error);
    reply.code(500).send({
      success: false,
      message: "Failed to get sync status",
      error: error.message,
    });
  }
};

/**
 * POST /api/iot/sync/manual
 * Trigger manual sync
 */
const manualSync = async (request, reply) => {
  try {
    const {days = 3, stations = null} = request.body || {};

    request.log.info("Manual sync triggered", {days, stations});

    // Sử dụng service để sync
    const result = stations
      ? await iotSyncService.syncSpecificStations(stations, days)
      : await iotSyncService.syncAllStations(days);

    reply.code(200).send({
      success: true,
      message: "Manual sync completed",
      summary: result,
    });
  } catch (error) {
    request.log.error("Manual sync failed:", error);
    reply.code(500).send({
      success: false,
      message: "Manual sync failed",
      error: error.message,
    });
  }
};

/**
 * GET /api/iot/sync/cron-status
 * Get cron job status
 */
const getCronStatus = async (request, reply) => {
  try {
    const iotSyncCron = require("../../jobs/iotSyncCron");

    const cronStatus = iotSyncCron.getStatus();

    reply.code(200).send({
      success: true,
      cronJob: cronStatus,
      systemCron: {
        available: true,
        recommendation: "Use system cron with scripts/iot_sync_cron.sh for better reliability",
      },
    });
  } catch (error) {
    request.log.error("Error getting cron status:", error);
    reply.code(500).send({
      success: false,
      message: "Failed to get cron status",
      error: error.message,
    });
  }
};

/**
 * Helper: Calculate next cron run time (updated for 3-hour schedule)
 */
function getNextCronRun() {
  const now = new Date();
  const currentHour = now.getHours();
  const nextHour = Math.ceil((currentHour + 1) / 3) * 3; // Next multiple of 3
  const nextRun = new Date(now);

  if (nextHour >= 24) {
    // Next day
    nextRun.setDate(nextRun.getDate() + 1);
    nextRun.setHours(0);
  } else {
    nextRun.setHours(nextHour);
  }

  nextRun.setMinutes(0);
  nextRun.setSeconds(0);
  nextRun.setMilliseconds(0);

  return nextRun.toISOString();
}

module.exports = {
  initialSync,
  syncDateRange,
  getSyncStatus,
  manualSync,
  getCronStatus,
};
