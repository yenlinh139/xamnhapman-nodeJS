// CRUD dung chung cho trang "Quan tri du lieu" cua 4 lop so lieu NGAY luu theo dang bang RONG
// (moi tram 1 hoac vai cot, moi ngay 1 dong):
//   - rain      : Diem do mua          -> hochiminh."KhiTuong" (cot R_*)
//   - meteo     : Tram khi tuong       -> hochiminh."KhiTuong" (R_MDC, R_NB, R_TSH + nhiet do TSH)
//   - hydro     : Tram thuy van        -> hochiminh."ThuyVan"  (Htb/Hx/Hm)
//   - reservoir : Ho chua thuong luu   -> hochiminh."TongLuongXa" (HDT, HTA + nguon du lieu)
//
// API tra ve/nhan du lieu o dang DAI (1 ban ghi = 1 tram + 1 ngay) de trang quan tri loc theo
// tram/giai doan, them/sua/xoa tung ban ghi giong 2 lop "Diem do man"/"Tram IoT".
//
// RANG BUOC DUY NHAT: moi (tram, ngay) chi co toi da 1 ban ghi. Them moi vao (tram, ngay) da co so
// lieu -> 409, khong ghi de.
//
// TRAM MOI (them qua "Them vi tri"): duoc cap COT THAT ngay luc tao (ALTER TABLE, xem
// utils/dynamicStationColumns.js) thay vi ghi tam vao 1 bang JSONB rieng - tram moi tu do duoc xu
// ly y het tram co san (hardcoded trong LAYERS.stations) o moi ham duoi day, qua 1 mapping hop nhat
// "stations cung (JS) + stations dong (hochiminh."TramMoiCot")".
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const {clearReservoirCache} = require("../reservoir/reservoir.controller");
const {clearHydrometeorologyStationsCache} = require("../hydrometeorology/hydrometeorology.controller");
const {clearSearchCache} = require("../search/getSearch.controller");
const {ensureStationColumns, getDynamicStationMapping, dropStationColumns} = require("../../utils/dynamicStationColumns");

// Cot "Ngày" cua KhiTuong/ThuyVan la TEXT dang M/D/YYYY -> luon doi sang date bang TO_DATE (khong
// dung ::date vi ket qua phu thuoc DateStyle cua server).
const TEXT_DATE_EXPR = `TO_DATE("Ngày", 'MM/DD/YYYY')`;

// Truong thuoc tinh ngoai ten/toa do - rong -> NULL thay vi chuoi rong.
const readOptionalText = (value) => {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
};

const KHITUONG = {
  table: "KhiTuong",
  dateExpr: TEXT_DATE_EXPR,
  // Gia tri ghi vao cot "Ngày" khi them dong moi - giu dung dinh dang M/D/YYYY cua du lieu cu.
  dateInsertExpr: (param) => `TO_CHAR(${param}::date, 'FMMM/FMDD/YYYY')`,
  valueAsText: true,
  touchUpdatedAt: false,
};
const THUYVAN = {...KHITUONG, table: "ThuyVan"};
const TONGLUONGXA = {
  table: "TongLuongXa",
  dateExpr: `"Ngày"`,
  dateInsertExpr: (param) => `${param}::date`,
  valueAsText: false,
  touchUpdatedAt: true,
};

const STATION_META_KTTV = {table: "TramKTTV", nameCol: "TenTram"};

