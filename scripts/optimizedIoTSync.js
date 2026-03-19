#!/bin/bash
require("dotenv").config();
const optimizedIoTSync = require("../src/services/optimizedIoTSyncService");
const logger = require("../src/loggers/loggers.config");

/**
 * Optimized batch sync với improved performance
 */
async function runOptimizedSync() {
  const startDateArg = process.argv[2];
  const mode = process.argv[3] || "smart"; // smart, manual, or full

  if (!startDateArg && mode !== "smart") {
    console.error("❌ Vui lòng cung cấp ngày bắt đầu (format: YYYY-MM-DD)");
    console.log("Ví dụ: node scripts/optimizedIoTSync.js 2025-08-25");
    console.log("Hoặc: node scripts/optimizedIoTSync.js smart (tự động từ ngày mới nhất)");
    process.exit(1);
  }

  try {
    let syncResult;

    console.log(`
=====================================
🚀 Optimized IoT Sync Script
⚡ Mode: ${mode.toUpperCase()}
📊 Performance: ✅ Batching ✅ Caching ✅ Pooling
=====================================
    `);

    if (mode === "smart" || mode === "full") {
      // Sync tất cả trạm với optimized logic
      const daysBack = mode === "full" ? 200 : 7; // Full sync 200 ngày
      syncResult = await optimizedIoTSync.optimizedSyncAllStations(daysBack);
    } else {
      // Manual sync từ ngày cụ thể
      const startDate = new Date(startDateArg);
      if (isNaN(startDate.getTime())) {
        console.error("❌ Ngày không hợp lệ. Vui lòng sử dụng format: YYYY-MM-DD");
        process.exit(1);
      }

      const endDate = new Date();
      const startDateStr = startDate.toISOString().split("T")[0];
      const endDateStr = endDate.toISOString().split("T")[0];

      console.log(`📅 Manual sync: ${startDateStr} → ${endDateStr}`);

      // Get active stations
      const {Pool} = require("pg");
      const pool = new Pool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        port: process.env.DB_PORT,
      });

      const stationsResult = await pool.query(`
        SELECT serial_number FROM iot_system.iot_stations 
        WHERE status = 'active' AND serial_number IS NOT NULL
      `);

      const stations = stationsResult.rows;
      console.log(`📡 Found ${stations.length} active stations`);

      // Sync each station using optimized service
      const results = [];
      for (const station of stations) {
        const result = await optimizedIoTSync.optimizedSyncStation(station.serial_number, startDateStr, endDateStr);
        results.push(result);
      }

      syncResult = {
        totalStations: stations.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        totalInserted: results.reduce((sum, r) => sum + (r.inserted || 0), 0),
        totalUpdated: results.reduce((sum, r) => sum + (r.updated || 0), 0),
        results: results,
      };

      await pool.end();
    }

    // Display results
    console.log(`
🎉 ===== OPTIMIZED SYNC COMPLETED =====
✅ Successful: ${syncResult.successful}/${syncResult.totalStations} stations
📥 Inserted: ${syncResult.totalInserted} records  
🔄 Updated: ${syncResult.totalUpdated} records
❌ Failed: ${syncResult.failed} stations

⚡ Performance Improvements:
• Batch processing (7-day chunks vs daily)
• Connection pooling (20 connections vs 1)
• Query caching (5min TTL)
• Concurrent processing (3 parallel requests)
• Memory management (auto cleanup)
• Retry logic (3 attempts with backoff)
=====================================
    `);

    if (syncResult.failed > 0) {
      console.log(`⚠️  Failed stations:`);
      syncResult.results.filter((r) => !r.success).forEach((r) => console.log(`   • ${r.serialNumber}: ${r.error}`));
    }

    logger.info("Optimized IoT sync completed successfully", syncResult);
    process.exit(0);
  } catch (error) {
    console.error("❌ Optimized sync failed:", error.message);
    logger.error("Optimized sync failed:", error);
    process.exit(1);
  }
}

runOptimizedSync();
