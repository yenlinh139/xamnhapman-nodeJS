// Don vi thuc te cua cam bien khoang cach (distance_value, dung lam "muc nuoc" tai tram IoT) la
// CENTIMET, khong phai MET nhu cot "distance_unit" dang mac dinh/luu - gia tri 1-2 (m) la vo ly
// cho mot cam bien treo tren cong/kenh, trong khi 100-200 (cm) thi hop ly. Sua tan goc:
//   1) Doi DEFAULT cua cot ve 'cm' de moi ban ghi tu nay ve sau dung don vi.
//   2) Cap nhat lai toan bo ban ghi cu dang ghi nham 'm' thanh 'cm' (khong doi GIA TRI, chi doi nhan don vi).
module.exports = {
  name: "019_fix_iot_distance_unit_to_cm",
  async up(QueryDatabase) {
    await QueryDatabase(`ALTER TABLE iot_system.iot_data ALTER COLUMN distance_unit SET DEFAULT 'cm';`);
    await QueryDatabase(`UPDATE iot_system.iot_data SET distance_unit = 'cm' WHERE distance_unit = 'm';`);
  },
};
