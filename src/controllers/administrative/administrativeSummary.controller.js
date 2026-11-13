const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const NodeCache = require("node-cache");
const {FORECAST_VALUE_COLUMNS, FORECAST_IOT_COLUMNS} = require("../../configs/forecastStations");
const {toIsoWithOffset, resolveReferenceNow} = require("../../utils/forecastTime");
const {idMapping: KTTV_COLUMN_MAP, normalizeDateExpr} = require("../hydrometeorology/hydrometeorology.controller");

const stationCache = new NodeCache({stdTTL: 600, checkperiod: 120});
const summaryCache = new NodeCache({stdTTL: 300, checkperiod: 60});

const UNIT_TABLES = {
  huyen: {
    table: 'hochiminh."DiaPhanHuyen"',
    codeCol: '"maHuyen"',
    select: '"maHuyen", "tenHuyen", "dienTichTuNhien"',
  },
  xa: {
    table: 'hochiminh."DiaPhanXa"',
    codeCol: '"maXa"',
    select: '"maXa", "tenXa", "maHuyen", "tenHuyen", "dienTichTuNhien"',
  },
};

const NOW_VN = `timezone('Asia/Ho_Chi_Minh', CURRENT_TIMESTAMP)`;
const SAFE_IDENTIFIER = /^[A-Za-z0-9_]+$/;

// Toạ độ trạm trong DB có thể là số thập phân hoặc chuỗi độ-phút-giây (vd 10°40'12"N)
const toDecimalDegrees = (raw) => {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  const text = String(raw).trim().replace(/[’‘′]/g, "'").replace(/[”“″]/g, '"');
  if (/^-?\d+([.,]\d+)?$/.test(text)) return parseFloat(text.replace(",", "."));

  const match = text.match(/(\d+)°\s*(\d+)'(?:\s*([\d.]+)")?\s*([NSEW])?/i);
  if (!match) return null;

  const decimal = Number(match[1]) + Number(match[2]) / 60 + (match[3] ? Number(match[3]) / 3600 : 0);
  return match[4] && /[SW]/i.test(match[4]) ? -decimal : decimal;
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
};

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

const summarize = (values) => {
  const numbers = values.filter((value) => value !== null);
  if (numbers.length === 0) return null;
  return {
    mean: round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length),
    max: round(Math.max(...numbers)),
    min: round(Math.min(...numbers)),
    count: numbers.length,
  };
};

const buildTrend = (currentMean, previousMean, previousTime) => {
  if (currentMean === null || currentMean === undefined || previousMean === null || previousMean === undefined) {
    return null;
  }
  const delta = round(currentMean - previousMean);
  return {
    previousMean,
    previousTime,
    delta,
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
  };
};

const classifyKttvStation = (kiHieu, phanLoai) => {
  const mapping = KTTV_COLUMN_MAP[kiHieu];
  if (mapping) {
    if (mapping.table === "ThuyVan") return "hydrology";
    return mapping.columns.some((column) => !column.startsWith("R_")) ? "meteorology" : "rain";
  }

  const text = String(phanLoai || "").toLowerCase();
  if (text.includes("mưa")) return "rain";
  if (text.includes("thủy văn") || text.includes("thuỷ văn")) return "hydrology";
  return "meteorology";
};

