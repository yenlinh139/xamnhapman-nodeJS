const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const NodeCache = require("node-cache");

// Cache với TTL 1 tiếng cho report data
const reportCache = new NodeCache({stdTTL: 3600, checkperiod: 300});

// Station mapping
const stationMapping = {
  CRT: "Cầu Rạch Tra",
  CTT: "Cầu Thủ Thiêm",
  COT: "Cầu Ông Thìn",
  CKC: "Cống Kênh C",
  KXAH: "Kênh Xáng đứng 1", // Updated name as per note in data
  MNB: "Mũi Nhà Bè",
  PCL: "Phà Cát Lái",
  KXD2: "Kênh Xáng đứng 2",
};

const stationCodes = Object.keys(stationMapping);
const manualDailyAverageColumns = stationCodes
  .map((code) => `ROUND(AVG(NULLIF("${code}"::text, 'NULL')::numeric), 3) AS "${code}"`)
  .join(",\n             ");
const manualResultHasDataCondition = stationCodes.map((code) => `"${code}" IS NOT NULL`).join(" OR ");

const buildIotSalinityReportData = async (date, year, month) => {
  const iotStationsQuery = `
    SELECT DISTINCT s.station_code, s.station_name, s.serial_number
    FROM iot_system.iot_stations s
    JOIN iot_system.iot_data d ON d.serial_number = s.serial_number
    WHERE d.salt_value IS NOT NULL
    ORDER BY s.station_name ASC
  `;

  const currentDayQuery = `
    SELECT
      s.station_code,
      s.station_name,
      s.serial_number,
      DATE(d.date_time) AS date,
      ROUND(AVG(d.salt_value)::numeric, 3) AS salinity
    FROM iot_system.iot_data d
    JOIN iot_system.iot_stations s ON s.serial_number = d.serial_number
    WHERE d.salt_value IS NOT NULL
      AND DATE(d.date_time) = $1::date
    GROUP BY s.station_code, s.station_name, s.serial_number, DATE(d.date_time)
    ORDER BY s.station_name ASC
  `;

  const previousDayQuery = `
    WITH daily_iot AS (
      SELECT
        s.station_code,
        s.station_name,
        s.serial_number,
        DATE(d.date_time) AS date,
        ROUND(AVG(d.salt_value)::numeric, 3) AS salinity
      FROM iot_system.iot_data d
      JOIN iot_system.iot_stations s ON s.serial_number = d.serial_number
      WHERE d.salt_value IS NOT NULL
        AND DATE(d.date_time) < $1::date
      GROUP BY s.station_code, s.station_name, s.serial_number, DATE(d.date_time)
    )
    SELECT DISTINCT ON (station_code)
      station_code,
      station_name,
      serial_number,
      date,
      salinity
    FROM daily_iot
    ORDER BY station_code, date DESC
  `;

  const monthlyPrevYearQuery = `
    SELECT
      s.station_code,
      s.station_name,
      s.serial_number,
      DATE(d.date_time) AS date,
      ROUND(AVG(d.salt_value)::numeric, 3) AS salinity
    FROM iot_system.iot_data d
    JOIN iot_system.iot_stations s ON s.serial_number = d.serial_number
    WHERE d.salt_value IS NOT NULL
      AND EXTRACT(YEAR FROM d.date_time) = $1
      AND EXTRACT(MONTH FROM d.date_time) = $2
    GROUP BY s.station_code, s.station_name, s.serial_number, DATE(d.date_time)
    ORDER BY DATE(d.date_time)
  `;

  const monthlyAllYearsQuery = `
    SELECT
      s.station_code,
      s.station_name,
      s.serial_number,
      DATE(d.date_time) AS date,
      ROUND(AVG(d.salt_value)::numeric, 3) AS salinity
    FROM iot_system.iot_data d
    JOIN iot_system.iot_stations s ON s.serial_number = d.serial_number
    WHERE d.salt_value IS NOT NULL
      AND EXTRACT(MONTH FROM d.date_time) = $2
      AND EXTRACT(YEAR FROM d.date_time) != $1
    GROUP BY s.station_code, s.station_name, s.serial_number, DATE(d.date_time)
    ORDER BY DATE(d.date_time)
  `;

  const fallbackHistoryQuery = `
    SELECT
      s.station_code,
      s.station_name,
      s.serial_number,
      DATE(d.date_time) AS date,
      ROUND(AVG(d.salt_value)::numeric, 3) AS salinity
    FROM iot_system.iot_data d
    JOIN iot_system.iot_stations s ON s.serial_number = d.serial_number
    WHERE d.salt_value IS NOT NULL
      AND DATE(d.date_time) < $1::date
    GROUP BY s.station_code, s.station_name, s.serial_number, DATE(d.date_time)
    ORDER BY DATE(d.date_time) DESC
  `;

  const [stationsResult, currentDayResult, previousDayResult, monthlyPrevYearResult, monthlyAllYearsResult, fallbackHistoryResult] = await Promise.all([
    QueryDatabase(iotStationsQuery),
    QueryDatabase(currentDayQuery, [date]),
    QueryDatabase(previousDayQuery, [date]),
    QueryDatabase(monthlyPrevYearQuery, [year - 1, month]),
    QueryDatabase(monthlyAllYearsQuery, [year, month]),
    QueryDatabase(fallbackHistoryQuery, [date]),
  ]);

  const currentMap = new Map(currentDayResult.rows.map((row) => [row.station_code, row]));
  const previousMap = new Map(previousDayResult.rows.map((row) => [row.station_code, row]));

  return stationsResult.rows.map((station, index) => {
    const currentStationData = currentMap.get(station.station_code);
    const previousStationData = previousMap.get(station.station_code);

    const prevYearMonthlyData = monthlyPrevYearResult.rows
      .filter((row) => row.station_code === station.station_code)
      .map((row) => ({
        date: row.date,
        value: row.salinity,
      }));

    const allYearsMonthlyData = monthlyAllYearsResult.rows
      .filter((row) => row.station_code === station.station_code)
      .map((row) => ({
        date: row.date,
        value: row.salinity,
      }));

    const fallbackHistory = fallbackHistoryResult.rows
      .filter((row) => row.station_code === station.station_code)
      .map((row) => ({
        date: row.date,
        value: row.salinity,
      }));

    return {
      stt: index + 1,
      stationCode: station.station_code,
      serialNumber: station.serial_number,
      stationName: station.station_name,
      dataFrequency: "day",
      currentSalinity: currentStationData?.salinity || null,
      currentDate: currentStationData?.date || null,
      previousSalinity: previousStationData?.salinity || null,
      previousObservationDate: previousStationData?.date || null,
      prevYearMonthlyData: prevYearMonthlyData.length > 0 ? prevYearMonthlyData : fallbackHistory,
      allYearsMonthlyData: allYearsMonthlyData.length > 0 ? allYearsMonthlyData : fallbackHistory,
    };
  });
};

