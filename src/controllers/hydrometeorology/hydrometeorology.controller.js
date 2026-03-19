const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const XLSX = require("xlsx");
const NodeCache = require("node-cache");

// Cache cho static data (stations) - 1 giờ
const stationCache = new NodeCache({stdTTL: 3600, checkperiod: 300});
// Cache cho dynamic data - 10 phút
const dataCache = new NodeCache({stdTTL: 600, checkperiod: 60});

const GetHydrometeorology = async (req, reply) => {
  try {
    // Check cache first
    const cacheKey = "hydro_stations";
    let result = stationCache.get(cacheKey);

    if (!result) {
      // Chỉ lấy thông tin cần thiết của trạm, không cần lấy tất cả dữ liệu
      const dbResult = await QueryDatabase(`
        SELECT "KiHieu", "TenTram", "KinhDo", "ViDo", "PhanLoai", "PhanLoai" AS "TinhTrang"
        FROM hochiminh."TramKTTV"
        WHERE "KinhDo" IS NOT NULL AND "ViDo" IS NOT NULL
        ORDER BY "TenTram" ASC
      `);
      result = dbResult.rows;
      stationCache.set(cacheKey, result, 3600); // Cache 1 giờ
    }

    return reply.code(200).send(result);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Internal Server Error"});
  }
};

const idMapping = {
  // Khí tượng
  AP: {table: "KhiTuong", columns: ["R_AP"]},
  BC: {table: "KhiTuong", columns: ["R_BC"]},
  CG: {table: "KhiTuong", columns: ["R_CG"]},
  CL: {table: "KhiTuong", columns: ["R_CL"]},
  CC: {table: "KhiTuong", columns: ["R_CC"]},
  HM: {table: "KhiTuong", columns: ["R_HM"]},
  LMX: {table: "KhiTuong", columns: ["R_LMX"]},
  LS: {table: "KhiTuong", columns: ["R_LS"]},
  MDC: {table: "KhiTuong", columns: ["R_MDC"]},
  NB_KT: {table: "KhiTuong", columns: ["R_NB"]},
  PVC: {table: "KhiTuong", columns: ["R_PVC"]},
  TTH: {table: "KhiTuong", columns: ["R_TTH"]},
  TD: {table: "KhiTuong", columns: ["R_TD"]},
  TSH: {table: "KhiTuong", columns: ["R_TSH", "Ttb_TSH", "Tx_TSH", "Tm_TSH"]},
  // Thủy văn
  NB_TV: {table: "ThuyVan", columns: ["Htb_NB", "Hx_NB", "Hm_NB"]},
  PA: {table: "ThuyVan", columns: ["Htb_PA", "Hx_PA", "Hm_PA"]},
};

