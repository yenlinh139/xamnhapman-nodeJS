// Phuc vu bang "THONG KE DU LIEU DO MAN" tren ban do: danh sach TAT CA moc thoi gian co so lieu
// quan trac do man (diem do man thu cong + tram IoT) va gia tri do man cua tung diem/tram tai 1 moc.
//
// Moi moc thoi gian trao doi voi FE deu la GIO VIET NAM dang "YYYY-MM-DD HH:MI" (khong kem mui gio):
// - hochiminh."DoManChiTiet"."ThoiDiem" la timestamptz -> doi sang gio VN.
// - iot_system.iot_data.date_time la timestamp (san gio VN) -> gom theo GIO voi quy uoc "cuoi gio"
//   (00:01-01:00 la gio 1...), giong /iot/stations va /iot/data/:serial?groupBy=hour.
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

const VN_TIMEZONE = "Asia/Ho_Chi_Minh";
const VIETNAM_NOW_SQL = `timezone('${VN_TIMEZONE}', CURRENT_TIMESTAMP)`;
const IOT_HOUR_END_SQL = `CASE
    WHEN date_time = date_trunc('hour', date_time) THEN date_trunc('hour', date_time)
    ELSE date_trunc('hour', date_time) + interval '1 hour'
  END`;
const TIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

// Danh sach moc quet ca bang iot_data (hang tram nghin dong) nen giu lai 5 phut trong bo nho.
const TIMES_CACHE_TTL_MS = 5 * 60 * 1000;
let timesCache = {expiresAt: 0, payload: null};

