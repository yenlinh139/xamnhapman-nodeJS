// Hoan tat viec bo bang tam cua tram/diem MOI (xem migration 022_add_custom_station_support.js):
// - 4 lop bang rong (rain/meteo/hydro/reservoir) gio cap COT THAT ngay luc tao tram
//   (hochiminh."TramMoiCot", xem migration 024 + utils/dynamicStationColumns.js).
// - Diem do man MOI ghi truc tiep vao hochiminh."DoManChiTiet" (bang hang dai, "KiHieu" la TEXT
//   thuong, khong can cot rieng) thay vi qua SoLieuTramMoi (xem salinityDetail.controller.js).
//
// Du lieu hien co trong 2 bang tam (kiem tra 2026-11-25) deu la du lieu TEST (tram "MD"/"fffghg",
// diem do man "gbd") - xoa luon theo xac nhan cua nguoi dung, khong migrate.
module.exports = {
  name: "025_drop_custom_station_temp_tables",
  async up(QueryDatabase) {
    await QueryDatabase(`DELETE FROM hochiminh."DiemDoMan" WHERE "KiHieu" = 'gbd'`);
    await QueryDatabase(`DELETE FROM hochiminh."TramKTTV" WHERE "KiHieu" IN ('MD', 'fffghg')`);

    await QueryDatabase(`DROP TABLE IF EXISTS hochiminh."SoLieuTramMoi"`);
    await QueryDatabase(`DROP TABLE IF EXISTS hochiminh."TramMoiLayer"`);
  },
};
