const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const XLSX = require("xlsx");
const NodeCache = require("node-cache");

// Cache với TTL 5 phút cho data ít thay đổi
const cache = new NodeCache({stdTTL: 300, checkperiod: 60});

const VALID_SALINITY_STATIONS = ["CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL", "KXD2"];

const salinityOverviewMapping = {
  CRT: {manualCode: "CRT", displayName: "Cầu Rạch Tra"},
  CTT: {manualCode: "CTT", displayName: "Cầu Thủ Thiêm"},
  COT: {manualCode: "COT", displayName: "Cầu Ông Thìn"},
  CKC: {manualCode: "CKC", displayName: "Cống Kênh C", iotStationCode: "CKC_IoT"},
  KXAH: {manualCode: "KXAH", displayName: "Kênh Xáng An Hạ", iotStationCode: "CAH_IoT"},
  MNB: {manualCode: "MNB", displayName: "Mũi Nhà Bè"},
  PCL: {manualCode: "PCL", displayName: "Phà Cát Lái"},
  KXD2: {manualCode: "KXD2", displayName: "Kênh Xáng đứng 2"},
  CAH_IoT: {manualCode: "KXAH", displayName: "Cống An Hạ", iotStationCode: "CAH_IoT"},
  CKC_IoT: {manualCode: "CKC", displayName: "Cống Kênh C", iotStationCode: "CKC_IoT"},
  CVT_IoT: {displayName: "Cống Vườn Thơm", iotStationCode: "CVT_IoT"},
};

const resolveSalinityOverviewConfig = (inputCode = "") => {
  const trimmed = inputCode.trim();
  const upper = trimmed.toUpperCase();

  if (salinityOverviewMapping[trimmed]) return salinityOverviewMapping[trimmed];
  if (salinityOverviewMapping[upper]) return salinityOverviewMapping[upper];

  return {
    manualCode: VALID_SALINITY_STATIONS.includes(upper) ? upper : null,
    iotStationCode: trimmed,
    displayName: trimmed,
  };
};

