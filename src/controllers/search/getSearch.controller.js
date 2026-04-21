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

// Thứ tự ưu tiên hiển thị kết quả tìm kiếm
const SEARCH_PRIORITY = {
  iot_station: 1,
  diem_do_man: 2,
  khi_tuong_thuy_van: 3,
  ho_chua: 4,
  cttl_cong: 5,
  cttl_tram_bom: 5,
  cttl_de_bao: 5,
  cttl_kenh_muong: 5,
  cttl_2030_noi_dong: 5,
  cttl_2030_nong_thon_moi: 5,
  cttl_2030_vung_thuy_loi: 5,
  cttl_2030_vung_he_thong: 5,
  giao_thong_line: 6,
  giao_thong_polygon: 6,
  thuy_he_line: 6,
  thuy_he_polygon: 6,
  xa: 7,
  huyen: 8,
};

const GetSearchAll = async (req, reply) => {
  try {
    const {id} = req.params;
    const {limit = 50} = req.query;

    if (!id) {
      return reply.code(400).send({code: 400, message: "ID là bắt buộc"});
    }

    const decodedSearchTerm = decodeURIComponent(id).trim();
    if (decodedSearchTerm.length < 1) {
      return reply.code(400).send({code: 400, message: "Search term không được rỗng"});
    }

    const normalizedSearchTerm = normalizeVietnamese(decodedSearchTerm).toLowerCase();

    const cacheKey = `search_all_v2_${normalizedSearchTerm}_${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return reply.code(200).send(cached);
    }

    const limitVal = Math.min(parseInt(limit), 100);
    const searchPattern = `%${normalizedSearchTerm}%`;

    // Helper tạo biểu thức SQL normalize không dấu
    const n = (col) => normalizeSqlExpr(col);

    const queryTasks = [
      // 1. Trạm IoT — apiRef: /iot/stations
      QueryDatabase(`
        SELECT
          s.serial_number                               AS id,
          s.station_name                               AS name,
          s.latitude                                   AS lat,
          s.longitude                                  AS lng,
          'iot_station'                                AS type,
          '/iot/stations'                              AS "apiRef",
          s.serial_number                              AS "SerialNumber",
          s.station_name                               AS "StationName",
          s.station_code                               AS "StationCode",
          s.station_type                               AS "StationType",
          s.status                                     AS "Status",
          s.frequency,
          s.time_period,
          s.note,
          COALESCE(iot_counts.total_records, 0)        AS total_records,
          iot_counts.start_time,
          iot_counts.end_time,
          '‰'                                          AS latest_salt_unit,
          salt_stats.latest_hour_end_time,
          salt_stats.previous_hour_end_time,
          salt_stats.latest_hour_avg_salt,
          salt_stats.previous_hour_avg_salt,
          salt_stats.previous_day,
          salt_stats.previous_day_avg_salt
        FROM iot_system.iot_stations s
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) AS total_records,
            MIN(d_count.date_time) AS start_time,
            MAX(d_count.date_time) AS end_time
          FROM iot_system.iot_data d_count
          WHERE d_count.serial_number = s.serial_number
        ) iot_counts ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            latest_slot.latest_hour_end_time,
            (latest_slot.latest_hour_end_time - interval '1 hour') AS previous_hour_end_time,
            (
              SELECT ROUND(AVG(d1.salt_value)::numeric, 3)
              FROM iot_system.iot_data d1
              WHERE d1.serial_number = s.serial_number
                AND d1.salt_value IS NOT NULL
                AND (
                  CASE
                    WHEN d1.date_time = date_trunc('hour', d1.date_time)
                      THEN date_trunc('hour', d1.date_time)
                    ELSE date_trunc('hour', d1.date_time) + interval '1 hour'
                  END
                ) = latest_slot.latest_hour_end_time
            ) AS latest_hour_avg_salt,
            (
              SELECT ROUND(AVG(d2.salt_value)::numeric, 3)
              FROM iot_system.iot_data d2
              WHERE d2.serial_number = s.serial_number
                AND d2.salt_value IS NOT NULL
                AND (
                  CASE
                    WHEN d2.date_time = date_trunc('hour', d2.date_time)
                      THEN date_trunc('hour', d2.date_time)
                    ELSE date_trunc('hour', d2.date_time) + interval '1 hour'
                  END
                ) = (latest_slot.latest_hour_end_time - interval '1 hour')
            ) AS previous_hour_avg_salt,
            (latest_slot.latest_hour_end_time::date - interval '1 day')::date AS previous_day,
            (
              SELECT ROUND(AVG(d3.salt_value)::numeric, 3)
              FROM iot_system.iot_data d3
              WHERE d3.serial_number = s.serial_number
                AND d3.salt_value IS NOT NULL
                AND d3.date_time::date = (latest_slot.latest_hour_end_time::date - interval '1 day')::date
            ) AS previous_day_avg_salt
          FROM (
            SELECT MAX(
              CASE
                WHEN d0.date_time = date_trunc('hour', d0.date_time)
                  THEN date_trunc('hour', d0.date_time)
                ELSE date_trunc('hour', d0.date_time) + interval '1 hour'
              END
            ) AS latest_hour_end_time
            FROM iot_system.iot_data d0
            WHERE d0.serial_number = s.serial_number
              AND d0.salt_value IS NOT NULL
              AND (
                CASE
                  WHEN d0.date_time = date_trunc('hour', d0.date_time)
                    THEN date_trunc('hour', d0.date_time)
                  ELSE date_trunc('hour', d0.date_time) + interval '1 hour'
                END
              ) <= timezone('Asia/Ho_Chi_Minh', CURRENT_TIMESTAMP)
          ) latest_slot
        ) salt_stats ON TRUE
        WHERE s.serial_number = $1
           OR ${n("s.station_name")} LIKE $2
           OR ${n("s.station_code")} LIKE $2
        ORDER BY s.station_name LIMIT $3`,
        [decodedSearchTerm, searchPattern, limitVal],
      ),

      // 2. Điểm đo mặn — apiRef: /salinity-points
      QueryDatabase(`
        SELECT
          "KiHieu"               AS id,
          "TenDiem"              AS name,
          "ViDo"                 AS lat,
          "KinhDo"               AS lng,
          'diem_do_man'          AS type,
          '/salinity-points'     AS "apiRef",
          "KiHieu",
          "TenDiem",
          "KinhDo",
          "ViDo",
          "PhanLoai",
          "ThoiGian",
          "TanSuat"
        FROM hochiminh."DiemDoMan"
        WHERE "KiHieu" = $1 OR ${n('"TenDiem"')} LIKE $2
        ORDER BY "TenDiem" LIMIT $3`,
        [decodedSearchTerm, searchPattern, limitVal],
      ),

      // 3. Trạm KTTV — apiRef: /hydrometeorology-stations
      QueryDatabase(`
        SELECT
          "KiHieu"                      AS id,
          "TenTram"                     AS name,
          "ViDo"                        AS lat,
          "KinhDo"                      AS lng,
          'khi_tuong_thuy_van'          AS type,
          '/hydrometeorology-stations'  AS "apiRef",
          "KiHieu",
          "TenTram",
          "KinhDo",
          "ViDo",
          "PhanLoai",
          "YeuTo",
          "ThoiGian",
          "TanSuat"
        FROM hochiminh."TramKTTV"
        WHERE "KiHieu" = $1 OR ${n('"TenTram"')} LIKE $2
        ORDER BY "TenTram" LIMIT $3`,
        [decodedSearchTerm, searchPattern, limitVal],
      ),

      // 4. Hồ chứa — apiRef: /reservoir-points
      QueryDatabase(`
        SELECT
          "KiHieu"               AS id,
          "TenHo"                AS name,
          "ViDo"                 AS lat,
          "KinhDo"               AS lng,
          'ho_chua'              AS type,
          '/reservoir-points'    AS "apiRef",
          "KiHieu",
          "TenHo",
          "KinhDo",
          "ViDo",
          "YeuTo",
          "ThoiGian",
          "TanSuat"
        FROM hochiminh."HoChua"
        WHERE "KiHieu" = $1 OR ${n('"TenHo"')} LIKE $2
        ORDER BY "TenHo" LIMIT $3`,
        [decodedSearchTerm, searchPattern, limitVal],
      ),

      // 5a. CTTL 2023 — Cống
      QueryDatabase(`
        SELECT
          "Id"::text              AS id,
          "TenCongDap"            AS name,
          ST_Y(ST_Centroid(geom)) AS lat,
          ST_X(ST_Centroid(geom)) AS lng,
          'cttl_cong'             AS type,
          NULL                    AS "apiRef",
          "TenCongDap",
          "LoaiCongTrinh",
          "CumCongTrinh",
          "HinhThuc",
          "MucTieuNhiemVu",
          "DienTichPhucVu_ha",
          "CapCongTrinh",
          "DonViQuanLy",
          "NamSuDung"
        FROM hochiminh."CTTL_2023_Cong"
        WHERE ${n('"TenCongDap"')} LIKE $1
        ORDER BY "TenCongDap" LIMIT $2`,
        [searchPattern, limitVal],
      ),

      // 5b. CTTL 2023 — Trạm bơm
      QueryDatabase(`
        SELECT
          "Id"::text              AS id,
          "TenTramBom"            AS name,
          ST_Y(ST_Centroid(geom)) AS lat,
          ST_X(ST_Centroid(geom)) AS lng,
          'cttl_tram_bom'         AS type,
          NULL                    AS "apiRef",
          "TenTramBom",
          "Loai",
          "CongSuat",
          "MucTieuNhiemVu",
          "DienTichPhucVu_ha",
          "HeThongCongTrinhThuyLoi",
          "DonViQuanLy",
          "NamSuDung"
        FROM hochiminh."CTTL_2023_TramBom"
        WHERE ${n('"TenTramBom"')} LIKE $1
        ORDER BY "TenTramBom" LIMIT $2`,
        [searchPattern, limitVal],
      ),

      // 5c. CTTL 2023 — Đê bao / Bờ bao
      QueryDatabase(`
        SELECT
          "Id"::text              AS id,
          "TenDeBao"              AS name,
          ST_Y(ST_Centroid(geom)) AS lat,
          ST_X(ST_Centroid(geom)) AS lng,
          'cttl_de_bao'           AS type,
          NULL                    AS "apiRef",
          "TenDeBao",
          "Loai",
          "ChieuDai_m",
          "CaoTrinhDinh",
          "MucTieuNhiemVu",
          "DienTichPhucVu_ha",
          "CapDe",
          "DonViQuanLy",
          "NamSuDung"
        FROM hochiminh."CTTL_2023_DeBao_BoBao"
        WHERE ${n('"TenDeBao"')} LIKE $1
        ORDER BY "TenDeBao" LIMIT $2`,
        [searchPattern, limitVal],
      ),

      // 5d. CTTL 2023 — Kênh mương
      QueryDatabase(`
        SELECT
          "Id"::text              AS id,
          "TenKenhMuong"          AS name,
          ST_Y(ST_Centroid(geom)) AS lat,
          ST_X(ST_Centroid(geom)) AS lng,
          'cttl_kenh_muong'       AS type,
          NULL                    AS "apiRef",
          "TenKenhMuong",
          "LoaiKenh",
          "CapKenh",
          "ChieuDai_m",
          "MucTieuNhiemVu",
          "DienTichPhucVu_ha",
          "HeThongCongTrinhThuyLoi",
          "DonViQuanLy",
          "NamSuDung"
        FROM hochiminh."CTTL_2023_KenhMuong"
        WHERE ${n('"TenKenhMuong"')} LIKE $1
        ORDER BY "TenKenhMuong" LIMIT $2`,
        [searchPattern, limitVal],
      ),

      // 5e. CTTL 2030 — Nội đồng
      QueryDatabase(`
        SELECT
          "OBJECTID"::text        AS id,
          "Ten"                   AS name,
          ST_Y(ST_Centroid(geom)) AS lat,
          ST_X(ST_Centroid(geom)) AS lng,
          'cttl_2030_noi_dong'    AS type,
          NULL                    AS "apiRef",
          "Ten",
          "VungThuyLoi"
        FROM hochiminh."CTTL_2030_NoiDong"
        WHERE ${n('"Ten"')} LIKE $1
        ORDER BY "Ten" LIMIT $2`,
        [searchPattern, limitVal],
      ),

      // 5f. CTTL 2030 — Nông thôn mới
      QueryDatabase(`
        SELECT
          "OBJECTID"::text           AS id,
          "Ten"                      AS name,
          ST_Y(ST_Centroid(geom))    AS lat,
          ST_X(ST_Centroid(geom))    AS lng,
          'cttl_2030_nong_thon_moi'  AS type,
          NULL                       AS "apiRef",
          "Ten",
          "VungThuyLoi"
        FROM hochiminh."CTTL_2030_NongThonMoi"
        WHERE ${n('"Ten"')} LIKE $1
        ORDER BY "Ten" LIMIT $2`,
        [searchPattern, limitVal],
      ),

      // 5g. CTTL 2030 — Vùng thủy lợi
      QueryDatabase(`
        SELECT
          "OBJECTID"::text           AS id,
          "VungThuyLoi"              AS name,
          ST_Y(ST_Centroid(geom))    AS lat,
          ST_X(ST_Centroid(geom))    AS lng,
          'cttl_2030_vung_thuy_loi'  AS type,
          NULL                       AS "apiRef",
          "VungThuyLoi",
          "MoTa"
        FROM hochiminh."CTTL_2030_VungThuyLoi"
        WHERE ${n('"VungThuyLoi"')} LIKE $1
        ORDER BY "VungThuyLoi" LIMIT $2`,
        [searchPattern, limitVal],
      ),

      // 5h. CTTL 2030 — Vùng hệ thống
      QueryDatabase(`
        SELECT
          "OBJECTID"::text           AS id,
          "Ten"                      AS name,
          ST_Y(ST_Centroid(geom))    AS lat,
          ST_X(ST_Centroid(geom))    AS lng,
          'cttl_2030_vung_he_thong'  AS type,
          NULL                       AS "apiRef",
          "Ten",
          "VungThuyLoi"
        FROM hochiminh."CTTL_2030_Vung_HeThong"
        WHERE ${n('"Ten"')} LIKE $1
        ORDER BY "Ten" LIMIT $2`,
        [searchPattern, limitVal],
      ),

      // 6. Xã
      QueryDatabase(`
        SELECT
          "maXa"                        AS id,
          "tenXa"                       AS name,
          ST_Y(ST_Centroid(geom))       AS lat,
          ST_X(ST_Centroid(geom))       AS lng,
          'xa'                          AS type,
          NULL                          AS "apiRef",
          "maXa",
          "tenXa",
          "maHuyen",
          "tenHuyen",
          "dienTichTuNhien",
          ST_AsGeoJSON(geom)::json      AS geom
        FROM hochiminh."DiaPhanXa"
        WHERE "maXa" = $1 OR "maHuyen" = $1
           OR ${n('"tenXa"')} LIKE $2
           OR ${n('"tenHuyen"')} LIKE $2
        ORDER BY "tenXa", "tenHuyen" LIMIT $3`,
        [decodedSearchTerm, searchPattern, limitVal],
      ),

      // 9. Huyện
      QueryDatabase(`
        SELECT
          "maHuyen"                     AS id,
          "tenHuyen"                    AS name,
          ST_Y(ST_Centroid(geom))       AS lat,
          ST_X(ST_Centroid(geom))       AS lng,
          'huyen'                       AS type,
          NULL                          AS "apiRef",
          "maHuyen",
          "tenHuyen",
          "dienTichTuNhien",
          ST_AsGeoJSON(geom)::json      AS geom
        FROM hochiminh."DiaPhanHuyen"
        WHERE "maHuyen" = $1 OR ${n('"tenHuyen"')} LIKE $2
        ORDER BY "tenHuyen" LIMIT $3`,
        [decodedSearchTerm, searchPattern, limitVal],
      ),

      // 10a. Giao thông — đường (line)
      QueryDatabase(`
        SELECT
          "id"::text                    AS id,
          "tenDuong"                   AS name,
          ST_Y(ST_Centroid(geom))      AS lat,
          ST_X(ST_Centroid(geom))      AS lng,
          'giao_thong_line'            AS type,
          NULL                         AS "apiRef",
          "OBJECTID",
          "tenDuong",
          "chieuDai"
        FROM hochiminh."GiaoThong_line"
        WHERE ${n('"tenDuong"')} LIKE $1
        ORDER BY "tenDuong" LIMIT $2`,
        [searchPattern, limitVal],
      ),

      // 10b. Giao thông — đường (polygon)
      QueryDatabase(`
        SELECT
          "id"::text                    AS id,
          "TenDuong"                   AS name,
          ST_Y(ST_Centroid(geom))      AS lat,
          ST_X(ST_Centroid(geom))      AS lng,
          'giao_thong_polygon'         AS type,
          NULL                         AS "apiRef",
          "OBJECTID",
          "TenDuong",
          "DoRong",
          "ChieuDai",
          "KetCau",
          "CapQuanLy",
          "TinhTrang"
        FROM hochiminh."GiaoThong_polygon"
        WHERE ${n('"TenDuong"')} LIKE $1
        ORDER BY "TenDuong" LIMIT $2`,
        [searchPattern, limitVal],
      ),

      // 11a. Thủy hệ — sông/kênh rạch (line)
      QueryDatabase(`
        SELECT
          "id"::text                    AS id,
          "Ten"                        AS name,
          ST_Y(ST_Centroid(geom))      AS lat,
          ST_X(ST_Centroid(geom))      AS lng,
          'thuy_he_line'               AS type,
          NULL                         AS "apiRef",
          "OBJECTID",
          "Ten",
          "DiemDau",
          "DiemCuoi",
          "ChieuDai"
        FROM hochiminh."ThuyHe_line"
        WHERE ${n('"Ten"')} LIKE $1
        ORDER BY "Ten" LIMIT $2`,
        [searchPattern, limitVal],
      ),

      // 11b. Thủy hệ — ao/hồ/kênh rạch (polygon)
      QueryDatabase(`
        SELECT
          "id"::text                    AS id,
          "Ten"                        AS name,
          ST_Y(ST_Centroid(geom))      AS lat,
          ST_X(ST_Centroid(geom))      AS lng,
          'thuy_he_polygon'            AS type,
          NULL                         AS "apiRef",
          "OBJECTID",
          "Ten",
          "phanLoai",
          "doRong",
          "doSau",
          "ChatDay",
          "TrangThai"
        FROM hochiminh."ThuyHe_polygon"
        WHERE ${n('"Ten"')} LIKE $1
        ORDER BY "Ten" LIMIT $2`,
        [searchPattern, limitVal],
      ),
    ];

    const salinityStatsQuery = QueryDatabase(`
      SELECT station_code,
             MIN(date_val) AS start_date,
             MAX(date_val) AS end_date,
             COUNT(*)      AS total_records
      FROM (
        SELECT "Ngày" AS date_val, 'CRT'  AS station_code FROM hochiminh."DoMan" WHERE "CRT"  IS NOT NULL
        UNION ALL
        SELECT "Ngày",             'CTT'  FROM hochiminh."DoMan" WHERE "CTT"  IS NOT NULL
        UNION ALL
        SELECT "Ngày",             'COT'  FROM hochiminh."DoMan" WHERE "COT"  IS NOT NULL
        UNION ALL
        SELECT "Ngày",             'CKC'  FROM hochiminh."DoMan" WHERE "CKC"  IS NOT NULL
        UNION ALL
        SELECT "Ngày",             'KXAH' FROM hochiminh."DoMan" WHERE "KXAH" IS NOT NULL
        UNION ALL
        SELECT "Ngày",             'MNB'  FROM hochiminh."DoMan" WHERE "MNB"  IS NOT NULL
        UNION ALL
        SELECT "Ngày",             'PCL'  FROM hochiminh."DoMan" WHERE "PCL"  IS NOT NULL
        UNION ALL
        SELECT "Ngày",             'KXD2' FROM hochiminh."DoMan" WHERE "KXD2" IS NOT NULL
      ) unpivoted
      GROUP BY station_code
    `).catch(() => null);

    const [settled, salinityStatsRaw] = await Promise.all([Promise.allSettled(queryTasks), salinityStatsQuery]);
    let results = [];

    // Build per-station salinity stats map
    const salinityStatsMap = {};
    if (salinityStatsRaw?.rowCount > 0) {
      for (const row of salinityStatsRaw.rows) {
        salinityStatsMap[row.station_code] = row;
      }
    }

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

    // Enrich điểm đo mặn results with per-station data series stats
    results = results.map((r) => {
      if (r.type === "diem_do_man" && salinityStatsMap[r.KiHieu]) {
        const stats = salinityStatsMap[r.KiHieu];
        return {
          ...r,
          start_date: stats.start_date,
          end_date: stats.end_date,
          total_records: parseInt(stats.total_records),
        };
      }
      return r;
    });

    // Sắp xếp theo ưu tiên, cùng ưu tiên thì theo tên
    results.sort((a, b) => {
      const pa = SEARCH_PRIORITY[a.type] ?? 99;
      const pb = SEARCH_PRIORITY[b.type] ?? 99;
      if (pa !== pb) return pa - pb;
      return (a.name || "").localeCompare(b.name || "", "vi");
    });

    searchCache.set(cacheKey, results, 1800);
    console.log(`📊 Found ${results.length} results for "${decodedSearchTerm}" | types: ${[...new Set(results.map((r) => r.type))].join(", ")}`);
    return reply.code(200).send(results);
  } catch (error) {
    logger.error("GetSearchAll error:", error);
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