const LAYERS = {
  rain: {
    ...KHITUONG,
    label: "Điểm đo mưa",
    stationMeta: STATION_META_KTTV,
    fields: [{key: "R", label: "Lượng mưa", type: "number", min: 0}],
    stations: {
      AP: {R: "R_AP"},
      BC: {R: "R_BC"},
      CG: {R: "R_CG"},
      CL: {R: "R_CL"},
      CC: {R: "R_CC"},
      HM: {R: "R_HM"},
      LMX: {R: "R_LMX"},
      LS: {R: "R_LS"},
      PVC: {R: "R_PVC"},
      TTH: {R: "R_TTH"},
      TD: {R: "R_TD"},
    },
  },
  meteo: {
    ...KHITUONG,
    label: "Trạm khí tượng",
    stationMeta: STATION_META_KTTV,
    fields: [
      {key: "R", label: "Lượng mưa", type: "number", min: 0},
      {key: "Ttb", label: "Nhiệt độ trung bình", type: "number"},
      {key: "Tx", label: "Nhiệt độ cao nhất", type: "number"},
      {key: "Tm", label: "Nhiệt độ thấp nhất", type: "number"},
    ],
    order: {low: "Tm", mid: "Ttb", high: "Tx", name: "nhiệt độ"},
    stations: {
      MDC: {R: "R_MDC", Ttb: "Ttb_MDC", Tx: "Tx_MDC", Tm: "Tm_MDC"},
      NB_KT: {R: "R_NB", Ttb: "Ttb_NB", Tx: "Tx_NB", Tm: "Tm_NB"},
      TSH: {R: "R_TSH", Ttb: "Ttb_TSH", Tx: "Tx_TSH", Tm: "Tm_TSH"},
    },
  },
  hydro: {
    ...THUYVAN,
    label: "Trạm thủy văn",
    stationMeta: STATION_META_KTTV,
    fields: [
      {key: "Htb", label: "Mực nước trung bình", type: "number"},
      {key: "Hx", label: "Mực nước cao nhất", type: "number"},
      {key: "Hm", label: "Mực nước thấp nhất", type: "number"},
    ],
    order: {low: "Hm", mid: "Htb", high: "Hx", name: "mực nước"},
    stations: {
      NB_TV: {Htb: "Htb_NB", Hx: "Hx_NB", Hm: "Hm_NB"},
      PA: {Htb: "Htb_PA", Hx: "Hx_PA", Hm: "Hm_PA"},
    },
  },
  reservoir: {
    ...TONGLUONGXA,
    label: "Hồ chứa thượng lưu",
    stationMeta: {table: "HoChua", nameCol: "TenHo"},
    fields: [
      {key: "TongLuongXa", label: "Tổng lượng xả", type: "number", min: 0},
      {key: "NguonDuLieu", label: "Nguồn dữ liệu", type: "text"},
    ],
    stations: {
      HDT: {TongLuongXa: "HDT", NguonDuLieu: "NguonDuLieu_HDT"},
      HTA: {TongLuongXa: "HTA", NguonDuLieu: "NguonDuLieu_HTA"},
    },
  },
};

const MAX_PAGE_SIZE = 5000;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const numberFields = (layer) => layer.fields.filter((f) => f.type === "number");

// Kieu cot SQL that khi ALTER TABLE them cot cho 1 tram MOI - khop dung kieu cac cot cung hien co:
// KhiTuong/ThuyVan luu moi gia tri (ke ca so) duoi dang "character varying"; TongLuongXa luu so
// dang NUMERIC, van ban (nguon du lieu) dang TEXT.
const sqlTypeForField = (layer, field) => {
  if (field.type === "text") return "TEXT";
  return layer.valueAsText ? "VARCHAR" : "NUMERIC";
};

// Mapping hop nhat {KiHieu: {fieldKey: columnName}} cua 1 layer - gom stations CUNG (hardcoded
// trong LAYERS) + stations DONG (tram moi, tra tu hochiminh."TramMoiCot"). Tu day ve sau, moi ham
// deu di qua mapping nay nen khong con phan biet "tram cu/tram moi" trong luong xu ly.
const getMergedStations = async (layer, layerKey) => {
  const dynamic = await getDynamicStationMapping(layerKey);
  return {...layer.stations, ...dynamic};
};

// Cac cot SO cua 1 tram - 1 (tram, ngay) duoc coi la "co ban ghi" khi it nhat 1 cot nay khac NULL.
const stationNumberColumns = (layer, code, stationsMap) =>
  numberFields(layer)
    .map((f) => stationsMap[code][f.key])
    .filter(Boolean);

const stationAllColumns = (layer, code, stationsMap) => layer.fields.map((f) => stationsMap[code][f.key]).filter(Boolean);

const hasDataSql = (layer, code, stationsMap) =>
  stationNumberColumns(layer, code, stationsMap)
    .map((col) => `"${col}" IS NOT NULL`)
    .join(" OR ");

const isEmptySql = (layer, code, stationsMap) =>
  stationNumberColumns(layer, code, stationsMap)
    .map((col) => `"${col}" IS NULL`)
    .join(" AND ");

