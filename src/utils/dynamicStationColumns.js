// Tien ich cho "Them vi tri" cua 4 lop bang rong (rain/meteo/hydro/reservoir): tram MOI duoc cap
// CỘT THẬT trong bang chinh thuc (ALTER TABLE ... ADD COLUMN) ngay luc tao, khong qua bang tam nua.
// Ten cot duoc sinh tu động theo quy uoc "<fieldKey>_<MA_TRAM_DA_LAM_SACH>" va luu lai trong
// hochiminh."TramMoiCot" de code biet cot nao ung voi tram+field nao (thay cho mapping cung trong
// JS chi dung duoc voi cac tram co san).
const QueryDatabase = require("./queryDatabase");

// Chi cho phep chu hoa/so/gach duoi, bat buoc bat dau bang chu - an toan de noi thang vao ten cot
// SQL (khong the tham so hoa ten cot). Nem loi neu ma tram khong hop le thay vi am tham chen ky tu lạ.
const sanitizeStationCode = (code) => {
  const cleaned = String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  if (!/^[A-Z][A-Z0-9_]*$/.test(cleaned)) {
    throw new Error(`Mã/Ký hiệu "${code}" chứa ký tự không hợp lệ cho tên cột (chỉ chữ/số/gạch dưới, bắt đầu bằng chữ)`);
  }
  return cleaned;
};

const columnNameFor = (fieldKey, sanitizedCode) => `${fieldKey}_${sanitizedCode}`;

// Them cot that cho tung field cua 1 tram MOI + ghi lai mapping vao TramMoiCot.
// `fields`: [{key, sqlType}] - sqlType la kieu cot SQL (vd "TEXT", "DOUBLE PRECISION").
const ensureStationColumns = async ({table, layerKey, code, fields}) => {
  const sanitizedCode = sanitizeStationCode(code);
  const mapping = {};

  for (const field of fields) {
    const columnName = columnNameFor(field.key, sanitizedCode);
    await QueryDatabase(`ALTER TABLE hochiminh."${table}" ADD COLUMN IF NOT EXISTS "${columnName}" ${field.sqlType}`);
    await QueryDatabase(
      `INSERT INTO hochiminh."TramMoiCot" ("Layer", "KiHieu", "FieldKey", "ColumnName")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("Layer", "KiHieu", "FieldKey") DO UPDATE SET "ColumnName" = $4`,
      [layerKey, code, field.key, columnName],
    );
    mapping[field.key] = columnName;
  }

  return mapping;
};

// Doc mapping {KiHieu -> {fieldKey: columnName}} cua TAT CA tram MOI da dang ky cho 1 layer - gop
// voi mapping cung (layer.stations) de co danh sach day du.
const getDynamicStationMapping = async (layerKey) => {
  const result = await QueryDatabase(`SELECT "KiHieu", "FieldKey", "ColumnName" FROM hochiminh."TramMoiCot" WHERE "Layer" = $1`, [
    layerKey,
  ]);
  const mapping = {};
  result.rows.forEach((row) => {
    if (!mapping[row.KiHieu]) mapping[row.KiHieu] = {};
    mapping[row.KiHieu][row.FieldKey] = row.ColumnName;
  });
  return mapping;
};

// Go dang ky 1 tram MOI: XOA cac cot that da tao rieng cho tram nay (an toan vi chi dong nay tham
// chieu toi cac cot do - khong anh huong tram khac) roi xoa mapping trong TramMoiCot.
const dropStationColumns = async ({table, layerKey, code}) => {
  const result = await QueryDatabase(`SELECT "ColumnName" FROM hochiminh."TramMoiCot" WHERE "Layer" = $1 AND "KiHieu" = $2`, [
    layerKey,
    code,
  ]);
  for (const row of result.rows) {
    await QueryDatabase(`ALTER TABLE hochiminh."${table}" DROP COLUMN IF EXISTS "${row.ColumnName}"`);
  }
  await QueryDatabase(`DELETE FROM hochiminh."TramMoiCot" WHERE "Layer" = $1 AND "KiHieu" = $2`, [layerKey, code]);
};

module.exports = {
  sanitizeStationCode,
  columnNameFor,
  ensureStationColumns,
  getDynamicStationMapping,
  dropStationColumns,
};
