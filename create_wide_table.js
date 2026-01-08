const {Pool} = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
  database: process.env.DB_DATABASE,
  port: Number(process.env.DB_PORT),
});

async function createWideFormatTable() {
  try {
    console.log('🚀 Tạo bảng iot_data với format "wide"...');

    // Drop table cũ nếu có
    await pool.query("DROP TABLE IF EXISTS iot_data CASCADE;");

    // Tạo bảng mới với format wide
    const createTableQuery = `
      CREATE TABLE iot_data (
        id SERIAL PRIMARY KEY,
        serial_number VARCHAR(50) NOT NULL,
        date_time TIMESTAMP NOT NULL,
        
        -- FTP sensor
        ftp_value NUMERIC(10, 4),
        ftp_unit VARCHAR(20),
        ftp_status VARCHAR(50),
        
        -- COD sensor  
        cod_value NUMERIC(10, 4),
        cod_unit VARCHAR(20),
        cod_status VARCHAR(50),
        
        -- Flow_in sensor
        flow_in_value NUMERIC(10, 4),
        flow_in_unit VARCHAR(20),
        flow_in_status VARCHAR(50),
        
        -- Flow_out sensor
        flow_out_value NUMERIC(10, 4),
        flow_out_unit VARCHAR(20), 
        flow_out_status VARCHAR(50),
        
        -- NH4+ sensor
        nh4_value NUMERIC(10, 4),
        nh4_unit VARCHAR(20),
        nh4_status VARCHAR(50),
        
        -- pH sensor
        ph_value NUMERIC(10, 4),
        ph_unit VARCHAR(20),
        ph_status VARCHAR(50),
        
        -- Temp sensor
        temp_value NUMERIC(10, 4),
        temp_unit VARCHAR(20),
        temp_status VARCHAR(50),
        
        -- TSS sensor
        tss_value NUMERIC(10, 4),
        tss_unit VARCHAR(20),
        tss_status VARCHAR(50),
        
        updated_at TIMESTAMP null,
        deleted_at TIMESTAMP null,
        
        -- Unique constraint để tránh duplicate
        UNIQUE(serial_number,  date_time)
      );
    `;

    await pool.query(createTableQuery);
    console.log("✅ Đã tạo bảng iot_data với format wide");

    // Tạo indexes
    console.log("🔍 Tạo indexes...");
    const indexes = [
      "CREATE INDEX idx_iot_data_serial_date ON iot_data(serial_number, date_time);",
      "CREATE INDEX idx_iot_data_datetime ON iot_data(date_time);",
    ];

    for (const indexQuery of indexes) {
      await pool.query(indexQuery);
    }
    console.log("✅ Đã tạo indexes");

    // Kiểm tra schema
    const schema = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'iot_data' 
      ORDER BY ordinal_position
    `);

    console.log("\\n📋 Schema bảng iot_data:");
    schema.rows.forEach((col) => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === "YES" ? "NULL" : "NOT NULL"}`);
    });

    await pool.end();
    console.log("\\n🎉 Hoàn thành tạo bảng iot_data với format wide!");
  } catch (error) {
    console.error("❌ Lỗi:", error.message);
    await pool.end();
    process.exit(1);
  }
}

createWideFormatTable();
