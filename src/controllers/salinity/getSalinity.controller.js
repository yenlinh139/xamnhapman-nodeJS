const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const XLSX = require("xlsx");

const GetSalinityPoints = async (req, reply) => {
  try {
    const result = await QueryDatabase(`
      SELECT * FROM hochiminh."DiemDoMan"
      WHERE "KinhDo" IS NOT NULL AND "ViDo" IS NOT NULL
    `);

    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Internal Server Error"});
  }
};

const idMapping = {
  CauRachTra: "CRT",
  CauThuThiem: "CTT",
  CauOngThin: "COT",
  CongKenhC: "CKC",
  "KenhXang-AnHa": "KXAH",
  MuiNhaBe: "MNB",
  PhaCatLai: "PCL",
};

// GET /api/salinity-table?year=2007
const GetSalinityData = async (req, reply) => {
  const allowedColumns = Object.values(idMapping);

  try {
    const {kihieu} = req.params;

    if (!kihieu) {
      return reply.code(400).send({code: 400, message: "Thiếu ký hiệu điểm đo"});
    }

    let query;
    if (kihieu === "full") {
      query = `
        SELECT "Ngày", "CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL"
        FROM hochiminh."DoMan"
        ORDER BY "Ngày" ASC
      `;
    } else {
      const column = idMapping[kihieu];
      if (!allowedColumns.includes(column)) {
        return reply.code(400).send({code: 400, message: "Điểm đo không hợp lệ"});
      }

      query = `
        SELECT "Ngày", "${column}" AS "DoMan"
        FROM hochiminh."DoMan"
        WHERE "${column}" IS NOT NULL
        ORDER BY "Ngày" ASC
      `;
    }

    const result = await QueryDatabase(query);
    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

const ExportSalinityDataToExcel = async (req, reply) => {
  const allowedColumns = Object.values(idMapping);

  try {
    const {kihieu} = req.params;
    if (!kihieu) {
      return reply.code(400).send({code: 400, message: "Thiếu ký hiệu điểm đo"});
    }

    const column = idMapping[kihieu];
    if (!allowedColumns.includes(column)) {
      return reply.code(400).send({code: 400, message: "Điểm đo không hợp lệ"});
    }

    const query = `
      SELECT "Ngày", "${column}" AS "DoMan"
      FROM hochiminh."DoMan"
      WHERE "${column}" IS NOT NULL
      ORDER BY "Ngày" ASC
    `;
    const result = await QueryDatabase(query);
    const rows = result.rows;

    // Chuyển định dạng ngày và độ mặn
    const formatted = rows.map((row) => ({
      Ngày: new Date(row.Ngày).toLocaleDateString("vi-VN"),
      "Độ mặn (‰)": row.DoMan,
    }));

    const worksheet = XLSX.utils.json_to_sheet(formatted);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "DoMan");

    const buffer = XLSX.write(workbook, {bookType: "xlsx", type: "buffer"});

    reply
      .header("Content-Disposition", `attachment; filename=DoMan_${kihieu}.xlsx`)
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

module.exports = {
  GetSalinityPoints,
  GetSalinityData,
  ExportSalinityDataToExcel,
};