// Generate daily salinity report data
const GetDailySalinityReportData = async (req, reply) => {
  try {
    const {date} = req.params;

    if (!date) {
      return reply.code(400).send({
        code: 400,
        message: "Ngày báo cáo là bắt buộc",
      });
    }

    const reportDate = new Date(date);
    const year = reportDate.getFullYear();
    const month = reportDate.getMonth() + 1;

    // Get data for the specific date - dùng trung bình theo ngày
    const currentDayQuery = `
      WITH daily_avg AS (
        SELECT DATE("Ngày") AS "Ngày",
             ${manualDailyAverageColumns}
        FROM hochiminh."DoMan"
        WHERE DATE("Ngày") = $1::date
        GROUP BY DATE("Ngày")
      )
      SELECT *
      FROM daily_avg
      WHERE ${manualResultHasDataCondition}
      ORDER BY "Ngày" DESC
      LIMIT 1
    `;

    // Get previous observation data - lấy ngày gần nhất trước đó và trung bình theo ngày
    const previousDayQuery = `
      WITH daily_avg AS (
        SELECT DATE("Ngày") AS "Ngày",
             ${manualDailyAverageColumns}
        FROM hochiminh."DoMan"
        WHERE DATE("Ngày") < $1::date
        GROUP BY DATE("Ngày")
      )
      SELECT *
      FROM daily_avg
      WHERE ${manualResultHasDataCondition}
      ORDER BY "Ngày" DESC
      LIMIT 1
    `;

    // Lấy dữ liệu trung bình theo ngày của tháng đó năm trước
    const monthlyPrevYearQuery = `
      WITH daily_avg AS (
        SELECT DATE("Ngày") AS "Ngày",
             ${manualDailyAverageColumns}
        FROM hochiminh."DoMan"
        WHERE EXTRACT(YEAR FROM "Ngày") = $1
          AND EXTRACT(MONTH FROM "Ngày") = $2
        GROUP BY DATE("Ngày")
      )
      SELECT *
      FROM daily_avg
      WHERE ${manualResultHasDataCondition}
      ORDER BY "Ngày"
    `;

    // Lấy dữ liệu trung bình theo ngày của tháng đó từ các năm khác
    const monthlyAllYearsQuery = `
      WITH daily_avg AS (
        SELECT DATE("Ngày") AS "Ngày",
             ${manualDailyAverageColumns}
        FROM hochiminh."DoMan"
        WHERE EXTRACT(MONTH FROM "Ngày") = $2
          AND EXTRACT(YEAR FROM "Ngày") != $1
        GROUP BY DATE("Ngày")
      )
      SELECT *
      FROM daily_avg
      WHERE ${manualResultHasDataCondition}
      ORDER BY "Ngày"
    `;

    // Execute all queries
    const [currentDay, previousDay, monthlyPrevYear, monthlyAllYears, iotStations] = await Promise.all([
      QueryDatabase(currentDayQuery, [date]),
      QueryDatabase(previousDayQuery, [date]),
      QueryDatabase(monthlyPrevYearQuery, [year - 1, month]),
      QueryDatabase(monthlyAllYearsQuery, [year, month]),
      buildIotSalinityReportData(date, year, month),
    ]);

    const currentData = currentDay.rows[0] || {};
    const previousData = previousDay.rows[0] || {};
    const prevYearData = monthlyPrevYear.rows || [];
    const allYearsData = monthlyAllYears.rows || [];

    // Debug logging for GetDailySalinityReportData
    console.log("Debug GetDailySalinityReportData - Query date:", date, "Year:", year, "Month:", month);
    console.log("Debug GetDailySalinityReportData - Previous Year Data:", prevYearData);
    console.log("Debug GetDailySalinityReportData - All Years Data:", allYearsData);

    // Prepare report data
    const stations = Object.keys(stationMapping).map((code, index) => {
      const currentSalinity = currentData[code] || null;
      const shouldReturnData = currentSalinity !== null && currentSalinity !== "NULL";

      return {
        stt: index + 1,
        stationCode: code,
        stationName: stationMapping[code],
        dataFrequency: "day",
        currentDate: shouldReturnData ? currentData.Ngày || null : null,
        currentSalinity: shouldReturnData ? currentSalinity : null,
        previousSalinity: shouldReturnData ? previousData[code] || null : null,
        prevYearMonthlyData: shouldReturnData
          ? prevYearData
              .filter((row) => row[code] !== null && row[code] !== undefined && row[code] !== "NULL")
              .map((row) => ({
                date: row.Ngày,
                value: row[code],
              }))
          : null,
        allYearsMonthlyData: shouldReturnData
          ? allYearsData
              .filter((row) => row[code] !== null && row[code] !== undefined && row[code] !== "NULL")
              .map((row) => ({
                date: row.Ngày,
                value: row[code],
              }))
          : null,
        previousObservationDate: shouldReturnData ? previousData.Ngày || null : null,
      };
    });

    const normalizedStations = stations.some((station) => station.currentDate !== null) ? stations : null;
    const normalizedIotStations = Array.isArray(iotStations) && iotStations.some((station) => station.currentDate !== null) ? iotStations : null;

    if (!normalizedStations && !normalizedIotStations) {
      return reply.code(200).send(null);
    }

    const reportData = {
      reportDate: date,
      stations: normalizedStations,
      iotStations: normalizedIotStations,
    };

    return reply.code(200).send(reportData);
  } catch (error) {
    logger.error("GetDailySalinityReportData Error:", error);
    return reply.code(500).send({
      code: 500,
      message: "Lỗi máy chủ khi tạo báo cáo",
    });
  }
};

