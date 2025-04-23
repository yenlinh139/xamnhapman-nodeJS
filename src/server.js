"use strict";
const path = require("path");
const multer = require("fastify-multer");
const dotenv = require("dotenv");
dotenv.config({
  path: path.join(__dirname, "../.env"),
});
const http = require("http");
const cors = require("@fastify/cors");
const rateLimit = require("@fastify/rate-limit");
const pino = require("pino");
const pretty = require("pino-pretty");
const fastifySwagger = require("@fastify/swagger");
const fastifySwaggerUi = require("@fastify/swagger-ui");
const allRouter = require("./routes/routes");
const initTableDatabase = require("./connection/initTableDatabase");
const redisClient = require("./connection/redis.connection");

// Create Server
var server;
const serverFactory = (handler, opts) => {
  server = http.createServer((req, res) => {
    handler(req, res);
  });
  return server;
};

// Config Pino-Pretty Logger
const stream = pretty({
  colorize: true,
  translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
  ignore: "pid,reqId,responseTime,req.remotePort,req.remoteAddress",
});
const app = require("fastify")({
  serverFactory,
  logger: pino(stream),
});

// Apply CORS middleware globally
app.register(cors, {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});

// Đăng ký plugin fastify-multer
app.register(multer.contentParser);

// Rate-Limit
app.register(rateLimit, {
  timeWindow: 2 * 60 * 1000, // 2 phút
  max: 100, // Giới hạn mỗi IP chỉ gửi tối đa 100 request trong 2 phút
  keyGenerator: (req) => req.ip, // Sử dụng địa chỉ IP của request để làm key xác định
  statusCode: 429,
  errorResponseBuilder: (req, context) => {
    console.log("Rate limit exceeded for IP:", req.ip); // Log thông tin IP bị giới hạn
    return {
      status: 429,
      error: "Too many requests🔥🔥, please wait 2 minute!",
      message: "Too many requests🔥🔥, please wait a minute!",
    };
  },
});

// Swagger
const swaggerOptions = {
  swagger: {
    info: {
      title: "Mockproject API Documentation",
      description: "My Description",
      version: "1.0.0",
    },
    host: "localhost",
    schemes: ["http", "https"],
    consumes: ["application/json"],
    produces: ["application/json"],
    tags: [{name: "Design API", description: "Code related end-points"}],
  },
};
const swaggerUiOptions = {
  routePrefix: "/docs",
  exposeRoute: true,
};
app.register(fastifySwagger, swaggerOptions);
app.register(fastifySwaggerUi, swaggerUiOptions);

// ROUTER
app.get("/", async (req, res) => {
  res.send({hello: "Home Page with Fastify JiraClone"});
});
app.register(allRouter, {prefix: "/api"});

// Run the server!
app.ready(async () => {
  // Init table database
  await initTableDatabase();

  // Redis Connection
  await redisClient.connect();

  // Start server
  server.listen({port: process.env.PORT}, async (err, address) => {
    console.log(`App 🖥️ is running ❤️ on port:: ${process.env.PORT}`);
    if (err) {
      console.warn("Error start server 🔥 :: ", err);
      fastify.log.error(err);
      process.exit(1);
    }
  });
});
