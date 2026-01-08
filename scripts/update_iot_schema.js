/**
 * Script cập nhật database schema cho IoT system
 * Tách cột datetime thành 2 cột riêng biệt: date và time
 *
 * Chạy: node scripts/update_iot_schema.js
 */

const {Pool} = require("pg");
require("dotenv").config();

// Database connection sử dụng config giống như src/connection/database.connection.js
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
  database: process.env.DB_DATABASE,
  port: Number(process.env.DB_PORT),
  max: 10,
  idleTimeoutMillis: 1500,
  connectionTimeoutMillis: 5000,
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

async function updateIoTSchema() {
  console.log("🚀 Bắt đầu cập nhật schema IoT database...");

  try {
    // 1. Backup dữ liệu hiện tại
    console.log("📦 Tạo backup table...");
    await queryDatabase(`
      CREATE TABLE IF NOT EXISTS iot_data_backup AS 
      SELECT * FROM iot_data;
    `);

    // 1.1. Clear tất cả data và reset ID sequence về 1
    console.log("🗑️ Clear tất cả data iot_data và reset ID về 1...");
    try {
      // Xóa tất cả dữ liệu
      await queryDatabase(`TRUNCATE TABLE iot_data RESTART IDENTITY;`);
      console.log("✅ Đã clear tất cả data và reset ID sequence về 1");
    } catch (error) {
      console.log(`⚠️ Lỗi khi clear data: ${error.message}`);
      // Fallback: DELETE và reset sequence thủ công
      await queryDatabase(`DELETE FROM iot_data;`);
      await queryDatabase(`ALTER SEQUENCE iot_data_id_seq RESTART WITH 1;`);
      console.log("✅ Đã clear data và reset ID bằng cách thủ công");
    }

    await queryDatabase(`
      UPDATE iot_data 
      SET "date" = DATE_TRUNC('minute', "date")
      WHERE "date" IS NOT NULL;
    `);
    console.log("✅ Đã format date_time cho API response");

    // 5. Tạo index cho performance (chỉ cần index cho date_time)
    console.log("🏃‍♂️ Tạo index cho date_time performance...");

    // Index cho iot_data (chỉ cần date_time)
    await queryDatabase(`
      CREATE INDEX IF NOT EXISTS idx_iot_data_datetime ON iot_data(date);
    `);
    await queryDatabase(`
      CREATE INDEX IF NOT EXISTS idx_iot_data_serial_datetime ON iot_data(serial_number, date);
    `);

    // Index cho iot_stations (chỉ những cột thực tế có)
    await queryDatabase(`
      CREATE INDEX IF NOT EXISTS idx_iot_stations_phanloai ON iot_stations("PhanLoai");
    `);
    await queryDatabase(`
      CREATE INDEX IF NOT EXISTS idx_iot_stations_kihieu ON iot_stations("KiHieu");
    `);
    await queryDatabase(`
      CREATE INDEX IF NOT EXISTS idx_iot_stations_serial ON iot_stations(serial_number);
    `);

    console.log("✅ Đã tạo tất cả index cần thiết");

    // 6. Kiểm tra kết quả
    console.log("🔍 Kiểm tra kết quả API data structure...");
    const result = await queryDatabase(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(date) as records_with_datetime,
        MIN(date) as earliest_datetime,
        MAX(date) as latest_datetime
      FROM iot_data;
    `);

    console.log("📊 Kết quả API data structure:");
    console.log(`   - Tổng records: ${result.rows[0].total_records}`);
    console.log(`   - Records có date_time: ${result.rows[0].records_with_datetime}`);
    console.log(`   - DateTime sớm nhất: ${result.rows[0].earliest_datetime}`);
    console.log(`   - DateTime muộn nhất: ${result.rows[0].latest_datetime}`);

    // 7. Sample data API response format
    const sampleData = await queryDatabase(`
      SELECT serial_number, sensor_type, value, date as date_time
      FROM iot_data 
      ORDER BY date DESC 
      LIMIT 5;
    `);

    console.log("🎯 Sample API response data:");
    if (sampleData.rows.length === 0) {
      console.log("   (Không có data nào - đã được clear)");
    } else {
      sampleData.rows.forEach((row, index) => {
        console.log(`   ${index + 1}. ${row.serial_number} - ${row.sensor_type}: ${row.value}`);
        console.log(`      date_time: ${row.date_time}`);
      });
    }

    console.log("✅ Cập nhật database cho API thành công!");
    console.log("");
    console.log("📝 Ghi chú:");
    console.log("   - Backup table: iot_data_backup");
    console.log("   - Đã clear tất cả data iot_data và reset ID về 1");
    console.log("   - Đã xóa cột: date_only, time_only");
    console.log("   - Index mới: idx_iot_data_datetime, idx_iot_data_serial_datetime");
    console.log("   - API chỉ trả về: date_time (format 'YYYY-MM-DD HH:MM')");
    console.log("   - Cột date được truncate về phút (loại bỏ giây)");
    console.log("   - Cột ThoiGian của iot_stations: VARCHAR với giá trị '25/8/2025-nay'");
    console.log("");
    console.log("🔧 Để rollback (nếu cần):");
    console.log("   1. DROP TABLE iot_data;");
    console.log("   2. ALTER TABLE iot_data_backup RENAME TO iot_data;");
  } catch (error) {
    console.error("❌ Lỗi khi cập nhật schema:", error);
    process.exit(1);
  }
}

// Chạy script
if (require.main === module) {
  updateIoTSchema()
    .then(() => {
      console.log("");
      console.log("🎉 Script hoàn thành!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Script thất bại:", error);
      process.exit(1);
    });
}

module.exports = {updateIoTSchema};
