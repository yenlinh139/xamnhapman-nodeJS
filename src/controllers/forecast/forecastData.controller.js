const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const forecastSyncService = require("../../services/forecastSyncService");
const {FORECAST_VALUE_COLUMNS, FORECAST_DAILY_COLUMNS} = require("../../configs/forecastStations");
const ALL_FORECAST_COLUMNS = [...FORECAST_VALUE_COLUMNS, ...FORECAST_DAILY_COLUMNS];
const {toIsoWithOffset, resolveReferenceNow} = require("../../utils/forecastTime");

const FORECAST_TIMEZONE = "Asia/Ho_Chi_Minh";
const MAX_PAGE_LIMIT = 50000;

/**
 * Mốc "hiện tại" của 1 lượt dự báo, kẹp trong khoảng [forecast_start_at, forecast_end_at] và
 * làm tròn theo đúng lưới interval_hours (dữ liệu đều mỗi N giờ nên tính truc tiep, khong can
 * query lai forecast_values). Dung lam gia tri mac dinh cho bo loc "Tu ngay" o trang quan tri.
 * Neu referenceNow nam ngoai khoang (truoc hoac sau ca chuoi - vd du lieu mau lich su, real
 * "now" luon vuot qua forecast_end_at) -> ve mốc đầu (forecast_start_at) cua đúng lượt vừa
 * đồng bộ, khong phai mốc cuoi, de moi lượt chạy mới tu dong hien dung "dau" cua no ma khong
 * can chinh FORECAST_NOW_OVERRIDE tay theo tung lượt. Voi du lieu that dang van hanh (issue
 * gan voi real now), referenceNow se tu nhien roi vao giua khoang nhu binh thuong.
 */
const computeRunCurrentTime = (run, referenceNow) => {
  const start = run.forecast_start_at ? new Date(run.forecast_start_at) : null;
  const end = run.forecast_end_at ? new Date(run.forecast_end_at) : null;
  if (!start || Number.isNaN(start.getTime())) return run.forecast_start_at;
  if (!end || Number.isNaN(end.getTime())) return run.forecast_start_at;

  if (referenceNow.getTime() <= start.getTime()) return run.forecast_start_at;
  if (referenceNow.getTime() >= end.getTime()) return run.forecast_start_at;

  const stepMs = (run.interval_hours || 6) * 60 * 60 * 1000;
  const stepsElapsed = Math.round((referenceNow.getTime() - start.getTime()) / stepMs);
  const clampedMs = start.getTime() + stepsElapsed * stepMs;
  return new Date(Math.min(clampedMs, end.getTime())).toISOString();
};

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : NaN;
};

// Lấy giá trị các trạm từ body, chỉ giữ những cột được gửi lên
const pickStationValues = (body) => {
  const values = {};
  for (const col of ALL_FORECAST_COLUMNS) {
    if (body[col] === undefined) continue;
    const numericValue = toNullableNumber(body[col]);
    if (Number.isNaN(numericValue)) {
      return {error: `Giá trị trạm ${col} không hợp lệ`};
    }
    values[col] = numericValue;
  }
  return {values};
};

const formatValueRow = (row) => ({
  ...row,
  ThoiDiem: toIsoWithOffset(row.ThoiDiem),
});

