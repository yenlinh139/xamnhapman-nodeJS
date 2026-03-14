const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const XLSX = require("xlsx");

const ExportHydrometeorologicalDataToExcel = async (req, reply) => {
  try {
    const {stations, startDate, endDate, format} = req.body;

    if (!stations || !Array.isArray(stations) || stations.length === 0) {
      return reply.code(400).send({code: 400, message: "Danh sách trạm là bắt buộc"});
    }

    if (!startDate || !endDate) {
      return reply.code(400).send({code: 400, message: "Khoảng thời gian là bắt buộc"});
    }

    // Convert station array to SQL IN clause
    const stationList = stations.map((s) => `'${s}'`).join(",");

    const query = `
      SELECT 
        h.*, 
        s."TenTram",
        s."TenSong",
        s."TinhThanh",
        s."QuanHuyen"
      FROM hochiminh."ThuyVanKhiTuong" h
      LEFT JOIN hochiminh."TramThuyVanKhiTuong" s ON h."MaTram" = s."MaTram"
      WHERE h."MaTram" IN (${stationList})
        AND h."ThoiGian" BETWEEN '${startDate}' AND '${endDate}'
      ORDER BY h."ThoiGian" ASC, h."MaTram"
    `;

    const result = await QueryDatabase(query);

    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy dữ liệu trong khoảng thời gian này"});
    }

    // Create Excel workbook
    const workbook = XLSX.utils.book_new();

    // Prepare data for Excel
    const excelData = result.rows.map((row) => ({
      "Mã Trạm": row.MaTram,
      "Tên Trạm": row.TenTram || "",
      "Tên Sông": row.TenSong || "",
      "Tỉnh Thành": row.TinhThanh || "",
      "Quận Huyện": row.QuanHuyen || "",
      "Thời Gian": row.ThoiGian ? new Date(row.ThoiGian).toLocaleDateString("vi-VN") : "",
      "Lượng Mưa (mm)": row.LuongMua || "",
      "Mực Nước (cm)": row.MucNuoc || "",
      "Nhiệt Độ (°C)": row.NhietDo || "",
      "Độ Ẩm (%)": row.DoAm || "",
      "Tốc Độ Gió (m/s)": row.TocDoGio || "",
      "Hướng Gió": row.HuongGio || "",
      "Áp Suất (hPa)": row.ApSuat || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dữ liệu Khí tượng Thủy văn");

    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, {type: "buffer", bookType: "xlsx"});

    // Set headers for file download
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("Content-Disposition", `attachment; filename="hydrometeorology_export_${startDate}_${endDate}.xlsx"`);

    return reply.send(excelBuffer);
  } catch (error) {
    logger.error("Export hydrometeorology data error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ khi xuất dữ liệu"});
  }
};

const ExportHydrometeorologicalDataWithRange = async (req, reply) => {
  try {
    const {stations, startDate, endDate, format} = req.body;

    if (!stations || !Array.isArray(stations) || stations.length === 0) {
      return reply.code(400).send({code: 400, message: "Danh sách trạm là bắt buộc"});
    }

    if (!startDate || !endDate) {
      return reply.code(400).send({code: 400, message: "Khoảng thời gian là bắt buộc"});
    }

    // Based on format, call appropriate export function
    if (format === "excel") {
      return await ExportHydrometeorologicalDataToExcel(req, reply);
    } else if (format === "pdf") {
      // Implement PDF export logic here
      return reply.code(501).send({code: 501, message: "PDF export chưa được triển khai"});
    } else if (format === "gis") {
      // Implement GIS export logic here
      return reply.code(501).send({code: 501, message: "GIS export chưa được triển khai"});
    } else {
      return reply.code(400).send({code: 400, message: "Định dạng xuất không hợp lệ"});
    }
  } catch (error) {
    logger.error("Export hydrometeorology data with range error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ khi xuất dữ liệu"});
  }
};

module.exports = {
  ExportHydrometeorologicalDataToExcel,
  ExportHydrometeorologicalDataWithRange,
};
