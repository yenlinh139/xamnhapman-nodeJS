const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const XLSX = require("xlsx");

const ExportAdministrativeDataToExcel = async (req, reply) => {
  try {
    const {format} = req.body;

    // Export administrative boundaries data
    const queries = {
      districts: `
        SELECT 
          "mahuyen" as "Mã Huyện",
          "tenhuyen" as "Tên Huyện", 
          "dientichtunhien" as "Diện Tích Tự Nhiên (km²)",
          "shape_length" as "Chu Vi (m)",
          "shape_area" as "Diện Tích (m²)"
        FROM hochiminh."DiaPhanHuyen"
        ORDER BY "tenhuyen"
      `,
      communes: `
        SELECT 
          "maxa" as "Mã Xã",
          "tenxa" as "Tên Xã",
          "mahuyen" as "Mã Huyện", 
          "tenhuyen" as "Tên Huyện",
          "dientichtunhien" as "Diện Tích Tự Nhiên (km²)",
          "shape_length" as "Chu Vi (m)",
          "shape_area" as "Diện Tích (m²)"
        FROM hochiminh."DiaPhanXa"
        ORDER BY "tenhuyen", "tenxa"
      `,
    };

    // Create Excel workbook
    const workbook = XLSX.utils.book_new();

    // Export Districts data
    const districtResult = await QueryDatabase(queries.districts);
    if (districtResult.rowCount > 0) {
      const districtWorksheet = XLSX.utils.json_to_sheet(districtResult.rows);
      XLSX.utils.book_append_sheet(workbook, districtWorksheet, "Quận Huyện");
    }

    // Export Communes data
    const communeResult = await QueryDatabase(queries.communes);
    if (communeResult.rowCount > 0) {
      const communeWorksheet = XLSX.utils.json_to_sheet(communeResult.rows);
      XLSX.utils.book_append_sheet(workbook, communeWorksheet, "Phường Xã");
    }

    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, {type: "buffer", bookType: "xlsx"});

    // Set headers for file download
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("Content-Disposition", `attachment; filename="administrative_data_export.xlsx"`);

    return reply.send(excelBuffer);
  } catch (error) {
    logger.error("Export administrative data error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ khi xuất dữ liệu hành chính"});
  }
};

const ExportAdministrativeDataWithRange = async (req, reply) => {
  try {
    const {format} = req.body;

    // Based on format, call appropriate export function
    if (format === "excel") {
      return await ExportAdministrativeDataToExcel(req, reply);
    } else if (format === "pdf") {
      // Implement PDF export logic here
      return reply.code(501).send({code: 501, message: "PDF export chưa được triển khai"});
    } else if (format === "gis") {
      // Implement GIS export logic here - this would be the most appropriate format for administrative boundaries
      return reply.code(501).send({code: 501, message: "GIS export chưa được triển khai"});
    } else {
      return reply.code(400).send({code: 400, message: "Định dạng xuất không hợp lệ"});
    }
  } catch (error) {
    logger.error("Export administrative data with range error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ khi xuất dữ liệu hành chính"});
  }
};

module.exports = {
  ExportAdministrativeDataToExcel,
  ExportAdministrativeDataWithRange,
};
