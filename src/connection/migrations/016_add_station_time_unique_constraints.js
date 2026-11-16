// Rang buoc "tram + ngay (gio) la duy nhat" o tang DB cho cac bang so lieu cua trang Quan tri du lieu.
//
//  - hochiminh."KhiTuong" / "ThuyVan": bang RONG, moi ngay 1 dong (cac tram la cot) -> UNIQUE("Ngày")
//    dam bao khong the co 2 dong cung ngay, tuc khong the co 2 ban ghi cung (tram, ngay).
//    (hochiminh."TongLuongXa" da co PRIMARY KEY ("Ngày"), iot_system.iot_data da co
//    UNIQUE (serial_number, date_time) tu truoc.)
//  - hochiminh."DoManChiTiet": UNIQUE ("KiHieu", "ThoiDiem").
//
// Chi tao index khi bang CHUA co dong trung - neu da co (vd DoManChiTiet nap tu file Excel goc co
// san mot so cap tram + thoi diem trung nhau voi gia tri khac nhau) thi BO QUA va ghi log, KHONG tu
// xoa du lieu. Khi do rang buoc van duoc kiem tra o tang ung dung (controller tra 409). Sau khi da
// xu ly du lieu trung, chay lai cau CREATE UNIQUE INDEX tuong ung la xong.
const logger = require("../../loggers/loggers.config");

const TARGETS = [
  {table: "KhiTuong", columns: ["Ngày"], index: "uq_khituong_ngay"},
  {table: "ThuyVan", columns: ["Ngày"], index: "uq_thuyvan_ngay"},
  {table: "DoManChiTiet", columns: ["KiHieu", "ThoiDiem"], index: "uq_domanchitiet_kihieu_thoidiem"},
];

module.exports = {
  name: "016_add_station_time_unique_constraints",
  async up(QueryDatabase) {
    for (const {table, columns, index} of TARGETS) {
      const cols = columns.map((c) => `"${c}"`).join(", ");
      const dup = await QueryDatabase(
        `SELECT COUNT(*) AS groups FROM (SELECT 1 FROM hochiminh."${table}" GROUP BY ${cols} HAVING COUNT(*) > 1) t`,
      );
      const groups = parseInt(dup.rows[0]?.groups || 0);
      if (groups > 0) {
        const message = `[016] Bo qua UNIQUE index ${index}: hochiminh."${table}" dang co ${groups} nhom (${columns.join(", ")}) trung nhau.`;
        console.warn(message);
        logger.warn(message);
        continue;
      }
      await QueryDatabase(`CREATE UNIQUE INDEX IF NOT EXISTS ${index} ON hochiminh."${table}" (${cols})`);
    }
  },
};
