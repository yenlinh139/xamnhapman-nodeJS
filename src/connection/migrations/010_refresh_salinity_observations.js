// Thay toan bo du lieu quan trac do man (hochiminh."DoMan") + chi so nuoc moi
// (hochiminh."ChiSoNuoc") bang du lieu that do thay cung cap (file Excel goc
// "DoMan_6.2007_9.2026.xlsx", sheet "pH_EC_DoDuc_DoMan_hour"). Du lieu nguon co nhieu ban ghi/
// ngay cho 1 so ngay (toi da 18 ban ghi/ngay, vd dot khao sat 2h/lan) nhung schema hien tai cua
// DoMan/ChiSoNuoc la grain theo NGAY (cot "Ngay" kieu DATE) - nen gop trung binh cac ban ghi
// cung ngay/cung tram thanh 1 gia tri/ngay (bo qua null khi tinh trung binh) truoc khi nap.
//
// Luu y quan trong da phat hien khi doi chieu: cot "Ngay" rieng trong file Excel goc BI LECH
// 1 ngay so voi cot "ThoiDiem" (day du) o ~98% so dong (loi co san tu file nguon, co le do tinh
// toan UTC/gio VN khac nhau giua 2 cot). Da dung "ThoiDiem" (dang tin cay hon, khop dung voi
// moc thuc te: tram Kenh Xang dung 2 bat dau dung ngay 2024-12-07) de xac dinh ngay, KHONG dung
// cot "Ngay" co san trong file.
//
// Script gop du lieu (khong chay lai duoc vi phu thuoc file Excel tren may local) da duoc chay
// 1 lan de tao ra file data_010_salinity_refresh.json di kem trong thu muc nay.
const fs = require("fs");
const path = require("path");

const STATION_CODES = ["CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL", "KXD2"];
const CHUNK_SIZE = 500;

const chunk = (arr, size) => {
  const result = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
};

module.exports = {
  name: "010_refresh_salinity_observations",
  async up(QueryDatabase) {
    const dataPath = path.join(__dirname, "data_010_salinity_refresh.json");
    const {doMan, chiSoNuoc} = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

    // 1) Backup du lieu cu truoc khi xoa, phong truong hop can doi chieu lai sau nay.
    await QueryDatabase(`
      CREATE TABLE IF NOT EXISTS hochiminh."DoMan_backup_20261112" AS
      SELECT * FROM hochiminh."DoMan";
    `);
    await QueryDatabase(`
      CREATE TABLE IF NOT EXISTS hochiminh."ChiSoNuoc_backup_20261112" AS
      SELECT * FROM hochiminh."ChiSoNuoc";
    `);

    // 2) Xoa toan bo du lieu quan trac cu.
    await QueryDatabase(`TRUNCATE TABLE hochiminh."DoMan" RESTART IDENTITY;`);
    await QueryDatabase(`TRUNCATE TABLE hochiminh."ChiSoNuoc";`);

    // 3) Chuan hoa lai kieu cot ve DOUBLE PRECISION that su. Truoc day 1 so cot la
    // "character varying" - co kha nang tung chua chuoi van ban "NULL" thay vi SQL NULL that,
    // khien cac truy van chi kiem tra "IS NOT NULL" khong loai duoc nhung ban ghi nay (xem muc
    // 2 trong yeu cau: khong duoc tinh gia tri null vao tong so ban ghi / khoang thoi gian).
    // Bang da duoc TRUNCATE o buoc 2 nen ALTER TYPE o day luon an toan (khong co du lieu de ep
    // kieu sai).
    for (const code of STATION_CODES) {
      await QueryDatabase(`
        ALTER TABLE hochiminh."DoMan"
        ALTER COLUMN "${code}" TYPE DOUBLE PRECISION USING "${code}"::DOUBLE PRECISION;
      `);
    }

    // 4) Nap lai du lieu da gop (trung binh/ngay/tram, bo qua null) tu file JSON kem theo.
    const doManChunks = chunk(doMan, CHUNK_SIZE);
    for (const batch of doManChunks) {
      const cols = ["Ngày", ...STATION_CODES];
      const valuesSql = [];
      const params = [];
      for (const row of batch) {
        const rowValues = [row.Ngay, ...STATION_CODES.map((c) => row[c])];
        const placeholders = rowValues.map((_, i) => `$${params.length + i + 1}`);
        valuesSql.push(`(${placeholders.join(", ")})`);
        params.push(...rowValues);
      }
      await QueryDatabase(
        `INSERT INTO hochiminh."DoMan" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES ${valuesSql.join(", ")}`,
        params,
      );
    }

    const chiSoNuocChunks = chunk(chiSoNuoc, CHUNK_SIZE);
    for (const batch of chiSoNuocChunks) {
      const valuesSql = [];
      const params = [];
      for (const row of batch) {
        const rowValues = [row.Ngay, row.KiHieu, row.pH, row.DoDanDien, row.DoDuc];
        const placeholders = rowValues.map((_, i) => `$${params.length + i + 1}`);
        valuesSql.push(`(${placeholders.join(", ")})`);
        params.push(...rowValues);
      }
      await QueryDatabase(
        `INSERT INTO hochiminh."ChiSoNuoc" ("Ngày", "KiHieu", "pH", "DoDanDien", "DoDuc") VALUES ${valuesSql.join(", ")}`,
        params,
      );
    }
  },
};