// Tat ca cot DU LIEU cua 1 bang rong (tru "Ngày"/created_at/updated_at) - doc truc tiep tu
// information_schema de luon dung du voi moi tram (cung + dong), dung de xoa han dong khi sau khi
// go 1 tram thi ca dong khong con so lieu nao.
const NON_DATA_COLUMNS = new Set(["Ngày", "created_at", "updated_at"]);
const tableDataColumns = async (table) => {
  const result = await QueryDatabase(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'hochiminh' AND table_name = $1`,
    [table],
  );
  return result.rows.map((row) => row.column_name).filter((col) => !NON_DATA_COLUMNS.has(col));
};

// Bang RONG -> dang DAI: moi tram 1 nhanh SELECT (chi lay ngay tram do co so lieu), UNION ALL.
const buildLongSql = (layer, codes, stationsMap) =>
  codes
    .map((code) => {
      const mapping = stationsMap[code];
      const cols = layer.fields
        .map((f) => (mapping[f.key] ? `"${mapping[f.key]}"::text AS "${f.key}"` : `NULL::text AS "${f.key}"`))
        .join(", ");
      return `SELECT ${layer.dateExpr} AS d, '${code}'::text AS "KiHieu", ${cols}
              FROM hochiminh."${layer.table}" WHERE ${hasDataSql(layer, code, stationsMap)}`;
    })
    .join("\nUNION ALL\n");

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const formatRow = (layer, row, nameByCode) => {
  const out = {Ngay: row.Ngay, KiHieu: row.KiHieu, Ten: nameByCode[row.KiHieu] || row.KiHieu};
  layer.fields.forEach((f) => {
    out[f.key] = f.type === "number" ? toNumberOrNull(row[f.key]) : (row[f.key] ?? null);
  });
  return out;
};

// Cot thuoc tinh ngoai ten/toa do - "TramKTTV" co them "PhanLoai", "HoChua" thi khong (bang khac cau
// truc, khong co cot nay).
const extraMetaColumns = (table) =>
  table === "HoChua" ? ["YeuTo", "ThoiGian", "TanSuat"] : ["PhanLoai", "YeuTo", "ThoiGian", "TanSuat"];

// Metadata (ten/toa do/thuoc tinh) cua danh sach "codes" cho truoc - dung chung cho ca tram cung
// lan tram dong, vi ca 2 deu co 1 dong trong bang metadata that (TramKTTV/HoChua).
const getStationMeta = async (layer, codes) => {
  if (codes.length === 0) return {};
  const {table, nameCol} = layer.stationMeta;
  const extraCols = extraMetaColumns(table)
    .map((col) => `, "${col}"`)
    .join("");
  const result = await QueryDatabase(
    `SELECT "KiHieu", "${nameCol}" AS "Ten", "KinhDo", "ViDo"${extraCols} FROM hochiminh."${table}"
     WHERE "KiHieu" = ANY($1) AND "deleted_at" IS NULL`,
    [codes],
  );
  const byCode = {};
  result.rows.forEach((row) => {
    byCode[row.KiHieu] = row;
  });
  return byCode;
};

const todayVN = () => new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Ho_Chi_Minh"}).format(new Date());

const isValidIsoDate = (value) => {
  if (typeof value !== "string" || !ISO_DATE_REGEX.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

const formatDisplayDate = (iso) => iso.split("-").reverse().join("/");

const resolveLayer = (req, reply) => {
  const layer = LAYERS[req.params.layer];
  if (!layer) {
    reply.code(400).send({code: 400, message: "Lớp dữ liệu không hợp lệ"});
    return null;
  }
  return layer;
};

// Doc + kiem tra cac gia tri gui len cho 1 tram. Tra ve {values} (chi gom truong DUOC GUI, da chuan
// hoa) hoac {error}. Truong tram khong ho tro (vd nhiet do o tram chi do mua) bi bo qua.
const readValues = (mapping, layer, body) => {
  const values = {};
  for (const field of layer.fields) {
    if (!mapping[field.key] || body[field.key] === undefined) continue;
    const raw = body[field.key];

    if (field.type === "text") {
      const text = raw === null ? "" : String(raw).trim();
      values[field.key] = text === "" ? null : text;
      continue;
    }

    if (raw === null || raw === "") {
      values[field.key] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return {error: `${field.label} phải là số`};
    if (field.min !== undefined && n < field.min) return {error: `${field.label} không được nhỏ hơn ${field.min}`};
    values[field.key] = n;
  }
  return {values};
};

// Thap nhat <= trung binh <= cao nhat (nhiet do / muc nuoc) tren bo gia tri CUOI CUNG cua ban ghi.
const checkOrder = (layer, finalValues) => {
  if (!layer.order) return null;
  const {low, mid, high, name} = layer.order;
  const lo = finalValues[low];
  const mi = finalValues[mid];
  const hi = finalValues[high];
  const bad = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && a > b;
  if (bad(lo, mi) || bad(mi, hi) || bad(lo, hi)) {
    return `Giá trị ${name} không hợp lệ: thấp nhất ≤ trung bình ≤ cao nhất`;
  }
  return null;
};

const toDbValue = (layer, field, value) => {
  if (value === null || value === undefined) return null;
  return field.type === "number" && layer.valueAsText ? String(value) : value;
};

const afterWrite = (layer) => {
  if (layer.table === "TongLuongXa") clearReservoirCache();
};

// GET /api/station-data/:layer/stations - danh sach tram cua lop + toa do + khoang ngay co so lieu.
const GetStationDataStations = async (req, reply) => {
  try {
    const layer = resolveLayer(req, reply);
    if (!layer) return;

    const stationsMap = await getMergedStations(layer, req.params.layer);
    const codes = Object.keys(stationsMap);

    const [meta, rangeResult] = await Promise.all([
      getStationMeta(layer, codes),
      codes.length
        ? QueryDatabase(
            `SELECT "KiHieu", TO_CHAR(MIN(d), 'YYYY-MM-DD') AS min_date, TO_CHAR(MAX(d), 'YYYY-MM-DD') AS max_date,
                    COUNT(*) AS total
             FROM (${buildLongSql(layer, codes, stationsMap)}) t GROUP BY "KiHieu"`,
          )
        : {rows: []},
    ]);
    const rangeByCode = {};
    rangeResult.rows.forEach((row) => {
      rangeByCode[row.KiHieu] = row;
    });

    const extraCols = extraMetaColumns(layer.stationMeta.table);
    const data = codes
      // Meta da bi xoa mem (khong con trong ket qua getStationMeta) thi an luon, khong hien voi
      // ten mac dinh = ma tram.
      .filter((code) => meta[code])
      .map((code) => ({
        KiHieu: code,
        Ten: meta[code]?.Ten || code,
        KinhDo: meta[code]?.KinhDo || null,
        ViDo: meta[code]?.ViDo || null,
        ...Object.fromEntries(extraCols.map((col) => [col, meta[code]?.[col] ?? null])),
        fields: layer.fields.filter((f) => stationsMap[code][f.key]).map((f) => f.key),
        minDate: rangeByCode[code]?.min_date || null,
        maxDate: rangeByCode[code]?.max_date || null,
        total: parseInt(rangeByCode[code]?.total || 0),
        isCustom: !layer.stations[code],
      }))
      .sort((a, b) => a.Ten.localeCompare(b.Ten, "vi"));

    return reply.code(200).send({code: 200, data});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// GET /api/station-data/:layer?kihieu=&startDate=&endDate=&page=&limit=&pivot=
// pivot=1: moi NGAY 1 dong, gia tri cac tram gom trong "values" ({[KiHieu]: {truong: gia tri}}) -
// dung cho bang hien thi moi tram 1 cot (vd ho chua); phan trang khi do tinh theo so ngay.
const GetStationDataList = async (req, reply) => {
  try {
    const layer = resolveLayer(req, reply);
    if (!layer) return;

    const {kihieu, startDate, endDate, page = 1, limit = 50, pivot} = req.query;
    const isPivot = pivot === "1" || pivot === "true";
    const stationsMap = await getMergedStations(layer, req.params.layer);
    if (kihieu && !stationsMap[kihieu]) {
      return reply.code(400).send({code: 400, message: "Ký hiệu không hợp lệ"});
    }
    if ((startDate && !isValidIsoDate(startDate)) || (endDate && !isValidIsoDate(endDate))) {
      return reply.code(400).send({code: 400, message: "Ngày lọc không hợp lệ (YYYY-MM-DD)"});
    }

    const limitVal = Math.min(Math.max(parseInt(limit) || 50, 1), MAX_PAGE_SIZE);
    const pageVal = Math.max(parseInt(page) || 1, 1);
    const offsetVal = (pageVal - 1) * limitVal;

    const codes = kihieu ? [kihieu] : Object.keys(stationsMap);
    const where = [];
    const params = [];
    if (kihieu) {
      params.push(kihieu);
      where.push(`"KiHieu" = $${params.length}`);
    }
    if (startDate) {
      params.push(startDate);
      where.push(`d >= $${params.length}::date`);
    }
    if (endDate) {
      params.push(endDate);
      where.push(`d <= $${params.length}::date`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const longSql = codes.length
      ? buildLongSql(layer, codes, stationsMap)
      : `SELECT NULL::date AS d, NULL::text AS "KiHieu" WHERE FALSE`;
    const fieldCols = layer.fields.map((f) => `"${f.key}"`).join(", ");

    if (isPivot) {
      const jsonFields = layer.fields.map((f) => `'${f.key}', "${f.key}"`).join(", ");
      const [pivotResult, pivotCount] = await Promise.all([
        QueryDatabase(
          `SELECT TO_CHAR(d, 'YYYY-MM-DD') AS "Ngay", json_object_agg("KiHieu", json_build_object(${jsonFields})) AS values
           FROM (${longSql}) t ${whereSql}
           GROUP BY d ORDER BY d DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limitVal, offsetVal],
        ),
        QueryDatabase(`SELECT COUNT(DISTINCT d) AS total FROM (${longSql}) t ${whereSql}`, params),
      ]);
      const pivotTotal = parseInt(pivotCount.rows[0]?.total || 0);
      const data = pivotResult.rows.map((row) => {
        const values = {};
        Object.keys(row.values || {}).forEach((code) => {
          values[code] = {};
          layer.fields.forEach((f) => {
            const raw = row.values[code][f.key];
            values[code][f.key] = f.type === "number" ? toNumberOrNull(raw) : (raw ?? null);
          });
        });
        return {Ngay: row.Ngay, values};
      });
      return reply.code(200).send({
        code: 200,
        data,
        pagination: {page: pageVal, limit: limitVal, total: pivotTotal, totalPages: Math.ceil(pivotTotal / limitVal)},
      });
    }

    const [dataResult, countResult, meta] = await Promise.all([
      QueryDatabase(
        `SELECT TO_CHAR(d, 'YYYY-MM-DD') AS "Ngay", "KiHieu", ${fieldCols}
         FROM (${longSql}) t ${whereSql}
         ORDER BY d DESC, "KiHieu" ASC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limitVal, offsetVal],
      ),
      QueryDatabase(`SELECT COUNT(*) AS total FROM (${longSql}) t ${whereSql}`, params),
      getStationMeta(layer, codes),
    ]);

    const nameByCode = {};
    Object.keys(meta).forEach((code) => {
      nameByCode[code] = meta[code].Ten;
    });
    const total = parseInt(countResult.rows[0]?.total || 0);

    return reply.code(200).send({
      code: 200,
      data: dataResult.rows.map((row) => formatRow(layer, row, nameByCode)),
      pagination: {page: pageVal, limit: limitVal, total, totalPages: Math.ceil(total / limitVal)},
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// Kiem tra phan chung cua body (tram + ngay) cho POST/PUT.
const readKey = (stationsMap, body, reply) => {
  const {KiHieu, Ngay} = body || {};
  if (!KiHieu || !Ngay) {
    reply.code(400).send({code: 400, message: "Thiếu trạm hoặc ngày"});
    return null;
  }
  if (!stationsMap[KiHieu]) {
    reply.code(400).send({code: 400, message: "Ký hiệu không hợp lệ"});
    return null;
  }
  if (!isValidIsoDate(Ngay)) {
    reply.code(400).send({code: 400, message: "Ngày không hợp lệ (YYYY-MM-DD)"});
    return null;
  }
  if (Ngay > todayVN()) {
    reply.code(400).send({code: 400, message: "Không được nhập ngày trong tương lai"});
    return null;
  }
  return {KiHieu, Ngay};
};

// POST /api/station-data/:layer  body: {KiHieu, Ngay: "YYYY-MM-DD", ...gia tri}
const CreateStationData = async (req, reply) => {
  try {
    const layer = resolveLayer(req, reply);
    if (!layer) return;
    const stationsMap = await getMergedStations(layer, req.params.layer);
    const key = readKey(stationsMap, req.body, reply);
    if (!key) return;
    const {KiHieu, Ngay} = key;
    const mapping = stationsMap[KiHieu];

    const {values, error} = readValues(mapping, layer, req.body);
    if (error) return reply.code(400).send({code: 400, message: error});

    const hasNumber = numberFields(layer).some((f) => values[f.key] !== null && values[f.key] !== undefined);
    if (!hasNumber) {
      return reply.code(400).send({code: 400, message: "Cần nhập ít nhất một giá trị đo"});
    }
    const orderError = checkOrder(layer, values);
    if (orderError) return reply.code(400).send({code: 400, message: orderError});

    // Ghi du moi cot cua tram (truong khong gui -> NULL) de ban ghi moi khong "thua huong" gia tri cu.
    const writeFields = layer.fields.filter((f) => mapping[f.key]);
    const writeValues = writeFields.map((f) => toDbValue(layer, f, values[f.key]));
    const setSql = writeFields.map((f, i) => `"${mapping[f.key]}" = $${i + 2}`).join(", ");
    const touchSql = layer.touchUpdatedAt ? `, updated_at = CURRENT_TIMESTAMP` : "";

    // Chi dien vao dong cua ngay nay KHI tram chua co so lieu (dieu kien nam ngay trong UPDATE nen
    // 2 yeu cau dong thoi khong the cung "thang").
    const fillExistingRow = () =>
      QueryDatabase(
        `UPDATE hochiminh."${layer.table}" SET ${setSql}${touchSql}
         WHERE ${layer.dateExpr} = $1::date AND (${isEmptySql(layer, KiHieu, stationsMap)})`,
        [Ngay, ...writeValues],
      );

    const duplicate = () =>
      reply.code(409).send({
        code: 409,
        message: `Đã có dữ liệu của ${layer.label.toLowerCase()} ${KiHieu} ngày ${formatDisplayDate(Ngay)}. Mỗi trạm chỉ có một bản ghi cho mỗi ngày - hãy dùng "Sửa" để cập nhật.`,
      });

    let filled = await fillExistingRow();
    if (filled.rowCount === 0) {
      const dayRow = await QueryDatabase(`SELECT 1 FROM hochiminh."${layer.table}" WHERE ${layer.dateExpr} = $1::date LIMIT 1`, [
        Ngay,
      ]);
      if (dayRow.rowCount > 0) return duplicate();

      const insertCols = [`"Ngày"`, ...writeFields.map((f) => `"${mapping[f.key]}"`)].join(", ");
      const insertVals = [layer.dateInsertExpr("$1"), ...writeFields.map((_, i) => `$${i + 2}`)].join(", ");
      try {
        await QueryDatabase(`INSERT INTO hochiminh."${layer.table}" (${insertCols}) VALUES (${insertVals})`, [
          Ngay,
          ...writeValues,
        ]);
      } catch (insertError) {
        // Yeu cau khac vua tao dong cua ngay nay (trung khoa duy nhat) -> thu dien vao dong do.
        if (insertError.code !== "23505") throw insertError;
        filled = await fillExistingRow();
        if (filled.rowCount === 0) return duplicate();
      }
    }

    afterWrite(layer);
    return reply.code(201).send({code: 201, message: "Thêm bản ghi thành công", data: {KiHieu, Ngay, ...values}});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// PUT /api/station-data/:layer  body: {KiHieu, Ngay, ...gia tri can sua}
// (tram + ngay la khoa cua ban ghi nen khong doi duoc - muon chuyen ngay thi xoa roi them moi).
const UpdateStationData = async (req, reply) => {
  try {
    const layer = resolveLayer(req, reply);
    if (!layer) return;
    const stationsMap = await getMergedStations(layer, req.params.layer);
    const key = readKey(stationsMap, req.body, reply);
    if (!key) return;
    const {KiHieu, Ngay} = key;
    const mapping = stationsMap[KiHieu];

    const {values, error} = readValues(mapping, layer, req.body);
    if (error) return reply.code(400).send({code: 400, message: error});

    const selectCols = layer.fields
      .filter((f) => mapping[f.key])
      .map((f) => `"${mapping[f.key]}"::text AS "${f.key}"`)
      .join(", ");
    const existing = await QueryDatabase(
      `SELECT ${selectCols} FROM hochiminh."${layer.table}"
       WHERE ${layer.dateExpr} = $1::date AND (${hasDataSql(layer, KiHieu, stationsMap)}) LIMIT 1`,
      [Ngay],
    );
    if (existing.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy bản ghi"});
    }

    // Truong khong gui len thi giu nguyen gia tri cu.
    const finalValues = {};
    layer.fields
      .filter((f) => mapping[f.key])
      .forEach((f) => {
        const oldValue = f.type === "number" ? toNumberOrNull(existing.rows[0][f.key]) : existing.rows[0][f.key];
        finalValues[f.key] = values[f.key] !== undefined ? values[f.key] : oldValue;
      });

    const hasNumber = numberFields(layer).some((f) => finalValues[f.key] !== null && finalValues[f.key] !== undefined);
    if (!hasNumber) {
      return reply.code(400).send({code: 400, message: 'Cần giữ ít nhất một giá trị đo - dùng "Xóa" nếu muốn gỡ bản ghi'});
    }
    const orderError = checkOrder(layer, finalValues);
    if (orderError) return reply.code(400).send({code: 400, message: orderError});

    const writeFields = layer.fields.filter((f) => mapping[f.key] && values[f.key] !== undefined);
    if (writeFields.length === 0) {
      return reply.code(400).send({code: 400, message: "Không có dữ liệu để cập nhật"});
    }
    const setSql = writeFields.map((f, i) => `"${mapping[f.key]}" = $${i + 2}`).join(", ");
    const touchSql = layer.touchUpdatedAt ? `, updated_at = CURRENT_TIMESTAMP` : "";
    await QueryDatabase(
      `UPDATE hochiminh."${layer.table}" SET ${setSql}${touchSql}
       WHERE ${layer.dateExpr} = $1::date AND (${hasDataSql(layer, KiHieu, stationsMap)})`,
      [Ngay, ...writeFields.map((f) => toDbValue(layer, f, values[f.key]))],
    );

    afterWrite(layer);
    return reply.code(200).send({code: 200, message: "Cập nhật thành công", data: {KiHieu, Ngay, ...finalValues}});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// DELETE /api/station-data/:layer?kihieu=&date=YYYY-MM-DD
// Go so lieu cua 1 tram trong 1 ngay; neu sau do ca dong (moi tram) khong con so lieu thi xoa dong.
const DeleteStationData = async (req, reply) => {
  try {
    const layer = resolveLayer(req, reply);
    if (!layer) return;

    const {kihieu, date} = req.query;
    const stationsMap = await getMergedStations(layer, req.params.layer);
    if (!kihieu || !stationsMap[kihieu]) {
      return reply.code(400).send({code: 400, message: "Ký hiệu không hợp lệ"});
    }
    if (!isValidIsoDate(date)) {
      return reply.code(400).send({code: 400, message: "Ngày không hợp lệ (YYYY-MM-DD)"});
    }

    const clearSql = stationAllColumns(layer, kihieu, stationsMap)
      .map((col) => `"${col}" = NULL`)
      .join(", ");
    const touchSql = layer.touchUpdatedAt ? `, updated_at = CURRENT_TIMESTAMP` : "";
    const cleared = await QueryDatabase(
      `UPDATE hochiminh."${layer.table}" SET ${clearSql}${touchSql}
       WHERE ${layer.dateExpr} = $1::date AND (${hasDataSql(layer, kihieu, stationsMap)})`,
      [date],
    );
    if (cleared.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy bản ghi"});
    }

    const dataColumns = await tableDataColumns(layer.table);
    const allEmptySql = dataColumns.map((col) => `"${col}" IS NULL`).join(" AND ");
    await QueryDatabase(`DELETE FROM hochiminh."${layer.table}" WHERE ${layer.dateExpr} = $1::date AND ${allEmptySql}`, [date]);

    afterWrite(layer);
    return reply.code(200).send({code: 200, message: "Xóa bản ghi thành công"});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// POST /api/station-data/:layer/stations - them 1 VI TRI MOI (chi ten + toa do) cho layer nay.
// Ghi vao dung bang metadata that (TramKTTV dung chung mua/khi tuong/thuy van, hoac HoChua rieng
// cho ho chua) nen hien ngay tren ban do (cac API /hydrometeorology-stations, /reservoir-points
// deu SELECT toan bo bang, khong loc theo danh sach cung). Ngay sau do, cap COT THAT cho tram nay
// trong bang rong (ALTER TABLE) + ghi mapping vao hochiminh."TramMoiCot" - tu day tram duoc doc/ghi
// y het tram cung (xem getMergedStations).
const CreateStationMeta = async (req, reply) => {
  try {
    const layer = resolveLayer(req, reply);
    if (!layer) return;

    const KiHieu = String(req.body?.KiHieu || "").trim();
    const Ten = String(req.body?.Ten || "").trim();
    const KinhDo = String(req.body?.KinhDo || "").trim();
    const ViDo = String(req.body?.ViDo || "").trim();
    if (!KiHieu || !Ten || !KinhDo || !ViDo) {
      return reply.code(400).send({code: 400, message: "Thiếu ký hiệu, tên hoặc toạ độ"});
    }

    const {table, nameCol} = layer.stationMeta;
    const extraCols = extraMetaColumns(table);
    const extraValues = extraCols.map((col) => readOptionalText(req.body?.[col]));

    const existing = await QueryDatabase(`SELECT 1 FROM hochiminh."${table}" WHERE "KiHieu" = $1 AND "deleted_at" IS NULL`, [
      KiHieu,
    ]);
    if (existing.rowCount > 0) {
      return reply.code(409).send({code: 409, message: `Ký hiệu "${KiHieu}" đã tồn tại`});
    }

    const cols = [`"KiHieu"`, `"${nameCol}"`, `"KinhDo"`, `"ViDo"`, ...extraCols.map((col) => `"${col}"`)];
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    try {
      await QueryDatabase(`INSERT INTO hochiminh."${table}" (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`, [
        KiHieu,
        Ten,
        KinhDo,
        ViDo,
        ...extraValues,
      ]);
    } catch (insertError) {
      if (insertError.code === "23505") return reply.code(409).send({code: 409, message: "Ký hiệu đã tồn tại"});
      throw insertError;
    }

    try {
      await ensureStationColumns({
        table: layer.table,
        layerKey: req.params.layer,
        code: KiHieu,
        fields: layer.fields.map((f) => ({key: f.key, sqlType: sqlTypeForField(layer, f)})),
      });
    } catch (columnError) {
      // KiHieu chua ky tu khong hop le de dat ten cot - rollback metadata vua tao de khong de lai
      // vi tri "mo coi" (co metadata nhung khong co cho nhap so lieu).
      await QueryDatabase(`DELETE FROM hochiminh."${table}" WHERE "KiHieu" = $1`, [KiHieu]);
      return reply.code(400).send({code: 400, message: columnError.message});
    }

    if (table === "TramKTTV") clearHydrometeorologyStationsCache();
    else if (table === "HoChua") clearReservoirCache();
    clearSearchCache();

    return reply.code(201).send({
      code: 201,
      message: "Thêm vị trí thành công",
      data: {KiHieu, Ten, KinhDo, ViDo, ...Object.fromEntries(extraCols.map((col, i) => [col, extraValues[i]]))},
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// PUT /api/station-data/:layer/stations/:code - sua thuoc tinh (ten/toa do/phan loai/yeu to/thoi
// gian/tan suat) 1 tram (ap dung ca tram cu lan tram moi - khong doi "KiHieu" nen khong anh huong
// mapping cot cua tram).
const UpdateStationMeta = async (req, reply) => {
  try {
    const layer = resolveLayer(req, reply);
    if (!layer) return;

    const code = String(req.params?.code || "").trim();
    const Ten = String(req.body?.Ten || "").trim();
    const KinhDo = String(req.body?.KinhDo || "").trim();
    const ViDo = String(req.body?.ViDo || "").trim();
    if (!code || !Ten || !KinhDo || !ViDo) {
      return reply.code(400).send({code: 400, message: "Thiếu tên hoặc toạ độ"});
    }

    const {table, nameCol} = layer.stationMeta;
    const extraCols = extraMetaColumns(table);
    const extraValues = extraCols.map((col) => readOptionalText(req.body?.[col]));
    const setSql = [`"${nameCol}" = $2`, `"KinhDo" = $3`, `"ViDo" = $4`, ...extraCols.map((col, i) => `"${col}" = $${i + 5}`)];
    const updatedByParam = extraValues.length + 5;
    const result = await QueryDatabase(
      `UPDATE hochiminh."${table}" SET ${setSql.join(", ")}, "updated_at" = now(), "updated_by" = $${updatedByParam}
       WHERE "KiHieu" = $1 AND "deleted_at" IS NULL`,
      [code, Ten, KinhDo, ViDo, ...extraValues, req.user?.email || null],
    );
    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy vị trí"});
    }

    if (table === "TramKTTV") clearHydrometeorologyStationsCache();
    else if (table === "HoChua") clearReservoirCache();
    clearSearchCache();

    return reply.code(200).send({
      code: 200,
      message: "Cập nhật thành công",
      data: {KiHieu: code, Ten, KinhDo, ViDo, ...Object.fromEntries(extraCols.map((col, i) => [col, extraValues[i]]))},
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// DELETE /api/station-data/:layer/stations/:code - XOA MEM (set deleted_at), ap dung cho MOI vi tri
// (ca tram co cot cung lan tram cot dong) - khong con rang buoc rieng cho tram cu, vi xoa mem khong
// dong cham toi cot/du lieu trong bang rong, chi an vi tri khoi cac danh sach/ban do (deu da loc
// "deleted_at IS NULL"). Cot/mapping dong (TramMoiCot) duoc GIU NGUYEN de khong mat du lieu da nhap -
// go han cot thuoc pham vi "xoa han" (HardDeleteStationMeta) chu khong phai xoa mem.
const DeleteStationMeta = async (req, reply) => {
  try {
    const layer = resolveLayer(req, reply);
    if (!layer) return;

    const code = String(req.params?.code || "").trim();
    const {table} = layer.stationMeta;
    const result = await QueryDatabase(
      `UPDATE hochiminh."${table}" SET "deleted_at" = now() WHERE "KiHieu" = $1 AND "deleted_at" IS NULL`,
      [code],
    );
    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy vị trí"});
    }

    if (table === "TramKTTV") clearHydrometeorologyStationsCache();
    else if (table === "HoChua") clearReservoirCache();
    clearSearchCache();

    return reply.code(200).send({code: 200, message: "Xoá vị trí thành công"});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// DELETE /api/station-data/:layer/stations/:code/hard - XOA HAN, tach rieng khoi "Xoá" thong thuong
// (DeleteStationMeta - xoa mem) - chi dung khi thuc su can don han. "KiHieu" cua TramKTTV/HoChua
// khong co FK tham chieu toi nen xoa an toan. Neu code la tram MOI (co cot dong trong TramMoiCot) -
// go luon cac cot that da ALTER TABLE them rieng cho tram nay (dropStationColumns), khong anh huong
// tram khac; tram co san (hardcoded trong LAYERS.stations) khong co dong nao trong TramMoiCot nen
// buoc nay khong lam gi (an toan, khong vo tinh xoa cot dung chung).
const HardDeleteStationMeta = async (req, reply) => {
  try {
    const layer = resolveLayer(req, reply);
    if (!layer) return;

    const code = String(req.params?.code || "").trim();
    const {table} = layer.stationMeta;
    const result = await QueryDatabase(`DELETE FROM hochiminh."${table}" WHERE "KiHieu" = $1`, [code]);
    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy vị trí"});
    }

    await dropStationColumns({table: layer.table, layerKey: req.params.layer, code});

    if (table === "TramKTTV") clearHydrometeorologyStationsCache();
    else if (table === "HoChua") clearReservoirCache();
    clearSearchCache();

    return reply.code(200).send({code: 200, message: "Xoá hẳn vị trí thành công"});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

module.exports = {
  GetStationDataStations,
  GetStationDataList,
  CreateStationData,
  UpdateStationData,
  DeleteStationData,
  CreateStationMeta,
  UpdateStationMeta,
  DeleteStationMeta,
  HardDeleteStationMeta,
};
