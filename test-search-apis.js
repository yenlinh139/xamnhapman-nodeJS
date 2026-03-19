/**
 * Test script cho optimized Search APIs
 * Verify performance và functionality sau tối ưu
 */

const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const BASE_URL = "http://localhost:5000/api";

const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
};

/**
 * Test cases cho Search APIs
 */
const testCases = {
  searchDate: [
    {date: "2024-01-15", description: "ISO format YYYY-MM-DD"},
    {date: "15/01/2024", description: "Vietnam format DD/MM/YYYY"},
    {date: "15-01-2024", description: "Dash format DD-MM-YYYY"},
    {date: "2024-2-5", description: "ISO format với single digits"},
    {date: "5/2/2024", description: "Vietnam format với single digits"},
    {date: "invalid-date", description: "Invalid format (should fail)", shouldFail: true},
    {date: "32/13/2024", description: "Invalid date values (should fail)", shouldFail: true},
  ],

  searchAll: [
    {term: "Củ Chi", description: "Search Huyện Củ Chi"},
    {term: "Tân Phú", description: "Search Quận Tân Phú"},
    {term: "HCM", description: "Search general term"},
    {term: "CN01", description: "Search station code"},
    {term: "a", description: "Too short term (should fail)", shouldFail: true},
  ],

  stationSalinity: [
    {code: "CN01", description: "Specific station code"},
    {code: "full", description: "All stations"},
    {code: "INVALID", description: "Non-existent station"},
  ],

  stationHydro: [
    {code: "NB_TV", description: "Hydrology station"},
    {code: "TSH", description: "Weather station"},
  ],
};

/**
 * Helper function to make API calls
 */
