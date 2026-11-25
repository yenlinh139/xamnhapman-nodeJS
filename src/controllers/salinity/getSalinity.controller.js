const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const XLSX = require("xlsx");
const NodeCache = require("node-cache");
const {FORECAST_STATION_MAP} = require("../../configs/forecastStations");
const {clearSearchCache} = require("../search/getSearch.controller");

// Cache với TTL 5 phút cho data ít thay đổi
const cache = new NodeCache({stdTTL: 300, checkperiod: 60});

const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

const VALID_SALINITY_STATIONS = ["CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL", "KXD2", "RBL"];

const salinityOverviewMapping = {
  CRT: {manualCode: "CRT", displayName: "Cầu Rạch Tra"},
  CTT: {manualCode: "CTT", displayName: "Cầu Thủ Thiêm"},
  COT: {manualCode: "COT", displayName: "Cầu Ông Thìn"},
  CKC: {manualCode: "CKC", displayName: "Cống Kênh C", iotStationCode: "CKC_IoT"},
  KXAH: {manualCode: "KXAH", displayName: "Kênh Xáng An Hạ", iotStationCode: "CAH_IoT"},
  MNB: {manualCode: "MNB", displayName: "Mũi Nhà Bè"},
  PCL: {manualCode: "PCL", displayName: "Phà Cát Lái"},
  KXD2: {manualCode: "KXD2", displayName: "Kênh Xáng đứng 2"},
  RBL: {manualCode: "RBL", displayName: "Rạch Bà Lào"},
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
        `SELECT "KiHieu", "TenDiem", "KinhDo", "ViDo", "PhanLoai", "PhanLoai" AS "MoTa", "ThoiGian", "TanSuat", "Note"
         FROM hochiminh."DiemDoMan"
         WHERE "KinhDo" IS NOT NULL AND "ViDo" IS NOT NULL AND "deleted_at" IS NULL
         ORDER BY "TenDiem" ASC`,
      );

      // Lấy toàn bộ dữ liệu độ mặn (sắp xếp theo ngày giảm dần)
      const dataResult = await QueryDatabase(
        `SELECT *
         FROM hochiminh."DoMan"
         ORDER BY "Ngày" DESC`,
      );

      // Số liệu của điểm MỚI thêm qua "Thêm vị trí" (chưa có cột riêng trong "DoMan" nên vòng lặp
      // bên dưới luôn không thấy gì cho các điểm này) - gộp riêng, trung bình/ngày, trực tiếp từ
      // hochiminh."DoManChiTiet" (điểm mới ghi thẳng vào đây, xem salinityDetail.controller.js).
      const customDataResult = await QueryDatabase(
        `SELECT "KiHieu", to_char(("ThoiDiem" AT TIME ZONE '${VN_TIMEZONE}')::date, 'YYYY-MM-DD') AS "Ngày",
                AVG("DoMan") AS value
         FROM hochiminh."DoManChiTiet"
         WHERE "DoMan" IS NOT NULL AND NOT ("KiHieu" = ANY($1))
         GROUP BY "KiHieu", ("ThoiDiem" AT TIME ZONE '${VN_TIMEZONE}')::date
         ORDER BY "Ngày" DESC`,
        [VALID_SALINITY_STATIONS],
      );
      const customRowsByCode = new Map();
      customDataResult.rows.forEach((row) => {
        if (!customRowsByCode.has(row.KiHieu)) customRowsByCode.set(row.KiHieu, []);
        customRowsByCode.get(row.KiHieu).push(row);
      });

      // Xử lý dữ liệu
      result = pointsResult.rows.map((point) => {
        const pointData = {
          ...point,
          isCustom: !VALID_SALINITY_STATIONS.includes(point.KiHieu),
          start_date: null,
          end_date: null,
          total_records: 0,
          latest_value: null,
          latest_date: null,
          previous_value: null,
          previous_date: null,
        };

        const kihieu = point.KiHieu;
        let foundLatest = false;
        let foundPrevious = false;

        // Lặp qua dữ liệu độ mặn để tìm latest/previous VÀ tự tính total_records/start_date/
        // end_date THEO ĐÚNG TRẠM này (không lấy chung của cả bảng "DoMan"), vì mỗi trạm có 1
        // cột riêng và có thể NULL ở những ngày khác nhau (vd KXD2 chỉ có dữ liệu từ 7/12/2024).
        // dataResult.rows đã sắp "Ngày" DESC nên bản ghi non-null đầu tiên gặp là end_date (mới
        // nhất), bản ghi non-null cuối cùng gặp là start_date (cũ nhất).
        for (const record of dataResult.rows) {
          const value = record[kihieu]; // Lấy giá trị cột tương ứng với KiHieu

          if (value !== null && value !== undefined) {
            pointData.total_records += 1;
            if (!pointData.end_date) pointData.end_date = record.Ngày;
            pointData.start_date = record.Ngày;

            if (!foundLatest) {
              pointData.latest_value = value;
              pointData.latest_date = record.Ngày;
              foundLatest = true;
            } else if (!foundPrevious) {
              pointData.previous_value = value;
              pointData.previous_date = record.Ngày;
              foundPrevious = true;
            }
          }
        }

        // "DoMan" chưa có cột riêng cho điểm này (luôn đúng với điểm MỚI, vì cột chỉ được thêm thủ
        // công khi dev "chuyển chính thức") -> lấy trực tiếp từ hochiminh."DoManChiTiet" (đã sắp mới
        // nhất trước) để bản đồ vẫn thấy số liệu vừa nhập, không cần đợi dev xử lý.
        if (pointData.total_records === 0) {
          const customRows = customRowsByCode.get(kihieu) || [];
          pointData.total_records = customRows.length;
          if (customRows.length > 0) {
            pointData.end_date = customRows[0].Ngày;
            pointData.start_date = customRows[customRows.length - 1].Ngày;
            pointData.latest_value = Number(customRows[0].value);
            pointData.latest_date = customRows[0].Ngày;
            if (customRows.length > 1) {
              pointData.previous_value = Number(customRows[1].value);
              pointData.previous_date = customRows[1].Ngày;
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

// POST /api/salinity-points - them 1 DIEM DO MAN MOI (chi thong tin vi tri: ma, ten, toa do).
// CHUA co cot rieng trong bang rong "DoMan" (dung cho thong ke/du bao/canh bao) nen so lieu do man
// cua diem nay duoc ghi thang vao hochiminh."DoManChiTiet" (xem salinityDetail.controller.js) -
// bang hang dai, "KiHieu" la TEXT thuong nen khong can cot rieng - cho den khi dev chuyen sang cot
// chinh thuc trong "DoMan" (ALTER TABLE thu cong, xem migration 018_add_rbl_salinity_station.js).
// Cac truong thuoc tinh ngoai ten/toa do - khong bat buoc.
const readOptionalText = (value) => {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
};

const CreateSalinityPoint = async (req, reply) => {
  try {
    const KiHieu = String(req.body?.KiHieu || "").trim();
    const TenDiem = String(req.body?.TenDiem || "").trim();
    const KinhDo = String(req.body?.KinhDo || "").trim();
    const ViDo = String(req.body?.ViDo || "").trim();
    const PhanLoai = readOptionalText(req.body?.PhanLoai);
    const ThoiGian = readOptionalText(req.body?.ThoiGian);
    const TanSuat = readOptionalText(req.body?.TanSuat);
    const Note = readOptionalText(req.body?.Note);

    if (!KiHieu || !TenDiem || !KinhDo || !ViDo) {
      return reply.code(400).send({code: 400, message: "Thiếu ký hiệu, tên điểm hoặc toạ độ"});
    }

    const existing = await QueryDatabase(`SELECT 1 FROM hochiminh."DiemDoMan" WHERE "KiHieu" = $1 AND "deleted_at" IS NULL`, [
      KiHieu,
    ]);
    if (existing.rowCount > 0) {
      return reply.code(409).send({code: 409, message: `Ký hiệu "${KiHieu}" đã tồn tại`});
    }

    const result = await QueryDatabase(
      `INSERT INTO hochiminh."DiemDoMan" ("KiHieu", "TenDiem", "KinhDo", "ViDo", "PhanLoai", "ThoiGian", "TanSuat", "Note")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING "KiHieu", "TenDiem", "KinhDo", "ViDo", "PhanLoai", "ThoiGian", "TanSuat", "Note"`,
      [KiHieu, TenDiem, KinhDo, ViDo, PhanLoai, ThoiGian, TanSuat, Note],
    );

    cache.flushAll();
    clearSearchCache();
    return reply.code(201).send({code: 201, message: "Thêm điểm đo mặn thành công", data: result.rows[0]});
  } catch (error) {
    if (error.code === "23505") {
      return reply.code(409).send({code: 409, message: "Ký hiệu đã tồn tại"});
    }
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// PUT /api/salinity-points/:code - sua thuoc tinh (ten/toa do/phan loai/thoi gian/tan suat/ghi chu)
// cua 1 diem do man (ap dung duoc cho ca diem cu lan diem moi - khong doi "KiHieu" nen khong anh
// huong du bao/phan loai rui ro von chi dua theo ma).
const UpdateSalinityPoint = async (req, reply) => {
  try {
    const code = String(req.params?.code || "").trim();
    const TenDiem = String(req.body?.TenDiem || "").trim();
    const KinhDo = String(req.body?.KinhDo || "").trim();
    const ViDo = String(req.body?.ViDo || "").trim();
    const PhanLoai = readOptionalText(req.body?.PhanLoai);
    const ThoiGian = readOptionalText(req.body?.ThoiGian);
    const TanSuat = readOptionalText(req.body?.TanSuat);
    const Note = readOptionalText(req.body?.Note);
    if (!code || !TenDiem || !KinhDo || !ViDo) {
      return reply.code(400).send({code: 400, message: "Thiếu tên điểm hoặc toạ độ"});
    }

    const result = await QueryDatabase(
      `UPDATE hochiminh."DiemDoMan"
       SET "TenDiem" = $2, "KinhDo" = $3, "ViDo" = $4, "PhanLoai" = $5, "ThoiGian" = $6, "TanSuat" = $7, "Note" = $8,
           "updated_at" = now(), "updated_by" = $9
       WHERE "KiHieu" = $1 AND "deleted_at" IS NULL
       RETURNING "KiHieu", "TenDiem", "KinhDo", "ViDo", "PhanLoai", "ThoiGian", "TanSuat", "Note"`,
      [code, TenDiem, KinhDo, ViDo, PhanLoai, ThoiGian, TanSuat, Note, req.user?.email || null],
    );
    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy điểm đo"});
    }

    cache.flushAll();
    clearSearchCache();
    return reply.code(200).send({code: 200, message: "Cập nhật thành công", data: result.rows[0]});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// DELETE /api/salinity-points/:code - XOA MEM (set deleted_at), khong xoa khoi DB. Ap dung cho MOI
// diem do man, khong rieng diem moi - diem da xoa se tu dong bien mat khoi moi danh sach/ban do vi
// cac truy van deu loc "deleted_at IS NULL".
const DeleteSalinityPoint = async (req, reply) => {
  try {
    const code = String(req.params?.code || "").trim();

    const result = await QueryDatabase(
      `UPDATE hochiminh."DiemDoMan" SET "deleted_at" = now() WHERE "KiHieu" = $1 AND "deleted_at" IS NULL`,
      [code],
    );
    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy điểm đo"});
    }

    cache.flushAll();
    clearSearchCache();
    return reply.code(200).send({code: 200, message: "Xoá điểm đo thành công"});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// DELETE /api/salinity-points/:code/hard - XOA HAN, tach rieng khoi "Xoá" thong thuong
// (DeleteSalinityPoint - xoa mem) - chi dung khi thuc su can don han (vd nhap sai ma). "KiHieu"
// khong co FK tham chieu toi (hochiminh."DoManChiTiet" chi dung TEXT "KiHieu" thuong, khong co
// constraint) nen xoa an toan, khong vuong loi FK.
const HardDeleteSalinityPoint = async (req, reply) => {
  try {
    const code = String(req.params?.code || "").trim();

    const result = await QueryDatabase(`DELETE FROM hochiminh."DiemDoMan" WHERE "KiHieu" = $1`, [code]);
    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy điểm đo"});
    }

    cache.flushAll();
    clearSearchCache();
    return reply.code(200).send({code: 200, message: "Xoá hẳn điểm đo thành công"});
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
          WHERE "KiHieu" = $1 AND "deleted_at" IS NULL
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
        SELECT "Ngày", "CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL", "KXD2", "RBL"
        FROM hochiminh."DoMan"
        WHERE 1=1 ${whereClause}
        ORDER BY "Ngày" DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(limitVal, offsetVal);
    } else {
      // LEFT JOIN hochiminh."ChiSoNuoc" de kem theo pH/Do dan dien/Do duc cua dung tram nay -
      // bang moi chua co du lieu that nen 3 cot nay hien tra ve NULL, se tu dong co gia tri khi
      // "ChiSoNuoc" duoc nhap lieu (xem migration 009_create_water_quality_table.js).
      const kiHieuParam = `$${params.length + 1}`;
      params.push(kihieu);
      query = `
        SELECT d."Ngày", d."${kihieu}" AS "DoMan", c."pH", c."DoDanDien", c."DoDuc"
        FROM hochiminh."DoMan" d
        LEFT JOIN hochiminh."ChiSoNuoc" c
          ON c."Ngày" = d."Ngày" AND c."KiHieu" = ${kiHieuParam}
        WHERE d."${kihieu}" IS NOT NULL ${whereClause.replace(/"Ngày"/g, 'd."Ngày"')}
        ORDER BY d."Ngày" DESC
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

// GET /api/salinity-data/:kihieu/detail
// Tra ve TUNG lan do thuc te (hochiminh."DoManChiTiet", co the nhieu dong/ngay) de hien thi cot
// "Thoi diem"/"Gio" that trong bang quan trac - khac voi GetSalinityData (tra ve gia tri trung
// binh/ngay tu "DoMan", dung cho bieu do).
const GetSalinityDataDetail = async (req, reply) => {
  try {
    const {kihieu} = req.params;
    const {limit = 1000, offset = 0, startDate, endDate, orderBy = "DESC"} = req.query;

    if (!kihieu || !VALID_SALINITY_STATIONS.includes(kihieu)) {
      return reply.code(400).send({code: 400, message: "Ký hiệu không hợp lệ"});
    }

    const limitVal = Math.min(Math.max(parseInt(limit) || 1000, 1), 20000);
    const offsetVal = Math.max(parseInt(offset) || 0, 0);
    const order = String(orderBy).toLowerCase() === "asc" ? "ASC" : "DESC";

    const params = [kihieu];
    let whereClause = "";
    if (startDate) {
      params.push(startDate);
      whereClause += ` AND "ThoiDiem" >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      whereClause += ` AND "ThoiDiem" <= $${params.length}::date + interval '1 day'`;
    }

    const query = `
      SELECT "ThoiDiem", "DoMan", "pH", "DoDanDien", "DoDuc"
      FROM hochiminh."DoManChiTiet"
      WHERE "KiHieu" = $1 ${whereClause}
      ORDER BY "ThoiDiem" ${order}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM hochiminh."DoManChiTiet"
      WHERE "KiHieu" = $1 ${whereClause}
    `;

    const [dataResult, countResult] = await Promise.all([
      QueryDatabase(query, [...params, limitVal, offsetVal]),
      QueryDatabase(countQuery, params),
    ]);

    return reply.code(200).send({
      data: dataResult.rows,
      pagination: {
        limit: limitVal,
        offset: offsetVal,
        total: parseInt(countResult.rows[0]?.total || 0),
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

// GET /api/salinity-ai-export?startDate=...&endDate=...
// Xuat toan bo du lieu quan trac do man (hochiminh."DoMan") dang rows phang {Date, Station, Salinity},
// dung "Station" theo dung ten ma nhom AI dang dung o API du bao (FORECAST_STATION_MAP) de ho de doi chieu/
// huan luyen lai mo hinh. Public, khong yeu cau dang nhap.
const AI_STATION_NAME_BY_MANUAL_CODE = Object.fromEntries(
  Object.entries(FORECAST_STATION_MAP).map(([station, mapping]) => [mapping.manualCode, station]),
);

const ExportSalinityObservationsForAI = async (req, reply) => {
  try {
    const {startDate, endDate} = req.query;

    const whereClauses = [];
    const params = [];
    if (startDate) {
      params.push(startDate);
      whereClauses.push(`"Ngày" >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      whereClauses.push(`"Ngày" <= $${params.length}`);
    }
    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const [dataResult, waterQualityResult, stationsResult] = await Promise.all([
      QueryDatabase(
        `SELECT "Ngày", "CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL", "KXD2", "RBL"
         FROM hochiminh."DoMan"
         ${whereSql}
         ORDER BY "Ngày" ASC`,
        params,
      ),
      // Chi so chat luong nuoc moi (pH/Do dan dien/Do duc) - bang rieng hochiminh."ChiSoNuoc",
      // chua co du lieu that nen hien tai luon tra ve mang rong, cac truong tuong ung se la null
      // trong moi row cho toi khi bang nay duoc nhap lieu (xem migration 009).
      QueryDatabase(
        `SELECT "Ngày", "KiHieu", "pH", "DoDanDien", "DoDuc"
         FROM hochiminh."ChiSoNuoc"
         ${whereSql}`,
        params,
      ),
      QueryDatabase(
        `SELECT "KiHieu", "TenDiem", "KinhDo", "ViDo"
         FROM hochiminh."DiemDoMan"
         WHERE "KiHieu" = ANY($1) AND "deleted_at" IS NULL`,
        [VALID_SALINITY_STATIONS],
      ),
    ]);

    const stationMeta = {};
    for (const s of stationsResult.rows) {
      stationMeta[s.KiHieu] = s;
    }

    const toDateStr = (rawDate) => (rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate).slice(0, 10));

    const waterQualityByDateStation = {};
    for (const record of waterQualityResult.rows) {
      const key = `${toDateStr(record["Ngày"])}_${record["KiHieu"]}`;
      waterQualityByDateStation[key] = record;
    }

    const rows = [];
    for (const record of dataResult.rows) {
      const dateStr = toDateStr(record["Ngày"]);

      for (const code of VALID_SALINITY_STATIONS) {
        const value = record[code];
        if (value === null || value === undefined || value === "NULL") continue;

        const salinity = Number(value);
        if (!Number.isFinite(salinity)) continue;

        const waterQuality = waterQualityByDateStation[`${dateStr}_${code}`];

        rows.push({
          Datetime: `${dateStr}T00:00:00+07:00`,
          Station: AI_STATION_NAME_BY_MANUAL_CODE[code] || code,
          ManualCode: code,
          do_man: salinity,
          pH: waterQuality?.pH !== undefined ? waterQuality.pH : null,
          do_dan_dien: waterQuality?.DoDanDien !== undefined ? waterQuality.DoDanDien : null,
          do_duc: waterQuality?.DoDuc !== undefined ? waterQuality.DoDuc : null,
        });
      }
    }

    const stations = VALID_SALINITY_STATIONS.map((code) => ({
      manualCode: code,
      station: AI_STATION_NAME_BY_MANUAL_CODE[code] || code,
      displayName: stationMeta[code]?.TenDiem || code,
      longitude: stationMeta[code]?.KinhDo ?? null,
      latitude: stationMeta[code]?.ViDo ?? null,
    }));

    return reply.code(200).send({
      generatedAt: new Date().toISOString(),
      units: {do_man: "‰", pH: null, do_dan_dien: "mS", do_duc: "NTU"},
      filters: {startDate: startDate || null, endDate: endDate || null},
      stations,
      totalRecords: rows.length,
      rows,
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// Goi sau khi them/sua/xoa so lieu (DoManChiTiet) de "/salinity-points" (ban do) thay
// latest_value/total_records moi ngay, khong doi het TTL cache (5 phut).
const clearSalinityPointsCache = () => cache.flushAll();

module.exports = {
  GetSalinityPoints,
  CreateSalinityPoint,
  UpdateSalinityPoint,
  DeleteSalinityPoint,
  HardDeleteSalinityPoint,
  clearSalinityPointsCache,
  GetSalinityOverview,
  GetSalinityData,
  GetSalinityDataDetail,
  ExportSalinityDataToExcel,
  ExportSalinityDataWithRange,
  ExportSalinityObservationsForAI,
};
