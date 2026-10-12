const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const {ALL_SALINITY_STATIONS_FORECAST_STATUS, FORECAST_VALUE_COLUMNS} = require("../../configs/forecastStations");

// pg trả timestamptz dạng "2024-08-01 02:00:00+07" (custom type parser trong
// database.connection.js) - chuẩn hoá về ISO 8601 có dấu ":" ở offset
// ("...+07:00") để Date parser của mọi trình duyệt đều đọc được nhất quán.
const toIsoWithOffset = (raw) => {
  if (!raw) return raw;
  const isoLike = raw.replace(" ", "T");
  return /[+-]\d{2}$/.test(isoLike) ? `${isoLike}:00` : isoLike;
};

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
    }));

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
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

module.exports = {GetForecastStations, GetLatestForecast};
