const {Pool} = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_DATABASE || "xamnhapman_tphcm",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "51397",
});

async function testStatus() {
  try {
    const result = await pool.query(`
      SELECT 
        serial_number, 
        date_time, 
        distance_value, 
        distance_status, 
        salt_value, 
        salt_status, 
        temp_value, 
        temp_status,
        daily_rainfall_value,
        daily_rainfall_status
      FROM iot_system.iot_data 
      WHERE date_time >= '2025-09-01' 
      AND (distance_status IS NOT NULL 
           OR salt_status IS NOT NULL 
           OR temp_status IS NOT NULL
           OR daily_rainfall_status IS NOT NULL) 
      ORDER BY date_time DESC 
      LIMIT 10
    `);

    console.log("📊 Dữ liệu IoT với Status (10 records mới nhất):");
    console.table(result.rows);

    if (result.rows.length === 0) {
      console.log("🔍 Kiểm tra tất cả dữ liệu ngày 2025-09-01:");
      const allData = await pool.query(`
        SELECT serial_number, date_time, distance_value, salt_value, temp_value
        FROM iot_system.iot_data 
        WHERE date_time >= '2025-09-01' 
        ORDER BY date_time DESC 
        LIMIT 5
      `);
      console.table(allData.rows);
    }
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    pool.end();
  }
}

testStatus();
