const {Login, RefreshToken, SignUp, verifyEmail} = require("../controllers/auth/auth.controller");
const ChangeRoleUser = require("../controllers/users/changeRoleUser.controller");
const CreateUser = require("../controllers/users/createUser.controller");
const DeleteUser = require("../controllers/users/deleteUser.controller");
const {GetUser, GetUserById} = require("../controllers/users/getUser.controller");
const PutUser = require("../controllers/users/putUser.controller");
const VerifyToken = require("../middlewares/verifyToken");
const GetFeedback = require("../controllers/feedback/getFeedback.controller");
const CreateFeedback = require("../controllers/feedback/postFeedback.controller");
const ChangeFeedback = require("../controllers/feedback/putFeedback.controller");
const {
  GetFeedbackStats,
  GetFeedbackStatsByTime,
  GetRecentFeedbacks,
  GetDetailedRatingStats,
} = require("../controllers/feedback/feedbackStats.controller");
const {
  GetSalinityPoints,
  GetSalinityData,
  ExportSalinityDataToExcel,
  ExportSalinityDataWithRange,
} = require("../controllers/salinity/getSalinity.controller");
const {
  CreateSalinityData,
  GetAllSalinityData,
  UpdateSalinityData,
  DeleteSalinityData,
  DeleteSalinityDataRange,
} = require("../controllers/salinity/salinityData.controller");
const {GetDailySalinityReportData, ExportSalinityReportPDF} = require("../controllers/salinity/salinityReport.controller");
const {
  GetSearchAll,
  GetAllDistricts,
  GetSearchDate,
  GetStationPositionSalinity,
  GetStationPositionHydrometeorology,
} = require("../controllers/search/getSearch.controller");
const {
  GetHydrometeorology,
  GetHydrometeorologyData,
  GetLatestHydrometeorologyData,
} = require("../controllers/hydrometeorology/hydrometeorology.controller");
const {
  GetHydrometeorologySummaryStats,
  GetRainfallStatsByStation,
  GetWaterLevelStatsByStation,
  GetMonthlyYearlyStats,
  GetWeatherHydroAlerts,
  GetHydrometeorologicalDashboard,
} = require("../controllers/hydrometeorology/hydrometeorologyStats.controller");
// const {cacheMiddleware} = require("../middlewares/cacheMiddleware"); // Tạm tắt để test
const {
  LogReportDownload,
  GetReportHistory,
  GetReportStatistics,
  DeleteReportLog,
} = require("../controllers/salinity/reportHistory.controller");

// IoT Routes
const iotRoutes = require("./iotRoutes");

const router = (router, opts, next) => {
  router.get("/", async (req, res) => {
    res.send({hello: "Home Page with Fastify JiraClone"});
  });

  // Auth + Signup
  router.post("/login", Login);
  router.get("/refresh-token", RefreshToken);
  router.post("/signup", SignUp);
  router.get("/verify-email/:userId", verifyEmail);

  // User
  router.get("/user", {onRequest: [VerifyToken]}, GetUser);
  router.get("/user/:id", {onRequest: [VerifyToken]}, GetUserById);
  router.post("/user", CreateUser);
  router.delete("/user", {onRequest: [VerifyToken]}, DeleteUser);
  router.put("/user", {onRequest: [VerifyToken]}, PutUser);
  router.put("/user/changerole", {onRequest: [VerifyToken]}, ChangeRoleUser);

  //Feedback
  router.post("/feedback", CreateFeedback);
  router.get("/feedback/:email", GetFeedback);
  router.put("/feedback/:email", ChangeFeedback);

  // Feedback Statistics - Public endpoints for building trust
  router.get("/feedback/stats", GetFeedbackStats);
  router.get("/feedback/stats/time", GetFeedbackStatsByTime);
  router.get("/feedback/recent", GetRecentFeedbacks);
  router.get("/feedback/stats/rating", GetDetailedRatingStats);

  //salinity
  router.get("/salinity-points", GetSalinityPoints);
  router.get("/salinity-data/:kihieu", GetSalinityData);
  router.get("/salinity-export/:kihieu", ExportSalinityDataToExcel);
  router.post("/salinity-export", ExportSalinityDataWithRange);

  // SalinityData CRUD
  router.post("/salinity-data", {onRequest: [VerifyToken]}, CreateSalinityData);
  router.get("/salinity-data", GetAllSalinityData);
  router.put("/salinity-data/:date", {onRequest: [VerifyToken]}, UpdateSalinityData);
  router.delete("/salinity-data/:date", {onRequest: [VerifyToken]}, DeleteSalinityData);
  router.delete("/salinity-data-range", {onRequest: [VerifyToken]}, DeleteSalinityDataRange);

  // Salinity Reports
  router.get("/salinity-report/:date", GetDailySalinityReportData);
  router.get("/salinity-report/:date/export-pdf", {onRequest: [VerifyToken]}, ExportSalinityReportPDF);
  router.post("/log-download", {onRequest: [VerifyToken]}, LogReportDownload);
  router.get("/history", {onRequest: [VerifyToken]}, GetReportHistory);
  router.get("/statistics", {onRequest: [VerifyToken]}, GetReportStatistics);
  router.delete("/history/:id", {onRequest: [VerifyToken]}, DeleteReportLog);

  //search
  router.get("/search/:id", GetSearchAll);
  router.get("/districts", GetAllDistricts);
  router.get("/search-date/:id", GetSearchDate);
  router.get("/station-position-salinity/:kihieu", GetStationPositionSalinity);
  router.get("/station-position-hydrometeorology/:code", GetStationPositionHydrometeorology);

  //hydrometeorology
  router.get("/hydrometeorology-stations", GetHydrometeorology);
  router.get("/hydrometeorology-data/:kihieu", GetHydrometeorologyData);
  router.get("/hydrometeorology-latest", GetLatestHydrometeorologyData);

  //hydrometeorology statistics
  router.get("/hydrometeorology-stats/summary", GetHydrometeorologySummaryStats);
  router.get("/hydrometeorology-stats/rainfall-by-station", GetRainfallStatsByStation);
  router.get("/hydrometeorology-stats/water-level-by-station", GetWaterLevelStatsByStation);
  router.get("/hydrometeorology-stats/monthly-yearly", GetMonthlyYearlyStats);
  router.get("/hydrometeorology-stats/alerts", GetWeatherHydroAlerts);
  router.get("/hydrometeorology-stats/dashboard", GetHydrometeorologicalDashboard);

  // IoT Data Routes
  router.register(iotRoutes, {prefix: "/iot"});

  next();
};

module.exports = router;
