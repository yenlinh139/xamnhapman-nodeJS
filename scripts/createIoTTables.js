// Load environment variables FIRST
require("dotenv").config();

const {Pool} = require("pg");
const logger = require("../src/loggers/loggers.config");

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
  database: process.env.DB_DATABASE,
  port: Number(process.env.DB_PORT),
  max: 10,
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

/**
 * Tạo lại các bảng IoT đã bị xóa
 */
async function createIoTTables() {
  console.log("🚀 Bắt đầu tạo lại các bảng IoT...");

  try {
    // 0. Tạo schema iot_system riêng cho IoT (không dùng hochiminh)
    console.log("🏢 Tạo schema iot_system...");
    await queryDatabase(`CREATE SCHEMA IF NOT EXISTS iot_system;`);
    console.log("✅ Đã tạo schema iot_system");

    // 1. Tạo bảng iot_stations trong schema iot_system
    console.log("📊 Tạo bảng iot_system.iot_stations...");
    await queryDatabase(`
      CREATE TABLE IF NOT EXISTS iot_system.iot_stations (
          id SERIAL PRIMARY KEY,
          station_code VARCHAR(255),
          serial_number VARCHAR(255) UNIQUE NOT NULL,
          station_name VARCHAR(255) NOT NULL,
          longitude VARCHAR(50),
          latitude VARCHAR(50),
          station_type VARCHAR(50) DEFAULT 'Trạm IoT',
          frequency VARCHAR(20) DEFAULT '5 phút',
          time_period VARCHAR(50) DEFAULT '25/8/2025-nay',
          note TEXT,
          status VARCHAR(50) DEFAULT 'active',
          updated_at TIMESTAMP NULL,
          deleted_at TIMESTAMP NULL
      );
    `);
    console.log("✅ Đã tạo bảng iot_system.iot_stations");

    // 2. Tạo bảng iot_data với 4 loại dữ liệu chính
    console.log("📊 Tạo bảng iot_system.iot_data (4 sensor types)...");
    await queryDatabase(`
      CREATE TABLE IF NOT EXISTS iot_system.iot_data (
          id SERIAL PRIMARY KEY,
          serial_number VARCHAR(50) NOT NULL,
          date_time TIMESTAMP NOT NULL,
          distance_value NUMERIC(10, 4) NULL,
          distance_unit VARCHAR(20) DEFAULT 'm',
          distance_status VARCHAR(50) NULL,
          daily_rainfall_value NUMERIC(10, 4) NULL,
          daily_rainfall_unit VARCHAR(20) DEFAULT 'mm',
          daily_rainfall_status VARCHAR(50) NULL,
          salt_value NUMERIC(10, 4) NULL,
          salt_unit VARCHAR(20) DEFAULT 'ppt',
          salt_status VARCHAR(50) NULL,
          temp_value NUMERIC(10, 4) NULL,
          temp_unit VARCHAR(20) DEFAULT '°C',
          temp_status VARCHAR(50) NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          deleted_at TIMESTAMP NULL,
          CONSTRAINT iot_data_serial_number_date_time_key UNIQUE (serial_number, date_time),
          CONSTRAINT fk_iot_data_serial_number FOREIGN KEY (serial_number) REFERENCES iot_system.iot_stations(serial_number) ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);
    console.log("✅ Đã tạo bảng iot_system.iot_data");

    // 3. Tạo bảng iot_sync_logs trong schema iot_system
    console.log("📊 Tạo bảng iot_system.iot_sync_logs...");
    await queryDatabase(`
      CREATE TABLE IF NOT EXISTS iot_system.iot_sync_logs (
          id SERIAL PRIMARY KEY,
          serial_number VARCHAR(255),
          status VARCHAR(50),
          records_synced INTEGER DEFAULT 0,
          records_inserted INTEGER DEFAULT 0,
          records_updated INTEGER DEFAULT 0,
          sync_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          sync_duration_ms INTEGER DEFAULT 0,
          error_message TEXT,
          start_date DATE,
          end_date DATE
      );
    `);
    console.log("✅ Đã tạo bảng iot_system.iot_sync_logs");

    // 4. Thêm dữ liệu mẫu cho iot_system.iot_stations
    console.log("🏭 Thêm dữ liệu trạm IoT vào schema iot_system...");
    await queryDatabase(`
      INSERT INTO iot_system.iot_stations 
      (station_code, serial_number, station_name, longitude, latitude, station_type, frequency, time_period, note)
      VALUES 
      ('CKC_IoT', 'Log01250713', 'Cống Kênh C', '106°33''57.61872''E', '10°42''20.17924''N', 'Trạm IoT', '5 phút', '25/8/2025-nay', ''),
      ('CAH_IoT', 'Log01250711', 'Cà Mau Hạ', '104°44''52.25088''E', '9°10''31.23756''N', 'Trạm IoT', '5 phút', '25/8/2025-nay', ''),
      ('CVT_IoT', '', 'Cống Vườn Thơm', '106°29''29.1''E', '10°45''38.5''N', 'Trạm IoT', '5 phút', '', 'Chưa lắp đặt')
      ON CONFLICT (serial_number) DO UPDATE SET
      station_code = EXCLUDED.station_code,
      station_name = EXCLUDED.station_name,
      longitude = EXCLUDED.longitude,
      latitude = EXCLUDED.latitude,
      station_type = EXCLUDED.station_type,
      frequency = EXCLUDED.frequency,
      time_period = EXCLUDED.time_period,
      note = EXCLUDED.note;
    `);
    console.log("✅ Đã thêm dữ liệu trạm IoT vào schema iot_system");

    // 5. Tạo các index cần thiết cho schema iot_system
    console.log("🏃‍♂️ Tạo index cho performance...");

    // Index cho iot_system.iot_data
    await queryDatabase(`CREATE INDEX IF NOT EXISTS idx_iot_iot_data_datetime ON iot_system.iot_data USING btree (date_time);`);
    await queryDatabase(`CREATE INDEX IF NOT EXISTS idx_iot_iot_data_serial ON iot_system.iot_data(serial_number);`);

    // Index cho iot_system.iot_stations
    await queryDatabase(`CREATE INDEX IF NOT EXISTS idx_iot_iot_stations_serial ON iot_system.iot_stations(serial_number);`);
    await queryDatabase(`CREATE INDEX IF NOT EXISTS idx_iot_iot_stations_code ON iot_system.iot_stations(station_code);`);
    await queryDatabase(`CREATE INDEX IF NOT EXISTS idx_iot_iot_stations_type ON iot_system.iot_stations(station_type);`);

    console.log("✅ Đã tạo tất cả index cho schema iot_system");

    // 6. Kiểm tra kết quả trong schema iot_system
    console.log("🔍 Kiểm tra kết quả trong schema iot_system...");

    const stationsResult = await queryDatabase(`SELECT COUNT(*) as count FROM iot_system.iot_stations;`);
    console.log(`📊 Bảng iot_system.iot_stations: ${stationsResult.rows[0].count} trạm`);

    const dataResult = await queryDatabase(`SELECT COUNT(*) as count FROM iot_system.iot_data;`);
    console.log(`📊 Bảng iot_system.iot_data: ${dataResult.rows[0].count} bản ghi`);

    const logsResult = await queryDatabase(`SELECT COUNT(*) as count FROM iot_system.iot_sync_logs;`);
    console.log(`📊 Bảng iot_system.iot_sync_logs: ${logsResult.rows[0].count} log`);

    // 7. Hiển thị danh sách trạm
    const stations = await queryDatabase(`
      SELECT station_code, serial_number, station_name 
      FROM iot_system.iot_stations 
      ORDER BY station_code;
    `);

    console.log("\n🏭 Danh sách trạm IoT đã tạo trong schema iot_system:");
    stations.rows.forEach((station) => {
      console.log(`   - ${station.station_code}: ${station.station_name} (${station.serial_number})`);
    });

    console.log("\n✅ Tạo lại các bảng IoT thành công!");
    console.log("\n📝 Bước tiếp theo:");
    console.log("   1. Chạy sync dữ liệu: npm run iot:sync-batch 2025-08-25");
    console.log("   2. Hoặc chạy sync từng ngày: npm run iot:sync-daily 2025-08-25");
    console.log("   3. Kiểm tra dữ liệu: SELECT COUNT(*) FROM iot_data;");
  } catch (error) {
    console.error("❌ Lỗi khi tạo bảng IoT:", error.message);
    logger.error("Create IoT Tables Error:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Chạy script khi được gọi trực tiếp
if (require.main === module) {
  createIoTTables()
    .then(() => {
      console.log("\n🎉 Script hoàn thành!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Script thất bại:", error.message);
      process.exit(1);
    });
}

module.exports = {createIoTTables};
