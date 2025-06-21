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

// GET /api/salinity-table?year=2007
const GetSalinityData = async (req, reply) => {
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
      query = `
        SELECT "Ngày", "${kihieu}" AS "DoMan"
        FROM hochiminh."DoMan"
        WHERE "${kihieu}" IS NOT NULL
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
  try {
    const {kihieu} = req.params;
    if (!kihieu) {
      return reply.code(400).send({code: 400, message: "Thiếu ký hiệu điểm đo"});
    }
    const query = `
      SELECT "Ngày", "${kihieu}" AS "DoMan"
      FROM hochiminh."DoMan"
      WHERE "${kihieu}" IS NOT NULL
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

const ExportSalinityDataWithRange = async (req, reply) => {
  try {
    const {kiHieu, tenDiem, startDate, endDate, data} = req.body;

    if (!kiHieu || !startDate || !endDate) {
      return reply.code(400).send({
        code: 400,
        message: "Thiếu thông tin: kiHieu, startDate, endDate",
      });
    }

    let exportData = [];

    // Nếu frontend gửi data sẵn, sử dụng data đó
    if (data && data.length > 0) {
      exportData = data;
    } else {
      // Nếu không có data, query từ database với range
      const query = `
        SELECT "Ngày", "${kihieu}" AS "DoMan"
        FROM hochiminh."DoMan"
        WHERE "${kihieu}" IS NOT NULL
          AND "Ngày" >= $1
          AND "Ngày" <= $2
        ORDER BY "Ngày" ASC
      `;

      const result = await QueryDatabase(query, [startDate, endDate]);
      exportData = result.rows;
    }

    if (exportData.length === 0) {
      return reply.code(404).send({
        code: 404,
        message: "Không có dữ liệu trong khoảng thời gian được chọn",
      });
    }

    // Format data cho Excel
    const formatted = exportData.map((row, index) => {
      const date = row.Ngày || row.ngay || row.date;
      const salinity = row.DoMan || row.doman || row.salinity;

      return {
        STT: index + 1,
        Ngày: date ? new Date(date).toLocaleDateString("vi-VN") : "",
        "Độ mặn (‰)": salinity || "",
        "Điểm đo": tenDiem || kiHieu || "",
      };
    });

    // Tạo Excel file
    const worksheet = XLSX.utils.json_to_sheet(formatted);

    // Set column widths
    worksheet["!cols"] = [
      {wch: 5}, // STT
      {wch: 12}, // Ngày
      {wch: 15}, // Độ mặn
      {wch: 20}, // Điểm đo
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dữ liệu độ mặn");

    // Add metadata sheet
    const metaData = [
      ["Thông tin xuất dữ liệu"],
      ["Điểm đo:", tenDiem || kiHieu],
      ["Ký hiệu:", kiHieu],
      ["Từ ngày:", startDate],
      ["Đến ngày:", endDate],
      ["Tổng số bản ghi:", formatted.length],
      ["Thời gian xuất:", new Date().toLocaleString("vi-VN")],
    ];

    const metaWorksheet = XLSX.utils.aoa_to_sheet(metaData);
    metaWorksheet["!cols"] = [{wch: 20}, {wch: 30}];
    XLSX.utils.book_append_sheet(workbook, metaWorksheet, "Thông tin");

    const buffer = XLSX.write(workbook, {bookType: "xlsx", type: "buffer"});

    // Tạo filename
    const fileName = `DoMan_${tenDiem || kiHieu}_${startDate}_${endDate}.xlsx`;

    reply
      .header("Content-Disposition", `attachment; filename=${encodeURIComponent(fileName)}`)
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(buffer);

    logger.info(`Xuất Excel thành công: ${fileName}`);
  } catch (error) {
    logger.error("Lỗi xuất Excel:", error);
    return reply.code(500).send({
      code: 500,
      message: "Lỗi máy chủ khi xuất Excel",
    });
  }
};

module.exports = {
  GetSalinityPoints,
  GetSalinityData,
  ExportSalinityDataToExcel,
  ExportSalinityDataWithRange,
};
