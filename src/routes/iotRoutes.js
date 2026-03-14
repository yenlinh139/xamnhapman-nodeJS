const iotController = require("../controllers/iot/iot.controller");
const iotSyncController = require("../controllers/iot/iotSync.controller");
const {ExportIoTDataWithRange} = require("../controllers/iot/iotExport.controller");
const VerifyToken = require("../middlewares/verifyToken");

/**
 * IoT Data Routes
 * Prefix: /api/iot
 */
async function iotRoutes(fastify, options) {
  // Get all IoT stations
  fastify.get(
    "/stations",
    {
      schema: {
        description: "Get all IoT stations",
        tags: ["IoT Stations"],
        querystring: {
          type: "object",
          properties: {
            status: {type: "string", enum: ["active", "inactive"], description: "Filter by status"},
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: {type: "boolean"},
              data: {type: "array"},
              count: {type: "integer"},
            },
          },
        },
      },
    },
    iotController.getAllStations,
  );

  // Get IoT statistics
  fastify.get(
    "/stats",
    {
      schema: {
        description: "Get IoT data statistics",
        tags: ["IoT Stats"],
        querystring: {
          type: "object",
          properties: {
            period: {type: "string", enum: ["day", "week", "month"], default: "day"},
            startDate: {type: "string", format: "date"},
            endDate: {type: "string", format: "date"},
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: {type: "boolean"},
              summary: {type: "object"},
              stations: {type: "array"},
              sensor_distribution: {type: "object"},
            },
          },
        },
      },
    },
    iotController.getStats,
  );

  // Get all IoT data with pagination and filters
  fastify.get(
    "/data",
    {
      schema: {
        description: "Get all IoT data with pagination and filters",
        tags: ["IoT Data"],
        querystring: {
          type: "object",
          properties: {
            page: {type: "integer", default: 1, description: "Page number"},
            limit: {type: "integer", default: 100, description: "Items per page (max: 1000)"},
            serialNumber: {type: "string", description: "Filter by station serial number"},
            sensorType: {
              type: "string",
              enum: ["Salt", "Distance", "Temp", "Daily Rainfall"],
              description: "Filter by sensor type",
            },
            startDate: {type: "string", format: "date", description: "Start date (YYYY-MM-DD)"},
            endDate: {type: "string", format: "date", description: "End date (YYYY-MM-DD)"},
            sortBy: {type: "string", enum: ["date", "sensor_type", "value", "serial_number"], default: "date"},
            sortOrder: {type: "string", enum: ["asc", "desc"], default: "desc"},
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: {type: "boolean"},
              data: {type: "array"},
              pagination: {type: "object"},
              filters: {type: "object"},
            },
          },
        },
      },
    },
    iotController.getAllData,
  );

  // Get data by station
  fastify.get(
    "/data/:serialNumber",
    {
      schema: {
        description: "Get IoT data for a specific station",
        tags: ["IoT Data"],
        params: {
          type: "object",
          required: ["serialNumber"],
          properties: {
            serialNumber: {type: "string", description: "Station serial number"},
          },
        },
        querystring: {
          type: "object",
          properties: {
            startDate: {type: "string", format: "date", description: "Start date (YYYY-MM-DD)"},
            endDate: {type: "string", format: "date", description: "End date (YYYY-MM-DD)"},
            sensorType: {type: "string", enum: ["Salt", "Distance", "Temp", "Daily Rainfall"]},
            groupBy: {
              type: "string",
              enum: ["date", "sensor_type", "none"],
              default: "none",
              description: "Group results by date or sensor type",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: {type: "boolean"},
              station: {type: "object"},
              data: {type: "array"},
              count: {type: "integer"},
              filters: {type: "object"},
            },
          },
        },
      },
    },
    iotController.getDataByStation,
  );

  // Manual sync trigger
  fastify.post(
    "/sync/:serialNumber",
    {
      schema: {
        description: "Trigger manual sync for a station or all stations",
        tags: ["IoT Sync"],
        params: {
          type: "object",
          required: ["serialNumber"],
          properties: {
            serialNumber: {
              type: "string",
              description: 'Station serial number or "all" for all stations',
            },
          },
        },
        body: {
          type: "object",
          properties: {
            startDate: {type: "string", format: "date", description: "Start date (YYYY-MM-DD)"},
            endDate: {type: "string", format: "date", description: "End date (YYYY-MM-DD)"},
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: {type: "boolean"},
              message: {type: "string"},
              result: {type: "object"},
            },
          },
        },
      },
    },
    iotController.manualSync,
  );

  // Get sync logs
  fastify.get(
    "/sync/logs",
    {
      schema: {
        description: "Get sync history logs",
        tags: ["IoT Sync"],
        querystring: {
          type: "object",
          properties: {
            page: {type: "integer", default: 1},
            limit: {type: "integer", default: 50},
            serialNumber: {type: "string", description: "Filter by station"},
            status: {type: "string", enum: ["success", "error"], description: "Filter by status"},
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: {type: "boolean"},
              data: {type: "array"},
              pagination: {type: "object"},
            },
          },
        },
      },
    },
    iotController.getSyncLogs,
  );

  // Health check
  fastify.get(
    "/health",
    {
      schema: {
        description: "IoT service health check",
        tags: ["IoT Health"],
        response: {
          200: {
            type: "object",
            properties: {
              success: {type: "boolean"},
              message: {type: "string"},
              timestamp: {type: "string"},
            },
          },
        },
      },
    },
    async (request, reply) => {
      reply.code(200).send({
        success: true,
        message: "IoT service is running",
        timestamp: new Date().toISOString(),
      });
    },
  );

  // =============================================
  // NEW: Initial Sync & Date Range Sync Endpoints
  // =============================================

  // Initial sync from 25/8/2025 to now
  fastify.post(
    "/initial-sync",
    {
      schema: {
        description: "Sync all data from 25/8/2025 to now for all active stations",
        tags: ["IoT Sync"],
        body: {
          type: "object",
          properties: {
            stations: {
              type: "array",
              items: {type: "string"},
              description: "Array of station serial numbers (optional, default: all active)",
            },
            startDate: {
              type: "string",
              format: "date",
              default: "2025-08-25",
              description: "Start date (YYYY-MM-DD)",
            },
            chunkDays: {
              type: "integer",
              default: 30,
              description: "Chunk size in days for splitting sync",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: {type: "boolean"},
              message: {type: "string"},
              summary: {type: "object"},
              results: {type: "array"},
            },
          },
        },
      },
    },
    iotSyncController.initialSync,
  );

  // Sync specific date range
  fastify.post(
    "/sync-date-range",
    {
      schema: {
        description: "Sync data for specific date range",
        tags: ["IoT Sync"],
        body: {
          type: "object",
          required: ["serialNumber", "startDate", "endDate"],
          properties: {
            serialNumber: {type: "string", description: "Station serial number"},
            startDate: {type: "string", format: "date", description: "Start date (YYYY-MM-DD)"},
            endDate: {type: "string", format: "date", description: "End date (YYYY-MM-DD)"},
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: {type: "boolean"},
              message: {type: "string"},
              result: {type: "object"},
            },
          },
        },
      },
    },
    iotSyncController.syncDateRange,
  );

  // Get sync status
  fastify.get(
    "/sync/status",
    {
      schema: {
        description: "Get current sync status and schedule",
        tags: ["IoT Sync"],
        response: {
          200: {
            type: "object",
            properties: {
              success: {type: "boolean"},
              cronSchedule: {type: "string"},
              nextRun: {type: "string"},
              stations: {type: "array"},
            },
          },
        },
      },
    },
    iotSyncController.getSyncStatus,
  );

  // Manual sync trigger
  fastify.post(
    "/sync/manual",
    {
      schema: {
        description: "Trigger manual sync for all active stations",
        tags: ["IoT Sync"],
        body: {
          type: "object",
          properties: {
            days: {type: "integer", default: 3, description: "Number of days back to sync"},
            stations: {type: "array", items: {type: "string"}, description: "Specific stations to sync (optional)"},
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: {type: "boolean"},
              message: {type: "string"},
              summary: {type: "object"},
            },
          },
        },
      },
    },
    iotSyncController.manualSync,
  );

  // Get cron job status
  fastify.get(
    "/sync/cron-status",
    {
      schema: {
        description: "Get cron job status and configuration",
        tags: ["IoT Sync"],
        response: {
          200: {
            type: "object",
            properties: {
              success: {type: "boolean"},
              cronJob: {type: "object"},
              systemCron: {type: "boolean"},
            },
          },
        },
      },
    },
    iotSyncController.getCronStatus,
  );

  // Export IoT data
  fastify.post(
    "/export",
    {
      onRequest: [VerifyToken],
      schema: {
        description: "Export IoT data in various formats",
        tags: ["IoT Export"],
        body: {
          type: "object",
          required: ["stations", "startDate", "endDate", "format"],
          properties: {
            stations: {
              type: "array",
              items: {type: "string"},
              description: "Array of station serial numbers",
            },
            startDate: {type: "string", format: "date", description: "Start date"},
            endDate: {type: "string", format: "date", description: "End date"},
            format: {type: "string", enum: ["excel", "pdf", "gis"], description: "Export format"},
          },
        },
        response: {
          200: {
            type: "string",
            description: "File content (binary)",
          },
        },
      },
    },
    ExportIoTDataWithRange,
  );

  // Clear all IoT data
  fastify.delete(
    "/data/clear",
    {
      onRequest: [VerifyToken],
      schema: {
        description: "Clear all IoT data and optionally trigger resync",
        tags: ["IoT Data Management"],
        querystring: {
          type: "object",
          properties: {
            resync: {type: "boolean", default: false, description: "Trigger resync after clearing data"},
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: {type: "boolean"},
              message: {type: "string"},
              cleared: {type: "object"},
              resyncTriggered: {type: "boolean"},
            },
          },
        },
      },
    },
    iotController.clearAllData,
  );
}

module.exports = iotRoutes;
