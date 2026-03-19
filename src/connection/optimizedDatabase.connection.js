const {Pool} = require("pg");
const logger = require("../loggers/loggers.config");
const NodeCache = require("node-cache");

/**
 * Optimized Database Connection với connection pooling và caching
 */
class OptimizedDatabaseConnection {
  constructor() {
    // Cache cho query results - TTL 5 phút
    this.queryCache = new NodeCache({
      stdTTL: 300,
      checkperiod: 60,
      maxKeys: 1000,
    });

    // Optimized connection pool
    this.pool = new Pool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: String(process.env.DB_PASSWORD),
      database: process.env.DB_DATABASE,
      port: Number(process.env.DB_PORT),

      // Optimized pool settings
      max: 20, // Tăng số connection tối đa
      min: 5, // Giữ minimum connections
      idleTimeoutMillis: 30000, // 30s idle timeout
      connectionTimeoutMillis: 10000, // 10s connection timeout
      acquireTimeoutMillis: 10000, // 10s acquire timeout

      // Health check
      allowExitOnIdle: false,

      // SSL settings nếu cần
      ssl:
        process.env.NODE_ENV === "production"
          ? {
              rejectUnauthorized: false,
            }
          : false,
    });

    this.setupPoolEventListeners();
    this.startHealthCheck();
  }

  /**
   * Setup event listeners cho connection pool
   */
  setupPoolEventListeners() {
    this.pool.on("connect", (client) => {
      logger.info(`Database client connected (Total: ${this.pool.totalCount}, Idle: ${this.pool.idleCount})`);
    });

    this.pool.on("remove", (client) => {
      logger.info(`Database client removed (Total: ${this.pool.totalCount}, Idle: ${this.pool.idleCount})`);
    });

    this.pool.on("acquire", (client) => {
      // Client được lấy từ pool
      if (this.pool.waitingCount > 5) {
        logger.warn(`High waiting queue: ${this.pool.waitingCount} clients waiting`);
      }
    });

    this.pool.on("error", (err, client) => {
      logger.error("Unexpected error on idle client", err);
    });

    this.pool.on("end", () => {
      logger.info("Database connection pool has ended");
    });
  }

  /**
   * Health check cho connection pool
   */
  startHealthCheck() {
    setInterval(async () => {
      try {
        const client = await this.pool.connect();
        await client.query("SELECT 1");
        client.release();

        // Log pool stats
        logger.debug(
          `Pool Health: Total=${this.pool.totalCount}, Idle=${this.pool.idleCount}, Waiting=${this.pool.waitingCount}`,
        );

        // Clean cache nếu quá lớn
        if (this.queryCache.keys().length > 800) {
          this.queryCache.flushAll();
          logger.info("Query cache cleared due to size limit");
        }
      } catch (error) {
        logger.error("Database health check failed:", error.message);
      }
    }, 30000); // Check mỗi 30s
  }

  /**
   * Optimized query với caching và retry
   */
  async query(sql, params = [], options = {}) {
    const {cache = false, cacheKey = null, cacheTTL = 300, retries = 3, timeout = 30000} = options;

    // Check cache nếu enabled
    if (cache) {
      const key = cacheKey || this.generateCacheKey(sql, params);
      const cached = this.queryCache.get(key);
      if (cached) {
        logger.debug(`Cache hit for key: ${key}`);
        return cached;
      }
    }

    let client;
    let attempt = 0;

    while (attempt <= retries) {
      try {
        client = await this.pool.connect();

        // Set query timeout
        if (timeout) {
          await client.query("SET statement_timeout = $1", [timeout]);
        }

        const result = await client.query(sql, params);

        // Cache result nếu enabled
        if (cache && result.rows) {
          const key = cacheKey || this.generateCacheKey(sql, params);
          this.queryCache.set(key, result, cacheTTL);
          logger.debug(`Cached result for key: ${key}`);
        }

        return result;
      } catch (error) {
        attempt++;
        logger.error(`Query attempt ${attempt} failed:`, {
          error: error.message,
          sql: sql.substring(0, 100) + (sql.length > 100 ? "..." : ""),
          params: params?.slice(0, 5),
        });

        if (attempt > retries) {
          throw error;
        }

        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      } finally {
        if (client) {
          client.release();
        }
      }
    }
  }

  /**
   * Batch query execution với transaction
   */
  async batchQuery(queries, options = {}) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const results = [];
      for (const {sql, params = []} of queries) {
        const result = await client.query(sql, params);
        results.push(result);
      }

      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Optimized insert với ON CONFLICT
   */
  async upsert(table, data, conflictColumns, updateColumns = null) {
    const keys = Object.keys(data);
    const values = Object.values(data);

    const columns = keys.map((k) => `"${k}"`).join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");

    let onConflictClause = "";
    if (updateColumns) {
      const updates = updateColumns.map((col) => `"${col}" = EXCLUDED."${col}"`).join(", ");
      onConflictClause = `ON CONFLICT (${conflictColumns.map((c) => `"${c}"`).join(", ")}) DO UPDATE SET ${updates}`;
    } else {
      onConflictClause = `ON CONFLICT (${conflictColumns.map((c) => `"${c}"`).join(", ")}) DO NOTHING`;
    }

    const sql = `
      INSERT INTO ${table} (${columns}) 
      VALUES (${placeholders}) 
      ${onConflictClause}
      RETURNING *
    `;

    return await this.query(sql, values);
  }

  /**
   * Bulk insert với optimized batch size
   */
  async bulkInsert(table, records, batchSize = 1000) {
    if (!records || records.length === 0) {
      return {insertedCount: 0, errors: []};
    }

    const keys = Object.keys(records[0]);
    const columns = keys.map((k) => `"${k}"`).join(", ");

    let insertedCount = 0;
    const errors = [];

    // Process in batches
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      try {
        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        batch.forEach((record) => {
          const recordValues = keys.map((key) => record[key]);
          values.push(...recordValues);

          const recordPlaceholder = keys.map(() => `$${paramIndex++}`).join(", ");
          placeholders.push(`(${recordPlaceholder})`);
        });

        const sql = `INSERT INTO ${table} (${columns}) VALUES ${placeholders.join(", ")}`;
        const result = await this.query(sql, values);

        insertedCount += result.rowCount;
      } catch (error) {
        logger.error(`Bulk insert batch ${i}-${i + batchSize} failed:`, error.message);
        errors.push({
          batch: {start: i, end: i + batchSize},
          error: error.message,
        });
      }
    }

    return {insertedCount, errors};
  }

  /**
   * Generate cache key từ SQL và params
   */
  generateCacheKey(sql, params) {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    const paramsStr = JSON.stringify(params);
    return `query:${Buffer.from(normalizedSql + paramsStr)
      .toString("base64")
      .substring(0, 64)}`;
  }

  /**
   * Clear cache
   */
  clearCache(pattern = null) {
    if (pattern) {
      const keys = this.queryCache.keys();
      const matchingKeys = keys.filter((key) => key.includes(pattern));
      this.queryCache.del(matchingKeys);
      logger.info(`Cleared ${matchingKeys.length} cache entries matching pattern: ${pattern}`);
    } else {
      this.queryCache.flushAll();
      logger.info("All cache cleared");
    }
  }

  /**
   * Get connection pool stats
   */
  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      cacheSize: this.queryCache.keys().length,
      cacheStats: this.queryCache.getStats(),
    };
  }

  /**
   * Close pool gracefully
   */
  async close() {
    logger.info("Closing database connection pool...");
    this.queryCache.flushAll();
    await this.pool.end();
    logger.info("Database connection pool closed");
  }
}

// Singleton instance
const optimizedDb = new OptimizedDatabaseConnection();

// Graceful shutdown
process.on("SIGINT", async () => {
  await optimizedDb.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await optimizedDb.close();
  process.exit(0);
});

module.exports = optimizedDb;
