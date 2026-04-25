const {Login, RefreshToken, SignUp, verifyEmail, ForgotPassword, ResetPassword, ValidateResetToken} = require("../controllers/auth/auth.controller");
const ChangeRoleUser = require("../controllers/users/changeRoleUser.controller");
const CreateUser = require("../controllers/users/createUser.controller");
const DeleteUser = require("../controllers/users/deleteUser.controller");
const {GetUser, GetUserById} = require("../controllers/users/getUser.controller");
const PutUser = require("../controllers/users/putUser.controller");
const VerifyToken = require("../middlewares/verifyToken");
const GetFeedback = require("../controllers/feedback/getFeedback.controller");
const CreateFeedback = require("../controllers/feedback/postFeedback.controller");
const ChangeFeedback = require("../controllers/feedback/putFeedback.controller");
const DeleteFeedback = require("../controllers/feedback/deleteFeedback.controller");
const {UploadFeedbackImage, GetUploadedImage, DeleteUploadedImage} = require("../controllers/feedback/uploadFeedbackImage.controller");
const {upload} = require("../configs/uploadImage");
const {
  GetSalinityPoints,
  GetSalinityOverview,
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
  GetAdministrativeDistricts,
  GetAdministrativeCommunesByDistrict,
  GetAdministrativeCommuneByCode,
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
  GetReservoirPoints,
  GetReservoirOverview,
  GetReservoirData,
  GetLatestReservoirData,
} = require("../controllers/reservoir/reservoir.controller");
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
  router.post("/forgot-password", ForgotPassword);
  router.get("/validate-reset-token/:token", ValidateResetToken);
  router.post("/reset-password", ResetPassword);

  // User
  router.get("/user", {onRequest: [VerifyToken]}, GetUser);
  router.get("/user/:id", {onRequest: [VerifyToken]}, GetUserById);
  router.post("/user", CreateUser);
  router.delete("/user", {onRequest: [VerifyToken]}, DeleteUser);
  router.put("/user", {onRequest: [VerifyToken]}, PutUser);
  router.put("/user/changerole", {onRequest: [VerifyToken]}, ChangeRoleUser);

  //Feedback
  router.post("/upload/feedback-image", {onRequest: [VerifyToken], preHandler: upload.single("image")}, UploadFeedbackImage);
  router.get("/uploads/:fileName", GetUploadedImage);
  router.delete("/uploads/:fileName", {onRequest: [VerifyToken]}, DeleteUploadedImage);
  router.post("/feedback", {onRequest: [VerifyToken]}, CreateFeedback);
  router.get("/feedback", {onRequest: [VerifyToken]}, GetFeedback);
  router.get("/feedback/:email", {onRequest: [VerifyToken]}, GetFeedback);
  router.put("/feedback/:id", {onRequest: [VerifyToken]}, ChangeFeedback);
  router.delete("/feedback/:id", {onRequest: [VerifyToken]}, DeleteFeedback);

  //salinity
  router.get("/salinity-points", GetSalinityPoints);
  router.get("/salinity-overview/:code", GetSalinityOverview);
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
  router.get("/administrative/districts", GetAdministrativeDistricts);
  router.get("/administrative/communes/:maHuyen", GetAdministrativeCommunesByDistrict);
  router.get("/administrative/commune/:maXa", GetAdministrativeCommuneByCode);
  router.get("/search-date/:id", GetSearchDate);
  router.get("/station-position-salinity/:kihieu", GetStationPositionSalinity);
  router.get("/station-position-hydrometeorology/:code", GetStationPositionHydrometeorology);

  //hydrometeorology
  router.get("/hydrometeorology-stations", GetHydrometeorology);
  router.get("/hydrometeorology-data/:kihieu", GetHydrometeorologyData);
  router.get("/hydrometeorology-latest", GetLatestHydrometeorologyData);

  // reservoir discharge
  router.get("/reservoir-points", GetReservoirPoints);
  router.get("/reservoir-overview/:code", GetReservoirOverview);
  router.get("/reservoir-data/:kihieu", GetReservoirData);
  router.get("/reservoir-latest", GetLatestReservoirData);

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