// READ - Danh sách lượt chạy dự báo (mới nhất trước)
const GetForecastRuns = async (req, reply) => {
  try {
    const result = await QueryDatabase(`
      SELECT r.run_id, r.schema_version, r.issued_at, r.forecast_timezone, r.forecast_start_at,
             r.interval_hours, r.horizon_days, r.station_count, r.is_synthetic, r.fetched_at,
             COUNT(v."ThoiDiem")::int AS value_count,
             MAX(v."ThoiDiem") AS forecast_end_at
      FROM forecast_system.forecast_runs r
      LEFT JOIN forecast_system.forecast_values v ON v.run_id = r.run_id
      GROUP BY r.run_id
      ORDER BY r.forecast_start_at DESC NULLS LAST
    `);

    const referenceNow = resolveReferenceNow();

    return reply.code(200).send({
      code: 200,
      data: result.rows.map((run) => {
        const normalized = {
          ...run,
          issued_at: toIsoWithOffset(run.issued_at),
          forecast_start_at: toIsoWithOffset(run.forecast_start_at),
          forecast_end_at: toIsoWithOffset(run.forecast_end_at),
          fetched_at: toIsoWithOffset(run.fetched_at),
        };
        return {
          ...normalized,
          // Mac dinh cho bo loc "Tu ngay": xem computeRunCurrentTime() va utils/forecastTime.js
          current_time: computeRunCurrentTime(normalized, referenceNow),
        };
      }),
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// READ - Giá trị dự báo có phân trang, lọc theo lượt chạy và khoảng ngày (giờ VN)
const GetForecastValues = async (req, reply) => {
  try {
    const {runId, startDate, endDate} = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (runId) {
      params.push(runId);
      conditions.push(`run_id = $${params.length}`);
    }
    if (startDate) {
      params.push(startDate);
      conditions.push(`("ThoiDiem" AT TIME ZONE '${FORECAST_TIMEZONE}')::date >= $${params.length}::date`);
    }
    if (endDate) {
      params.push(endDate);
      conditions.push(`("ThoiDiem" AT TIME ZONE '${FORECAST_TIMEZONE}')::date <= $${params.length}::date`);
    }

    const whereCondition = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const columnList = ALL_FORECAST_COLUMNS.map((c) => `"${c}"`).join(", ");

    const [result, countResult] = await Promise.all([
      QueryDatabase(
        `SELECT run_id, "ThoiDiem", ${columnList}
         FROM forecast_system.forecast_values
         ${whereCondition}
         ORDER BY "ThoiDiem" ASC, run_id DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
      QueryDatabase(`SELECT COUNT(*) AS total FROM forecast_system.forecast_values ${whereCondition}`, params),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit);

    return reply.code(200).send({
      code: 200,
      data: result.rows.map(formatValueRow),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// CREATE - Thêm 1 mốc thời gian dự báo vào lượt chạy có sẵn
const CreateForecastValue = async (req, reply) => {
  try {
    const {runId, ThoiDiem} = req.body || {};

    if (!runId || !ThoiDiem) {
      return reply.code(400).send({code: 400, message: "Lượt dự báo và thời điểm là bắt buộc"});
    }

    const {values, error} = pickStationValues(req.body);
    if (error) return reply.code(400).send({code: 400, message: error});

    const runExists = await QueryDatabase(`SELECT 1 FROM forecast_system.forecast_runs WHERE run_id = $1`, [runId]);
    if (runExists.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy lượt dự báo"});
    }

    const checkExist = await QueryDatabase(
      `SELECT 1 FROM forecast_system.forecast_values WHERE run_id = $1 AND "ThoiDiem" = $2`,
      [runId, ThoiDiem],
    );
    if (checkExist.rowCount > 0) {
      return reply.code(409).send({code: 409, message: "Dữ liệu dự báo cho thời điểm này đã tồn tại"});
    }

    const columns = ["run_id", "ThoiDiem", ...Object.keys(values)];
    const params = [runId, ThoiDiem, ...Object.values(values)];
    const placeholders = params.map((_, index) => `$${index + 1}`);

    const result = await QueryDatabase(
      `INSERT INTO forecast_system.forecast_values (${columns.map((c) => `"${c}"`).join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING *`,
      params,
    );

    return reply.code(201).send({
      code: 201,
      message: "Thêm dữ liệu dự báo thành công",
      data: formatValueRow(result.rows[0]),
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// UPDATE - Sửa giá trị các trạm tại 1 mốc thời gian
const UpdateForecastValue = async (req, reply) => {
  try {
    const {runId, ThoiDiem} = req.body || {};

    if (!runId || !ThoiDiem) {
      return reply.code(400).send({code: 400, message: "Lượt dự báo và thời điểm là bắt buộc"});
    }

    const {values, error} = pickStationValues(req.body);
    if (error) return reply.code(400).send({code: 400, message: error});

    const columns = Object.keys(values);
    if (columns.length === 0) {
      return reply.code(400).send({code: 400, message: "Không có dữ liệu để cập nhật"});
    }

    const setClause = columns.map((col, index) => `"${col}" = $${index + 3}`).join(", ");
    const result = await QueryDatabase(
      `UPDATE forecast_system.forecast_values
       SET ${setClause}
       WHERE run_id = $1 AND "ThoiDiem" = $2
       RETURNING *`,
      [runId, ThoiDiem, ...Object.values(values)],
    );

    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy dữ liệu dự báo"});
    }

    return reply.code(200).send({
      code: 200,
      message: "Cập nhật dữ liệu dự báo thành công",
      data: formatValueRow(result.rows[0]),
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// DELETE - Xóa 1 hoặc nhiều mốc thời gian: body { items: [{ runId, ThoiDiem }] }
const DeleteForecastValues = async (req, reply) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items.filter((i) => i?.runId && i?.ThoiDiem) : [];

    if (items.length === 0) {
      return reply.code(400).send({code: 400, message: "Vui lòng chọn dữ liệu cần xóa"});
    }

    const params = [];
    const tuples = items.map((item) => {
      params.push(item.runId, item.ThoiDiem);
      return `($${params.length - 1}, $${params.length}::timestamptz)`;
    });

    const result = await QueryDatabase(
      `DELETE FROM forecast_system.forecast_values
       WHERE (run_id, "ThoiDiem") IN (${tuples.join(", ")})`,
      params,
    );

    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy dữ liệu dự báo"});
    }

    return reply.code(200).send({
      code: 200,
      message: `Xóa thành công ${result.rowCount} bản ghi dữ liệu dự báo`,
      deletedCount: result.rowCount,
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// DELETE - Xóa cả lượt chạy dự báo (cascade forecast_values)
const DeleteForecastRun = async (req, reply) => {
  try {
    const {runId} = req.params;
    const result = await QueryDatabase(`DELETE FROM forecast_system.forecast_runs WHERE run_id = $1`, [runId]);

    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy lượt dự báo"});
    }

    return reply.code(200).send({code: 200, message: "Xóa lượt dự báo thành công"});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// Đồng bộ thủ công lượt dự báo mới nhất từ API ngoài
const SyncForecastNow = async (req, reply) => {
  try {
    const result = await forecastSyncService.syncLatest();

    if (result.status === "error") {
      return reply.code(502).send({code: 502, message: "API dự báo chưa sẵn sàng", data: result});
    }

    const message =
      result.status === "skipped_duplicate"
        ? "Lượt dự báo mới nhất đã có trong hệ thống"
        : `Đồng bộ thành công ${result.rowsSynced} mốc thời gian`;

    return reply.code(200).send({code: 200, message, data: result});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Không thể đồng bộ dữ liệu dự báo"});
  }
};

module.exports = {
  GetForecastRuns,
  GetForecastValues,
  CreateForecastValue,
  UpdateForecastValue,
  DeleteForecastValues,
  DeleteForecastRun,
  SyncForecastNow,
};
