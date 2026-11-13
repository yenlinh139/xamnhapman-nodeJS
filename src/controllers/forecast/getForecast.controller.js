const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const {
  ALL_SALINITY_STATIONS_FORECAST_STATUS,
  FORECAST_VALUE_COLUMNS,
  FORECAST_IOT_COLUMNS,
  IOT_STATIONS_FORECAST_STATUS,
} = require("../../configs/forecastStations");
// values: do_man (theo moc 2h) - dung ve bieu do; dailyValues: DailyForecast (theo ngay, lap lai trong ngay)
const {toIsoWithOffset, resolveReferenceNow} = require("../../utils/forecastTime");

// Danh sách trạm + cờ hasForecast, để FE tự biết trạm nào chưa có dữ liệu dự báo
const GetForecastStations = async (req, reply) => {
  // ?group=iot -> các trạm IoT có dự báo; mặc định là điểm đo mặn
  return reply.code(200).send(req.query?.group === "iot" ? IOT_STATIONS_FORECAST_STATUS : ALL_SALINITY_STATIONS_FORECAST_STATUS);
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

    // ?group=iot -> dự báo của trạm IoT (manualCode = station_code, vd CKC_IoT); mặc định là 7 điểm đo
    // mặn. Hai nhóm có lưới thời gian riêng nên chỉ lấy các mốc mà nhóm đang hỏi có số liệu.
    const columns = req.query?.group === "iot" ? FORECAST_IOT_COLUMNS : FORECAST_VALUE_COLUMNS;
    const groupRows = valuesResult.rows.filter((row) =>
      columns.some((column) => row[column] !== null || row[`${column}_Daily`] !== null),
    );

    const timeGrid = groupRows.map((row) => toIsoWithOffset(row.ThoiDiem));
    const stations = columns.map((manualCode) => ({
      manualCode,
      values: groupRows.map((row) => row[manualCode]),
      dailyValues: groupRows.map((row) => row[`${manualCode}_Daily`]),
    }));

    // Neu "hien tai" (thuc hoac override) nam TRUOC ca chuoi -> mốc đầu (tự nhiên, findIndex tra ve 0).
    // Neu nam SAU ca chuoi (vd du lieu mau lich su, real "now" luon vuot qua) -> lay mốc CUOI
    // (dự báo mới nhất cua lượt chạy, khong fix o mốc dau) de FE luon hien dung gia tri du bao
    // moi nhat hien co thay vi mot ngay co dinh.
    const referenceNow = resolveReferenceNow();
    const foundFutureIndex = timeGrid.findIndex((t) => new Date(t).getTime() >= referenceNow.getTime());
    // hasFutureForecast = co it nhat 1 moc du bao >= "hien tai" thuc su (khong tinh fallback ben duoi).
    // FE dung co nay de quyet dinh: uu tien mau/cap rui ro theo du bao (neu co moc tuong lai), nguoc lai
    // (du lieu mau lich su, "hien tai" thuc da vuot qua het chuoi du bao) thi dung quan trac gan nhat.
    const hasFutureForecast = foundFutureIndex !== -1;
    const currentIndex = hasFutureForecast ? foundFutureIndex : timeGrid.length - 1;

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
      hasFutureForecast,
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

module.exports = {GetForecastStations, GetLatestForecast};
