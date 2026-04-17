const path = require("path");
const fs = require("fs");
const logger = require("../loggers/loggers.config");
const QueryDatabase = require("../utils/queryDatabase");

const runMigrations = async () => {
  try {
    // Tạo bảng migrations nếu chưa có
    await QueryDatabase(`
      CREATE TABLE IF NOT EXISTS public.migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        run_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const migrationsDir = path.join(__dirname, "migrations");
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".js")).sort();

    for (const file of files) {
      const migrationName = path.basename(file, ".js");

      const result = await QueryDatabase(`SELECT 1 FROM public.migrations WHERE name = $1`, [migrationName]);
      if (result.rows.length > 0) {
        continue; // Đã chạy rồi, bỏ qua
      }

      const migration = require(path.join(migrationsDir, file));
      await migration.up(QueryDatabase);
      await QueryDatabase(`INSERT INTO public.migrations (name) VALUES ($1)`, [migrationName]);
      console.log(`Migration applied: ${migrationName}`);
      logger.info(`Migration applied: ${migrationName}`);
    }

    console.log("All migrations completed.");
  } catch (error) {
    console.error("Error running migrations:", error);
    logger.error(error);
  }
};

module.exports = runMigrations;