const GetSalinityPoints = async (req, reply) => {
  try {
    // Check cache first
    const cacheKey = "salinity_points_v2";
    let result = cache.get(cacheKey);

    if (!result) {
      // Lấy danh sách điểm đo
      const pointsResult = await QueryDatabase(
        `SELECT "KiHieu", "TenDiem", "KinhDo", "ViDo", "PhanLoai" AS "MoTa", "TanSuat"
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

      // Lấy khoảng ngày dữ liệu trong bảng
      const rangeResult = await QueryDatabase(
        `SELECT MIN("Ngày") AS start_date, MAX("Ngày") AS end_date
         FROM hochiminh."DoMan"`,
      );
      const startDate = rangeResult.rows[0]?.start_date || null;
      const endDate = rangeResult.rows[0]?.end_date || null;
      const totalRecords = dataResult.rowCount || 0;

      // Xử lý dữ liệu
      result = pointsResult.rows.map((point) => {
        const pointData = {
          ...point,
          start_date: startDate,
          end_date: endDate,
          total_records: totalRecords,
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
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

const GetSalinityOverview = async (req, reply) => {
  try {
    const {code} = req.params;
    const {startDate, endDate, limit = 200} = req.query;

    if (!code) {
      return reply.code(400).send({code: 400, message: "Thiếu mã trạm"});
    }

    const decodedCode = decodeURIComponent(code).trim();
    const limitVal = Math.min(Math.max(parseInt(limit) || 200, 1), 1000);
    const mapping = resolveSalinityOverviewConfig(decodedCode);
    const cacheKey = `salinity_overview_${decodedCode}_${startDate || "all"}_${endDate || "all"}_${limitVal}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return reply.code(200).send(cached);
    }

    const manualWhere = [];
    const manualParams = [];
    if (mapping.manualCode) {
      manualWhere.push(`"${mapping.manualCode}" IS NOT NULL`);
      if (startDate) {
        manualParams.push(startDate);
        manualWhere.push(`"Ngày" >= $${manualParams.length}`);
      }
      if (endDate) {
        manualParams.push(endDate);
        manualWhere.push(`"Ngày" <= $${manualParams.length}`);
      }
    }

    const iotWhere = [];
    const iotParams = [];

    let manualStation = null;
    let manualData = [];
    let manualSummary = {totalRecords: 0, startTime: null, endTime: null};

    if (mapping.manualCode) {
      const [manualStationResult, manualDataResult, manualCountResult] = await Promise.all([
        QueryDatabase(
          `
          SELECT "KiHieu", "TenDiem", "KinhDo", "ViDo", "PhanLoai" AS "MoTa", "TanSuat"
          FROM hochiminh."DiemDoMan"
          WHERE "KiHieu" = $1
          LIMIT 1
          `,
          [mapping.manualCode],
        ),
        QueryDatabase(
          `
          SELECT "Ngày" AS date, "${mapping.manualCode}" AS salinity, '‰' AS unit
          FROM hochiminh."DoMan"
          WHERE ${manualWhere.join(" AND ")}
          ORDER BY "Ngày" DESC
          LIMIT $${manualParams.length + 1}
          `,
          [...manualParams, limitVal],
        ),
        QueryDatabase(
          `
          SELECT COUNT(*) AS total_records, MIN("Ngày") AS start_time, MAX("Ngày") AS end_time
          FROM hochiminh."DoMan"
          WHERE ${manualWhere.join(" AND ")}
          `,
          manualParams,
        ),
      ]);

      manualStation = manualStationResult.rows[0] || null;
      manualData = manualDataResult.rows;
      manualSummary = {
        totalRecords: parseInt(manualCountResult.rows[0]?.total_records || 0),
        startTime: manualCountResult.rows[0]?.start_time || null,
        endTime: manualCountResult.rows[0]?.end_time || null,
      };
    }

    let iotStation = null;
    let iotData = [];
    let iotSummary = {totalRecords: 0, startTime: null, endTime: null};

    if (mapping.iotStationCode || decodedCode) {
      const stationLookupValue = mapping.iotStationCode || decodedCode;
      const iotStationResult = await QueryDatabase(
        `
        SELECT id, station_code, serial_number, station_name, longitude, latitude, station_type, frequency, time_period, note
        FROM iot_system.iot_stations
        WHERE station_code = $1 OR serial_number = $1
        LIMIT 1
        `,
        [stationLookupValue],
      );

      if (iotStationResult.rowCount > 0) {
        iotStation = iotStationResult.rows[0];
        iotWhere.push(`serial_number = $1`);
        iotParams.push(iotStation.serial_number);

        if (startDate) {
          iotWhere.push(`date_time >= $${iotParams.length + 1}::date`);
          iotParams.push(startDate);
        }
        if (endDate) {
          iotWhere.push(`date_time <= $${iotParams.length + 1}::date + interval '1 day'`);
          iotParams.push(endDate);
        }

        const [iotDataResult, iotCountResult] = await Promise.all([
          QueryDatabase(
            `
            SELECT date_time, salt_value AS salinity, '‰' AS unit
            FROM iot_system.iot_data
            WHERE ${iotWhere.join(" AND ")} AND salt_value IS NOT NULL
            ORDER BY date_time DESC
            LIMIT $${iotParams.length + 1}
            `,
            [...iotParams, limitVal],
          ),
          QueryDatabase(
            `
            SELECT COUNT(*) AS total_records, MIN(date_time) AS start_time, MAX(date_time) AS end_time
            FROM iot_system.iot_data
            WHERE ${iotWhere.join(" AND ")} AND salt_value IS NOT NULL
            `,
            iotParams,
          ),
        ]);

        iotData = iotDataResult.rows;
        iotSummary = {
          totalRecords: parseInt(iotCountResult.rows[0]?.total_records || 0),
          startTime: iotCountResult.rows[0]?.start_time || null,
          endTime: iotCountResult.rows[0]?.end_time || null,
        };
      }
    }

    if (!manualStation && !iotStation) {
      return reply.code(404).send({
        code: 404,
        message: `Không tìm thấy dữ liệu độ mặn cho mã trạm: ${decodedCode}`,
      });
    }

    const response = {
      code: decodedCode,
      displayName: manualStation?.TenDiem || iotStation?.station_name || mapping.displayName || decodedCode,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        limit: limitVal,
      },
      manual: {
        available: !!manualStation,
        station: manualStation,
        total_records: manualSummary.totalRecords,
        start_time: manualSummary.startTime,
        end_time: manualSummary.endTime,
        data: manualData,
      },
      iot: {
        available: !!iotStation,
        station: iotStation,
        total_records: iotSummary.totalRecords,
        start_time: iotSummary.startTime,
        end_time: iotSummary.endTime,
        data: iotData,
      },
    };

    cache.set(cacheKey, response);
    return reply.code(200).send(response);
  } catch (error) {
    logger.error("GetSalinityOverview error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
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
    if (kihieu !== "full" && !VALID_SALINITY_STATIONS.includes(kihieu)) {
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
  GetSalinityOverview,
  GetSalinityData,
  ExportSalinityDataToExcel,
  ExportSalinityDataWithRange,
};