const GetHydrometeorologyData = async (req, reply) => {
  try {
    const {kihieu} = req.params;
    const {startDate, endDate, limit = 100, offset = 0, orderBy = "DESC"} = req.query;

    if (!kihieu) {
      return reply.code(400).send({code: 400, message: "Thiếu ký hiệu điểm đo"});
    }

    // Validate và sanitize inputs
    const limitValue = Math.min(Math.max(parseInt(limit), 1), 1000);
    const offsetValue = Math.max(parseInt(offset), 0);
    const order = orderBy.toLowerCase() === "asc" ? "ASC" : "DESC";

    // Chuẩn bị query parameters
    let params = [];
    let timeCondition = "";

    if (startDate && endDate) {
      timeCondition = ` AND "Ngày"::date BETWEEN $${params.length + 1} AND $${params.length + 2}`;
      params.push(startDate, endDate);
    } else if (startDate) {
      timeCondition = ` AND "Ngày"::date >= $${params.length + 1}`;
      params.push(startDate);
    } else if (endDate) {
      timeCondition = ` AND "Ngày"::date <= $${params.length + 1}`;
      params.push(endDate);
    }

    let query, countQuery;
    const limitParam = `$${params.length + 1}`;
    const offsetParam = `$${params.length + 2}`;

    if (kihieu === "full") {
      // Optimized query cho full data - tránh UNION ALL
      query = `
        SELECT 
          k."Ngày",
          k."R_AP", k."R_BC", k."R_CG", k."R_CL", k."R_CC",
          k."R_HM", k."R_LMX", k."R_LS", k."R_MDC", k."R_NB",
          k."R_PVC", k."R_TTH", k."R_TSH", k."R_TD",
          k."Ttb_TSH", k."Tx_TSH", k."Tm_TSH",
          t."Htb_NB", t."Hx_NB", t."Hm_NB",
          t."Htb_PA", t."Hx_PA", t."Hm_PA"
        FROM hochiminh."KhiTuong" k
        FULL OUTER JOIN hochiminh."ThuyVan" t ON DATE(k."Ngày") = DATE(t."Ngày")
        WHERE (k."Ngày" IS NOT NULL OR t."Ngày" IS NOT NULL) ${timeCondition}
        ORDER BY COALESCE(k."Ngày", t."Ngày") ${order}
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `;

      countQuery = `
        SELECT COUNT(*) as total 
        FROM hochiminh."KhiTuong" k
        FULL OUTER JOIN hochiminh."ThuyVan" t ON DATE(k."Ngày") = DATE(t."Ngày")
        WHERE (k."Ngày" IS NOT NULL OR t."Ngày" IS NOT NULL) ${timeCondition}
      `;
    } else {
      // Single station query
      const mapping = idMapping[kihieu];
      if (!mapping) {
        return reply.code(400).send({code: 400, message: "Ký hiệu không hợp lệ"});
      }

      const columns = mapping.columns.map((col) => `"${col}"`).join(", ");
      const tableName = mapping.table;

      query = `
        SELECT "Ngày", ${columns}
        FROM hochiminh."${tableName}"
        WHERE 1=1 ${timeCondition}
        ORDER BY "Ngày" ${order}
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `;

      countQuery = `
        SELECT COUNT(*) as total
        FROM hochiminh."${tableName}"
        WHERE 1=1 ${timeCondition}
      `;
    }

    // Add limit and offset to params
    params.push(limitValue, offsetValue);

    // Execute queries in parallel
    const [dataResult, countResult] = await Promise.all([
      QueryDatabase(query, params),
      QueryDatabase(countQuery, params.slice(0, -2)), // Remove limit/offset for count
    ]);

    const total = parseInt(countResult.rows[0]?.total || 0);
    const totalPages = Math.ceil(total / limitValue);

    return reply.code(200).send({
      code: 200,
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
    logger.error("GetHydrometeorologyData Error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// API mới để lấy dữ liệu mới nhất của tất cả trạm (tối ưu cho map display)
const GetLatestHydrometeorologyData = async (req, reply) => {
  try {
    const query = `
      WITH latest_dates AS (
        SELECT MAX("Ngày") as latest_date FROM hochiminh."KhiTuong"
        UNION ALL
        SELECT MAX("Ngày") as latest_date FROM hochiminh."ThuyVan"
      ),
      max_date AS (
        SELECT MAX(latest_date) as max_date FROM latest_dates
      ),
      latest_weather AS (
        SELECT "Ngày", "R_AP", "R_BC", "R_CG", "R_CL", "R_CC", 
               "R_HM", "R_LMX", "R_LS", "R_MDC", "R_NB", 
               "R_PVC", "R_TTH", "R_TSH", "R_TD", "Ttb_TSH", "Tx_TSH", "Tm_TSH"
        FROM hochiminh."KhiTuong", max_date
        WHERE "Ngày"::date = max_date.max_date::date
      ),
      latest_hydro AS (
        SELECT "Ngày", "Htb_NB", "Hx_NB", "Hm_NB", "Htb_PA", "Hx_PA", "Hm_PA"
        FROM hochiminh."ThuyVan", max_date
        WHERE "Ngày"::date = max_date.max_date::date
      )
      SELECT 
        COALESCE(w."Ngày", h."Ngày") as "Ngày",
        w."R_AP", w."R_BC", w."R_CG", w."R_CL", w."R_CC",
        w."R_HM", w."R_LMX", w."R_LS", w."R_MDC", w."R_NB",
        w."R_PVC", w."R_TTH", w."R_TSH", w."R_TD", 
        w."Ttb_TSH", w."Tx_TSH", w."Tm_TSH",
        h."Htb_NB", h."Hx_NB", h."Hm_NB", h."Htb_PA", h."Hx_PA", h."Hm_PA"
      FROM latest_weather w
      FULL OUTER JOIN latest_hydro h ON w."Ngày" = h."Ngày"
    `;

    const result = await QueryDatabase(query);
    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error("Error in GetLatestHydrometeorologyData:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

module.exports = {
  GetHydrometeorology,
  GetHydrometeorologyData,
  GetLatestHydrometeorologyData,
};
