// Simple in-memory cache middleware for hydrometeorology data
// Để tối ưu performance hơn nữa

const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const hydrometeorologyCache = {
  get: (key) => {
    const cached = cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > CACHE_DURATION) {
      cache.delete(key);
      return null;
    }

    return cached.data;
  },

  set: (key, data) => {
    cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  },

  clear: () => {
    cache.clear();
  },

  size: () => cache.size,
};

// Middleware function
const cacheMiddleware = (cacheDuration = CACHE_DURATION) => {
  return async (req, reply, next) => {
    // Tạo cache key từ URL và query parameters
    const cacheKey = `${req.url}${JSON.stringify(req.query)}`;

    // Check cache trước
    const cachedData = hydrometeorologyCache.get(cacheKey);
    if (cachedData) {
      return reply.code(200).send(cachedData);
    }

    // Override reply.send để cache response
    const originalSend = reply.send;
    reply.send = function (payload) {
      // Cache response nếu thành công
      if (reply.statusCode === 200) {
        hydrometeorologyCache.set(cacheKey, payload);
      }
      return originalSend.call(this, payload);
    };

    next();
  };
};

module.exports = {
  hydrometeorologyCache,
  cacheMiddleware,
};

// Usage in routes:
// router.get("/hydrometeorology-latest", {preHandler: cacheMiddleware(60000)}, GetLatestHydrometeorologyData);
// router.get("/hydrometeorology-stations", {preHandler: cacheMiddleware(300000)}, GetHydrometeorology);
