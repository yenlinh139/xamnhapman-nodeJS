const axios = require("axios");

const API_BASE_URL = "http://localhost:4000/api";

// Test function helper
const testAPI = async (endpoint, description) => {
  try {
    console.log(`🧪 Testing: ${description}`);
    const response = await axios.get(`${API_BASE_URL}${endpoint}`);
    console.log(`✅ SUCCESS: ${endpoint}`);
    console.log(`📊 Data count: ${response.data.data?.length || response.data.count || "N/A"}`);
    console.log("---");
    return response.data;
  } catch (error) {
    console.log(`❌ FAILED: ${endpoint}`);
    console.log(`Error: ${error.response?.data?.message || error.message}`);
    console.log("---");
    return null;
  }
};

const testStatsAPIs = async () => {
  console.log("🚀 TESTING HYDROMETEOROLOGY STATISTICS APIs\n");

  // 1. Test Summary Stats
  await testAPI("/hydrometeorology-stats/summary", "Thống kê tổng quan");

  // 2. Test Summary Stats with date range
  const currentDate = new Date().toISOString().split("T")[0];
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  await testAPI(
    `/hydrometeorology-stats/summary?startDate=${oneMonthAgo}&endDate=${currentDate}`,
    "Thống kê tổng quan (30 ngày qua)",
  );

  // 3. Test Rainfall Stats by Station
  await testAPI("/hydrometeorology-stats/rainfall-by-station", "Thống kê mưa theo trạm");
  await testAPI("/hydrometeorology-stats/rainfall-by-station?orderBy=total_desc", "Thống kê mưa theo trạm (sắp xếp theo tổng)");

  // 4. Test Water Level Stats
  await testAPI("/hydrometeorology-stats/water-level-by-station", "Thống kê mực nước theo trạm");
  await testAPI("/hydrometeorology-stats/water-level-by-station?orderBy=avg_desc", "Thống kê mực nước (sắp xếp theo trung bình)");

  // 5. Test Monthly/Yearly Stats
  await testAPI("/hydrometeorology-stats/monthly-yearly?period=monthly", "Thống kê theo tháng");
  await testAPI("/hydrometeorology-stats/monthly-yearly?period=yearly", "Thống kê theo năm");
  await testAPI("/hydrometeorology-stats/monthly-yearly?period=monthly&stationType=weather", "Thống kê tháng - chỉ thời tiết");

  // 6. Test Alerts
  await testAPI("/hydrometeorology-stats/alerts", "Cảnh báo thời tiết/thủy văn");
  await testAPI("/hydrometeorology-stats/alerts?alertType=heavy_rain", "Cảnh báo mưa lớn");
  await testAPI("/hydrometeorology-stats/alerts?alertType=high_water", "Cảnh báo mực nước cao");

  // 7. Test Dashboard
  await testAPI("/hydrometeorology-stats/dashboard", "Dashboard (7 ngày)");
  await testAPI("/hydrometeorology-stats/dashboard?period=30days", "Dashboard (30 ngày)");
  await testAPI("/hydrometeorology-stats/dashboard?period=90days", "Dashboard (90 ngày)");
  await testAPI("/hydrometeorology-stats/dashboard?period=1year", "Dashboard (1 năm)");

  console.log("✅ TESTING COMPLETED!");
};

// Test với error handling
const testWithErrorHandling = async () => {
  try {
    console.log("🔥 TESTING ERROR SCENARIOS\n");

    // Test với parameters không hợp lệ
    await testAPI("/hydrometeorology-stats/rainfall-by-station?orderBy=invalid", "Test orderBy không hợp lệ");
    await testAPI("/hydrometeorology-stats/monthly-yearly?period=invalid", "Test period không hợp lệ");
    await testAPI("/hydrometeorology-stats/dashboard?period=invalid", "Test dashboard period không hợp lệ");

    console.log("🔥 ERROR TESTING COMPLETED!");
  } catch (error) {
    console.log("❌ Error testing failed:", error.message);
  }
};

// Performance test
const performanceTest = async () => {
  console.log("⚡ PERFORMANCE TESTING\n");

  const endpoints = [
    "/hydrometeorology-stats/summary",
    "/hydrometeorology-stats/rainfall-by-station",
    "/hydrometeorology-stats/dashboard",
  ];

  for (const endpoint of endpoints) {
    const startTime = Date.now();
    await testAPI(endpoint, `Performance test: ${endpoint}`);
    const endTime = Date.now();
    console.log(`⏱️  Response time: ${endTime - startTime}ms\n`);
  }
};

// Main test runner
const runAllTests = async () => {
  console.log("🎯 HYDROMETEOROLOGY STATISTICS API TESTING SUITE\n");
  console.log(`Base URL: ${API_BASE_URL}`);
  console.log(`Testing time: ${new Date().toISOString()}\n`);

  try {
    // Test regular APIs
    await testStatsAPIs();

    // Test error scenarios
    await testWithErrorHandling();

    // Performance testing
    await performanceTest();

    console.log("🎉 ALL TESTS COMPLETED!");
    console.log("📋 Check the results above for any failures.");
  } catch (error) {
    console.log("💥 Testing suite failed:", error.message);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testAPI,
  testStatsAPIs,
  runAllTests,
};
