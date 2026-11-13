const cron = require("node-cron");
const forecastSyncService = require("../services/forecastSyncService");

/**
 * Forecast Sync Cron Job
 * Poll mỗi 30 phút để sớm phát hiện lượt dự báo mới (API phát hành theo lịch riêng, không
 * đồng bộ với chu kỳ poll). syncLatest() tự bỏ qua nếu run_id đã tồn tại nên poll trùng không
 * sao; khi phát hiện lượt mới, nó tự xóa lượt cũ trước khi lưu lượt mới (chỉ giữ 1 lượt duy
 * nhất tại mọi thời điểm - xem forecastSyncService.clearOldRuns).
 */
class ForecastSyncCron {
  constructor() {
    this.logger = require("../loggers/loggers.config");
    this.isRunning = false;
    this.cronTask = null;
  }

  start() {
    try {
      this.cronTask = cron.schedule(
        "*/30 * * * *",
        async () => {
          await this.executeSyncJob();
        },
        {
          scheduled: true,
          timezone: "Asia/Ho_Chi_Minh",
        },
      );

      this.logger.info("Forecast sync cron job started successfully", {
        schedule: "Every 30 minutes",
        timezone: "Asia/Ho_Chi_Minh",
      });

      return true;
    } catch (error) {
      this.logger.error("Failed to start forecast sync cron job:", error.message);
      return false;
    }
  }

  stop() {
    if (this.cronTask) {
      this.cronTask.stop();
      this.logger.info("Forecast sync cron job stopped");
      return true;
    }
    return false;
  }

  async executeSyncJob() {
    if (this.isRunning) {
      this.logger.warn("Forecast sync job already running, skipping this execution");
      return;
    }

    this.isRunning = true;

    try {
      this.logger.info(`Starting scheduled forecast sync at ${new Date().toISOString()}`);
      const result = await forecastSyncService.syncLatest();
      this.logger.info("Forecast sync job completed", result);
    } catch (error) {
      this.logger.error("Forecast sync job failed", {error: error.message, stack: error.stack});
    } finally {
      this.isRunning = false;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: Boolean(this.cronTask),
      schedule: "Every 30 minutes",
      timezone: "Asia/Ho_Chi_Minh",
    };
  }

  async manualTrigger() {
    this.logger.info("Manual forecast sync trigger requested");
    await this.executeSyncJob();
  }
}

const forecastSyncCron = new ForecastSyncCron();

module.exports = forecastSyncCron;