// Generate and export PDF report
const ExportSalinityReportPDF = async (req, reply) => {
  try {
    const {date} = req.params;
    const userInfo = req.user;

    if (!date) {
      return reply.code(400).send({
        code: 400,
        message: "Ngày báo cáo là bắt buộc",
      });
    }

    // Get report data first
    const reportDataResponse = await GetDailySalinityReportData(req, {
      code: (code) => ({send: (data) => data}),
    });

    if (reportDataResponse.code && reportDataResponse.code !== 200) {
      return reply.code(reportDataResponse.code).send(reportDataResponse);
    }

    const reportData = reportDataResponse;

    if (!reportData) {
      return reply.code(404).send({
        code: 404,
        message: "Không có dữ liệu báo cáo cho ngày này",
      });
    }

    // Create PDF
    const doc = new PDFDocument({
      layout: "landscape",
      size: "A4",
      margins: {top: 50, bottom: 50, left: 50, right: 50},
    });

    // Set up file path
    const fileName = `BaoCaoDoMan_TPHCM_${date.replace(/-/g, "")}_${Date.now()}.pdf`;
    const uploadsDir = path.join(__dirname, "../../uploads/reports");

    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, {recursive: true});
    }

    const filePath = path.join(uploadsDir, fileName);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // PDF Header
    doc.fontSize(20).font("Helvetica-Bold");
    doc.text("BÁO CÁO GIÁM SÁT XÂM NHẬP MẶN TRÊN SÔNG RẠCH TPHCM", {
      align: "center",
    });

    doc.fontSize(16);
    doc.text(`Ngày ${new Date(date).toLocaleDateString("vi-VN")}`, {
      align: "center",
    });

    doc.moveDown(2);

    // Report info
    doc.fontSize(12).font("Helvetica");
    doc.text(`Đơn vị thực hiện: ${userInfo.fullName || userInfo.name}`, 50, doc.y);
    doc.text(`Thời gian xuất báo cáo: ${new Date().toLocaleString("vi-VN")}`, 50, doc.y + 20);

    doc.moveDown(2);

    // Statistics summary
    const stationsForPdf = Array.isArray(reportData.stations) ? reportData.stations : [];
    const validStations = stationsForPdf.filter((s) => s.currentSalinity !== null);
    const avgSalinity =
      validStations.length > 0
        ? validStations.reduce((sum, s) => sum + parseFloat(s.currentSalinity), 0) / validStations.length
        : 0;

    doc.fontSize(14).font("Helvetica-Bold");
    doc.text("THỐNG KÊ TỔNG QUAN", 50, doc.y);
    doc.fontSize(12).font("Helvetica");

    const summaryStats = [
      `Tổng số trạm: ${stationsForPdf.length}`,
      `Số trạm có dữ liệu: ${validStations.length}`,
      `Độ mặn trung bình: ${avgSalinity.toFixed(3)}‰`,
    ];

    summaryStats.forEach((stat, index) => {
      doc.text(stat, 70, doc.y + 15);
    });

    doc.moveDown(2);

    // Data table
    doc.fontSize(14).font("Helvetica-Bold");
    doc.text("SỐ LIỆU QUAN TRẮC ĐỘ MẶN", 50, doc.y);

    // Table headers
    const tableTop = doc.y + 30;
    const colWidths = [30, 120, 80, 80, 100, 100];
    const colPositions = [50];

    for (let i = 1; i < colWidths.length; i++) {
      colPositions[i] = colPositions[i - 1] + colWidths[i - 1];
    }

    doc.fontSize(10).font("Helvetica-Bold");
    const headers = ["STT", "Tên trạm", "Độ mặn hiện tại (‰)", "Độ mặn trước (‰)", "TB năm trước (‰)", "TB tất cả (‰)"];

    headers.forEach((header, i) => {
      doc.text(header, colPositions[i], tableTop, {width: colWidths[i], align: "center"});
    });

    // Table border
    doc
      .moveTo(50, tableTop + 15)
      .lineTo(750, tableTop + 15)
      .stroke();

    // Table data
    let currentY = tableTop + 25;
    doc.fontSize(9).font("Helvetica");

    stationsForPdf.forEach((station, index) => {
      if (currentY > 500) {
        // New page if needed
        doc.addPage();
        currentY = 50;
      }

      const rowData = [
        station.stt.toString(),
        station.stationName,
        station.currentSalinity || "NULL",
        station.previousSalinity || "NULL",
        station.prevYearMonthlyData && station.prevYearMonthlyData.length > 0
          ? (
              station.prevYearMonthlyData.reduce((sum, d) => sum + parseFloat(d.value), 0) / station.prevYearMonthlyData.length
            ).toFixed(3)
          : "NULL",
        station.allYearsMonthlyData && station.allYearsMonthlyData.length > 0
          ? (
              station.allYearsMonthlyData.reduce((sum, d) => sum + parseFloat(d.value), 0) / station.allYearsMonthlyData.length
            ).toFixed(3)
          : "NULL",
      ];

      rowData.forEach((data, i) => {
        doc.text(data, colPositions[i], currentY, {width: colWidths[i], align: "center"});
      });

      currentY += 20;
    });

    // Footer
    doc.fontSize(8).font("Helvetica");
    doc.text(`Báo cáo được tạo tự động bởi hệ thống vào ${new Date().toLocaleString("vi-VN")}`, 50, doc.page.height - 100, {
      align: "center",
    });

    doc.end();

    // Wait for PDF to be written
    await new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    // Get file size
    const fileStats = fs.statSync(filePath);
    const fileSize = fileStats.size;

    // Log to report history
    const logQuery = `
      INSERT INTO "BaoCaoLichSu" (
        "tenBaoCao", "moTa", "loaiBaoCao", "trangThai", 
        "kichThuocFile", "duongDanFile", "thamSo", "thongTinNguoiDung",
        "diaChiIP", "ngayTaiXuong", "ngayTao"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `;

    const logParams = [
      `Báo cáo giám sát xâm nhập mặn TPHCM - ${new Date(date).toLocaleDateString("vi-VN")}`,
      `Báo cáo độ mặn cho ${validStations.length}/${reportData.stations.length} trạm quan trắc. Độ mặn TB: ${avgSalinity.toFixed(3)}‰`,
      "salinity_report",
      "completed",
      fileSize,
      `/uploads/reports/${fileName}`,
      JSON.stringify({
        reportDate: date,
        stationsCount: reportData.stations.length,
        validStationsCount: validStations.length,
        averageSalinity: avgSalinity,
        reportType: "daily_salinity",
        format: "PDF",
      }),
      JSON.stringify({
        id: userInfo.id,
        hoTen: userInfo.fullName || userInfo.name,
        email: userInfo.email,
      }),
      req.ip || req.connection.remoteAddress,
      new Date().toISOString(),
      new Date().toISOString(),
    ];

    const logResult = await QueryDatabase(logQuery, logParams);

    logger.info(`PDF report generated successfully: ${fileName}, logged with ID: ${logResult.rows[0].id}`);

    // Set response headers for file download
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
    reply.header("Content-Length", fileSize);

    // Send file
    const fileStream = fs.createReadStream(filePath);
    reply.send(fileStream);

    // Optionally delete file after sending (uncomment if you don't want to keep files)
    // setTimeout(() => {
    //   if (fs.existsSync(filePath)) {
    //     fs.unlinkSync(filePath);
    //   }
    // }, 5000);
  } catch (error) {
    logger.error("ExportSalinityReportPDF Error:", error);
    return reply.code(500).send({
      code: 500,
      message: "Lỗi máy chủ khi xuất báo cáo PDF",
    });
  }
};

module.exports = {
  GetDailySalinityReportData,
  ExportSalinityReportPDF,
};
