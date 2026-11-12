// Bang luu TUNG lan do thuc te (co the nhieu lan/ngay, vd toi 18 lan/ngay) cua pH/EC/do
// duc/do man theo dung "Thoi diem" (ngay + gio that), lay tu cung file Excel goc da dung o
// migration 010 nhung KHONG gop trung binh/ngay nhu DoMan/ChiSoNuoc - dung rieng de hien thi 2
// cot "Thoi diem"/"Gio" that su trong bang quan trac (DoMan/ChiSoNuoc van giu gia tri trung
// binh/ngay, dung cho bieu do va cac API tong quan hien co, khong doi).
//
// "ThoiDiem" luu dang TIMESTAMPTZ voi offset "+07:00" tuong minh tu luc build file JSON (xem
// build_salinity_detail.js) - tranh bug lech +00:00 vs +07:00 da gap voi du lieu du bao truoc do
// trong phien lam viec nay (server chay o timezone nao doc lai van ra dung gio VN that).
const fs = require("fs");
const path = require("path");

const CHUNK_SIZE = 1000;

const chunk = (arr, size) => {
  const result = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
};

module.exports = {
  name: "011_create_salinity_detail_table",
  async up(QueryDatabase) {
    await QueryDatabase(`
      CREATE TABLE IF NOT EXISTS hochiminh."DoManChiTiet" (
        id SERIAL PRIMARY KEY,
        "ThoiDiem" TIMESTAMPTZ NOT NULL,
        "KiHieu" TEXT NOT NULL,
        "DoMan" NUMERIC(10, 4),
        "pH" NUMERIC(5, 2),
        "DoDanDien" NUMERIC(10, 4),
        "DoDuc" NUMERIC(10, 2)
      );
    `);
    await QueryDatabase(`
      CREATE INDEX IF NOT EXISTS idx_domanchitiet_kihieu_thoidiem
      ON hochiminh."DoManChiTiet" ("KiHieu", "ThoiDiem" DESC);
    `);

    const dataPath = path.join(__dirname, "data_011_salinity_detail.json");
    const rows = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

    for (const batch of chunk(rows, CHUNK_SIZE)) {
      const valuesSql = [];
      const params = [];
      for (const row of batch) {
        const rowValues = [row.ThoiDiem, row.KiHieu, row.DoMan, row.pH, row.DoDanDien, row.DoDuc];
        const placeholders = rowValues.map((_, i) => `$${params.length + i + 1}`);
        valuesSql.push(`(${placeholders.join(", ")})`);
        params.push(...rowValues);
      }
      await QueryDatabase(
        `INSERT INTO hochiminh."DoManChiTiet" ("ThoiDiem", "KiHieu", "DoMan", "pH", "DoDanDien", "DoDuc")
         VALUES ${valuesSql.join(", ")}`,
        params,
      );
    }
  },
};
