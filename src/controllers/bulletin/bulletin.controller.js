const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const NodeCache = require("node-cache");
const {FORECAST_ALL_VALUE_COLUMNS} = require("../../configs/forecastStations");
const {toIsoWithOffset} = require("../../utils/forecastTime");
const {normalizeDateExpr} = require("../hydrometeorology/hydrometeorology.controller");
const {loadAllStations} = require("../administrative/administrativeSummary.controller");

// Bản sơ bộ: bản tin được dựng trực tiếp từ số liệu quan trắc/dự báo mỗi lần xem (không lưu bảng riêng),
// chỉ phần đăng ký nhận bản tin là lưu vào public.bulletin_subscriptions.
const dataCache = new NodeCache({stdTTL: 600, checkperiod: 120});

const TARGET_TYPES = ["salinity", "iot", "huyen"];
const WARNING_START_DAY = "2024-01-01";
const FORECAST_ISSUED_AFTER = "2026-09-11";
const HYDROLOGY_WINDOW_DAYS = 7;
const NEAREST_IOT_COUNT = 3;
const MAX_BULLETINS = 500;
// Trạm thủy văn dùng cho "hiện trạng thủy văn" của điểm đo mặn
const REFERENCE_HYDRO_STATIONS = [
  {name: "Phú An", mean: "Htb_PA", max: "Hx_PA", min: "Hm_PA"},
  {name: "Nhà Bè", mean: "Htb_NB", max: "Hx_NB", min: "Hm_NB"},
];

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
};

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

const addDays = (day, amount) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};

// Cùng quy tắc với frontend common/salinityClassification.js (getSingleStationClassification)
const classifyRisk = (value, stationCode) => {
  if (value === null) return {level: null, label: "Khuyết số liệu"};
  if (value < 1) return {level: 0, label: "Bình thường"};
  const isNhaBe = stationCode === "MNB";
  if (value <= 4) return isNhaBe ? {level: 1, label: "Rủi ro cấp 1"} : {level: 2, label: "Rủi ro cấp 2"};
  return isNhaBe ? {level: 2, label: "Rủi ro cấp 2"} : {level: 3, label: "Rủi ro cấp 3"};
};

