const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const {ALL_SALINITY_STATIONS_FORECAST_STATUS, FORECAST_VALUE_COLUMNS} = require("../../configs/forecastStations");
// values: do_man (theo moc 2h) - dung ve bieu do; dailyValues: DailyForecast (theo ngay, lap lai trong ngay)
const {toIsoWithOffset, resolveReferenceNow} = require("../../utils/forecastTime");

// Danh sách trạm + cờ hasForecast, để FE tự biết trạm nào chưa có dữ liệu dự báo
const GetForecastStations = async (req, reply) => {
  return reply.code(200).send(ALL_SALINITY_STATIONS_FORECAST_STATUS);
};

/**
 * Trả về Forecast Result mới nhất (lượt run có forecast_start_at lớn nhất),
 * dựng lại dạng stations[] (giống contract nguồn) từ bảng rộng forecast_values
 * để FE vẽ biểu đồ theo trạm như dữ liệu DoMan thủ công.
 */
const GetLatestForecast = async (req, reply) => {
  try {
    const runResult = await QueryDatabase(`
      SELECT *
      FROM forecast_system.forecast_runs
      ORDER BY forecast_start_at DESC
      LIMIT 1
    `);

    if (runResult.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Chưa có dữ liệu dự báo"});
    }

    const run = runResult.rows[0];

    const valuesResult = await QueryDatabase(
      `SELECT * FROM forecast_system.forecast_values WHERE run_id = $1 ORDER BY "ThoiDiem" ASC`,
      [run.run_id],
    );

    const timeGrid = valuesResult.rows.map((row) => toIsoWithOffset(row.ThoiDiem));
    const stations = FORECAST_VALUE_COLUMNS.map((manualCode) => ({
      manualCode,
      values: valuesResult.rows.map((row) => row[manualCode]),
      dailyValues: valuesResult.rows.map((row) => row[`${manualCode}_Daily`]),
    }));

    // Neu "hien tai" (thuc hoac override) nam TRUOC ca chuoi -> mốc đầu (tự nhiên, findIndex tra ve 0).
    // Neu nam SAU ca chuoi (vd du lieu mau lich su, real "now" luon vuot qua) -> cung ve mốc đầu
    // (dau cua lượt vừa đồng bộ) thay vi mốc cuoi, de moi lan co lượt chạy mới tu dong hien dung
    // "dau" cua lượt do ma khong can chinh FORECAST_NOW_OVERRIDE tay theo tung lượt.
    const referenceNow = resolveReferenceNow();
    let currentIndex = timeGrid.findIndex((t) => new Date(t).getTime() >= referenceNow.getTime());
    if (currentIndex === -1) currentIndex = 0;

    return reply.code(200).send({
      runId: run.run_id,
      schemaVersion: run.schema_version,
      issuedAt: toIsoWithOffset(run.issued_at),
      forecastTimezone: run.forecast_timezone,
      intervalHours: run.interval_hours,
      horizonDays: run.horizon_days,
      isSynthetic: run.is_synthetic,
      timeGrid,
      stations,
      // "Hiện tại" dùng để tô điểm mới nhất trên FE (popup bản đồ...). Xem resolveReferenceNow() ở trên.
      referenceNow: referenceNow.toISOString(),
      currentIndex,
      currentTime: timeGrid[currentIndex] || null,
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

module.exports = {GetForecastStations, GetLatestForecast};