async function makeRequest(endpoint, description) {
  const startTime = Date.now();

  try {
    log.info(`Testing: ${description}`);
    log.info(`URL: ${BASE_URL}${endpoint}`);

    const response = await fetch(`${BASE_URL}${endpoint}`);
    const responseTime = Date.now() - startTime;

    const data = await response.json();

    if (response.ok) {
      log.success(`✓ Status: ${response.status} | Time: ${responseTime}ms`);

      // Log summary của response
      if (data.results) {
        log.info(`  Results: ${data.results.length} items`);
      } else if (data.metadata) {
        log.info(`  Records: ${data.metadata.totalRecords} | Tables: ${data.metadata.queriedTables}`);
      } else if (Array.isArray(data)) {
        log.info(`  Records: ${data.length} items`);
      }

      return {success: true, data, responseTime, status: response.status};
    } else {
      log.error(`✗ Status: ${response.status} | Error: ${data.message || "Unknown error"}`);
      return {success: false, error: data, responseTime, status: response.status};
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    log.error(`✗ Network Error: ${error.message} | Time: ${responseTime}ms`);
    return {success: false, error: error.message, responseTime};
  }
}

/**
 * Test Search Date API
 */
async function testSearchDateAPI() {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 TESTING SEARCH DATE API (/api/search-date/:date)");
  console.log("=".repeat(60));

  const results = [];

  for (const testCase of testCases.searchDate) {
    console.log(`\n📅 Testing: ${testCase.description}`);

    const result = await makeRequest(`/search-date/${encodeURIComponent(testCase.date)}`, testCase.description);

    if (testCase.shouldFail) {
      if (result.status >= 400) {
        log.success("✓ Correctly rejected invalid input");
      } else {
        log.warn("⚠️ Should have failed but didn't");
      }
    } else {
      if (result.success) {
        log.success(`✓ Valid date processed successfully`);
      } else {
        log.error(`✗ Valid date failed: ${result.error}`);
      }
    }

    results.push({...testCase, ...result});
  }

  return results;
}

/**
 * Test Search All API
 */
async function testSearchAllAPI() {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 TESTING SEARCH ALL API (/api/search/:term)");
  console.log("=".repeat(60));

  const results = [];

  for (const testCase of testCases.searchAll) {
    console.log(`\n🔍 Testing: ${testCase.description}`);

    const result = await makeRequest(`/search/${encodeURIComponent(testCase.term)}?limit=20`, testCase.description);

    if (testCase.shouldFail) {
      if (result.status >= 400) {
        log.success("✓ Correctly rejected invalid input");
      } else {
        log.warn("⚠️ Should have failed but didn't");
      }
    }

    results.push({...testCase, ...result});
  }

  return results;
}

/**
 * Test Station Salinity API
 */
async function testStationSalinityAPI() {
  console.log("\n" + "=".repeat(60));
  console.log("🗺️ TESTING STATION SALINITY API (/api/station-position-salinity/:code)");
  console.log("=".repeat(60));

  const results = [];

  for (const testCase of testCases.stationSalinity) {
    console.log(`\n📍 Testing: ${testCase.description}`);

    const result = await makeRequest(`/station-position-salinity/${encodeURIComponent(testCase.code)}`, testCase.description);
    results.push({...testCase, ...result});
  }

  return results;
}

/**
 * Test Station Hydrometeorology API
 */
async function testStationHydrometeoroAPI() {
  console.log("\n" + "=".repeat(60));
  console.log("🌦️ TESTING STATION HYDROMETEOR API (/api/station-position-hydrometeorology/:code)");
  console.log("=".repeat(60));

  const results = [];

  for (const testCase of testCases.stationHydro) {
    console.log(`\n🌡️ Testing: ${testCase.description}`);

    const result = await makeRequest(
      `/station-position-hydrometeorology/${encodeURIComponent(testCase.code)}`,
      testCase.description,
    );
    results.push({...testCase, ...result});
  }

  return results;
}

/**
 * Test caching performance
 */
async function testCachingPerformance() {
  console.log("\n" + "=".repeat(60));
  console.log("⚡ TESTING CACHING PERFORMANCE");
  console.log("=".repeat(60));

  const testDate = "2024-01-15";

  // First call (cache miss)
  console.log("\n🔄 First call (cache miss):");
  const firstCall = await makeRequest(`/search-date/${testDate}`, "First call - should populate cache");

  // Second call (cache hit)
  console.log("\n⚡ Second call (cache hit):");
  const secondCall = await makeRequest(`/search-date/${testDate}`, "Second call - should use cache");

  if (firstCall.success && secondCall.success) {
    const improvement = (((firstCall.responseTime - secondCall.responseTime) / firstCall.responseTime) * 100).toFixed(1);

    if (secondCall.responseTime < firstCall.responseTime) {
      log.success(`🚀 Cache performance: ${improvement}% faster (${firstCall.responseTime}ms → ${secondCall.responseTime}ms)`);
    } else {
      log.warn(`⚠️ Cache might not be working - second call took ${secondCall.responseTime}ms vs ${firstCall.responseTime}ms`);
    }
  }

  return {firstCall, secondCall};
}

/**
 * Generate test summary
 */
function generateSummary(dateResults, allResults, stationResults, hydroResults, cacheResults) {
  console.log("\n" + "=".repeat(60));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(60));

  const summary = {
    searchDate: {
      total: dateResults.length,
      passed: dateResults.filter((r) => r.success || (r.shouldFail && r.status >= 400)).length,
      avgResponseTime:
        dateResults.filter((r) => r.responseTime).reduce((sum, r) => sum + r.responseTime, 0) /
        dateResults.filter((r) => r.responseTime).length,
    },
    searchAll: {
      total: allResults.length,
      passed: allResults.filter((r) => r.success || (r.shouldFail && r.status >= 400)).length,
      avgResponseTime:
        allResults.filter((r) => r.responseTime).reduce((sum, r) => sum + r.responseTime, 0) /
        allResults.filter((r) => r.responseTime).length,
    },
    stationSalinity: {
      total: stationResults.length,
      passed: stationResults.filter((r) => r.success).length,
      avgResponseTime:
        stationResults.filter((r) => r.responseTime).reduce((sum, r) => sum + r.responseTime, 0) /
        stationResults.filter((r) => r.responseTime).length,
    },
    stationHydro: {
      total: hydroResults.length,
      passed: hydroResults.filter((r) => r.success).length,
      avgResponseTime:
        hydroResults.filter((r) => r.responseTime).reduce((sum, r) => sum + r.responseTime, 0) /
        hydroResults.filter((r) => r.responseTime).length,
    },
  };

  Object.entries(summary).forEach(([api, stats]) => {
    const passRate = ((stats.passed / stats.total) * 100).toFixed(1);
    console.log(`\n${api}:`);
    console.log(`  ✅ Pass Rate: ${stats.passed}/${stats.total} (${passRate}%)`);
    console.log(`  ⏱️  Avg Response Time: ${Math.round(stats.avgResponseTime)}ms`);
  });

  // Overall performance assessment
  const overallAvg = Object.values(summary).reduce((sum, s) => sum + s.avgResponseTime, 0) / Object.values(summary).length;

  console.log(`\n🏆 Overall Performance:`);
  if (overallAvg < 100) {
    log.success(`Excellent: ${Math.round(overallAvg)}ms average`);
  } else if (overallAvg < 300) {
    log.info(`Good: ${Math.round(overallAvg)}ms average`);
  } else if (overallAvg < 1000) {
    log.warn(`Acceptable: ${Math.round(overallAvg)}ms average`);
  } else {
    log.error(`Needs improvement: ${Math.round(overallAvg)}ms average`);
  }
}

/**
 * Main test function
 */
async function runAllTests() {
  console.log("🚀 Starting Search API Tests...");
  console.log(`Base URL: ${BASE_URL}`);

  try {
    // Test individual APIs
    const dateResults = await testSearchDateAPI();
    const allResults = await testSearchAllAPI();
    const stationResults = await testStationSalinityAPI();
    const hydroResults = await testStationHydrometeoroAPI();

    // Test caching
    const cacheResults = await testCachingPerformance();

    // Generate summary
    generateSummary(dateResults, allResults, stationResults, hydroResults, cacheResults);

    console.log("\n✅ All tests completed!");
  } catch (error) {
    log.error(`Test runner error: ${error.message}`);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  runAllTests,
  testSearchDateAPI,
  testSearchAllAPI,
  testStationSalinityAPI,
  testStationHydrometeoroAPI,
  testCachingPerformance,
};
