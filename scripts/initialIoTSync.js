/**
 * Initial IoT Data Sync Script
 * Sync toàn bộ data từ 25/08/2025 đến hiện tại
 * Chạy script này 1 lần duy nhất trước khi start cron job
 *
 * Usage: node scripts/initialIoTSync.js
 */

// Load environment variables
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({
  path: path.join(__dirname, "../.env"),
});

const iotSyncService = require("../src/services/iotSyncService");

async function runInitialSync() {
  console.log("=====================================");
  console.log("IoT Initial Data Sync Script");
  console.log("Start Date: 25/08/2025");
  console.log("End Date: Present");
  console.log("=====================================\n");

  try {
    // Test database connection first
    const queryDatabase = require("../src/utils/queryDatabase");

    console.log("🔗 Testing database connection...");
    console.log(`DB_HOST: ${process.env.DB_HOST}`);
    console.log(`DB_USER: ${process.env.DB_USER}`);
    console.log(`DB_DATABASE: ${process.env.DB_DATABASE}\n`);

    // Test basic connection
    await queryDatabase("SELECT NOW() as current_time");
    console.log("✅ Database connection successful\n");

    // Check available schemas and tables
    console.log("🔍 Checking available schemas and iot tables...");
    const schemaResult = await queryDatabase(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE '%iot%' 
      ORDER BY table_schema, table_name
    `);

    if (schemaResult.rows.length > 0) {
      console.log("Found IoT-related tables:");
      schemaResult.rows.forEach((row) => {
        console.log(`  - ${row.table_schema}.${row.table_name}`);
      });
      console.log();
    }

    // Try different possible table references for iot_stations
    const possibleTables = ["iot_stations", "public.iot_stations", "iot_system.iot_stations"];

    let stationsResult = null;
    let workingTableName = null;

    for (const tableName of possibleTables) {
      try {
        console.log(`🔍 Trying table: ${tableName}`);
        stationsResult = await queryDatabase(
          `SELECT serial_number, station_name, status FROM ${tableName} WHERE status = $1 ORDER BY serial_number`,
          ["active"],
        );
        workingTableName = tableName;
        console.log(`✅ Successfully accessed ${tableName}`);
        break;
      } catch (err) {
        console.log(`❌ Failed to access ${tableName}: ${err.message}`);
        continue;
      }
    }

    if (!stationsResult) {
      console.log("\n⚠️  Could not access iot_stations table with any naming convention");
      console.log("Available tables are listed above. Please check the correct table name.");
      process.exit(1);
    }

    if (stationsResult.rows.length === 0) {
      console.log(`⚠️  No active stations found in ${workingTableName}`);
      console.log("Please insert stations into the table first or check the status values");

      // Show all stations regardless of status for debugging
      const allStationsResult = await queryDatabase(
        `SELECT serial_number, station_name, status FROM ${workingTableName} ORDER BY serial_number`,
      );

      if (allStationsResult.rows.length > 0) {
        console.log("\nAll stations found in table:");
        allStationsResult.rows.forEach((station, index) => {
          console.log(`${index + 1}. ${station.serial_number} - ${station.station_name} (${station.status})`);
        });
      }

      process.exit(1);
    }

    console.log(`Found ${stationsResult.rows.length} active station(s):\n`);
    stationsResult.rows.forEach((station, index) => {
      console.log(`${index + 1}. ${station.serial_number} - ${station.station_name}`);
    });
    console.log("\n=====================================\n");

    // Sync từng station
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    const startTime = Date.now();

    for (const station of stationsResult.rows) {
      // Skip stations without serial_number
      if (!station.serial_number || station.serial_number.trim() === "") {
        console.log(`\n⚠️  Skipping station: ${station.station_name} (No serial number)`);
        continue;
      }

      console.log(`\n📡 Syncing: ${station.serial_number} - ${station.station_name}`);
      console.log("─────────────────────────────────────");

      try {
        const result = await iotSyncService.initialFullSync(
          station.serial_number,
          30, // Chunk size: 30 days
        );

        if (result.success) {
          totalSuccess++;
          totalInserted += result.totalInserted;
          totalUpdated += result.totalUpdated;

          console.log(`✓ Success`);
          console.log(`  - Total chunks: ${result.chunks.length}`);
          console.log(`  - Total inserted: ${result.totalInserted}`);
          console.log(`  - Total updated: ${result.totalUpdated}`);
          console.log(`  - Duration: ${result.duration}ms`);

          // Log chi tiết từng chunk
          if (result.chunks.length > 0) {
            console.log(`\n  Chunk details:`);
            result.chunks.forEach((chunk, idx) => {
              console.log(`    ${idx + 1}. ${chunk.period}: ${chunk.inserted} inserted, ${chunk.updated} updated`);
            });
          }
        } else {
          totalFailed++;
          console.log(`✗ Failed: ${result.error}`);
        }
      } catch (error) {
        totalFailed++;
        console.log(`✗ Error: ${error.message}`);
      }

      // Delay 2 giây giữa các station
      if (station !== stationsResult.rows[stationsResult.rows.length - 1]) {
        console.log("\n⏱️  Waiting 2 seconds before next station...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // Summary
    const totalDuration = Date.now() - startTime;
    console.log("\n\n=====================================");
    console.log("INITIAL SYNC COMPLETED");
    console.log("=====================================");
    console.log(`Total stations: ${stationsResult.rows.length}`);
    console.log(`Successful: ${totalSuccess}`);
    console.log(`Failed: ${totalFailed}`);
    console.log(`Total records inserted: ${totalInserted}`);
    console.log(`Total records updated: ${totalUpdated}`);
    console.log(`Total duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log("=====================================\n");

    if (totalFailed === 0) {
      console.log("✓ All stations synced successfully!");
      console.log("\nNext steps:");
      console.log("1. Start the main server to enable cron job");
      console.log("2. Cron job will sync data every 30 minutes automatically");
      console.log("3. Use API endpoints to query synced data\n");
    } else {
      console.log("⚠️  Some stations failed to sync");
      console.log("Please check the logs for details\n");
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Fatal error during initial sync:");
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
runInitialSync();
