#!/usr/bin/env node

/**
 * QUICK DATA CHECKER - Find available dates in database
 */

const {Pool} = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_DATABASE || "xamnhapman_tphcm",
  password: process.env.DB_PASSWORD || "51397",
  port: process.env.DB_PORT || 5432,
});

async function findAvailableDates() {
  try {
    console.log("🔍 Checking available dates in database...\n");

    // Get recent dates with data
    const query = `
      SELECT 
        DATE("Ngày") as date,
        COUNT(*) as records,
        COUNT("CRT") as crt_count,
        COUNT("CTT") as ctt_count,
        COUNT("COT") as cot_count
      FROM hochiminh."DoMan"
      WHERE "Ngày" IS NOT NULL
      GROUP BY DATE("Ngày")
      ORDER BY DATE("Ngày") DESC
      LIMIT 10
    `;

    const result = await pool.query(query);

    if (result.rows.length > 0) {
      console.log("📅 Recent dates with data:");
      result.rows.forEach((row, index) => {
        const date = row.date.toISOString().split("T")[0];
        console.log(
          `${index + 1}. ${date} - ${row.records} records (CRT: ${row.crt_count}, CTT: ${row.ctt_count}, COT: ${row.cot_count})`,
        );
      });

      const latestDate = result.rows[0].date.toISOString().split("T")[0];
      console.log(`\n💡 Suggested test date: ${latestDate}`);
      return latestDate;
    } else {
      console.log("❌ No data found in database");
      return null;
    }
  } catch (error) {
    console.log("❌ Error checking dates:", error.message);
    return null;
  } finally {
    await pool.end();
  }
}

findAvailableDates();
