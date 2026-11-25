// Tien ich dung chung cho so lieu cua cac diem/tram MOI them qua "Them vi tri" (xem migration
// 022_add_custom_station_support.js) - thay the bang rong chinh thuc (KhiTuong/ThuyVan/TongLuongXa/
// DoMan) cho nhung tram CHUA co cot rieng. "thoiDiem" la Date: gio that (diem do man) hoac dung
// 00:00 gio VN cua ngay do (cac lop con lai).
const QueryDatabase = require("./queryDatabase");

// Co dong cho (layer, KiHieu) nay chua, dung de kiem tra ma tram co hop le (tram cu hoac tram moi).
const existsInTable = async (table, code) => {
  const result = await QueryDatabase(`SELECT 1 FROM hochiminh."${table}" WHERE "KiHieu" = $1 LIMIT 1`, [code]);
  return result.rowCount > 0;
};

const listCustomRows = async ({layer, kiHieu, startDate, endDate}) => {
  const params = [layer];
  const where = [`"Layer" = $1`];
  if (kiHieu) {
    params.push(kiHieu);
    where.push(`"KiHieu" = $${params.length}`);
  }
  if (startDate) {
    params.push(startDate);
    where.push(`"ThoiDiem" >= $${params.length}::date AT TIME ZONE 'Asia/Ho_Chi_Minh'`);
  }
  if (endDate) {
    params.push(endDate);
    where.push(`"ThoiDiem" < ($${params.length}::date + 1) AT TIME ZONE 'Asia/Ho_Chi_Minh'`);
  }
  const result = await QueryDatabase(
    `SELECT "KiHieu", "ThoiDiem", "Values" FROM hochiminh."SoLieuTramMoi"
     WHERE ${where.join(" AND ")} ORDER BY "ThoiDiem" DESC`,
    params,
  );
  return result.rows;
};

const createCustomRow = async ({layer, kiHieu, thoiDiem, values}) => {
  const result = await QueryDatabase(
    `INSERT INTO hochiminh."SoLieuTramMoi" ("Layer", "KiHieu", "ThoiDiem", "Values")
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, "KiHieu", "ThoiDiem", "Values"`,
    [layer, kiHieu, thoiDiem, JSON.stringify(values)],
  );
  return result.rows[0];
};

const getCustomRow = async ({layer, kiHieu, thoiDiem}) => {
  const result = await QueryDatabase(
    `SELECT id, "KiHieu", "ThoiDiem", "Values" FROM hochiminh."SoLieuTramMoi"
     WHERE "Layer" = $1 AND "KiHieu" = $2 AND "ThoiDiem" = $3`,
    [layer, kiHieu, thoiDiem],
  );
  return result.rows[0] || null;
};

const updateCustomRow = async ({layer, kiHieu, thoiDiem, values}) => {
  const result = await QueryDatabase(
    `UPDATE hochiminh."SoLieuTramMoi" SET "Values" = $4::jsonb, updated_at = now()
     WHERE "Layer" = $1 AND "KiHieu" = $2 AND "ThoiDiem" = $3
     RETURNING id, "KiHieu", "ThoiDiem", "Values"`,
    [layer, kiHieu, thoiDiem, JSON.stringify(values)],
  );
  return result.rows[0] || null;
};

const deleteCustomRow = async ({layer, kiHieu, thoiDiem}) => {
  const result = await QueryDatabase(
    `DELETE FROM hochiminh."SoLieuTramMoi" WHERE "Layer" = $1 AND "KiHieu" = $2 AND "ThoiDiem" = $3`,
    [layer, kiHieu, thoiDiem],
  );
  return result.rowCount > 0;
};

// "id" so nguyen cua hochiminh."SoLieuTramMoi" - dung cho sua/xoa 1 dong tam qua URL dang "custom:<id>".
const CUSTOM_ID_PREFIX = "custom:";

const isCustomRowId = (id) => typeof id === "string" && id.startsWith(CUSTOM_ID_PREFIX);
const toCustomRowId = (id) => `${CUSTOM_ID_PREFIX}${id}`;
const fromCustomRowId = (id) => parseInt(String(id).slice(CUSTOM_ID_PREFIX.length), 10);

const getCustomRowById = async (id) => {
  const result = await QueryDatabase(
    `SELECT id, "Layer", "KiHieu", "ThoiDiem", "Values" FROM hochiminh."SoLieuTramMoi" WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
};

const updateCustomRowById = async (id, {thoiDiem, values}) => {
  const result = await QueryDatabase(
    `UPDATE hochiminh."SoLieuTramMoi" SET "ThoiDiem" = $2, "Values" = $3::jsonb, updated_at = now()
     WHERE id = $1
     RETURNING id, "Layer", "KiHieu", "ThoiDiem", "Values"`,
    [id, thoiDiem, JSON.stringify(values)],
  );
  return result.rows[0] || null;
};

const deleteCustomRowById = async (id) => {
  const result = await QueryDatabase(`DELETE FROM hochiminh."SoLieuTramMoi" WHERE id = $1`, [id]);
  return result.rowCount > 0;
};

const countCustomRows = async ({layer, kiHieu}) => {
  const result = await QueryDatabase(
    `SELECT
       TO_CHAR(MIN("ThoiDiem") AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS min_date,
       TO_CHAR(MAX("ThoiDiem") AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS max_date,
       MIN("ThoiDiem") AS min_time, MAX("ThoiDiem") AS max_time, COUNT(*) AS total
     FROM hochiminh."SoLieuTramMoi" WHERE "Layer" = $1 AND "KiHieu" = $2`,
    [layer, kiHieu],
  );
  return result.rows[0];
};

module.exports = {
  existsInTable,
  listCustomRows,
  getCustomRow,
  createCustomRow,
  updateCustomRow,
  deleteCustomRow,
  countCustomRows,
  isCustomRowId,
  toCustomRowId,
  fromCustomRowId,
  getCustomRowById,
  updateCustomRowById,
  deleteCustomRowById,
};
