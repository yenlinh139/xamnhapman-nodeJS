const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// Station mapping
const stationMapping = {
  CRT: "Cầu Rạch Trà",
  CTT: "Cầu Thủ Thiêm",
  COT: "Cầu Ông Thìn",
  CKC: "Cống Kênh C",
  KXAH: "Kênh Xáng - An Hạ",
  MNB: "Mũi Nhà Bè",
  PCL: "Phà Cát Lái",
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

    // Get data for the specific date
    const currentDayQuery = `
      SELECT "Ngày", "CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL"
      FROM hochiminh."DoMan"
      WHERE DATE("Ngày") = '${date}'
      ORDER BY "Ngày" DESC
      LIMIT 1
    `;

    // Get previous observation data
    const previousDayQuery = `
      SELECT "Ngày", "CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL"
      FROM hochiminh."DoMan"
      WHERE DATE("Ngày") < '${date}'
      AND ("CRT" IS NOT NULL OR "CTT" IS NOT NULL OR "COT" IS NOT NULL 
           OR "CKC" IS NOT NULL OR "KXAH" IS NOT NULL OR "MNB" IS NOT NULL OR "PCL" IS NOT NULL)
      ORDER BY "Ngày" DESC
      LIMIT 1
    `;

    // Lấy tất cả dữ liệu của tháng đó năm trước (không tính trung bình)
    const monthlyPrevYearQuery = `
      SELECT "Ngày", "CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL"
      FROM hochiminh."DoMan"
      WHERE EXTRACT(YEAR FROM "Ngày") = ${year - 1}
        AND EXTRACT(MONTH FROM "Ngày") = ${month}
        AND ("CRT" IS NOT NULL OR "CTT" IS NOT NULL OR "COT" IS NOT NULL 
             OR "CKC" IS NOT NULL OR "KXAH" IS NOT NULL OR "MNB" IS NOT NULL OR "PCL" IS NOT NULL)
      ORDER BY "Ngày"
    `;

    // Lấy tất cả dữ liệu của tháng đó từ các năm khác
    const monthlyAllYearsQuery = `
      SELECT "Ngày", "CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL"
      FROM hochiminh."DoMan"
      WHERE EXTRACT(MONTH FROM "Ngày") = ${month}
        AND EXTRACT(YEAR FROM "Ngày") != ${year}
        AND ("CRT" IS NOT NULL OR "CTT" IS NOT NULL OR "COT" IS NOT NULL 
             OR "CKC" IS NOT NULL OR "KXAH" IS NOT NULL OR "MNB" IS NOT NULL OR "PCL" IS NOT NULL)
      ORDER BY "Ngày"
    `;

    // Execute all queries
    const [currentDay, previousDay, monthlyPrevYear, monthlyAllYears] = await Promise.all([
      QueryDatabase(currentDayQuery),
      QueryDatabase(previousDayQuery),
      QueryDatabase(monthlyPrevYearQuery),
      QueryDatabase(monthlyAllYearsQuery),
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
    const reportData = {
      reportDate: date,
      stations: Object.keys(stationMapping).map((code, index) => {
        // Nếu currentSalinity null hoặc "NULL" thì tất cả đều null
        const currentSalinity = currentData[code] || null;
        const shouldReturnData = currentSalinity !== null && currentSalinity !== "NULL";

        return {
          stt: index + 1,
          stationCode: code,
          stationName: stationMapping[code],
          currentSalinity: shouldReturnData ? currentSalinity : null,
          previousSalinity: shouldReturnData ? (previousData[code] || null) : null,
          prevYearMonthlyData: shouldReturnData ? prevYearData.filter(row => row[code] !== null && row[code] !== undefined && row[code] !== "NULL").map(row => ({
            date: row.Ngày,
            value: row[code]
          })) : null,
          allYearsMonthlyData: shouldReturnData ? allYearsData.filter(row => row[code] !== null && row[code] !== undefined && row[code] !== "NULL").map(row => ({
            date: row.Ngày,
            value: row[code]
          })) : null,
          previousObservationDate: shouldReturnData ? (previousData.Ngày || null) : null,
        };
      }),
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

// ✅ SỬA: Áp dụng cùng logic cho GenerateDailySalinityPDF
const GenerateDailySalinityPDF = async (req, reply) => {
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

    // Same queries as above with fixed CAST
    const currentDayQuery = `
      SELECT "Ngày", "CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL"
      FROM hochiminh."DoMan"
      WHERE DATE("Ngày") = '${date}'
      ORDER BY "Ngày" DESC
      LIMIT 1
    `;

    const previousDayQuery = `
      SELECT "Ngày", "CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL"
      FROM hochiminh."DoMan"
      WHERE DATE("Ngày") < '${date}'
      AND ("CRT" IS NOT NULL OR "CTT" IS NOT NULL OR "COT" IS NOT NULL 
           OR "CKC" IS NOT NULL OR "KXAH" IS NOT NULL OR "MNB" IS NOT NULL OR "PCL" IS not NULL)
      ORDER BY "Ngày" DESC
      LIMIT 1
    `;

    const monthlyPrevYearQuery = `
      SELECT "Ngày", "CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL"
      FROM hochiminh."DoMan"
      WHERE EXTRACT(YEAR FROM "Ngày") = ${year - 1}
        AND EXTRACT(MONTH FROM "Ngày") = ${month}
        AND ("CRT" IS NOT NULL OR "CTT" IS NOT NULL OR "COT" IS NOT NULL 
             OR "CKC" IS NOT NULL OR "KXAH" IS NOT NULL OR "MNB" IS NOT NULL OR "PCL" IS NOT NULL)
      ORDER BY "Ngày"
    `;

    const monthlyAllYearsQuery = `
      SELECT "Ngày", "CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL"
      FROM hochiminh."DoMan"
      WHERE EXTRACT(MONTH FROM "Ngày") = ${month}
        AND EXTRACT(YEAR FROM "Ngày") != ${year}
        AND ("CRT" IS NOT NULL OR "CTT" IS NOT NULL OR "COT" IS NOT NULL 
             OR "CKC" IS NOT NULL OR "KXAH" IS NOT NULL OR "MNB" IS NOT NULL OR "PCL" IS NOT NULL)
      ORDER BY "Ngày"
    `;

    // Execute all queries
    const [currentDay, previousDay, monthlyPrevYear, monthlyAllYears] = await Promise.all([
      QueryDatabase(currentDayQuery),
      QueryDatabase(previousDayQuery),
      QueryDatabase(monthlyPrevYearQuery),
      QueryDatabase(monthlyAllYearsQuery),
    ]);

    const currentData = currentDay.rows[0] || {};
    const previousData = previousDay.rows[0] || {};
    const prevYearData = monthlyPrevYear.rows || [];
    const allYearsData = monthlyAllYears.rows || [];

    // Create PDF document
    const doc = new PDFDocument({margin: 50});
    const fileName = `salinity-report-${date}.pdf`;
    const filePath = path.join(__dirname, "../../uploads", fileName);

    // Ensure uploads directory exists
    const uploadsDir = path.dirname(filePath);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, {recursive: true});
    }

    doc.pipe(fs.createWriteStream(filePath));

    // PDF Header
    doc.fontSize(16).text("BÁO CÁO ĐỘ MẶN HÀNG NGÀY", {align: "center"});
    doc.fontSize(12).text(`Ngày: ${new Date(date).toLocaleDateString("vi-VN")}`, {align: "center"});
    doc.moveDown();

    // Table headers
    const startY = doc.y;
    const colWidths = [30, 120, 60, 60, 100, 100];
    const cols = ["STT", "Tên trạm", "Hiện tại", "Trước đó", "Dữ liệu tháng năm trước", "Dữ liệu tháng các năm"];

    let currentX = 50;
    cols.forEach((col, i) => {
      doc.text(col, currentX, startY, {width: colWidths[i], align: "center"});
      currentX += colWidths[i];
    });

    doc.moveDown();

    // Table data
    Object.keys(stationMapping).forEach((code, index) => {
      const rowY = doc.y;
      currentX = 50;

      // Nếu currentSalinity null hoặc "NULL" thì tất cả đều null
      const currentSalinity = currentData[code];
      const shouldShowData = currentSalinity !== 'NULL' && currentSalinity !== null && currentSalinity !== undefined;

      const prevYearValues = shouldShowData ? 
        prevYearData.filter(row => row[code] !== null && row[code] !== undefined && row[code] !== "NULL").map(row => row[code]).join(", ") || null : 
        null;
      
      const allYearsValues = shouldShowData ? 
        allYearsData.filter(row => row[code] !== null && row[code] !== undefined && row[code] !== "NULL").slice(0, 5).map(row => row[code]).join(", ") || null : 
        null;

      const rowData = [
        (index + 1).toString(),
        stationMapping[code],
        shouldShowData ? currentSalinity : null,
        shouldShowData ? (previousData[code] || null) : null,
        prevYearValues,
        allYearsValues,
      ];

      rowData.forEach((data, i) => {
        doc.text(data || "", currentX, rowY, {width: colWidths[i], align: "center"});
        currentX += colWidths[i];
      });

      doc.moveDown(0.5);
    });

    doc.end();

    // Set response headers for PDF download
    reply.type("application/pdf");
    reply.header("Content-Disposition", `attachment; filename="${fileName}"`);

    // Wait for PDF to be written, then send it
    doc.on("end", () => {
      const fileStream = fs.createReadStream(filePath);
      reply.send(fileStream);

      // Clean up file after sending
      fileStream.on("end", () => {
        fs.unlink(filePath, (err) => {
          if (err) logger.error("Failed to delete PDF file:", err);
        });
      });
    });
  } catch (error) {
    logger.error("GenerateDailySalinityPDF Error:", error);
    return reply.code(500).send({
      code: 500,
      message: "Lỗi máy chủ khi tạo PDF",
    });
  }
};

module.exports = {
  GetDailySalinityReportData,
  GenerateDailySalinityPDF,
};