const distanceKm = (a, b) => {
  const toRad = (degree) => (degree * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

// Điểm đo mặn + trạm IoT kèm huyện chứa nó
const loadBulletinStations = async () => {
  const cached = dataCache.get("stations");
  if (cached) return cached;

  const stations = (await loadAllStations()).filter((station) => ["salinity", "iot"].includes(station.type));
  const result = await QueryDatabase(
    `SELECT p.idx, h."maHuyen", h."tenHuyen"
     FROM unnest($1::float8[], $2::float8[]) WITH ORDINALITY AS p(lng, lat, idx)
     JOIN hochiminh."DiaPhanHuyen" h
       ON ST_Contains(h.geom, ST_SetSRID(ST_MakePoint(p.lng, p.lat), ST_SRID(h.geom)))`,
    [stations.map((station) => station.lng), stations.map((station) => station.lat)],
  );
  const districtByIndex = new Map(result.rows.map((row) => [Number(row.idx) - 1, row]));

  const withDistrict = stations.map((station, index) => ({
    ...station,
    maHuyen: districtByIndex.get(index)?.maHuyen || null,
    tenHuyen: districtByIndex.get(index)?.tenHuyen || null,
  }));
  dataCache.set("stations", withDistrict);
  return withDistrict;
};

const loadObservedSalinityByDay = async (columns) => {
  if (columns.length === 0) return [];
  const cacheKey = `doman_${columns.join("_")}`;
  const cached = dataCache.get(cacheKey);
  if (cached) return cached;

  const result = await QueryDatabase(
    `SELECT TO_CHAR("Ngày", 'YYYY-MM-DD') AS day, ${columns.map((column) => `"${column}"`).join(", ")}
     FROM hochiminh."DoMan"
     WHERE "Ngày" >= $1::date - ${HYDROLOGY_WINDOW_DAYS}
     ORDER BY "Ngày" DESC`,
    [WARNING_START_DAY],
  );
  dataCache.set(cacheKey, result.rows);
  return result.rows;
};

// serial -> Map(day -> {salt, waterMean, waterMax, waterMin, waterUnit}); ngày = 00:01-24:00
const loadIotDaily = async () => {
  const cached = dataCache.get("iot_daily");
  if (cached) return cached;

  const result = await QueryDatabase(
    `SELECT serial_number,
            TO_CHAR((date_time - interval '1 second')::date, 'YYYY-MM-DD') AS day,
            AVG(salt_value) AS salt,
            AVG(distance_value) AS water_mean,
            MAX(distance_value) AS water_max,
            MIN(distance_value) AS water_min,
            MAX(distance_unit) AS water_unit
     FROM iot_system.iot_data
     WHERE date_time > $1::date - ${HYDROLOGY_WINDOW_DAYS}
     GROUP BY 1, 2`,
    [WARNING_START_DAY],
  );

  const bySerial = new Map();
  result.rows.forEach((row) => {
    if (!bySerial.has(row.serial_number)) bySerial.set(row.serial_number, new Map());
    bySerial.get(row.serial_number).set(row.day, {
      salt: toNumber(row.salt),
      waterMean: toNumber(row.water_mean),
      waterMax: toNumber(row.water_max),
      waterMin: toNumber(row.water_min),
      waterUnit: row.water_unit || null,
    });
  });
  dataCache.set("iot_daily", bySerial);
  return bySerial;
};

const loadReferenceWaterLevels = async () => {
  const cached = dataCache.get("thuyvan");
  if (cached) return cached;

  const columns = REFERENCE_HYDRO_STATIONS.flatMap((station) => [station.mean, station.max, station.min]);
  const result = await QueryDatabase(
    `SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day, ${columns.map((column) => `"${column}"`).join(", ")}
     FROM (
       SELECT ${normalizeDateExpr('"Ngày"')} AS day, ${columns.map((column) => `"${column}"`).join(", ")}
       FROM hochiminh."ThuyVan"
     ) t
     WHERE day >= $1::date - ${HYDROLOGY_WINDOW_DAYS}`,
    [WARNING_START_DAY],
  );
  const byDay = new Map(result.rows.map((row) => [row.day, row]));
  dataCache.set("thuyvan", byDay);
  return byDay;
};

const windowDays = (endDay) => Array.from({length: HYDROLOGY_WINDOW_DAYS}, (_, index) => addDays(endDay, -index));

const summarizeWater = (name, unit, items) => {
  const means = items.map((item) => item.mean).filter((value) => value !== null);
  if (means.length === 0) return null;
  const maxValues = items.map((item) => item.max ?? item.mean).filter((value) => value !== null);
  const minValues = items.map((item) => item.min ?? item.mean).filter((value) => value !== null);
  return {
    name,
    unit,
    mean: round(means.reduce((sum, value) => sum + value, 0) / means.length),
    max: round(Math.max(...maxValues)),
    min: round(Math.min(...minValues)),
  };
};

// Hiện trạng thủy văn 7 ngày tính đến endDay: trạm IoT lấy mực nước của chính nó; điểm đo mặn lấy
// Phú An, Nhà Bè và 3 trạm IoT gần nhất
const buildHydrology = (station, endDay, context) => {
  const days = windowDays(endDay);
  const iotWater = (iotStation) => {
    const byDay = context.iotDaily.get(iotStation.code);
    const items = days
      .map((day) => byDay?.get(day))
      .filter(Boolean)
      .map((item) => ({mean: item.waterMean, max: item.waterMax, min: item.waterMin, unit: item.waterUnit}));
    return summarizeWater(iotStation.name, items.find((item) => item.unit)?.unit || "", items);
  };

  if (station.type === "iot") return [iotWater(station)].filter(Boolean);

  const reference = REFERENCE_HYDRO_STATIONS.map((item) =>
    summarizeWater(
      item.name,
      "cm",
      days
        .map((day) => context.waterLevels.get(day))
        .filter(Boolean)
        .map((row) => ({mean: toNumber(row[item.mean]), max: toNumber(row[item.max]), min: toNumber(row[item.min])})),
    ),
  );
  const nearestIot = context.stations
    .filter((item) => item.type === "iot")
    .sort((left, right) => distanceKm(station, left) - distanceKm(station, right))
    .slice(0, NEAREST_IOT_COUNT)
    .map(iotWater);
  return [...reference, ...nearestIot].filter(Boolean);
};

const baseBulletin = (type, station, day) => ({
  id: `${type}:${station.type}:${station.code}:${day}`,
  type,
  title: `Tin ${type === "warning" ? "cảnh báo" : "dự báo"} XNM tại ${station.name}`,
  stationType: station.type,
  stationCode: station.code,
  stationName: station.name,
  maHuyen: station.maHuyen,
  tenHuyen: station.tenHuyen,
});

// Độ mặn quan trắc theo ngày của 1 trạm: [{day, value}] mới -> cũ
const observedSeries = (station, context) => {
  if (station.type === "iot") {
    const byDay = context.iotDaily.get(station.code) || new Map();
    return [...byDay.entries()]
      .map(([day, item]) => ({day, value: item.salt === null ? null : round(item.salt)}))
      .filter((item) => item.value !== null)
      .sort((left, right) => (left.day < right.day ? 1 : -1));
  }
  if (!station.hasObservedColumn) return [];
  return context.observedRows
    .map((row) => ({day: row.day, value: toNumber(row[station.code])}))
    .filter((item) => item.value !== null);
};

// Cảnh báo: mỗi lần quan trắc có độ mặn từ cấp rủi ro 1 trở lên, tính từ 2024
const buildWarningBulletins = (stations, context) =>
  stations.flatMap((station) =>
    observedSeries(station, context)
      .filter((item) => item.day >= WARNING_START_DAY && item.value >= 1)
      .map((item) => ({
        ...baseBulletin("warning", station, item.day),
        issuedAt: item.day,
        issuedResolution: "day",
        observed: {value: item.value, time: item.day},
        hydrology: buildHydrology(station, item.day, context),
        risk: classifyRisk(item.value, station.code),
      })),
  );

// Dự báo: mỗi lượt dự báo phát hành sau 11/9/2026, cho từng trạm có dự báo
const buildForecastBulletins = async (stations, context) => {
  const runs = await QueryDatabase(
    `SELECT run_id, issued_at, forecast_start_at
     FROM forecast_system.forecast_runs
     WHERE issued_at > $1::date
     ORDER BY issued_at DESC
     LIMIT 60`,
    [FORECAST_ISSUED_AFTER],
  );

  const bulletins = [];
  for (const run of runs.rows) {
    const values = await QueryDatabase(
      `SELECT * FROM forecast_system.forecast_values WHERE run_id = $1 ORDER BY "ThoiDiem" ASC`,
      [run.run_id],
    );
    const issuedAt = toIsoWithOffset(run.issued_at);

    stations.forEach((station) => {
      // Trạm IoT có cột dự báo riêng theo station_code; điểm đo mặn theo mã điểm
      const forecastCode = station.type === "iot" ? station.stationCode : station.code;
      if (!FORECAST_ALL_VALUE_COLUMNS.includes(forecastCode)) return;

      // Điểm đo mặn và trạm IoT có lưới thời gian dự báo riêng -> mốc bắt đầu tính theo từng trạm
      let peak = null;
      let startDay = null;
      values.rows.forEach((row) => {
        const value = toNumber(row[`${forecastCode}_Daily`]) ?? toNumber(row[forecastCode]);
        if (value === null) return;
        const time = toIsoWithOffset(row.ThoiDiem);
        if (!startDay) startDay = String(time).slice(0, 10);
        if (!peak || value > peak.value) peak = {value: round(value), time};
      });
      if (!peak) return;

      const windowStart = addDays(startDay, -(HYDROLOGY_WINDOW_DAYS - 1));
      const recentPeak = observedSeries(station, context)
        .filter((item) => item.day >= windowStart && item.day <= startDay)
        .reduce((best, item) => (!best || item.value > best.value ? item : best), null);

      bulletins.push({
        ...baseBulletin("forecast", station, run.run_id),
        issuedAt,
        issuedResolution: "time",
        hydrology: buildHydrology(station, startDay, context),
        current: recentPeak ? {value: recentPeak.value, time: recentPeak.day} : null,
        forecast: peak,
        risk: classifyRisk(peak.value, station.type === "iot" ? null : station.code),
      });
    });
  }
  return bulletins;
};

const loadSubscriptions = async (email) => {
  const result = await QueryDatabase(
    `SELECT target_type, target_code FROM public.bulletin_subscriptions WHERE user_email = $1 ORDER BY id`,
    [email],
  );
  return result.rows;
};

const groupSubscriptions = (rows) =>
  Object.fromEntries(
    TARGET_TYPES.map((type) => [type, rows.filter((row) => row.target_type === type).map((row) => row.target_code)]),
  );

const loadOptions = async () => {
  const stations = await loadBulletinStations();
  const districts = await QueryDatabase(
    `SELECT "maHuyen" AS code, "tenHuyen" AS name
     FROM hochiminh."DiaPhanHuyen"
     WHERE "maHuyen" IS NOT NULL AND "tenHuyen" IS NOT NULL
     ORDER BY "tenHuyen"`,
  );
  const toOption = (station) => ({code: station.code, name: station.name, maHuyen: station.maHuyen});
  return {
    salinity: stations.filter((station) => station.type === "salinity").map(toOption),
    iot: stations.filter((station) => station.type === "iot").map(toOption),
    huyen: districts.rows,
  };
};

const GetBulletinOptions = async (req, reply) => {
  try {
    return reply.code(200).send(await loadOptions());
  } catch (error) {
    logger.error("GetBulletinOptions error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

const GetBulletinSubscriptions = async (req, reply) => {
  try {
    return reply.code(200).send(groupSubscriptions(await loadSubscriptions(req.user.email)));
  } catch (error) {
    logger.error("GetBulletinSubscriptions error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// PUT /bulletin/subscriptions - body {salinity: [mã], iot: [serial], huyen: [mã huyện]}: thay toàn bộ đăng ký
const SaveBulletinSubscriptions = async (req, reply) => {
  try {
    const options = await loadOptions();
    const entries = TARGET_TYPES.flatMap((type) => {
      const validCodes = new Set(options[type].map((option) => String(option.code)));
      const requested = Array.isArray(req.body?.[type]) ? req.body[type].map(String) : [];
      return [...new Set(requested)].filter((code) => validCodes.has(code)).map((code) => ({type, code}));
    });

    await QueryDatabase(`DELETE FROM public.bulletin_subscriptions WHERE user_email = $1`, [req.user.email]);
    if (entries.length > 0) {
      await QueryDatabase(
        `INSERT INTO public.bulletin_subscriptions (user_email, target_type, target_code)
         SELECT $1, t.target_type, t.target_code
         FROM unnest($2::text[], $3::text[]) AS t(target_type, target_code)
         ON CONFLICT DO NOTHING`,
        [req.user.email, entries.map((entry) => entry.type), entries.map((entry) => entry.code)],
      );
    }

    return reply.code(200).send({
      code: 200,
      message: "Đăng ký nhận bản tin thành công",
      subscriptions: groupSubscriptions(entries.map((entry) => ({target_type: entry.type, target_code: entry.code}))),
    });
  } catch (error) {
    logger.error("SaveBulletinSubscriptions error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// GET /bulletins?type=warning|forecast&targetType=salinity|iot|huyen&targetCode=...
// Chỉ trả bản tin của các điểm/trạm/huyện người dùng đã đăng ký; huyện gồm mọi điểm đo mặn, trạm IoT bên trong
const GetBulletins = async (req, reply) => {
  try {
    const type = req.query.type === "forecast" ? "forecast" : "warning";
    const {targetType, targetCode} = req.query;

    const subscriptions = await loadSubscriptions(req.user.email);
    const active =
      targetType && targetCode
        ? subscriptions.filter((row) => row.target_type === targetType && row.target_code === String(targetCode))
        : subscriptions;

    const allStations = await loadBulletinStations();
    const matches = (station) =>
      active.some((row) =>
        row.target_type === "huyen"
          ? station.maHuyen === row.target_code
          : row.target_type === station.type && row.target_code === station.code,
      );
    const stations = allStations.filter(matches);
    if (stations.length === 0) {
      return reply.code(200).send({type, total: 0, hasSubscriptions: subscriptions.length > 0, bulletins: []});
    }

    const observedColumns = allStations
      .filter((station) => station.type === "salinity" && station.hasObservedColumn)
      .map((station) => station.code);
    const [observedRows, iotDaily, waterLevels] = await Promise.all([
      loadObservedSalinityByDay(observedColumns),
      loadIotDaily(),
      loadReferenceWaterLevels(),
    ]);
    const context = {stations: allStations, observedRows, iotDaily, waterLevels};

    const bulletins =
      type === "warning" ? buildWarningBulletins(stations, context) : await buildForecastBulletins(stations, context);
    bulletins.sort((left, right) => (left.issuedAt < right.issuedAt ? 1 : left.issuedAt > right.issuedAt ? -1 : 0));

    return reply.code(200).send({
      type,
      total: bulletins.length,
      hasSubscriptions: true,
      bulletins: bulletins.slice(0, MAX_BULLETINS),
    });
  } catch (error) {
    logger.error("GetBulletins error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

module.exports = {GetBulletinOptions, GetBulletinSubscriptions, SaveBulletinSubscriptions, GetBulletins};
