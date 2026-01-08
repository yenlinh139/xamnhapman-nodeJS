const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const XLSX = require("xlsx");

const GetHydrometeorology = async (req, reply) => {
  try {
    // Chỉ lấy thông tin cần thiết của trạm, không cần lấy tất cả dữ liệu
    const result = await QueryDatabase(`
      SELECT "KiHieu", "TenTram", "KinhDo", "ViDo", "PhanLoai"
      FROM hochiminh."TramKTTV"
      WHERE "KinhDo" IS NOT NULL AND "ViDo" IS NOT NULL
      ORDER BY "TenTram" ASC
    `);

    return reply.code(200).send(result.rows);
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
    const {
      startDate,
      endDate,
      limit = 100, // Mặc định giới hạn 100 bản ghi
      offset = 0,
      orderBy = 'DESC' // Mặc định sắp xếp từ mới nhất
    } = req.query;

    if (!kihieu) {
      return reply.code(400).send({code: 400, message: "Thiếu ký hiệu điểm đo"});
    }

    let query;
    let countQuery;

    // Tạo điều kiện WHERE cho thời gian
    let timeCondition = '';
    if (startDate && endDate) {
      timeCondition = ` AND "Ngày"::date BETWEEN '${startDate}' AND '${endDate}'`;
    } else if (startDate) {
      timeCondition = ` AND "Ngày"::date >= '${startDate}'`;
    } else if (endDate) {
      timeCondition = ` AND "Ngày"::date <= '${endDate}'`;
    }

    // Validate limit và offset
    const limitValue = Math.min(Math.max(parseInt(limit), 1), 1000); // Giới hạn tối đa 1000 bản ghi
    const offsetValue = Math.max(parseInt(offset), 0);
    const order = orderBy.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Xử lý trường hợp "full" - lấy dữ liệu từ cả 2 bảng với pagination
    if (kihieu === "full") {
      // Query để đếm tổng số bản ghi
      countQuery = `
        SELECT COUNT(*) as total FROM (
          SELECT "Ngày" FROM hochiminh."KhiTuong" WHERE 1=1 ${timeCondition}
          UNION
          SELECT "Ngày" FROM hochiminh."ThuyVan" WHERE 1=1 ${timeCondition}
        ) as combined_data
      `;

      query = `
        WITH combined_data AS (
          SELECT "Ngày", "R_AP", "R_BC", "R_CG", "R_CL", "R_CC", 
                 "R_HM", "R_LMX", "R_LS", "R_MDC", "R_NB", 
                 "R_PVC", "R_TTH", "R_TSH", "R_TD", "Ttb_TSH", "Tx_TSH", "Tm_TSH",
                 NULL as "Htb_NB", NULL as "Hx_NB", NULL as "Hm_NB",
                 NULL as "Htb_PA", NULL as "Hx_PA", NULL as "Hm_PA"
          FROM hochiminh."KhiTuong"
          WHERE 1=1 ${timeCondition}
          UNION ALL
          SELECT "Ngày", NULL as "R_AP", NULL as "R_BC", NULL as "R_CG", NULL as "R_CL", NULL as "R_CC",
                 NULL as "R_HM", NULL as "R_LMX", NULL as "R_LS", NULL as "R_MDC", NULL as "R_NB",
                 NULL as "R_PVC", NULL as "R_TTH", NULL as "R_TSH", NULL as "R_TD", 
                 NULL as "Ttb_TSH", NULL as "Tx_TSH", NULL as "Tm_TSH",
                 "Htb_NB", "Hx_NB", "Hm_NB", "Htb_PA", "Hx_PA", "Hm_PA"
          FROM hochiminh."ThuyVan"
          WHERE 1=1 ${timeCondition}
        )
        SELECT * FROM combined_data
        ORDER BY "Ngày"::date ${order}
        LIMIT ${limitValue} OFFSET ${offsetValue}
      `;
    } else {
      if (!idMapping[kihieu]) {
        return reply.code(400).send({code: 400, message: "Điểm đo không hợp lệ"});
      }

      const {table, columns} = idMapping[kihieu];
      const selectColumns = columns.map((col) => `"${col}"`).join(", ");
      const whereConditions = columns.map((col) => `"${col}" IS NOT NULL`).join(" OR ");

      // Query để đếm tổng số bản ghi
      countQuery = `
        SELECT COUNT(*) as total
        FROM hochiminh."${table}"
        WHERE (${whereConditions}) ${timeCondition}
      `;

      query = `
        SELECT "Ngày", ${selectColumns}
        FROM hochiminh."${table}"
        WHERE (${whereConditions}) ${timeCondition}
        ORDER BY "Ngày"::date ${order}
        LIMIT ${limitValue} OFFSET ${offsetValue}
      `;
    }

    // Thực hiện cả 2 query song song để tối ưu performance
    const [dataResult, countResult] = await Promise.all([
      QueryDatabase(query),
      QueryDatabase(countQuery)
    ]);

    const totalRecords = countResult.rows[0]?.total || 0;
    const totalPages = Math.ceil(totalRecords / limitValue);
    const currentPage = Math.floor(offsetValue / limitValue) + 1;

    return reply.code(200).send({
      data: dataResult.rows,
      pagination: {
        currentPage,
        totalPages,
        totalRecords: parseInt(totalRecords),
        limit: limitValue,
        offset: offsetValue,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1
      }
    });
  } catch (error) {
    logger.error("Error in GetHydrometeorologyData:", error);
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
