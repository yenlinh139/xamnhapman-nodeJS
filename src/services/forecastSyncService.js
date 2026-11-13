const axios = require("axios");
const QueryDatabase = require("../utils/queryDatabase");
const logger = require("../loggers/loggers.config");
const {FORECAST_STATION_MAP, FORECAST_VALUE_COLUMNS, FORECAST_DAILY_COLUMNS} = require("../configs/forecastStations");

/**
 * Forecast Sync Service
 * Lấy Forecast Result (contract v0.4, xac nhan truc tiep tu response that ngay
 * 2026-11-10 - payload la mang phang "rows[]", moi phan tu co {Datetime, Station,
 * IssueDate, LeadDay, DailyModel, Profile, DailyForecast, do_man}. Xac nhan lai
 * 2026-11-10 (lan 2) voi doi API: gia tri du bao chinh thuc la "DailyForecast"
 * (gia tri theo ngay - LeadDay, lap lai cho moi moc 2h trong cung ngay do), KHONG
 * phai "do_man" (truoc do nham tuong la gia tri theo tung moc). Luu vao
 * forecast_system.forecast_runs / forecast_system.forecast_values (dang rong,
 * giong hochiminh."DoMan": 1 dong / moc thoi gian, 1 cot / tram) - gia tri se lap
 * lai suot cac moc trong cung 1 ngay vi DailyForecast la gia tri cap ngay.
 *
 * CHI GIU 1 LUOT DUY NHAT: moi khi phat hien lot du bao MOI (run_id khac), xoa toan bo
 * lot cu truoc khi luu lot moi (xem clearOldRuns) - khong tich luy nhieu lot nhu truoc,
 * vi lot cu da het han su dung ngay khi co lot moi thay the.
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
   * Chuyển payload gốc (mảng phẳng rows[], mỗi phần tử = 1 trạm tại 1 mốc) thành
   * các dòng dạng rộng (1 dòng / mốc thời gian, cột = mã trạm nội bộ).
   */
  pivotToWideRows(payload) {
    const sourceRows = payload.rows || [];
    const unmappedStations = new Set();
    const byTime = new Map();

    for (const sourceRow of sourceRows) {
      const mapping = FORECAST_STATION_MAP[sourceRow.Station];
      if (!mapping) {
        unmappedStations.add(sourceRow.Station);
        continue;
      }

      if (!byTime.has(sourceRow.Datetime)) {
        const row = {ThoiDiem: sourceRow.Datetime};
        for (const col of FORECAST_VALUE_COLUMNS) row[col] = null;
        for (const col of FORECAST_DAILY_COLUMNS) row[col] = null;
        byTime.set(sourceRow.Datetime, row);
      }
      // do_man: gia tri theo moc 2h | DailyForecast: gia tri theo ngay (lap lai trong ngay)
      const row = byTime.get(sourceRow.Datetime);
      row[mapping.manualCode] = sourceRow.do_man;
      row[`${mapping.manualCode}_Daily`] = sourceRow.DailyForecast;
    }

    const rows = Array.from(byTime.values()).sort((a, b) => new Date(a.ThoiDiem).getTime() - new Date(b.ThoiDiem).getTime());

    return {rows, unmappedStations: Array.from(unmappedStations)};
  }

  /**
   * v0.4 khong con cac field top-level forecast_start_at/interval_hours/horizon_days/
   * issued_at nhu v0.3 -> tu suy ra tu chinh cac dong da pivot (rows da sap xep theo
   * thoi gian, cung 1 luoi thoi gian dung chung cho moi tram nen chi can lay 2 mốc dau
   * de tinh khoang cach).
   */
  buildRunMeta(payload, rows) {
    const forecastStartAt = rows[0]?.ThoiDiem || null;
    const intervalHours =
      rows.length >= 2
        ? Math.round((new Date(rows[1].ThoiDiem).getTime() - new Date(rows[0].ThoiDiem).getTime()) / 3600000)
        : null;
    const horizonDays = intervalHours ? Math.round((rows.length * intervalHours) / 24) : null;

    // Khong co issued_at tuong minh -> dung thoi diem artifact duoc tao lam gia tri gan dung.
    const issuedAt = payload.artifact?.created_at || null;

    return {forecastStartAt, intervalHours, horizonDays, issuedAt};
  }

  /**
   * He thong chi giu DUY NHAT 1 lot du bao tai moi thoi diem: moi khi co lot moi, xoa toan bo
   * lot cu truoc khi luu lot moi (khong tich luy nhieu lot nhu truoc). forecast_values co
   * "ON DELETE CASCADE" theo run_id nen chi can xoa forecast_runs la du; forecast_sync_logs
   * KHONG bi xoa (giu lai lich su dong bo de doi chieu/debug).
   */
  async clearOldRuns() {
    await QueryDatabase(`DELETE FROM forecast_system.forecast_runs`);
  }

  async saveRun(payload, meta) {
    await QueryDatabase(
      `INSERT INTO forecast_system.forecast_runs
        (run_id, schema_version, issued_at, forecast_timezone, forecast_start_at, interval_hours,
         horizon_days, station_count, points_per_station, total_points, artifact_id, artifact_checksum, is_synthetic)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (run_id) DO NOTHING`,
      [
        payload.run_id,
        payload.schema_version,
        meta.issuedAt,
        payload.forecast_timezone,
        meta.forecastStartAt,
        meta.intervalHours,
        meta.horizonDays,
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

    const columns = ["run_id", "ThoiDiem", ...FORECAST_VALUE_COLUMNS, ...FORECAST_DAILY_COLUMNS];
    const columnList = columns.map((c) => `"${c}"`).join(", ");
    const valuePlaceholders = [];
    const params = [];

    rows.forEach((row, rowIndex) => {
      const base = rowIndex * columns.length;
      const placeholders = columns.map((_, colIndex) => `$${base + colIndex + 1}`);
      valuePlaceholders.push(`(${placeholders.join(", ")})`);
      params.push(
        runId,
        row.ThoiDiem,
        ...FORECAST_VALUE_COLUMNS.map((c) => row[c]),
        ...FORECAST_DAILY_COLUMNS.map((c) => row[c]),
      );
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
   * Đồng bộ 1 lượt: bỏ qua nếu run_id đã có (idempotent); nếu là lượt MỚI thì xóa hết lượt cũ
   * trước khi lưu (chỉ giữ 1 lượt duy nhất tại mọi thời điểm - xem clearOldRuns). Không fail cả
   * run nếu gặp station lạ chưa map (chỉ log lại).
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
    const meta = this.buildRunMeta(payload, rows);

    await this.clearOldRuns();
    await this.saveRun(payload, meta);
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
