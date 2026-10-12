module.exports = {
  name: "007_create_forecast_schema",
  async up(QueryDatabase) {
    await QueryDatabase(`CREATE SCHEMA IF NOT EXISTS forecast_system;`);

    // 1 dòng / lượt chạy dự báo (metadata)
    await QueryDatabase(`
      CREATE TABLE IF NOT EXISTS forecast_system.forecast_runs (
        run_id VARCHAR(100) PRIMARY KEY,
        schema_version VARCHAR(10),
        issued_at TIMESTAMPTZ,
        forecast_timezone VARCHAR(50),
        forecast_start_at TIMESTAMPTZ,
        interval_hours INTEGER,
        horizon_days INTEGER,
        station_count INTEGER,
        points_per_station INTEGER,
        total_points INTEGER,
        artifact_id VARCHAR(150),
        artifact_checksum VARCHAR(150),
        is_synthetic BOOLEAN DEFAULT TRUE,
        fetched_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Dạng rộng giống hochiminh."DoMan": 1 dòng / mốc thời gian, 1 cột / trạm
    await QueryDatabase(`
      CREATE TABLE IF NOT EXISTS forecast_system.forecast_values (
        run_id VARCHAR(100) NOT NULL REFERENCES forecast_system.forecast_runs(run_id) ON DELETE CASCADE,
        "ThoiDiem" TIMESTAMPTZ NOT NULL,
        "MNB" NUMERIC(6, 2),
        "PCL" NUMERIC(6, 2),
        "CTT" NUMERIC(6, 2),
        "COT" NUMERIC(6, 2),
        "CKC" NUMERIC(6, 2),
        "KXAH" NUMERIC(6, 2),
        "CRT" NUMERIC(6, 2),
        PRIMARY KEY (run_id, "ThoiDiem")
      );
    `);
    await QueryDatabase(`
      CREATE INDEX IF NOT EXISTS idx_forecast_values_thoidiem
      ON forecast_system.forecast_values ("ThoiDiem");
    `);

    // Log mỗi lần worker/cron gọi API dự báo ngoài, giống iot_system.iot_sync_logs
    await QueryDatabase(`
      CREATE TABLE IF NOT EXISTS forecast_system.forecast_sync_logs (
        id SERIAL PRIMARY KEY,
        run_id VARCHAR(100),
        status VARCHAR(50),
        points_synced INTEGER DEFAULT 0,
        unmapped_stations TEXT,
        sync_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sync_duration_ms INTEGER,
        error_message TEXT
      );
    `);
  },
};
