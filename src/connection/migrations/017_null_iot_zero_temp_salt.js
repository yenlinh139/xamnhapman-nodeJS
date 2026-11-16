// Dau do man/nhiet cua tram IoT khi loi van tra ve 0 voi status "Good" (vd Cong Kenh C
// 20-23/10/2026). Nhiet do nuoc = 0 la mat tin hieu chu khong phai gia tri do that, nen chuan hoa
// du lieu da dong bo ve NULL: nhiet do = 0 -> NULL, va do man = 0 tai cung ban ghi do -> NULL.
// iotSyncService.saveToDatabase ap dung cung quy tac nay cho du lieu dong bo moi.
module.exports = {
  name: "017_null_iot_zero_temp_salt",
  async up(QueryDatabase) {
    await QueryDatabase(`
      UPDATE iot_system.iot_data
      SET
        salt_status = CASE WHEN salt_value = 0 THEN NULL ELSE salt_status END,
        salt_value = NULLIF(salt_value, 0),
        temp_value = NULL,
        temp_status = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE temp_value = 0;
    `);
  },
};
