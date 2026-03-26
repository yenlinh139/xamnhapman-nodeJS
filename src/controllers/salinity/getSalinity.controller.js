const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const XLSX = require("xlsx");
const NodeCache = require("node-cache");

// Cache với TTL 5 phút cho data ít thay đổi
const cache = new NodeCache({stdTTL: 300, checkperiod: 60});

const GetSalinityPoints = async (req, reply) => {
  try {
    // Check cache first
    const cacheKey = "salinity_points";
    let result = cache.get(cacheKey);

    if (!result) {
      // Lấy danh sách điểm đo
      const pointsResult = await QueryDatabase(
        `SELECT "KiHieu", "TenDiem", "KinhDo", "ViDo", "PhanLoai" AS "MoTa"
         FROM hochiminh."DiemDoMan"
         WHERE "KinhDo" IS NOT NULL AND "ViDo" IS NOT NULL
         ORDER BY "TenDiem" ASC`,
      );

      // Lấy toàn bộ dữ liệu độ mặn (sắp xếp theo ngày giảm dần)
      const dataResult = await QueryDatabase(
        `SELECT *
         FROM hochiminh."DoMan"
         ORDER BY "Ngày" DESC`,
      );

      // Xử lý dữ liệu
      result = pointsResult.rows.map((point) => {
        const pointData = {
          ...point,
          latest_value: null,
          latest_date: null,
          previous_value: null,
          previous_date: null,
        };

        const kihieu = point.KiHieu;
        let foundLatest = false;
        let foundPrevious = false;

        // Lặp qua dữ liệu độ mặn để tìm latest và previous
        for (const record of dataResult.rows) {
          const value = record[kihieu]; // Lấy giá trị cột tương ứng với KiHieu

          if (value !== null && value !== undefined) {
            if (!foundLatest) {
              pointData.latest_value = value;
              pointData.latest_date = record.Ngày;
              foundLatest = true;
            } else if (!foundPrevious) {
              pointData.previous_value = value;
              pointData.previous_date = record.Ngày;
              foundPrevious = true;
              break;
            }
          }
        }

        return pointData;
      });

      cache.set(cacheKey, result);
    }

    return reply.code(200).send(result);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Internal Server Error"});
  }
};

// GET /api/salinity-table?year=2007
const GetSalinityData = async (req, reply) => {
  try {
    const {kihieu} = req.params;
    const {limit = 1000, offset = 0, startDate, endDate} = req.query;

    if (!kihieu) {
      return reply.code(400).send({code: 400, message: "Thiếu ký hiệu điểm đo"});
    }

    // Validate và sanitize tham số
    const validStations = ["CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL", "KXD2"];
    if (kihieu !== "full" && !validStations.includes(kihieu)) {
      return reply.code(400).send({code: 400, message: "Ký hiệu không hợp lệ"});
    }

    const limitVal = Math.min(parseInt(limit), 5000); // Max 5000 records
    const offsetVal = Math.max(parseInt(offset), 0);

    let query,
      params = [];
    let whereClause = "";

    // Thêm điều kiện thời gian nếu có
    if (startDate && endDate) {
      whereClause = ' AND "Ngày" BETWEEN $' + (params.length + 1) + " AND $" + (params.length + 2);
      params.push(startDate, endDate);
    }

    if (kihieu === "full") {
      query = `
        SELECT "Ngày", "CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL", "KXD2"
        FROM hochiminh."DoMan"
        WHERE 1=1 ${whereClause}
        ORDER BY "Ngày" DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(limitVal, offsetVal);
    } else {
      query = `
        SELECT "Ngày", "${kihieu}" AS "DoMan"
        FROM hochiminh."DoMan"
        WHERE "${kihieu}" IS NOT NULL ${whereClause}
        ORDER BY "Ngày" DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(limitVal, offsetVal);
    }

    const result = await QueryDatabase(query, params);
    return reply.code(200).send({
      data: result.rows,
      pagination: {
        limit: limitVal,
        offset: offsetVal,
        total: result.rowCount,
      },
    });
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