// GET /api/salinity-timeline/times
const GetSalinityTimelineTimes = async (req, reply) => {
  try {
    if (timesCache.payload && timesCache.expiresAt > Date.now()) {
      return reply.code(200).send(timesCache.payload);
    }

    const [timesResult, pointsResult, iotStationsResult] = await Promise.all([
      QueryDatabase(`
        SELECT to_char(t, 'YYYY-MM-DD HH24:MI') AS time
        FROM (
          SELECT ("ThoiDiem" AT TIME ZONE '${VN_TIMEZONE}') AS t
          FROM hochiminh."DoManChiTiet"
          WHERE "DoMan" IS NOT NULL
          UNION
          SELECT ${IOT_HOUR_END_SQL} AS t
          FROM iot_system.iot_data
          WHERE salt_value IS NOT NULL
        ) merged
        WHERE t <= ${VIETNAM_NOW_SQL}
        ORDER BY t DESC
      `),
      QueryDatabase(
        `SELECT "KiHieu", "TenDiem", "KinhDo", "ViDo" FROM hochiminh."DiemDoMan" WHERE "deleted_at" IS NULL ORDER BY "TenDiem" ASC`,
      ),
      QueryDatabase(
        `SELECT station_code, station_name, longitude, latitude, serial_number FROM iot_system.iot_stations
         WHERE deleted_at IS NULL ORDER BY station_name ASC`,
      ),
    ]);

    const payload = {
      code: 200,
      // Moi -> cu
      times: timesResult.rows.map((row) => row.time),
      stations: [
        ...pointsResult.rows.map((row) => ({
          code: row.KiHieu,
          name: row.TenDiem,
          type: "manual",
          longitude: row.KinhDo,
          latitude: row.ViDo,
        })),
        ...iotStationsResult.rows.map((row) => ({
          code: row.station_code,
          name: row.station_name,
          type: "iot",
          longitude: row.longitude,
          latitude: row.latitude,
          serialNumber: row.serial_number,
        })),
      ],
    };

    timesCache = {expiresAt: Date.now() + TIMES_CACHE_TTL_MS, payload};
    return reply.code(200).send(payload);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// GET /api/salinity-timeline/values?time=YYYY-MM-DD HH:MI
const GetSalinityTimelineValues = async (req, reply) => {
  try {
    const time = String(req.query?.time || "").trim();
    if (!TIME_PATTERN.test(time)) {
      return reply.code(400).send({code: 400, message: "Tham số time phải có dạng YYYY-MM-DD HH:MI"});
    }

    const [manualResult, iotResult] = await Promise.all([
      // Du lieu goc co vai cap (tram, thoi diem) trung nhau voi gia tri khac nhau -> lay trung binh.
      QueryDatabase(
        `
          SELECT "KiHieu" AS code, ROUND(AVG("DoMan")::numeric, 3) AS value
          FROM hochiminh."DoManChiTiet"
          WHERE "DoMan" IS NOT NULL
            AND "ThoiDiem" = ($1::timestamp AT TIME ZONE '${VN_TIMEZONE}')
          GROUP BY "KiHieu"
        `,
        [time],
      ),
      QueryDatabase(
        `
          SELECT s.station_code AS code, ROUND(AVG(d.salt_value)::numeric, 3) AS value
          FROM iot_system.iot_data d
          JOIN iot_system.iot_stations s ON s.serial_number = d.serial_number
          WHERE d.salt_value IS NOT NULL
            AND d.date_time > $1::timestamp - interval '1 hour'
            AND d.date_time <= $1::timestamp
          GROUP BY s.station_code
        `,
        [time],
      ),
    ]);

    const toRows = (rows, type) => rows.map((row) => ({code: row.code, type, value: Number(row.value)}));

    return reply.code(200).send({
      code: 200,
      time,
      data: [...toRows(manualResult.rows, "manual"), ...toRows(iotResult.rows, "iot")],
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// GET /api/salinity-timeline/latest - gia tri quan trac GAN NHAT cua TUNG diem/tram (moc gio co the
// khac nhau giua cac diem/tram) - dung cho "Bao cao nhanh do man".
const GetSalinityTimelineLatest = async (req, reply) => {
  try {
    const [manualResult, iotResult] = await Promise.all([
      QueryDatabase(`
        SELECT DISTINCT ON ("KiHieu") "KiHieu" AS code,
               to_char("ThoiDiem" AT TIME ZONE '${VN_TIMEZONE}', 'YYYY-MM-DD HH24:MI') AS time,
               ROUND("DoMan"::numeric, 3) AS value
        FROM hochiminh."DoManChiTiet"
        WHERE "DoMan" IS NOT NULL
          AND ("ThoiDiem" AT TIME ZONE '${VN_TIMEZONE}') <= ${VIETNAM_NOW_SQL}
        ORDER BY "KiHieu", "ThoiDiem" DESC
      `),
      QueryDatabase(`
        WITH hours AS (
          SELECT s.station_code, ${IOT_HOUR_END_SQL} AS hour_end, d.salt_value
          FROM iot_system.iot_data d
          JOIN iot_system.iot_stations s ON s.serial_number = d.serial_number
          WHERE d.salt_value IS NOT NULL
        ),
        latest AS (
          -- Khong lay moc tuong lai (du lieu nhap truoc/loi dong ho thiet bi) lam "gan nhat"
          SELECT station_code, MAX(hour_end) AS hour_end FROM hours WHERE hour_end <= ${VIETNAM_NOW_SQL} GROUP BY station_code
        )
        SELECT l.station_code AS code,
               to_char(l.hour_end, 'YYYY-MM-DD HH24:MI') AS time,
               ROUND(AVG(h.salt_value)::numeric, 3) AS value
        FROM latest l
        JOIN hours h ON h.station_code = l.station_code AND h.hour_end = l.hour_end
        GROUP BY l.station_code, l.hour_end
      `),
    ]);

    const toRows = (rows, type) => rows.map((row) => ({code: row.code, type, time: row.time, value: Number(row.value)}));

    return reply.code(200).send({
      code: 200,
      data: [...toRows(manualResult.rows, "manual"), ...toRows(iotResult.rows, "iot")],
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

module.exports = {GetSalinityTimelineTimes, GetSalinityTimelineValues, GetSalinityTimelineLatest};
