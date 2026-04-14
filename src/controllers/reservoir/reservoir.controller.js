const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const NodeCache = require("node-cache");

const cache = new NodeCache({stdTTL: 300, checkperiod: 60});

const RESERVOIR_MAPPING = {
  HDT: {
    column: "HDT",
    sourceColumn: "NguonDuLieu_HDT",
    displayName: "Hồ Dầu Tiếng",
  },
  HTA: {
    column: "HTA",
    sourceColumn: "NguonDuLieu_HTA",
    displayName: "Hồ Trị An",
  },
};

const getTimeCondition = (startDate, endDate, params = []) => {
  let timeCondition = "";

  if (startDate && endDate) {
    timeCondition = ` AND "Ngày" BETWEEN $${params.length + 1} AND $${params.length + 2}`;
    params.push(startDate, endDate);
  } else if (startDate) {
    timeCondition = ` AND "Ngày" >= $${params.length + 1}`;
    params.push(startDate);
  } else if (endDate) {
    timeCondition = ` AND "Ngày" <= $${params.length + 1}`;
    params.push(endDate);
  }

  return timeCondition;
};

const GetReservoirPoints = async (req, reply) => {
  try {
    const cacheKey = "reservoir_points_v1";
    let result = cache.get(cacheKey);

    if (!result) {
      const dbResult = await QueryDatabase(`
        SELECT "KiHieu", "TenHo", "KinhDo", "ViDo", "YeuTo", "ThoiGian", "TanSuat"
        FROM hochiminh."HoChua"
        WHERE "KinhDo" IS NOT NULL AND "ViDo" IS NOT NULL
        ORDER BY "TenHo" ASC
      `);

      result = dbResult.rows;
      cache.set(cacheKey, result);
    }

    return reply.code(200).send(result);
  } catch (error) {
    logger.error("GetReservoirPoints error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

const GetReservoirOverview = async (req, reply) => {
  try {
    const {code} = req.params;
    const {startDate, endDate, limit = 200} = req.query;

    if (!code) {
      return reply.code(400).send({code: 400, message: "Thiếu mã hồ chứa"});
    }

    const reservoirCode = decodeURIComponent(code).trim().toUpperCase();
    const mapping = RESERVOIR_MAPPING[reservoirCode];

    if (!mapping) {
      return reply.code(400).send({code: 400, message: "Mã hồ chứa không hợp lệ"});
    }

    const limitValue = Math.min(Math.max(parseInt(limit) || 200, 1), 1000);
    const cacheKey = `reservoir_overview_${reservoirCode}_${startDate || "all"}_${endDate || "all"}_${limitValue}`;
    const cached = cache.get(cacheKey);

    if (cached) {
      return reply.code(200).send(cached);
    }

    const stationResult = await QueryDatabase(
      `
        SELECT "KiHieu", "TenHo", "KinhDo", "ViDo", "YeuTo", "ThoiGian", "TanSuat"
        FROM hochiminh."HoChua"
        WHERE "KiHieu" = $1
      `,
      [reservoirCode],
    );

    if (stationResult.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy hồ chứa"});
    }

    const params = [];
    const timeCondition = getTimeCondition(startDate, endDate, params);

    const dataQuery = `
      SELECT
        "Ngày",
        "${mapping.column}" AS "TongLuongXa",
        "${mapping.sourceColumn}" AS "NguonDuLieu"
      FROM hochiminh."TongLuongXa"
      WHERE "${mapping.column}" IS NOT NULL ${timeCondition}
      ORDER BY "Ngày" DESC
      LIMIT $${params.length + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM hochiminh."TongLuongXa"
      WHERE "${mapping.column}" IS NOT NULL ${timeCondition}
    `;

    const rangeQuery = `
      SELECT MIN("Ngày") AS start_date, MAX("Ngày") AS end_date
      FROM hochiminh."TongLuongXa"
      WHERE "${mapping.column}" IS NOT NULL ${timeCondition}
    `;

    const [dataResult, countResult, rangeResult] = await Promise.all([
      QueryDatabase(dataQuery, [...params, limitValue]),
      QueryDatabase(countQuery, params),
      QueryDatabase(rangeQuery, params),
    ]);

    const response = {
      station: stationResult.rows[0],
      total_records: parseInt(countResult.rows[0]?.total || 0),
      start_time: rangeResult.rows[0]?.start_date || null,
      end_time: rangeResult.rows[0]?.end_date || null,
      latest_value: dataResult.rows[0]?.TongLuongXa || null,
      latest_source: dataResult.rows[0]?.NguonDuLieu || null,
      data: dataResult.rows,
    };

    cache.set(cacheKey, response);
    return reply.code(200).send(response);
  } catch (error) {
    logger.error("GetReservoirOverview error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

const GetReservoirData = async (req, reply) => {
  try {
    const {kihieu} = req.params;
    const {startDate, endDate, limit = 100, offset = 0, orderBy = "DESC"} = req.query;

    if (!kihieu) {
      return reply.code(400).send({code: 400, message: "Thiếu ký hiệu hồ chứa"});
    }

    const reservoirCode = decodeURIComponent(kihieu).trim().toUpperCase();
    const limitValue = Math.min(Math.max(parseInt(limit) || 100, 1), 1000);
    const offsetValue = Math.max(parseInt(offset) || 0, 0);
    const order = String(orderBy).toLowerCase() === "asc" ? "ASC" : "DESC";

    const params = [];
    const timeCondition = getTimeCondition(startDate, endDate, params);

    let query = "";
    let countQuery = "";
    let station = null;

    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;

    if (reservoirCode === "FULL") {
      query = `
        SELECT "Ngày", "HDT", "NguonDuLieu_HDT", "HTA", "NguonDuLieu_HTA"
        FROM hochiminh."TongLuongXa"
        WHERE 1 = 1 ${timeCondition}
        ORDER BY "Ngày" ${order}
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `;

      countQuery = `
        SELECT COUNT(*) AS total
        FROM hochiminh."TongLuongXa"
        WHERE 1 = 1 ${timeCondition}
      `;
    } else {
      const mapping = RESERVOIR_MAPPING[reservoirCode];
      if (!mapping) {
        return reply.code(400).send({code: 400, message: "Ký hiệu hồ chứa không hợp lệ"});
      }

      const stationResult = await QueryDatabase(
        `
          SELECT "KiHieu", "TenHo", "KinhDo", "ViDo", "YeuTo", "ThoiGian", "TanSuat"
          FROM hochiminh."HoChua"
          WHERE "KiHieu" = $1
        `,
        [reservoirCode],
      );
      station = stationResult.rows[0] || null;

      query = `
        SELECT
          "Ngày",
          "${mapping.column}" AS "TongLuongXa",
          "${mapping.sourceColumn}" AS "NguonDuLieu"
        FROM hochiminh."TongLuongXa"
        WHERE "${mapping.column}" IS NOT NULL ${timeCondition}
        ORDER BY "Ngày" ${order}
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `;

      countQuery = `
        SELECT COUNT(*) AS total
        FROM hochiminh."TongLuongXa"
        WHERE "${mapping.column}" IS NOT NULL ${timeCondition}
      `;
    }

    const [dataResult, countResult] = await Promise.all([
      QueryDatabase(query, [...params, limitValue, offsetValue]),
      QueryDatabase(countQuery, params),
    ]);

    const total = parseInt(countResult.rows[0]?.total || 0);
    const totalPages = Math.ceil(total / limitValue);

    return reply.code(200).send({
      code: 200,
      station,
      data: dataResult.rows,
      pagination: {
        page: Math.floor(offsetValue / limitValue) + 1,
        limit: limitValue,
        offset: offsetValue,
        total,
        totalPages,
        hasNext: offsetValue + limitValue < total,
        hasPrev: offsetValue > 0,
      },
    });
  } catch (error) {
    logger.error("GetReservoirData error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

const GetLatestReservoirData = async (req, reply) => {
  try {
    const cacheKey = "reservoir_latest_v1";
    const cached = cache.get(cacheKey);

    if (cached) {
      return reply.code(200).send(cached);
    }

    const result = await QueryDatabase(`
      SELECT "Ngày", "HDT", "NguonDuLieu_HDT", "HTA", "NguonDuLieu_HTA"
      FROM hochiminh."TongLuongXa"
      ORDER BY "Ngày" DESC
      LIMIT 1
    `);

    const response = result.rows[0] || null;
    cache.set(cacheKey, response);

    return reply.code(200).send(response);
  } catch (error) {
    logger.error("GetLatestReservoirData error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

module.exports = {
  GetReservoirPoints,
  GetReservoirOverview,
  GetReservoirData,
  GetLatestReservoirData,
};
