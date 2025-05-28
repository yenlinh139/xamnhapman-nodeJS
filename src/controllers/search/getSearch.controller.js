const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

const GetSearchAll = async (req, reply) => {
  try {
    const {id} = req.params;

    if (!id) {
      return reply.code(400).send({code: 400, message: "id is required"});
    }

    const escapedId = id.replace(/'/g, "''");
    let results = [];

    let queryHuyen = `
      SELECT id, mahuyen, tenhuyen, dientichtunhien, shape_length, shape_area,
             ST_AsGeoJSON(geom)::json AS geom
      FROM hochiminh."DiaPhanHuyen"
      WHERE mahuyen='${escapedId}' OR unaccent(tenhuyen) ILIKE unaccent('%${escapedId}%')
    `;
    const resultHuyen = await QueryDatabase(queryHuyen);
    if (resultHuyen.rowCount > 0) {
      results.push(...resultHuyen.rows);
    }

    let queryXa = `
     SELECT id, maxa, tenxa, mahuyen, tenhuyen, dientichtunhien, shape_length, shape_area,
            ST_AsGeoJSON(geom)::json AS geom
     FROM hochiminh."DiaPhanXa"
     WHERE maxa='${escapedId}' OR mahuyen='${escapedId}' OR unaccent(tenxa) ILIKE unaccent('%${escapedId}%') OR unaccent(tenhuyen) ILIKE unaccent('%${escapedId}%')
   `;
    const resultXa = await QueryDatabase(queryXa);
    if (resultXa.rowCount > 0) {
      results.push(...resultXa.rows);
    }

    // 🔍 Tìm theo điểm đo mặn
    let queryDiemDoMan = `
     SELECT id, "KiHieu", "TenDiem", "KinhDo", "ViDo", "PhanLoai", "ThoiGian", "TanSuat"
     FROM hochiminh."DiemDoMan"
     WHERE "KiHieu"='${escapedId}' 
        OR unaccent("TenDiem") ILIKE unaccent('%${escapedId}%')
   `;
    const resultDiemDoMan = await QueryDatabase(queryDiemDoMan);
    if (resultDiemDoMan.rowCount > 0) {
      results.push(
        ...resultDiemDoMan.rows.map((row) => ({
          ...row,
          type: "diem_do_man",
        })),
      );
    }

    if (results.length > 0) {
      return reply.code(200).send(results);
    }

    return reply.code(404).send({code: 404, message: "Not found"});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Internal Server Error"});
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

const parseDateForDoMan = (dateStr) => {
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return dateStr;
};

const parseDateForThuyVan_KhiTuong = (dateStr) => {
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
  }
  return dateStr;
};

const GetSearchDate = async (req, reply) => {
  try {
    const {id} = req.params;

    if (!id) {
      return reply.code(400).send({code: 400, message: "Thiếu tham số ngày (date)."});
    }

    const escapedDate = id.replace(/'/g, "''"); // tránh SQL injection
    const tables = [
      {name: "ThuyVan", label: "hydrologyData", format: "iso"},
      {name: "DoMan", label: "salinityData", format: "vn"},
      {name: "KhiTuong", label: "meteorologyData", format: "vn"},
    ];

    const resultData = {};

    for (const table of tables) {
      let dateToQuery;

      if (table.format === "iso") {
        dateToQuery = parseDateForDoMan(escapedDate);
      } else if (table.format === "vn") {
        dateToQuery = parseDateForThuyVan_KhiTuong(escapedDate);
      } else {
        dateToQuery = escapedDate;
      }

      const query = `
        SELECT * 
        FROM hochiminh."${table.name}"
        WHERE "Ngày" = '${dateToQuery}'
      `;

      const result = await QueryDatabase(query);

      if (result.rowCount > 0) {
        resultData[table.label] = result.rows;
      }
    }

    if (Object.keys(resultData).length === 0) {
      return reply.code(404).send({code: 404, message: `Không có dữ liệu cho ngày ${id}`});
    }

    return reply.code(200).send(resultData);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ."});
  }
};

const idMapping = {
  CRT: "CauRachTra",
  CTT: "CauThuThiem",
  COT: "CauOngThin",
  CKC: "CongKenhC",
  KXAH: "KenhXang-AnHa",
  MNB: "MuiNhaBe",
  PCL: "PhaCatLai",
};

const GetStationPositionSalinity = async (req, reply) => {
  const allowedCodes = Object.keys(idMapping);

  try {
    const {code} = req.params;

    if (!code) {
      return reply.code(400).send({code: 400, message: "Thiếu mã điểm đo"});
    }

    let query;
    if (code === "full") {
      query = `
        SELECT * FROM hochiminh."DiemDoMan"
        WHERE "KinhDo" IS NOT NULL AND "ViDo" IS NOT NULL
      `;
    } else {
      if (!allowedCodes.includes(code)) {
        return reply.code(400).send({code: 400, message: "Mã điểm đo không hợp lệ"});
      }

      const kiHieu = idMapping[code];
      query = `
        SELECT * FROM hochiminh."DiemDoMan"
        WHERE "KiHieu" = '${kiHieu}'
      `;
    }

    const result = await QueryDatabase(query);
    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error(error);
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
  const {code} = req.params;
  const kiHieu = weatherMapping[code];

  if (!kiHieu) {
    return reply.code(400).send({code: 400, message: "Mã không hợp lệ"});
  }

  try {
    const query = `
      SELECT * FROM hochiminh."TramKTTV"
      WHERE "KiHieu" = '${kiHieu}'
    `;
    const result = await QueryDatabase(query);
    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error(error);
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
