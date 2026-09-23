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

module.exports = {
  GetDailySalinityReportData,
};