const loadAllStations = async () => {
  const cached = stationCache.get("all_stations");
  if (cached) return cached;

  const [salinityResult, kttvResult, iotResult, doManColumnsResult] = await Promise.all([
    QueryDatabase(`SELECT "KiHieu", "TenDiem", "KinhDo", "ViDo", "PhanLoai" FROM hochiminh."DiemDoMan"`),
    QueryDatabase(`SELECT "KiHieu", "TenTram", "KinhDo", "ViDo", "PhanLoai", "YeuTo" FROM hochiminh."TramKTTV"`),
    QueryDatabase(`SELECT serial_number, station_name, station_code, latitude, longitude FROM iot_system.iot_stations`),
    QueryDatabase(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'hochiminh' AND table_name = 'DoMan'`),
  ]);

  const doManColumns = new Set(doManColumnsResult.rows.map((row) => row.column_name));

  const stations = [
    ...salinityResult.rows.map((row) => ({
      type: "salinity",
      code: row.KiHieu,
      name: row.TenDiem,
      phanLoai: row.PhanLoai || null,
      hasObservedColumn: doManColumns.has(row.KiHieu) && SAFE_IDENTIFIER.test(row.KiHieu),
      hasForecast: FORECAST_VALUE_COLUMNS.includes(row.KiHieu),
      lat: toDecimalDegrees(row.ViDo),
      lng: toDecimalDegrees(row.KinhDo),
    })),
    ...kttvResult.rows.map((row) => ({
      type: classifyKttvStation(row.KiHieu, row.PhanLoai),
      code: row.KiHieu,
      name: row.TenTram,
      phanLoai: row.PhanLoai || null,
      yeuTo: row.YeuTo || null,
      lat: toDecimalDegrees(row.ViDo),
      lng: toDecimalDegrees(row.KinhDo),
    })),
    ...iotResult.rows.map((row) => ({
      type: "iot",
      code: row.serial_number,
      name: row.station_name,
      stationCode: row.station_code || null,
      lat: toDecimalDegrees(row.latitude),
      lng: toDecimalDegrees(row.longitude),
    })),
  ].filter((station) => station.lat !== null && station.lng !== null);

  stationCache.set("all_stations", stations);
  return stations;
};

const findUnit = async ({level, code, lat, lng}) => {
  const config = UNIT_TABLES[level];
  const result = code
    ? await QueryDatabase(`SELECT ${config.select} FROM ${config.table} WHERE ${config.codeCol} = $1 LIMIT 1`, [code])
    : await QueryDatabase(
        `SELECT ${config.select}
         FROM ${config.table}
         WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), ST_SRID(geom)))
         LIMIT 1`,
        [lng, lat],
      );
  return result.rows[0] || null;
};

const findStationsInUnit = async (level, unitCode) => {
  const config = UNIT_TABLES[level];
  const stations = await loadAllStations();
  if (stations.length === 0) return [];

  const result = await QueryDatabase(
    `SELECT DISTINCT p.idx
     FROM unnest($2::float8[], $3::float8[]) WITH ORDINALITY AS p(lng, lat, idx)
     JOIN ${config.table} u ON u.${config.codeCol} = $1
     WHERE ST_Contains(u.geom, ST_SetSRID(ST_MakePoint(p.lng, p.lat), ST_SRID(u.geom)))`,
    [unitCode, stations.map((station) => station.lng), stations.map((station) => station.lat)],
  );

  const indexes = new Set(result.rows.map((row) => Number(row.idx) - 1));
  return stations.filter((_, index) => indexes.has(index));
};

// Bảng số liệu dạng rộng (mỗi trạm 1 cột): lấy 2 ngày gần hiện tại nhất có số liệu của các cột yêu cầu
const fetchLatestWideDays = async (tableName, columns) => {
  if (columns.length === 0) return [];
  const dateExpr = normalizeDateExpr('"Ngày"');
  const quoted = columns.map((column) => `"${column}"`);

  const result = await QueryDatabase(
    `SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day, ${quoted.join(", ")}
     FROM (
       SELECT ${dateExpr} AS day, ${quoted.join(", ")}
       FROM hochiminh."${tableName}"
       WHERE ${quoted.map((column) => `${column} IS NOT NULL`).join(" OR ")}
     ) t
     WHERE day IS NOT NULL AND day <= (${NOW_VN})::date
     ORDER BY t.day DESC
     LIMIT 10`,
  );

  return result.rows.filter((row) => columns.some((column) => toNumber(row[column]) !== null)).slice(0, 2);
};

// IoT: trung bình theo từng trạm ở mốc giờ gần nhất (quy về cuối giờ, như các popup IoT hiện có) và giờ liền trước
const fetchIotLatestHours = async (serials, column) => {
  if (serials.length === 0) return [];
  const slotExpr = (field) => `
    CASE WHEN ${field} = date_trunc('hour', ${field}) THEN ${field}
         ELSE date_trunc('hour', ${field}) + interval '1 hour' END`;

  const result = await QueryDatabase(
    `WITH latest AS (
       SELECT ${slotExpr("MAX(date_time)")} AS slot
       FROM iot_system.iot_data
       WHERE serial_number = ANY($1) AND ${column} IS NOT NULL AND date_time <= ${NOW_VN}
     )
     SELECT TO_CHAR(${slotExpr("d.date_time")}, 'YYYY-MM-DD"T"HH24:MI:SS') AS time,
            d.serial_number,
            AVG(d.${column}) AS value
     FROM iot_system.iot_data d, latest
     WHERE d.serial_number = ANY($1)
       AND d.${column} IS NOT NULL
       AND d.date_time > latest.slot - interval '2 hours'
       AND d.date_time <= latest.slot
     GROUP BY 1, 2
     ORDER BY 1 DESC`,
    [serials],
  );
  return result.rows;
};

// IoT: giá trị theo từng trạm ở ngày gần nhất và ngày liền trước (ngày = 00:01-24:00, bản ghi 00:00 thuộc ngày trước)
const fetchIotLatestDays = async (serials, column, aggregate) => {
  if (serials.length === 0) return [];
  const result = await QueryDatabase(
    `WITH latest AS (
       SELECT (MAX(date_time) - interval '1 second')::date AS day
       FROM iot_system.iot_data
       WHERE serial_number = ANY($1) AND ${column} IS NOT NULL AND date_time <= ${NOW_VN}
     )
     SELECT TO_CHAR((d.date_time - interval '1 second')::date, 'YYYY-MM-DD') AS time,
            d.serial_number,
            ${aggregate}(d.${column}) AS value
     FROM iot_system.iot_data d, latest
     WHERE d.serial_number = ANY($1)
       AND d.${column} IS NOT NULL
       AND d.date_time > latest.day - 1
       AND d.date_time <= latest.day + 1
     GROUP BY 1, 2
     ORDER BY 1 DESC`,
    [serials],
  );
  return result.rows;
};

// IoT: lượng mưa ngày theo từng trạm ở ngày gần nhất và ngày liền trước. daily_rainfall_value là luỹ kế,
// mỗi trạm reset vào giờ riêng, nên lượng mưa = tổng các mức tăng giữa 2 bản ghi liên tiếp
// (giá trị tụt xuống nghĩa là vừa reset).
const fetchIotLatestRainDays = async (serials) => {
  if (serials.length === 0) return [];
  const result = await QueryDatabase(
    `WITH latest AS (
       SELECT (MAX(date_time) - interval '1 second')::date AS day
       FROM iot_system.iot_data
       WHERE serial_number = ANY($1) AND daily_rainfall_value IS NOT NULL AND date_time <= ${NOW_VN}
     ),
     rain AS (
       SELECT d.serial_number,
              d.date_time,
              d.daily_rainfall_value AS value,
              LAG(d.daily_rainfall_value) OVER (PARTITION BY d.serial_number ORDER BY d.date_time) AS previous_value
       FROM iot_system.iot_data d, latest
       WHERE d.serial_number = ANY($1)
         AND d.daily_rainfall_value IS NOT NULL
         AND d.date_time > latest.day - 2
         AND d.date_time <= latest.day + 1
     )
     SELECT TO_CHAR((r.date_time - interval '1 second')::date, 'YYYY-MM-DD') AS time,
            r.serial_number,
            SUM(CASE
                  WHEN r.previous_value IS NULL OR r.value < r.previous_value THEN r.value
                  ELSE r.value - r.previous_value
                END) AS value
     FROM rain r, latest
     WHERE r.date_time > latest.day - 1
     GROUP BY 1, 2
     ORDER BY 1 DESC`,
    [serials],
  );
  return result.rows;
};

// Gom các dòng {time, value} thành [mốc mới nhất, mốc liền trước] kèm thống kê
const buildSlotsFromRows = (rows) => {
  const byTime = new Map();
  rows.forEach((row) => {
    const value = toNumber(row.value);
    if (value === null) return;
    if (!byTime.has(row.time)) byTime.set(row.time, []);
    byTime.get(row.time).push(value);
  });
  return [...byTime.entries()]
    .sort((left, right) => (left[0] < right[0] ? 1 : -1))
    .slice(0, 2)
    .map(([time, values]) => ({time, stats: summarize(values)}));
};

const toObservation = (slots, {source, unit, resolution}) => {
  if (!slots.length || !slots[0].stats) return null;
  const [latest, previous] = slots;
  return {
    source,
    unit,
    resolution,
    time: latest.time,
    ...latest.stats,
    trend: buildTrend(latest.stats.mean, previous?.stats?.mean, previous?.time),
  };
};

// Chọn nguồn có mốc thời gian gần hiện tại nhất (so theo ngày); hoà thì ưu tiên nguồn đứng trước
const pickMostRecent = (...observations) =>
  observations
    .filter(Boolean)
    .reduce((best, item) => (!best || item.time.slice(0, 10) > best.time.slice(0, 10) ? item : best), null);

const buildObservedSalinity = async (salinityStations, iotSerials) => {
  const iotRows = await fetchIotLatestHours(iotSerials, "salt_value");
  const iotObservation = toObservation(buildSlotsFromRows(iotRows), {source: "iot", unit: "‰", resolution: "hour"});
  if (iotObservation) return iotObservation;

  const columns = salinityStations.filter((station) => station.hasObservedColumn).map((station) => station.code);
  const days = await fetchLatestWideDays("DoMan", columns);
  const slots = days.map((row) => ({
    time: row.day,
    stats: summarize(columns.map((column) => toNumber(row[column]))),
  }));
  return toObservation(slots, {source: "manual", unit: "‰", resolution: "day"});
};

// Dự báo của điểm đo mặn và của trạm IoT có lưới thời gian riêng: tính từng nhóm rồi lấy nhóm có mốc
// dự báo gần hiện tại nhất
const buildForecastSalinity = async (salinityStations, iotStations) => {
  const referenceNow = resolveReferenceNow().getTime();
  const candidates = await Promise.all([
    buildForecastForColumns(salinityStations.filter((station) => station.hasForecast).map((station) => station.code)),
    buildForecastForColumns(
      iotStations.map((station) => station.stationCode).filter((code) => FORECAST_IOT_COLUMNS.includes(code)),
    ),
  ]);
  return candidates.filter(Boolean).reduce((best, item) => {
    const gap = (candidate) => Math.abs(new Date(candidate.time).getTime() - referenceNow);
    return !best || gap(item) < gap(best) ? item : best;
  }, null);
};

const buildForecastForColumns = async (columns) => {
  if (columns.length === 0) return null;

  const runResult = await QueryDatabase(
    `SELECT run_id FROM forecast_system.forecast_runs ORDER BY forecast_start_at DESC LIMIT 1`,
  );
  if (runResult.rowCount === 0) return null;

  const valuesResult = await QueryDatabase(
    `SELECT * FROM forecast_system.forecast_values WHERE run_id = $1 ORDER BY "ThoiDiem" ASC`,
    [runResult.rows[0].run_id],
  );
  if (valuesResult.rowCount === 0) return null;

  const rows = valuesResult.rows
    .map((row) => ({
      time: toIsoWithOffset(row.ThoiDiem),
      stats: summarize(columns.map((column) => toNumber(row[`${column}_Daily`]) ?? toNumber(row[column]))),
    }))
    .filter((row) => row.stats);
  if (rows.length === 0) return null;

  // Cùng quy ước với GetLatestForecast: mốc đầu tiên >= "hiện tại", nếu chuỗi đã ở quá khứ thì lấy mốc cuối
  const referenceNow = resolveReferenceNow().getTime();
  const futureIndex = rows.findIndex((row) => new Date(row.time).getTime() >= referenceNow);
  const currentIndex = futureIndex !== -1 ? futureIndex : rows.length - 1;
  const current = rows[currentIndex];
  if (!current.stats) return null;

  const previous = currentIndex > 0 ? rows[currentIndex - 1] : null;
  return {
    source: "forecast",
    unit: "‰",
    resolution: "2hour",
    time: current.time,
    hasFutureForecast: futureIndex !== -1,
    ...current.stats,
    trend: buildTrend(current.stats.mean, previous?.stats?.mean, previous?.time),
  };
};

const buildWaterLevel = async (hydrologyStations, iotSerials) => {
  const mappings = hydrologyStations.map((station) => KTTV_COLUMN_MAP[station.code]).filter(Boolean);
  const columns = mappings.flatMap((mapping) => mapping.columns);
  const days = await fetchLatestWideDays("ThuyVan", columns);

  const slots = days.map((row) => {
    const perStation = mappings.map((mapping) => {
      const find = (prefix) => {
        const column = mapping.columns.find((name) => name.startsWith(prefix));
        return column ? toNumber(row[column]) : null;
      };
      const mean = find("Htb_");
      return {mean, max: find("Hx_") ?? mean, min: find("Hm_") ?? mean};
    });
    const meanStats = summarize(perStation.map((item) => item.mean));
    const maxStats = summarize(perStation.map((item) => item.max));
    const minStats = summarize(perStation.map((item) => item.min));
    return {
      time: row.day,
      stats: meanStats && {mean: meanStats.mean, max: maxStats.max, min: minStats.min, count: meanStats.count},
    };
  });
  const stationObservation = toObservation(slots, {source: "station", unit: "cm", resolution: "day"});

  const iotRows = await fetchIotLatestDays(iotSerials, "distance_value", "AVG");
  let iotObservation = toObservation(buildSlotsFromRows(iotRows), {source: "iot", unit: null, resolution: "day"});
  if (iotObservation) {
    const unitResult = await QueryDatabase(
      `SELECT MAX(distance_unit) AS unit FROM iot_system.iot_data
       WHERE serial_number = ANY($1) AND distance_unit IS NOT NULL AND date_time::date = $2::date`,
      [iotSerials, iotObservation.time],
    );
    iotObservation = {...iotObservation, unit: unitResult.rows[0]?.unit || null};
  }

  // Không gộp 2 nguồn vì đơn vị/mốc cao độ có thể khác nhau
  return pickMostRecent(stationObservation, iotObservation);
};

const buildRainfall = async (rainStations, iotSerials) => {
  const columns = rainStations
    .map((station) => KTTV_COLUMN_MAP[station.code]?.columns.find((column) => column.startsWith("R_")))
    .filter(Boolean);
  const days = await fetchLatestWideDays("KhiTuong", columns);
  const slots = days.map((row) => ({
    time: row.day,
    stats: summarize(columns.map((column) => toNumber(row[column]))),
  }));
  const stationObservation = toObservation(slots, {source: "station", unit: "mm", resolution: "day"});

  const iotRows = await fetchIotLatestRainDays(iotSerials);
  const iotObservation = toObservation(buildSlotsFromRows(iotRows), {source: "iot", unit: "mm", resolution: "day"});

  return pickMostRecent(stationObservation, iotObservation);
};

const settle = async (label, promise) => {
  try {
    return await promise;
  } catch (error) {
    logger.error(`GetAdministrativeSummary - ${label} error:`, error);
    return null;
  }
};

/**
 * GET /administrative/summary?level=huyen|xa&code=<maHuyen|maXa>
 * GET /administrative/summary?level=huyen|xa&lat=<vĩ độ>&lng=<kinh độ>   (điểm click trên bản đồ)
 */
const GetAdministrativeSummary = async (req, reply) => {
  try {
    const level = String(req.query.level || "huyen").toLowerCase();
    if (!UNIT_TABLES[level]) {
      return reply.code(400).send({code: 400, message: "level phải là 'huyen' hoặc 'xa'"});
    }

    const code = req.query.code ? String(req.query.code).trim() : null;
    const lat = toNumber(req.query.lat);
    const lng = toNumber(req.query.lng);
    if (!code && (lat === null || lng === null)) {
      return reply.code(400).send({code: 400, message: "Cần truyền code hoặc cặp lat/lng"});
    }

    const unit = await findUnit({level, code, lat, lng});
    if (!unit) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy đơn vị hành chính"});
    }

    const unitCode = level === "huyen" ? unit.maHuyen : unit.maXa;
    const cacheKey = `admin_summary_${level}_${unitCode}`;
    const cached = summaryCache.get(cacheKey);
    if (cached) return reply.code(200).send(cached);

    const stations = await findStationsInUnit(level, unitCode);
    const byType = (type) => stations.filter((station) => station.type === type);
    const toListItem = (station) => ({
      code: station.code,
      name: station.name,
      lat: station.lat,
      lng: station.lng,
      ...(station.phanLoai ? {phanLoai: station.phanLoai} : {}),
      ...(station.stationCode ? {stationCode: station.stationCode} : {}),
    });

    const salinityStations = byType("salinity");
    const rainStations = byType("rain");
    const meteorologyStations = byType("meteorology");
    const hydrologyStations = byType("hydrology");
    const iotStations = byType("iot");
    const iotSerials = iotStations.map((station) => station.code);

    const [salinityForecast, salinityObserved, waterLevel, rainfall] = await Promise.all([
      settle("salinityForecast", buildForecastSalinity(salinityStations, iotStations)),
      settle("salinityObserved", buildObservedSalinity(salinityStations, iotSerials)),
      settle("waterLevel", buildWaterLevel(hydrologyStations, iotSerials)),
      settle("rainfall", buildRainfall([...rainStations, ...meteorologyStations], iotSerials)),
    ]);

    const response = {
      level,
      unit: {
        code: unitCode,
        name: level === "huyen" ? unit.tenHuyen : unit.tenXa,
        maHuyen: unit.maHuyen,
        tenHuyen: unit.tenHuyen,
        ...(level === "xa" ? {maXa: unit.maXa, tenXa: unit.tenXa} : {}),
        areaKm2: toNumber(unit.dienTichTuNhien),
      },
      stations: {
        total: stations.length,
        salinity: salinityStations.map(toListItem),
        rain: rainStations.map(toListItem),
        meteorology: meteorologyStations.map(toListItem),
        hydrology: hydrologyStations.map(toListItem),
        iot: iotStations.map(toListItem),
      },
      salinityForecast,
      salinityObserved,
      waterLevel,
      rainfall,
    };

    summaryCache.set(cacheKey, response);
    return reply.code(200).send(response);
  } catch (error) {
    logger.error("GetAdministrativeSummary error:", error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

module.exports = {GetAdministrativeSummary, loadAllStations};
