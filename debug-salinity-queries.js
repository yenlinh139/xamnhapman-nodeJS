require("dotenv").config();
const QueryDatabase = require("./src/utils/queryDatabase");

async function debugSalinityQueries() {
  try {
    console.log("Environment check:");
    console.log("DB_HOST:", process.env.DB_HOST);
    console.log("DB_DATABASE:", process.env.DB_DATABASE);
    console.log("DB_USER:", process.env.DB_USER);
    console.log("DB_PORT:", process.env.DB_PORT);

    // Test date - you can change this to match your sample data
    const date = "2007-06-15"; // Using date from your sample data
    const reportDate = new Date(date);
    const year = reportDate.getFullYear();
    const month = reportDate.getMonth() + 1;

    console.log("\nTesting with date:", date, "Year:", year, "Month:", month);

    // First, let's check if we have any data at all
    const testConnectionQuery = `SELECT COUNT(*) as total_records FROM hochiminh."DoMan"`;
    console.log("\n=== Testing Connection ===");
    const connectionResult = await QueryDatabase(testConnectionQuery);
    console.log("Total records in DoMan table:", connectionResult.rows[0].total_records);

    // Check what data exists for June 2007 (your sample data)
    const checkJune2007Query = `
      SELECT 
        "Ngày",
        "CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL"
      FROM hochiminh."DoMan"
      WHERE EXTRACT(YEAR FROM "Ngày") = 2007
        AND EXTRACT(MONTH FROM "Ngày") = 6
      ORDER BY "Ngày"
      LIMIT 5
    `;

    console.log("\n=== Sample June 2007 Data ===");
    const june2007Result = await QueryDatabase(checkJune2007Query);
    console.log("June 2007 sample data:", june2007Result.rows);

    // Test previous year query (2006 for June)
    const monthlyAvgPrevYearQuery = `
      SELECT 
        AVG(CASE WHEN "CRT" IS NOT NULL AND "CRT" ~ '^[0-9]+\.?[0-9]*$' THEN "CRT"::NUMERIC ELSE NULL END) AS avg_CRT,
        AVG(CASE WHEN "CTT" IS NOT NULL AND "CTT" ~ '^[0-9]+\.?[0-9]*$' THEN "CTT"::NUMERIC ELSE NULL END) AS avg_CTT,
        AVG("COT") AS avg_COT,
        AVG(CASE WHEN "CKC" IS NOT NULL AND "CKC" ~ '^[0-9]+\.?[0-9]*$' THEN "CKC"::NUMERIC ELSE NULL END) AS avg_CKC,
        AVG(CASE WHEN "KXAH" IS NOT NULL AND "KXAH" ~ '^[0-9]+\.?[0-9]*$' THEN "KXAH"::NUMERIC ELSE NULL END) AS avg_KXAH,
        AVG(CASE WHEN "MNB" IS NOT NULL AND "MNB" ~ '^[0-9]+\.?[0-9]*$' THEN "MNB"::NUMERIC ELSE NULL END) AS avg_MNB,
        AVG(CASE WHEN "PCL" IS NOT NULL AND "PCL" ~ '^[0-9]+\.?[0-9]*$' THEN "PCL"::NUMERIC ELSE NULL END) AS avg_PCL
      FROM hochiminh."DoMan"
      WHERE EXTRACT(YEAR FROM "Ngày") = ${year - 1}
        AND EXTRACT(MONTH FROM "Ngày") = ${month}
        AND ("CRT" IS NOT NULL OR "CTT" IS NOT NULL OR "COT" IS NOT NULL 
             OR "CKC" IS NOT NULL OR "KXAH" IS NOT NULL OR "MNB" IS NOT NULL OR "PCL" IS NOT NULL)
    `;

    console.log("\n=== Previous Year Query (2006) ===");
    console.log("Query:", monthlyAvgPrevYearQuery);
    const prevYearResult = await QueryDatabase(monthlyAvgPrevYearQuery);
    console.log("Previous Year Result:", prevYearResult.rows);

    // Check if there's any data for 2006
    const check2006Query = `
      SELECT COUNT(*) as count_2006
      FROM hochiminh."DoMan"
      WHERE EXTRACT(YEAR FROM "Ngày") = 2006
        AND EXTRACT(MONTH FROM "Ngày") = 6
    `;

    console.log("\n=== Check 2006 Data ===");
    const check2006Result = await QueryDatabase(check2006Query);
    console.log("2006 June record count:", check2006Result.rows[0].count_2006);

    // Test all years query
    const monthlyAvgAllYearsQuery = `
      SELECT 
        EXTRACT(YEAR FROM "Ngày") AS year,
        AVG(CASE WHEN "CRT" IS NOT NULL AND "CRT" ~ '^[0-9]+\.?[0-9]*$' THEN "CRT"::NUMERIC ELSE NULL END) AS avg_CRT,
        AVG(CASE WHEN "CTT" IS NOT NULL AND "CTT" ~ '^[0-9]+\.?[0-9]*$' THEN "CTT"::NUMERIC ELSE NULL END) AS avg_CTT,
        AVG("COT") AS avg_COT,
        AVG(CASE WHEN "CKC" IS NOT NULL AND "CKC" ~ '^[0-9]+\.?[0-9]*$' THEN "CKC"::NUMERIC ELSE NULL END) AS avg_CKC,
        AVG(CASE WHEN "KXAH" IS NOT NULL AND "KXAH" ~ '^[0-9]+\.?[0-9]*$' THEN "KXAH"::NUMERIC ELSE NULL END) AS avg_KXAH,
        AVG(CASE WHEN "MNB" IS NOT NULL AND "MNB" ~ '^[0-9]+\.?[0-9]*$' THEN "MNB"::NUMERIC ELSE NULL END) AS avg_MNB,
        AVG(CASE WHEN "PCL" IS NOT NULL AND "PCL" ~ '^[0-9]+\.?[0-9]*$' THEN "PCL"::NUMERIC ELSE NULL END) AS avg_PCL
      FROM hochiminh."DoMan"
      WHERE EXTRACT(MONTH FROM "Ngày") = ${month}
        AND ("CRT" IS NOT NULL OR "CTT" IS NOT NULL OR "COT" IS NOT NULL 
             OR "CKC" IS NOT NULL OR "KXAH" IS NOT NULL OR "MNB" IS NOT NULL OR "PCL" IS NOT NULL)
      GROUP BY EXTRACT(YEAR FROM "Ngày")
      ORDER BY year
    `;

    console.log("\n=== All Years Query ===");
    const allYearsResult = await QueryDatabase(monthlyAvgAllYearsQuery);
    console.log("All Years Result:", allYearsResult.rows);

    // Check what years have June data
    const dataYearsQuery = `
      SELECT 
        EXTRACT(YEAR FROM "Ngày") AS year,
        COUNT(*) AS record_count
      FROM hochiminh."DoMan"
      WHERE EXTRACT(MONTH FROM "Ngày") = 6
      GROUP BY EXTRACT(YEAR FROM "Ngày")
      ORDER BY year
    `;

    console.log("\n=== Years with June data ===");
    const yearResult = await QueryDatabase(dataYearsQuery);
    console.log("Years with June data:", yearResult.rows);

    console.log("\n=== Debug Complete ===");
    process.exit(0);
  } catch (error) {
    console.error("Debug Error:", error);
    process.exit(1);
  }
}

debugSalinityQueries();
