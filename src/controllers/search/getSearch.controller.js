const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const NodeCache = require("node-cache");

// Cache cho search results với TTL 30 phút
const searchCache = new NodeCache({stdTTL: 1800, checkperiod: 300});

const VIETNAMESE_FROM =
  "áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ";
const VIETNAMESE_TO =
  "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiioooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD";

const normalizeVietnamese = (text) => {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};

const normalizeSqlExpr = (columnName) => `LOWER(TRANSLATE(${columnName}, '${VIETNAMESE_FROM}', '${VIETNAMESE_TO}'))`;

const GetSearchAll = async (req, reply) => {
  try {
    const {id} = req.params;
    const {limit = 50} = req.query;

    if (!id) {
      return reply.code(400).send({code: 400, message: "ID là bắt buộc"});
    }

    // Decode URL và sanitize input
    const decodedSearchTerm = decodeURIComponent(id).trim();
    if (decodedSearchTerm.length < 1) {
      return reply.code(400).send({code: 400, message: "Search term không được rỗng"});
    }

    const normalizedSearchTerm = normalizeVietnamese(decodedSearchTerm).toLowerCase();

    // Check cache
    const cacheKey = `search_all_${normalizedSearchTerm}_${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      console.log(`🎯 Cache hit for search: "${decodedSearchTerm}"`);
      return reply.code(200).send(cached);
    }

    const limitVal = Math.min(parseInt(limit), 100); // Max 100 records
    console.log(`🔍 Searching for: "${decodedSearchTerm}" (limit: ${limitVal})`);
    let results = [];

    // Tìm kiếm không dấu và không phân biệt hoa thường
    const searchPattern = `%${normalizedSearchTerm}%`;
    const tenHuyenExpr = normalizeSqlExpr('"tenHuyen"');
    const tenXaExpr = normalizeSqlExpr('"tenXa"');
    const tenDiemExpr = normalizeSqlExpr('"TenDiem"');
    const tenTramExpr = normalizeSqlExpr('"TenTram"');
    const stationNameExpr = normalizeSqlExpr("station_name");
    const stationCodeExpr = normalizeSqlExpr("station_code");

    const queryTasks = [
      // Query Huyện
      QueryDatabase(
        `
        SELECT "maHuyen" AS mahuyen, "tenHuyen" AS tenhuyen,
               "dienTichTuNhien" AS dientichtunhien,
               "SHAPE_Length" AS shape_length,
               "SHAPE_Area" AS shape_area,
               ST_AsGeoJSON(geom)::json AS geom,
               'huyen' AS type
        FROM hochiminh."DiaPhanHuyen"
        WHERE "maHuyen" = $1 OR ${tenHuyenExpr} LIKE $2
        ORDER BY "tenHuyen"
        LIMIT $3
      `,
        [decodedSearchTerm, searchPattern, limitVal],
      ),

      // Query Xã
      QueryDatabase(
        `
        SELECT "maXa" AS maxa,
               "tenXa" AS tenxa,
               "maHuyen" AS mahuyen,
               "tenHuyen" AS tenhuyen,
               "dienTichTuNhien" AS dientichtunhien,
               "SHAPE_Length" AS shape_length,
               "SHAPE_Area" AS shape_area,
               ST_AsGeoJSON(geom)::json AS geom,
               'xa' AS type
        FROM hochiminh."DiaPhanXa"
        WHERE "maXa" = $1 OR "maHuyen" = $1 OR
            ${tenXaExpr} LIKE $2 OR
            ${tenHuyenExpr} LIKE $2
        ORDER BY "tenXa", "tenHuyen"
        LIMIT $3
      `,
        [decodedSearchTerm, searchPattern, limitVal],
      ),

      // Query Điểm đo mặn
      QueryDatabase(
        `
        SELECT "KiHieu", "TenDiem", "KinhDo", "ViDo", "PhanLoai", "ThoiGian", "TanSuat", 'diem_do_man' AS type
        FROM hochiminh."DiemDoMan"
        WHERE "KiHieu" = $1 OR ${tenDiemExpr} LIKE $2
        ORDER BY "TenDiem"
        LIMIT $3
      `,
        [decodedSearchTerm, searchPattern, limitVal],
      ),

      // Query Trạm khí tượng thủy văn
      QueryDatabase(
        `
        SELECT "KiHieu", "TenTram", "KinhDo", "ViDo", "PhanLoai" AS "LoaiTram", 'khi_tuong_thuy_van' AS type
        FROM hochiminh."TramKTTV"
        WHERE "KiHieu" = $1 OR ${tenTramExpr} LIKE $2
        ORDER BY "TenTram"
        LIMIT $3
      `,
        [decodedSearchTerm, searchPattern, limitVal],
      ),

      // Query Trạm IoT
      QueryDatabase(
        `
          SELECT serial_number AS "SerialNumber",
                 station_name AS "StationName",
                 station_code AS "StationCode",
                 latitude AS latitude,
                 longitude AS longitude,
                 latitude AS vido_decimal,
                 longitude AS kinhdo_decimal,
                 station_type AS "StationType",
                 frequency AS "TanSuat",
                 time_period AS "ThoiGian",
                 status AS "Status",
                 'iot_station' AS type
          FROM iot_system.iot_stations
          WHERE serial_number = $1
             OR ${stationNameExpr} LIKE $2
             OR ${stationCodeExpr} LIKE $3
          ORDER BY station_name
          LIMIT $4
        `,
        [decodedSearchTerm, searchPattern, searchPattern, limitVal],
      ),
    ];
    const settled = await Promise.allSettled(queryTasks);

    // Combine results (do not fail all when one query fails)
    settled.forEach((item) => {
      if (item.status === "fulfilled") {
        const queryResult = item.value;
        if (queryResult && queryResult.rowCount > 0) {
          results.push(...queryResult.rows);
        }
      } else {
        logger.error("Search sub-query failed:", item.reason?.message || item.reason);
      }
    });

    // Cache results
    searchCache.set(cacheKey, results, 1800);

    console.log(`📊 Found ${results.length} results for "${decodedSearchTerm}"`);
    if (results.length > 0) {
      console.log(`📋 Result types: ${[...new Set(results.map((r) => r.type))].join(", ")}`);
    }

    // Trả về mảng results trực tiếp
    return reply.code(200).send(results);
  } catch (error) {
    logger.error("GetSearchAll error:", error);
    console.error("❌ Search API Error:", error.message);

    // Trả về empty array thay vì error để tránh crash frontend
    return reply.code(200).send([]);
  }
};

const GetAllDistricts = async (req, reply) => {
  try {
    const result = await QueryDatabase(`
      SELECT "tenHuyen" AS tenhuyen,
             ST_Y(ST_Centroid(geom)) AS centerLat,
             ST_X(ST_Centroid(geom)) AS centerLng
      FROM hochiminh."DiaPhanHuyen"
      WHERE "tenHuyen" IS NOT NULL
      ORDER BY "tenHuyen" ASC
    `);

    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không có dữ liệu huyện."});
    }

    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ."});
  }
};

const GetAdministrativeDistricts = async (req, reply) => {
  try {
    const cacheKey = "administrative_districts_v1";
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return reply.code(200).send(cached);
    }

    const result = await QueryDatabase(`
      SELECT "maHuyen", "tenHuyen"
      FROM hochiminh."DiaPhanHuyen"
      WHERE "maHuyen" IS NOT NULL AND "tenHuyen" IS NOT NULL
      ORDER BY "tenHuyen" ASC
    `);

    searchCache.set(cacheKey, result.rows, 1800);
    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error("GetAdministrativeDistricts error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

const GetAdministrativeCommunesByDistrict = async (req, reply) => {
  try {
    const {maHuyen} = req.params;

    if (!maHuyen) {
      return reply.code(400).send({code: 400, message: "Thiếu mã huyện"});
    }

    const cacheKey = `administrative_communes_${maHuyen}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return reply.code(200).send(cached);
    }

    const districtResult = await QueryDatabase(
      `
      SELECT "maHuyen", "tenHuyen", ST_AsGeoJSON(geom)::json AS geom
      FROM hochiminh."DiaPhanHuyen"
      WHERE "maHuyen" = $1
      LIMIT 1
      `,
      [maHuyen],
    );

    if (districtResult.rowCount === 0) {
      return reply.code(404).send({code: 404, message: `Không tìm thấy huyện với mã: ${maHuyen}`});
    }

    const communesResult = await QueryDatabase(
      `
      SELECT "maXa", "tenXa"
      FROM hochiminh."DiaPhanXa"
      WHERE "maHuyen" = $1
      ORDER BY "tenXa" ASC
      `,
      [maHuyen],
    );

    const district = districtResult.rows[0];
    const response = {
      maHuyen: district.maHuyen,
      tenHuyen: district.tenHuyen,
      geom: district.geom,
      communes: communesResult.rows,
      totalCommunes: communesResult.rowCount,
    };

    searchCache.set(cacheKey, response, 1800);
    return reply.code(200).send(response);
  } catch (error) {
    logger.error("GetAdministrativeCommunesByDistrict error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

const GetAdministrativeCommuneByCode = async (req, reply) => {
  try {
    const {maXa} = req.params;

    if (!maXa) {
      return reply.code(400).send({code: 400, message: "Thiếu mã xã"});
    }

    const cacheKey = `administrative_commune_${maXa}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return reply.code(200).send(cached);
    }

    const result = await QueryDatabase(
      `
      SELECT "maXa", "tenXa", "maHuyen", "tenHuyen", ST_AsGeoJSON(geom)::json AS geom
      FROM hochiminh."DiaPhanXa"
      WHERE "maXa" = $1
      LIMIT 1
      `,
      [maXa],
    );

    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: `Không tìm thấy xã với mã: ${maXa}`});
    }

    const response = result.rows[0];
    searchCache.set(cacheKey, response, 1800);
    return reply.code(200).send(response);
  } catch (error) {
    logger.error("GetAdministrativeCommuneByCode error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

/**
 * Validate và parse ngày với nhiều format khác nhau
 */
const validateAndParseDate = (dateStr) => {
  if (!dateStr) return null;

  // Loại bỏ whitespace
  const cleaned = dateStr.trim();

  // Regex patterns cho các format date khác nhau
  const patterns = {
    iso: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD hoặc YYYY-M-D
    vietnam: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // DD/MM/YYYY hoặc D/M/YYYY
    reverse: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, // DD-MM-YYYY
  };

  let match;
  let day, month, year;

  if ((match = cleaned.match(patterns.iso))) {
    [, year, month, day] = match;
  } else if ((match = cleaned.match(patterns.vietnam))) {
    [, day, month, year] = match;
  } else if ((match = cleaned.match(patterns.reverse))) {
    [, day, month, year] = match;
  } else {
    return null;
  }

  // Parse thành numbers và validate
  year = parseInt(year);
  month = parseInt(month);
  day = parseInt(day);

  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  // Tạo Date object để validate ngày thực sự
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return {
    iso: `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`,
    vietnam: `${day.toString().padStart(2, "0")}/${month.toString().padStart(2, "0")}/${year}`,
    date: date,
  };
};

const GetSearchDate = async (req, reply) => {
  try {
    const {id} = req.params;
    const {limit = 100} = req.query;

    if (!id) {
      return reply.code(400).send({code: 400, message: "Thiếu tham số ngày (date)"});
    }

    // Validate và parse ngày
    const parsedDate = validateAndParseDate(id);
    if (!parsedDate) {
      return reply.code(400).send({
        code: 400,
        message: "Định dạng ngày không hợp lệ. Hãy sử dụng: YYYY-MM-DD, DD/MM/YYYY, hoặc DD-MM-YYYY",
      });
    }

    // Check cache
    const cacheKey = `search_date_v5_${parsedDate.iso}_${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return reply.code(200).send(cached);
    }

    const limitVal = Math.min(parseInt(limit), 500); // Max 500 records per table

    // Chuẩn hóa ngày từ nhiều định dạng text/date khác nhau trong DB
    const normalizedNgayExpr = `
      CASE
        WHEN "Ngày" IS NULL THEN NULL
        WHEN TRIM("Ngày"::text) ~ '^\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}([ T]\\d{1,2}:\\d{1,2}(:\\d{1,2})?)?$'
          THEN TO_DATE(
            REPLACE(
              SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1),
              '/',
              '-'
            ),
            'YYYY-MM-DD'
          )
        WHEN REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/') ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$'
          THEN MAKE_DATE(
            SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 3)::int,
            CASE
              WHEN SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 1)::int > 12
                AND SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 2)::int <= 12
                THEN SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 2)::int
              WHEN SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 2)::int > 12
                AND SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 1)::int <= 12
                THEN SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 1)::int
              ELSE SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 2)::int
            END,
            CASE
              WHEN SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 1)::int > 12
                AND SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 2)::int <= 12
                THEN SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 1)::int
              WHEN SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 2)::int > 12
                AND SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 1)::int <= 12
                THEN SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 2)::int
              ELSE SPLIT_PART(REPLACE(SPLIT_PART(REPLACE(TRIM("Ngày"::text), 'T', ' '), ' ', 1), '-', '/'), '/', 1)::int
            END
          )
        ELSE NULL
      END
    `;

    // Định nghĩa tables với format date tương ứng
    const tableQueries = [
      {
        name: "DoMan",
        label: "salinityData",
        query: `SELECT * FROM hochiminh."DoMan" WHERE "Ngày"::date = $1 LIMIT $2`,
        params: [parsedDate.iso, limitVal],
      },
      {
        name: "ThuyVan",
        label: "hydrologyData",
        query: `
          SELECT *
          FROM hochiminh."ThuyVan"
          WHERE (${normalizedNgayExpr}) = $1::date
          LIMIT $2
        `,
        params: [parsedDate.iso, limitVal],
      },
      {
        name: "KhiTuong",
        label: "meteorologyData",
        query: `
          SELECT *
          FROM hochiminh."KhiTuong"
          WHERE (${normalizedNgayExpr}) = $1::date
          LIMIT $2
        `,
        params: [parsedDate.iso, limitVal],
      },
      {
        name: "IoTData",
        label: "iotData",
        query: `
          SELECT
            d.date_time::date AS date,
            d.serial_number,
            s.station_name,
            s.station_code,
            s.latitude,
            s.longitude,
            s.latitude AS vido_decimal,
            s.longitude AS kinhdo_decimal,
            ROUND(AVG(d.distance_value)::numeric, 3) AS distance_value_avg,
            MAX(d.distance_unit) FILTER (WHERE d.distance_unit IS NOT NULL) AS distance_unit,
            CASE
              WHEN COUNT(d.daily_rainfall_value) > 0 THEN ROUND(SUM(d.daily_rainfall_value)::numeric, 3)
              ELSE NULL
            END AS daily_rainfall_value_sum,
            MAX(d.daily_rainfall_unit) FILTER (WHERE d.daily_rainfall_unit IS NOT NULL) AS daily_rainfall_unit,
            ROUND(AVG(d.salt_value)::numeric, 3) AS salt_value_avg,
            '‰' AS salt_unit,
            ROUND(AVG(d.temp_value)::numeric, 3) AS temp_value_avg,
            MAX(d.temp_unit) FILTER (WHERE d.temp_unit IS NOT NULL) AS temp_unit,
            COUNT(*) AS total_records
          FROM iot_system.iot_data d
          LEFT JOIN iot_system.iot_stations s ON s.serial_number = d.serial_number
          WHERE d.date_time::date = $1::date
          GROUP BY d.date_time::date, d.serial_number, s.station_name, s.station_code, s.latitude, s.longitude
          ORDER BY s.station_name ASC, d.serial_number ASC
          LIMIT $2
        `,
        params: [parsedDate.iso, limitVal],
      },
    ];

    // Execute queries in parallel
    const queryPromises = tableQueries.map(async (table) => {
      try {
        const result = await QueryDatabase(table.query, table.params);
        return {
          label: table.label,
          data: result.rows,
          count: result.rowCount,
        };
      } catch (error) {
        logger.error(`Error querying table ${table.name}:`, error);
        return {
          label: table.label,
          data: [],
          count: 0,
          error: error.message,
        };
      }
    });

    const results = await Promise.all(queryPromises);

    // Format response
    const resultData = {};
    let totalRecords = 0;
    let hasData = false;

    results.forEach((result) => {
      if (result.count > 0) {
        resultData[result.label] = result.data;
        totalRecords += result.count;
        hasData = true;
      }
      if (result.error) {
        resultData[`${result.label}_error`] = result.error;
      }
    });

    if (!hasData) {
      return reply.code(404).send({
        code: 404,
        message: `Không có dữ liệu cho ngày ${id}`,
        searchDate: parsedDate.iso,
        searchDateVN: parsedDate.vietnam,
      });
    }

    const response = {
      ...resultData,
      metadata: {
        searchDate: parsedDate.iso,
        searchDateVN: parsedDate.vietnam,
        totalRecords,
        limit: limitVal,
        queriedTables: tableQueries.length,
      },
    };

    // Cache kết quả
    searchCache.set(cacheKey, response, 1800); // Cache 30 phút

    return reply.code(200).send(response);
  } catch (error) {
    logger.error("GetSearchDate error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

const GetStationPositionSalinity = async (req, reply) => {
  try {
    const {kihieu} = req.params;

    if (!kihieu) {
      return reply.code(400).send({code: 400, message: "Thiếu mã điểm đo"});
    }

    // Check cache
    const cacheKey = `station_salinity_${kihieu}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return reply.code(200).send(cached);
    }

    let query, params;

    if (kihieu === "full") {
      query = `
        SELECT * FROM hochiminh."DiemDoMan"
        WHERE "KinhDo" IS NOT NULL AND "ViDo" IS NOT NULL
        ORDER BY "TenDiem" ASC
      `;
      params = [];
    } else {
      query = `
        SELECT * FROM hochiminh."DiemDoMan"
        WHERE "KiHieu" = $1
      `;
      params = [kihieu];
    }

    const result = await QueryDatabase(query, params);

    // Cache kết quả (longer TTL cho station data vì ít thay đổi)
    searchCache.set(cacheKey, result.rows, 3600);

    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error("GetStationPositionSalinity error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

const weatherMapping = {
  R_AP: "AP",
  R_BC: "BC",
  R_CG: "CG",
  R_CL: "CL",
  R_CC: "CC",
  R_HM: "HM",
  R_LMX: "LMX",
  R_LS: "LS",
  R_MDC: "MDC",
  R_NB: "NB_KT",
  R_PVC: "PVC",
  R_PA: "PA",
  R_TTH: "TTH",
  R_TSH: "TSH",
  R_TD: "TD",
  Ttb_TSH: "TSH",
  Tx_TSH: "TSH",
  Tm_TSH: "TSH",
  Htb_NB: "NB_TV",
  Hx_NB: "NB_TV",
  Hm_NB: "NB_TV",
  Htb_PA: "PA",
  Hx_PA: "PA",
  Hm_PA: "PA",
};
const GetStationPositionHydrometeorology = async (req, reply) => {
  try {
    const {code} = req.params;

    if (!code) {
      return reply.code(400).send({code: 400, message: "Thiếu mã trạm"});
    }

    const kiHieu = weatherMapping[code];
    if (!kiHieu) {
      return reply.code(400).send({code: 400, message: "Mã không hợp lệ"});
    }

    // Check cache
    const cacheKey = `station_hydro_${code}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return reply.code(200).send(cached);
    }

    const query = `
      SELECT * FROM hochiminh."TramKTTV"
      WHERE "KiHieu" = $1
    `;

    const result = await QueryDatabase(query, [kiHieu]);

    // Cache kết quả (longer TTL cho station data)
    searchCache.set(cacheKey, result.rows, 3600);

    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error("GetStationPositionHydrometeorology error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

module.exports = {
  GetSearchAll,
  GetAllDistricts,
  GetAdministrativeDistricts,
  GetAdministrativeCommunesByDistrict,
  GetAdministrativeCommuneByCode,
  GetSearchDate,
  GetStationPositionSalinity,
  GetStationPositionHydrometeorology,
};
