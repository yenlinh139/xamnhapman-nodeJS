const axios = require("axios");
const https = require("https");

// Tạo agent để bỏ qua SSL certificate errors
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

const API_ENDPOINT = "https://thegreenlab.xyz/Datums/DataByDateJson";
const USERNAME = "ngkloi@gmail.com";
const PASSWORD = "ngkloi123";

// Danh sách serial numbers có thể test
const TEST_SERIALS = [
  "Log01250713",
  "Log01250711",
  "Log01250712",
  "Log01250714",
  "Log01250715",
  "Log01250701",
  "Log01250702",
  "Log01250703",
  "LOG01250713",
  "LOG01250711", // Thử uppercase
];

// Danh sách ngày test (từ gần đây về trước)
const TEST_DATES = [
  "2025-12-23",
  "2025-12-22",
  "2025-12-21",
  "2025-12-20",
  "2025-12-15",
  "2025-12-10",
  "2025-12-01",
  "2025-11-30",
  "2025-11-15",
  "2025-10-15",
  "2025-09-15",
  "2025-08-25",
];

async function testAPICall(serialNumber, date) {
  try {
    const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");

    const response = await axios.get(API_ENDPOINT, {
      params: {
        serialNumber: serialNumber,
        dateOnly: date,
      },
      timeout: 10000,
      httpsAgent: httpsAgent,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "User-Agent": "IoT-Test-Script/1.0",
      },
    });

    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      console.log(`✅ FOUND DATA: Serial ${serialNumber} | Date ${date} | Records: ${response.data.length}`);
      console.log(`   Sample record:`, JSON.stringify(response.data[0], null, 2));
      return {serialNumber, date, count: response.data.length, data: response.data};
    } else {
      console.log(`⭕ No data: Serial ${serialNumber} | Date ${date}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error: Serial ${serialNumber} | Date ${date} | ${error.message}`);
    return null;
  }
}

async function findWorkingData() {
  console.log("🔍 Testing API to find working serial numbers and dates...\n");

  const foundData = [];

  // Test từng combination
  for (const serial of TEST_SERIALS) {
    console.log(`\n📡 Testing Serial: ${serial}`);

    for (const date of TEST_DATES) {
      const result = await testAPICall(serial, date);

      if (result) {
        foundData.push(result);
        // Tìm được rồi thì dừng test ngày khác cho serial này
        break;
      }

      // Delay nhỏ giữa requests
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Delay lớn hơn giữa các serial
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("\n🎯 ===== SUMMARY =====");
  if (foundData.length > 0) {
    console.log(`✅ Found ${foundData.length} working combinations:`);
    foundData.forEach((item, index) => {
      console.log(`${index + 1}. Serial: ${item.serialNumber} | Date: ${item.date} | Records: ${item.count}`);
    });
  } else {
    console.log("❌ No working data found. Possible issues:");
    console.log("   1. API credentials incorrect");
    console.log("   2. Serial numbers not active");
    console.log("   3. No data available for test dates");
    console.log("   4. API endpoint or format changed");
  }
}

findWorkingData().catch(console.error);
