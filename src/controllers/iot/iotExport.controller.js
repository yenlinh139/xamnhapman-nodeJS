const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const XLSX = require("xlsx");

const ExportIoTDataToExcel = async (req, reply) => {
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
        d.*, 
        s."name" as station_name,
        s."location_description"
      FROM hochiminh."iot_data" d
      LEFT JOIN hochiminh."iot_stations" s ON d."serial_number" = s."serial_number"
      WHERE d."serial_number" IN (${stationList})
        AND d."timestamp" BETWEEN '${startDate}' AND '${endDate}'
      ORDER BY d."timestamp" ASC, d."serial_number"
    `;

    const result = await QueryDatabase(query);

    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy dữ liệu IoT trong khoảng thời gian này"});
    }

    // Create Excel workbook
    const workbook = XLSX.utils.book_new();

    // Prepare data for Excel
    const excelData = result.rows.map((row) => ({
      "Serial Number": row.serial_number,
      "Tên Trạm": row.station_name || "",
      "Vị Trí": row.location_description || "",
      "Thời Gian": row.timestamp ? new Date(row.timestamp).toLocaleString("vi-VN") : "",
      pH: row.ph || "",
      "TDS (ppm)": row.tds || "",
      "Độ Mặn (ppt)": row.salinity || "",
      "Nhiệt Độ (°C)": row.temperature || "",
      "Độ Đục (NTU)": row.turbidity || "",
      "Oxy Hòa Tan (mg/L)": row.dissolved_oxygen || "",
      "ORP (mV)": row.orp || "",
      "Conductivity (µS/cm)": row.conductivity || "",
      "Trạng Thái Pin (%)": row.battery_level || "",
      "Chất Lượng Tín Hiệu": row.signal_quality || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dữ liệu IoT");

    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, {type: "buffer", bookType: "xlsx"});

    // Set headers for file download
    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    reply.header("Content-Disposition", `attachment; filename="iot_export_${startDate}_${endDate}.xlsx"`);

    return reply.send(excelBuffer);
  } catch (error) {
    logger.error("Export IoT data error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ khi xuất dữ liệu IoT"});
  }
};

const ExportIoTDataWithRange = async (req, reply) => {
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
      return await ExportIoTDataToExcel(req, reply);
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
    logger.error("Export IoT data with range error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ khi xuất dữ liệu IoT"});
  }
};

module.exports = {
  ExportIoTDataToExcel,
  ExportIoTDataWithRange,
};
