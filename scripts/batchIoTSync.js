// Load environment variables FIRST
require("dotenv").config();

const queryDatabase = require("../src/utils/queryDatabase");
const logger = require("../src/loggers/loggers.config");
const iotSyncService = require("../src/services/iotSyncService");

// Đặt NODE_TLS_REJECT_UNAUTHORIZED để bỏ qua SSL certificate errors
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

/**
 * Tạo danh sách ngày từ start date đến end date
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Date[]}
 */
function createDateRange(startDate, endDate) {
  const dates = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

/**
 * Format date thành YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Chạy sync từ ngày bắt đầu đến hiện tại
 */
async function runBatchSync() {
  // Lấy ngày bắt đầu từ command line argument
  const startDateArg = process.argv[2];

  if (!startDateArg) {
    console.error("❌ Vui lòng cung cấp ngày bắt đầu (format: YYYY-MM-DD)");
    console.log("Ví dụ: node scripts/batchIoTSync.js 2025-08-25");
    console.log("       npm run iot:sync-batch 2025-09-01");
    process.exit(1);
  }

  const startDate = new Date(startDateArg);

  if (isNaN(startDate.getTime())) {
    console.error("❌ Ngày không hợp lệ. Vui lòng sử dụng format: YYYY-MM-DD");
    console.log("Ví dụ: node scripts/batchIoTSync.js 2025-08-25");
    process.exit(1);
  }

  const endDate = new Date(); // Sync đến hiện tại

  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  console.log(`
=====================================
🚀 IoT Batch Sync Script
📅 Ngày bắt đầu: ${formatDate(startDate)}
📅 Ngày kết thúc: ${formatDate(endDate)}
📊 Tổng cộng: ${totalDays} ngày
=====================================
  `);

  try {
    // Test database connection trước
    console.log("🔍 Kiểm tra kết nối database...");
    const testQuery = "SELECT COUNT(*) as count FROM iot_system.iot_stations LIMIT 1";
    await queryDatabase(testQuery);
    console.log("✅ Kết nối database thành công!\n");

    const dateRange = createDateRange(startDate, endDate);

    console.log(`📋 Danh sách ngày sẽ sync:`);
    dateRange.forEach((date, index) => {
      console.log(`   ${index + 1}. ${formatDate(date)}`);
    });
    console.log("");

    let totalProcessed = 0;
    let totalRecords = 0;
    const results = {
      successful: [],
      failed: [],
      summary: {},
    };

    for (let i = 0; i < dateRange.length; i++) {
      const date = dateRange[i];
      const dateStr = formatDate(date);

      try {
        console.log(`\n🗓️ [${i + 1}/${dateRange.length}] ===== Sync ngày ${dateStr} =====`);

        // Lấy danh sách trạm active (chỉ lần đầu)
        let activeStations;
        if (i === 0) {
          const stationsQuery = `
            SELECT serial_number, station_name 
            FROM iot_system.iot_stations 
            WHERE status = 'active'
            AND serial_number IS NOT NULL 
            AND TRIM(serial_number) != ''
            ORDER BY serial_number
          `;
          const stationsResult = await queryDatabase(stationsQuery);
          activeStations = stationsResult.rows || [];

          if (activeStations.length === 0) {
            throw new Error("Không có trạm nào đang active!");
          }
          console.log(`📡 Đã tìm thấy ${activeStations.length} trạm active`);
        }

        let dayTotalRecords = 0;
        let daySuccessStations = 0;

        // Nếu là ngày đầu tiên hoặc activeStations chưa được khởi tạo
        if (!activeStations) {
          const stationsQuery = `
            SELECT serial_number, station_name
            FROM iot_system.iot_stations 
            WHERE status = 'active'
            AND serial_number IS NOT NULL 
            AND TRIM(serial_number) != ''
            ORDER BY serial_number
          `;
          const stationsResult = await queryDatabase(stationsQuery);
          activeStations = stationsResult.rows || [];
        }

        // Sync từng trạm cho ngày cụ thể này
        for (const station of activeStations) {
          try {
            console.log(`   📡 Sync ${station.serial_number} (${station.station_name})...`);

            const result = await iotSyncService.syncStation(station.serial_number, dateStr, dateStr);

            if (result.success) {
              dayTotalRecords += (result.inserted || 0) + (result.updated || 0);
              daySuccessStations++;
              console.log(`   ✅ ${station.serial_number}: ${result.inserted} inserted, ${result.updated} updated`);
            } else {
              console.log(`   ❌ ${station.serial_number}: ${result.error || result.message}`);
            }

            // Delay nhỏ giữa các station
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (stationError) {
            console.log(`   ❌ ${station.serial_number}: ${stationError.message}`);
          }
        }

        results.successful.push({
          date: dateStr,
          records: dayTotalRecords,
          stations: daySuccessStations,
        });

        totalRecords += dayTotalRecords;
        totalProcessed++;

        console.log(`✅ Hoàn thành ngày ${dateStr}: ${dayTotalRecords} bản ghi từ ${daySuccessStations} trạm`);

        // Delay 5 giây giữa các ngày để tránh overload API
        if (i < dateRange.length - 1) {
          console.log(`⏳ Chờ 5 giây trước khi sync ngày tiếp theo...`);
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      } catch (error) {
        console.error(`❌ Lỗi khi sync ngày ${dateStr}:`, error.message);
        results.failed.push({
          date: dateStr,
          error: error.message,
        });
      }
    }

    // Báo cáo tổng kết
    console.log(`\n🎉 ===== BÁO CÁO TỔNG KẾT BATCH SYNC =====`);
    console.log(`📅 Khoảng thời gian: ${formatDate(startDate)} → ${formatDate(endDate)}`);
    console.log(`📊 Tổng số ngày: ${dateRange.length}`);
    console.log(`✅ Thành công: ${results.successful.length} ngày`);
    console.log(`❌ Thất bại: ${results.failed.length} ngày`);
    console.log(`📦 Tổng bản ghi: ${totalRecords}`);

    if (results.successful.length > 0) {
      console.log(`\n✅ Các ngày sync thành công:`);
      results.successful.forEach((day) => {
        console.log(`   - ${day.date}: ${day.records} bản ghi từ ${day.stations} stations`);
      });
    }

    if (results.failed.length > 0) {
      console.log(`\n❌ Các ngày sync thất bại:`);
      results.failed.forEach((day) => {
        console.log(`   - ${day.date}: ${day.error}`);
      });
      console.log(`\n💡 Có thể retry từng ngày bằng lệnh:`);
      console.log(`   node scripts/dailyIoTSync.js YYYY-MM-DD`);
    }

    console.log("\n🏁 Hoàn thành 7-Day IoT Sync!");
    process.exit(results.failed.length > 0 ? 1 : 0);
  } catch (error) {
    console.error("\n💥 Lỗi nghiêm trọng trong quá trình sync:", error.message);
    logger.error("7-Day IoT Sync Fatal Error", error);
    process.exit(1);
  }
}

// Chạy script
if (require.main === module) {
  runBatchSync();
}

module.exports = {
  runBatchSync,
};
