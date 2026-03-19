const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const XLSX = require("xlsx");

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EXPORT_DAYS = 31;
const MAX_EXPORT_ROWS = 30000;

const ExportIoTDataToExcel = async (req, reply) => {
  try {
    const {stations, startDate, endDate} = req.body;

    if (!stations || !Array.isArray(stations) || stations.length === 0) {
      return reply.code(400).send({code: 400, message: "Danh sách trạm là bắt buộc"});
    }

    if (!startDate || !endDate) {
      return reply.code(400).send({code: 400, message: "Khoảng thời gian là bắt buộc"});
    }

    // Validate format ngày chuẩn YYYY-MM-DD
    if (!DATE_REGEX.test(startDate) || !DATE_REGEX.test(endDate)) {
      return reply.code(400).send({code: 400, message: "Ngày phải có định dạng YYYY-MM-DD"});
    }

    // Validate ngày trước khi query DB
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return reply.code(400).send({code: 400, message: "Khoảng thời gian không hợp lệ"});
    }

    const startYear = Number(startDate.slice(0, 4));
    const endYear = Number(endDate.slice(0, 4));
    const currentYear = new Date().getFullYear() + 1;
    if (startYear < 2000 || endYear > currentYear) {
      return reply.code(400).send({
        code: 400,
        message: `Năm không hợp lệ. Chỉ hỗ trợ từ 2000 đến ${currentYear}`,
      });
    }

    const rangeDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (rangeDays > MAX_EXPORT_DAYS) {
      return reply.code(400).send({
        code: 400,
        message: `Khoảng thời gian export tối đa ${MAX_EXPORT_DAYS} ngày để tránh timeout`,
      });
    }

    const stationPlaceholders = stations.map((_, index) => `$${index + 1}`).join(", ");
    const params = [...stations, startDate, endDate];

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM iot_system.iot_data d
      WHERE d.serial_number IN (${stationPlaceholders})
        AND d.date_time >= $${stations.length + 1}::date
        AND d.date_time < ($${stations.length + 2}::date + interval '1 day')
    `;
    const countResult = await QueryDatabase(countQuery, params);
    const totalRows = countResult.rows[0]?.total || 0;
    if (totalRows === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy dữ liệu IoT trong khoảng thời gian này"});
    }

    if (totalRows > MAX_EXPORT_ROWS) {
      return reply.code(413).send({
        code: 413,
        message: `Dữ liệu quá lớn (${totalRows} dòng). Vui lòng thu hẹp thời gian hoặc chọn ít trạm hơn`,
      });
    }

    const query = `
      SELECT 
        d.serial_number,
        s.station_code,
        s.station_name,
        s.longitude,
        s.latitude,
        TO_CHAR(d.date_time, 'YYYY-MM-DD HH24:MI:SS') AS date_time_text,
        d.distance_value,
        d.distance_unit,
        d.daily_rainfall_value,
        d.daily_rainfall_unit,
        d.salt_value,
        d.salt_unit,
        d.temp_value,
        d.temp_unit
      FROM iot_system.iot_data d
      LEFT JOIN iot_system.iot_stations s ON d.serial_number = s.serial_number
      WHERE d.serial_number IN (${stationPlaceholders})
        AND d.date_time >= $${stations.length + 1}::date
        AND d.date_time < ($${stations.length + 2}::date + interval '1 day')
      ORDER BY d.date_time ASC, d.serial_number
    `;

    const result = await QueryDatabase(query, params);

    // Create Excel workbook
    const workbook = XLSX.utils.book_new();

    // Prepare data for Excel
    const excelData = result.rows.map((row) => ({
      "Serial Number": row.serial_number,
      "Mã Trạm": row.station_code || "",
      "Tên Trạm": row.station_name || "",
      "Kinh Độ": row.longitude || "",
      "Vĩ Độ": row.latitude || "",
      "Thời Gian": row.date_time_text || "",
      "Mực nước": row.distance_value ?? "",
      "Đơn vị mực nước": row.distance_unit || "",
      "Lượng mưa ngày": row.daily_rainfall_value ?? "",
      "Đơn vị lượng mưa": row.daily_rainfall_unit || "",
      "Độ mặn": row.salt_value ?? "",
      "Đơn vị độ mặn": row.salt_unit || "",
      "Nhiệt độ": row.temp_value ?? "",
      "Đơn vị nhiệt độ": row.temp_unit || "",
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
    logger.error(`Export IoT data error: ${error.message}`);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ khi xuất dữ liệu IoT", detail: error.message});
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
