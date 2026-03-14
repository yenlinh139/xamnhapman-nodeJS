const axios = require("axios");

const BASE_URL = "http://localhost:4000/api";

async function testSearchAPI() {
  console.log("🔍 TESTING SEARCH API FIXES");
  console.log("=".repeat(50));

  const testCases = [
    "Cu Chi",
    "cu chi",
    "CU CHI",
    "Củ Chi",
    "Quận 1",
    "quan 1",
    "Hóc Môn",
    "hoc mon",
    "Bình Dương",
    "binh duong",
    "1",
    "abc xyz not exists",
  ];

  for (const searchTerm of testCases) {
    try {
      console.log(`\n🔸 Searching for: "${searchTerm}"`);
      console.log(`📡 GET ${BASE_URL}/search/${encodeURIComponent(searchTerm)}`);

      const startTime = Date.now();
      const response = await axios.get(`${BASE_URL}/search/${encodeURIComponent(searchTerm)}`);
      const endTime = Date.now();

      console.log(`✅ Status: ${response.status}`);
      console.log(`⏱️  Response time: ${endTime - startTime}ms`);
      console.log(`📊 Results count: ${Array.isArray(response.data) ? response.data.length : "Invalid format"}`);

      if (Array.isArray(response.data) && response.data.length > 0) {
        console.log(`📋 First result type: ${response.data[0].type}`);
        console.log(
          `📋 First result name:`,
          response.data[0].TenHuyen || response.data[0].TenXa || response.data[0].TenDiem || response.data[0].TenTram || "N/A",
        );
      }
    } catch (error) {
      console.log(`❌ Error: ${error.response?.status || "Network"} - ${error.response?.data?.message || error.message}`);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ Search API testing completed");
}

// Run the test
testSearchAPI().catch(console.error);
