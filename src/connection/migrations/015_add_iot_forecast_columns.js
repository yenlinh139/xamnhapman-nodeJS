// API dự báo trả thêm 3 trạm IoT (KenhAnHa, KenhC, KenhVuonThom) -> thêm cột riêng cho từng trạm.
// Lượt dự báo đang lưu được đồng bộ trước khi có các cột này (thiếu số liệu IoT) nên xoá đi để lần
// đồng bộ kế tiếp tải lại đầy đủ - hệ thống vốn chỉ giữ 1 lượt, forecast_values xoá theo (CASCADE).
const {FORECAST_IOT_COLUMNS} = require("../../configs/forecastStations");

module.exports = {
  name: "015_add_iot_forecast_columns",
  async up(QueryDatabase) {
    for (const col of FORECAST_IOT_COLUMNS) {
      await QueryDatabase(`
        ALTER TABLE forecast_system.forecast_values
        ADD COLUMN IF NOT EXISTS "${col}" NUMERIC(6, 2),
        ADD COLUMN IF NOT EXISTS "${col}_Daily" NUMERIC(6, 2);
      `);
    }
    await QueryDatabase(`DELETE FROM forecast_system.forecast_runs`);
  },
};
