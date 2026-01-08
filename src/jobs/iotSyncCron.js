const cron = require("node-cron");
const iotSyncService = require("../services/iotSyncService");

/**
 * IoT Data Sync Cron Job
 * Chạy mỗi 30 phút để sync data từ external API
 */

class IoTSyncCron {
  constructor() {
    this.logger = require("../loggers/loggers.config");
    this.isRunning = false;
    this.cronTask = null;
  }

  /**
   * Start cron job - chạy mỗi 3 giờ
   * Cron expression: every 3 hours (at minute 0 of every 3rd hour)
   * Format: minute hour day month dayOfWeek
   */
  start() {
    try {
      // Schedule: Mỗi 3 giờ
      this.cronTask = cron.schedule(
        "0 */3 * * *",
        async () => {
          await this.executeSyncJob();
        },
        {
          scheduled: true,
          timezone: "Asia/Ho_Chi_Minh",
        },
      );

      this.logger.info("IoT sync cron job started successfully", {
        schedule: "Every 3 hours",
        timezone: "Asia/Ho_Chi_Minh",
        nextRun: this.getNextRunTime(),
      });

      // Chạy lần đầu ngay khi start (optional)
      // Uncomment nếu muốn chạy ngay khi khởi động server
      // setTimeout(() => this.executeSyncJob(), 5000);

      return true;
    } catch (error) {
      this.logger.error("Failed to start IoT sync cron job:", error.message);
      return false;
    }
  }

  /**
   * Stop cron job
   */
  stop() {
    if (this.cronTask) {
      this.cronTask.stop();
      this.logger.info("IoT sync cron job stopped");
      return true;
    }
    return false;
  }

  /**
   * Execute sync job
   */
  async executeSyncJob() {
    // Prevent concurrent runs
    if (this.isRunning) {
      this.logger.warn("Sync job already running, skipping this execution");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.logger.info("========================================");
      this.logger.info(`Starting scheduled IoT data sync at ${new Date().toISOString()}`);
      this.logger.info("========================================");

      // Sync data từ ngày mới nhất trong DB đến hiện tại (smart sync)
      const results = await iotSyncService.syncAllStations(); // Không truyền daysBack

      const duration = Date.now() - startTime;

      // Log summary
      this.logger.info("========================================");
      this.logger.info("Sync job completed successfully", {
        duration: `${duration}ms`,
        totalStations: results.totalStations,
        successful: results.successful,
        failed: results.failed,
        totalInserted: results.totalInserted,
        totalUpdated: results.totalUpdated,
        nextRun: this.getNextRunTime(),
      });
      this.logger.info("========================================");

      // Log chi tiết từng station
      if (results.results && results.results.length > 0) {
        results.results.forEach((result) => {
          if (result.success) {
            this.logger.info(`✓ ${result.serialNumber}: ${result.inserted} inserted, ${result.updated} updated`);
          } else {
            this.logger.error(`✗ ${result.serialNumber}: ${result.error}`);
          }
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error("========================================");
      this.logger.error("Sync job failed", {
        duration: `${duration}ms`,
        error: error.message,
        stack: error.stack,
        nextRun: this.getNextRunTime(),
      });
      this.logger.error("========================================");
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get next run time
   */
  getNextRunTime() {
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

  /**
   * Get cron status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.cronTask ? true : false,
      nextRun: this.cronTask ? this.getNextRunTime() : null,
      schedule: "Every 3 hours",
      timezone: "Asia/Ho_Chi_Minh",
    };
  }

  /**
   * Manual trigger (for testing)
   */
  async manualTrigger() {
    this.logger.info("Manual sync trigger requested");
    await this.executeSyncJob();
  }
}

// Export singleton instance
const iotSyncCron = new IoTSyncCron();

module.exports = iotSyncCron;
