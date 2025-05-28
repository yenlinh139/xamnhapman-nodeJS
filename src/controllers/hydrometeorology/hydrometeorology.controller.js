const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const XLSX = require("xlsx");

const GetHydrometeorology = async (req, reply) => {
  try {
    const result = await QueryDatabase(`
      SELECT * FROM hochiminh."TramKTTV"
      WHERE "KinhDo" IS NOT NULL AND "ViDo" IS NOT NULL
    `);

    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Internal Server Error"});
  }
};

const idMapping = {
  // Khí tượng
  AP: { table: "KhiTuong", columns: ["R_AP"] },
  BC: { table: "KhiTuong", columns: ["R_BC"] },
  CG: { table: "KhiTuong", columns: ["R_CG"] },
  CL: { table: "KhiTuong", columns: ["R_CL"] },
  CC: { table: "KhiTuong", columns: ["R_CC"] },
  HM: { table: "KhiTuong", columns: ["R_HM"] },
  LMX: { table: "KhiTuong", columns: ["R_LMX"] },
  LS: { table: "KhiTuong", columns: ["R_LS"] },
  MDC: { table: "KhiTuong", columns: ["R_MDC"] },
  NB_KT: { table: "KhiTuong", columns: ["R_NB"] },
  PVC: { table: "KhiTuong", columns: ["R_PVC"] },
  TTH: { table: "KhiTuong", columns: ["R_TTH"] },
  TD: { table: "KhiTuong", columns: ["R_TD"] },
  TSH: { table: "KhiTuong", columns: ["R_TSH", "Ttb_TSH", "Tx_TSH", "Tm_TSH"] },
  // Thủy văn
  NB_TV: { table: "ThuyVan", columns: ["Htb_NB", "Hx_NB", "Hm_NB"] },
  PA: { table: "ThuyVan", columns: ["Htb_PA", "Hx_PA", "Hm_PA"] },
};

const GetHydrometeorologyData = async (req, reply) => {
  try {
    const {kihieu} = req.params;

    if (!kihieu) {
      return reply.code(400).send({code: 400, message: "Thiếu ký hiệu điểm đo"});
    }

    let query;

    // Xử lý trường hợp "full" - lấy tất cả dữ liệu từ cả 2 bảng
    if (kihieu === "full") {
      query = `
        SELECT "Ngày", "R_AP", "R_BC", "R_CG", "R_CL", "R_CC", 
               "R_HM", "R_LMX", "R_LS", "R_MDC", "R_NB", 
               "R_PVC", "R_TTH", "R_TSH", "R_TD", "Ttb_TSH", "Tx_TSH", "Tm_TSH"
        FROM hochiminh."KhiTuong"
        UNION ALL
        SELECT "Ngày", NULL as "R_AP", NULL as "R_BC", NULL as "R_CG", NULL as "R_CL", NULL as "R_CC",
               NULL as "R_HM", NULL as "R_LMX", NULL as "R_LS", NULL as "R_MDC", NULL as "R_NB",
               NULL as "R_PVC", NULL as "R_TTH", NULL as "R_TSH", NULL as "R_TD", NULL as "Ttb_TSH", NULL as "Tx_TSH", NULL as "Tm_TSH"
        FROM hochiminh."ThuyVan"
        ORDER BY "Ngày"::date ASC
      `;
    } else {
      if (!idMapping[kihieu]) {
        return reply.code(400).send({code: 400, message: "Điểm đo không hợp lệ"});
      }

      const { table, columns } = idMapping[kihieu];

      const selectColumns = columns.map(col => `"${col}"`).join(", ");
 
      const whereConditions = columns.map(col => `"${col}" IS NOT NULL`).join(" OR ");

      query = `
        SELECT "Ngày", ${selectColumns}
        FROM hochiminh."${table}"
        WHERE ${whereConditions}
        ORDER BY "Ngày"::date ASC
      `;
    }

    const result = await QueryDatabase(query);
    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

module.exports = {
  GetHydrometeorology,
  GetHydrometeorologyData,
};
