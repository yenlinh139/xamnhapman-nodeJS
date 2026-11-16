// Them diem do man moi "RBL" (Rach Ba Lao), theo file Excel chu cung cap
// "DoMan_6.2007_9.2026_them Rach Ba Lao.xlsx" (sheet DiemDoMan + pH_EC_DoDuc_DoMan_hour).
// Lam giong het cach "DoManChiTiet" + "DoMan"/"ChiSoNuoc" cua cac tram cu dang hoat dong:
//   1) Them cot "RBL" vao bang rong hochiminh."DoMan".
//   2) Them 1 dong vao hochiminh."DiemDoMan" (toa do, phan loai, thoi gian hoat dong...).
//   3) Nap 25 ban ghi thuc te (moi ban ghi 1 lan khao sat luc 12:00 trua, dung quy uoc cua cac
//      tram khac) vao hochiminh."DoManChiTiet".
//   4) Vi moi ngay chi co dung 1 ban ghi/tram nen "trung binh/ngay" = chinh gia tri do -> ghi
//      thang vao hochiminh."DoMan"."RBL" va hochiminh."ChiSoNuoc" (khong can gom nhieu dong).
const fs = require("fs");
const path = require("path");

const RBL_STATION = {
  KiHieu: "RBL",
  TenDiem: "Rạch Bà Lào",
  KinhDo: `106°40'41.4"E`,
  ViDo: `10°41'00.9"N`,
  PhanLoai: "Trạm khảo sát",
  ThoiGian: "30/12/2025-nay",
  TanSuat: "4 lần/tháng",
};

module.exports = {
  name: "018_add_rbl_salinity_station",
  async up(QueryDatabase) {
    const dataPath = path.join(__dirname, "data_018_rbl.json");
    const rows = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

    await QueryDatabase(`ALTER TABLE hochiminh."DoMan" ADD COLUMN IF NOT EXISTS "RBL" DOUBLE PRECISION;`);

    await QueryDatabase(
      `
        INSERT INTO hochiminh."DiemDoMan" ("KiHieu", "TenDiem", "KinhDo", "ViDo", "PhanLoai", "ThoiGian", "TanSuat")
        SELECT $1, $2, $3, $4, $5, $6, $7
        WHERE NOT EXISTS (SELECT 1 FROM hochiminh."DiemDoMan" WHERE "KiHieu" = $1::varchar)
      `,
      [
        RBL_STATION.KiHieu,
        RBL_STATION.TenDiem,
        RBL_STATION.KinhDo,
        RBL_STATION.ViDo,
        RBL_STATION.PhanLoai,
        RBL_STATION.ThoiGian,
        RBL_STATION.TanSuat,
      ],
    );

    for (const row of rows) {
      await QueryDatabase(
        `
          INSERT INTO hochiminh."DoManChiTiet" ("ThoiDiem", "KiHieu", "DoMan", "pH", "DoDanDien", "DoDuc")
          SELECT $1::timestamptz, 'RBL', $2, $3, $4, $5
          WHERE NOT EXISTS (
            SELECT 1 FROM hochiminh."DoManChiTiet" WHERE "KiHieu" = 'RBL' AND "ThoiDiem" = $1::timestamptz
          )
        `,
        [row.thoiDiem, row.doMan, row.pH, row.ec, row.doDuc],
      );

      const isoDate = row.thoiDiem.slice(0, 10);

      const existingDoManRow = await QueryDatabase(`SELECT 1 FROM hochiminh."DoMan" WHERE "Ngày" = $1::date`, [isoDate]);
      if (existingDoManRow.rowCount > 0) {
        await QueryDatabase(`UPDATE hochiminh."DoMan" SET "RBL" = $1 WHERE "Ngày" = $2::date`, [row.doMan, isoDate]);
      } else {
        await QueryDatabase(`INSERT INTO hochiminh."DoMan" ("Ngày", "RBL") VALUES ($1::date, $2)`, [isoDate, row.doMan]);
      }

      await QueryDatabase(
        `
          INSERT INTO hochiminh."ChiSoNuoc" ("Ngày", "KiHieu", "pH", "DoDanDien", "DoDuc")
          VALUES ($1::date, 'RBL', $2, $3, $4)
          ON CONFLICT ("Ngày", "KiHieu") DO UPDATE SET "pH" = $2, "DoDanDien" = $3, "DoDuc" = $4
        `,
        [isoDate, row.pH, row.ec, row.doDuc],
      );
    }
  },
};
