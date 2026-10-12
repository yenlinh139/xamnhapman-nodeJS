const axios = require("axios");
const QueryDatabase = require("../utils/queryDatabase");
const logger = require("../loggers/loggers.config");
const {FORECAST_STATION_MAP, FORECAST_VALUE_COLUMNS} = require("../configs/forecastStations");

/**
 * Forecast Sync Service
 * Lấy Forecast Result (contract v0.3) từ API dự báo XNM công khai và lưu vào
 * forecast_system.forecast_runs / forecast_system.forecast_values (dạng rộng,
 * giống hochiminh."DoMan": 1 dòng / mốc thời gian, 1 cột / trạm).
 */
class ForecastSyncService {
  constructor() {
    this.API_BASE_URL = process.env.FORECAST_API_BASE_URL || "https://136.85.17.205";
  }

  async isApiReady() {
    try {
      const res = await axios.get(`${this.API_BASE_URL}/health/ready`, {timeout: 10000});
      return res.status === 200;
    } catch (error) {
      logger.error("Forecast API health check failed:", error.message);
      return false;
    }
  }

  async fetchLatestForecast() {
    const url = `${this.API_BASE_URL}/api/v1/forecasts/latest`;
    const response = await axios.get(url, {timeout: 30000});
    return response.data;
  }

  async runExists(runId) {
    const result = await QueryDatabase(`SELECT 1 FROM forecast_system.forecast_runs WHERE run_id = $1`, [runId]);
    return result.rowCount > 0;
  }

  /**
   * Chuyển payload gốc (1 mảng salinity_psu / trạm) thành các dòng dạng rộng
   * (1 dòng / mốc thời gian, cột = mã trạm nội bộ).
   */
  pivotToWideRows(payload) {
    const {time_grid: timeGrid, stations} = payload;
    const unmappedStations = [];

    const rows = timeGrid.map((thoiDiem) => {
      const row = {ThoiDiem: thoiDiem};
      for (const col of FORECAST_VALUE_COLUMNS) row[col] = null;
      return row;
    });

    for (const station of stations || []) {
      const mapping = FORECAST_STATION_MAP[station.station_code];
      if (!mapping) {
        unmappedStations.push(station.station_code || station.station_id);
        continue;
      }
      station.salinity_psu.forEach((value, index) => {
        if (rows[index]) rows[index][mapping.manualCode] = value;
      });
    }

    return {rows, unmappedStations};
  }

  async saveRun(payload) {
    await QueryDatabase(
      `INSERT INTO forecast_system.forecast_runs
        (run_id, schema_version, issued_at, forecast_timezone, forecast_start_at, interval_hours,
         horizon_days, station_count, points_per_station, total_points, artifact_id, artifact_checksum, is_synthetic)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (run_id) DO NOTHING`,
      [
        payload.run_id,
        payload.schema_version,
        payload.issued_at,
        payload.forecast_timezone,
        payload.forecast_start_at,
        payload.interval_hours,
        payload.horizon_days,
        payload.station_count,
        payload.points_per_station,
        payload.total_points,
        payload.artifact?.id || null,
        payload.artifact?.checksum?.value || null,
        Boolean(payload.artifact?.metadata?.synthetic),
      ],
    );
  }

  async saveWideRows(runId, rows) {
    if (rows.length === 0) return;

    const columns = ["run_id", "ThoiDiem", ...FORECAST_VALUE_COLUMNS];
    const columnList = columns.map((c) => `"${c}"`).join(", ");
    const valuePlaceholders = [];
    const params = [];

    rows.forEach((row, rowIndex) => {
      const base = rowIndex * columns.length;
      const placeholders = columns.map((_, colIndex) => `$${base + colIndex + 1}`);
      valuePlaceholders.push(`(${placeholders.join(", ")})`);
      params.push(runId, row.ThoiDiem, ...FORECAST_VALUE_COLUMNS.map((c) => row[c]));
    });

    await QueryDatabase(
      `INSERT INTO forecast_system.forecast_values (${columnList})
       VALUES ${valuePlaceholders.join(", ")}
       ON CONFLICT (run_id, "ThoiDiem") DO NOTHING`,
      params,
    );
  }

  async logSync({runId, status, pointsSynced, unmappedStations, durationMs, errorMessage}) {
    await QueryDatabase(
      `INSERT INTO forecast_system.forecast_sync_logs
        (run_id, status, points_synced, unmapped_stations, sync_duration_ms, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [runId || null, status, pointsSynced || 0, unmappedStations?.join(", ") || null, durationMs || 0, errorMessage || null],
    );
  }

  /**
   * Đồng bộ 1 lượt: bỏ qua nếu run_id đã có (idempotent), không fail cả run
   * nếu gặp station lạ chưa map (chỉ log lại).
   */
  async syncLatest() {
    const startTime = Date.now();

    const ready = await this.isApiReady();
    if (!ready) {
      await this.logSync({status: "error", errorMessage: "Forecast API not ready (/health/ready failed)"});
      return {status: "error", message: "Forecast API not ready"};
    }

    const payload = await this.fetchLatestForecast();

    if (await this.runExists(payload.run_id)) {
      await this.logSync({runId: payload.run_id, status: "skipped_duplicate", durationMs: Date.now() - startTime});
      return {status: "skipped_duplicate", runId: payload.run_id};
    }

    const {rows, unmappedStations} = this.pivotToWideRows(payload);

    await this.saveRun(payload);
    await this.saveWideRows(payload.run_id, rows);

    await this.logSync({
      runId: payload.run_id,
      status: "success",
      pointsSynced: rows.length,
      unmappedStations,
      durationMs: Date.now() - startTime,
    });

    return {status: "success", runId: payload.run_id, rowsSynced: rows.length, unmappedStations};
  }
}

module.exports = new ForecastSyncService();
