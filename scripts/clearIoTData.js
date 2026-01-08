const {Pool} = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_DATABASE || "xamnhapman_tphcm",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "51397",
});

async function queryDatabase(query, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result;
  } finally {
    client.release();
  }
}

async function clearIoTData() {
  try {
    console.log("🗑️ Đang xóa dữ liệu cũ trong bảng iot_system.iot_data...");

    // Xóa tất cả dữ liệu trong bảng iot_data
    const result = await queryDatabase("DELETE FROM iot_system.iot_data");

    console.log(`✅ Đã xóa thành công dữ liệu cũ!`);

    // Reset sequence để ID bắt đầu từ 1
    await queryDatabase("ALTER SEQUENCE iot_system.iot_data_id_seq RESTART WITH 1");
    console.log("✅ Đã reset ID sequence!");

    // Xóa luôn sync logs cũ
    await queryDatabase("DELETE FROM iot_system.iot_sync_logs");
    await queryDatabase("ALTER SEQUENCE iot_system.iot_sync_logs_id_seq RESTART WITH 1");
    console.log("✅ Đã xóa sync logs cũ!");
  } catch (error) {
    console.error("❌ Lỗi khi xóa dữ liệu:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

clearIoTData();
