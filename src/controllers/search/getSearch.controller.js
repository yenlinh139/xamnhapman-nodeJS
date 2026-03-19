const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const NodeCache = require("node-cache");

// Cache cho search results với TTL 30 phút
const searchCache = new NodeCache({stdTTL: 1800, checkperiod: 300});

const GetSearchAll = async (req, reply) => {
  try {
    const {id} = req.params;
    const {limit = 50} = req.query;

    if (!id) {
      return reply.code(400).send({code: 400, message: "id is required"});
    }

    // Decode URL và sanitize input
    const decodedSearchTerm = decodeURIComponent(id).trim();
    if (decodedSearchTerm.length < 1) {
      return reply.code(400).send({code: 400, message: "Search term không được rỗng"});
    }

    // Check cache
    const cacheKey = `search_all_${decodedSearchTerm}_${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      console.log(`🎯 Cache hit for search: "${decodedSearchTerm}"`);
      return reply.code(200).send(cached);
    }

    const limitVal = Math.min(parseInt(limit), 100); // Max 100 records
    console.log(`🔍 Searching for: "${decodedSearchTerm}" (limit: ${limitVal})`);
    let results = [];

    // Tìm kiếm đơn giản không dùng unaccent để tránh lỗi database
    const searchPattern = `%${decodedSearchTerm}%`;

    const queries = [
      // Query Huyện
      QueryDatabase(
        `
        SELECT "MaHuyen", "TenHuyen", "dientichtunhien", "shape_length", "shape_area",
               ST_AsGeoJSON(geom)::json AS geom, 'huyen' as type
        FROM hochiminh."DiaPhanHuyen"
        WHERE "MaHuyen" = $1 OR LOWER("TenHuyen") LIKE LOWER($2)
        ORDER BY "TenHuyen"
        LIMIT $3
      `,
        [decodedSearchTerm, searchPattern, limitVal],
      ),

      // Query Xã
      QueryDatabase(
        `
        SELECT "MaXa", "TenXa", "MaHuyen", "TenHuyen", "dientichtunhien", "shape_length", "shape_area",
               ST_AsGeoJSON(geom)::json AS geom, 'xa' as type
        FROM hochiminh."DiaPhanXa"
        WHERE "MaXa" = $1 OR "MaHuyen" = $1 OR 
              LOWER("TenXa") LIKE LOWER($2) OR 
              LOWER("TenHuyen") LIKE LOWER($2)
        ORDER BY "TenXa", "TenHuyen"
        LIMIT $3
      `,
        [decodedSearchTerm, searchPattern, limitVal],
      ),

      // Query Điểm đo mặn
      QueryDatabase(
        `
        SELECT "KiHieu", "TenDiem", "KinhDo", "ViDo", "PhanLoai", "ThoiGian", "TanSuat", 'diem_do_man' as type
        FROM hochiminh."DiemDoMan"
        WHERE "KiHieu" = $1 OR LOWER("TenDiem") LIKE LOWER($2)
        ORDER BY "TenDiem"
        LIMIT $3
      `,
        [decodedSearchTerm, searchPattern, limitVal],
      ),

      // Query Trạm khí tượng thủy văn
      QueryDatabase(
        `
        SELECT "KiHieu", "TenTram", "KinhDo", "ViDo", "LoaiTram", 'khi_tuong_thuy_van' as type
        FROM hochiminh."KhiTuongThuyVan"
        WHERE "KiHieu" = $1 OR LOWER("TenTram") LIKE LOWER($2)
        ORDER BY "TenTram"
        LIMIT $3
      `,
        [decodedSearchTerm, searchPattern, limitVal],
      ),
    ];

    const [resultHuyen, resultXa, resultDiemDoMan, resultKhiTuong] = await Promise.all(queries);

    // Combine results
    if (resultHuyen && resultHuyen.rowCount > 0) results.push(...resultHuyen.rows);
    if (resultXa && resultXa.rowCount > 0) results.push(...resultXa.rows);
    if (resultDiemDoMan && resultDiemDoMan.rowCount > 0) results.push(...resultDiemDoMan.rows);
    if (resultKhiTuong && resultKhiTuong.rowCount > 0) results.push(...resultKhiTuong.rows);

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
      SELECT tenhuyen,
             ST_Y(ST_Centroid(geom)) AS centerLat,
             ST_X(ST_Centroid(geom)) AS centerLng
      FROM hochiminh."DiaPhanHuyen"
      WHERE tenhuyen IS NOT NULL
      ORDER BY tenhuyen ASC
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
    const cacheKey = `search_date_${parsedDate.iso}_${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return reply.code(200).send(cached);
    }

    const limitVal = Math.min(parseInt(limit), 500); // Max 500 records per table

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
        query: `SELECT * FROM hochiminh."ThuyVan" WHERE "Ngày" = $1 LIMIT $2`,
        params: [parsedDate.vietnam, limitVal],
      },
      {
        name: "KhiTuong",
        label: "meteorologyData",
        query: `SELECT * FROM hochiminh."KhiTuong" WHERE "Ngày" = $1 LIMIT $2`,
        params: [parsedDate.vietnam, limitVal],
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
  GetSearchDate,
  GetStationPositionSalinity,
  GetStationPositionHydrometeorology,
};
