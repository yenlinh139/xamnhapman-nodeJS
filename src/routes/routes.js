const {upload} = require("../configs/uploadImage");
const {Login, RefreshToken, SignUp, verifyEmail} = require("../controllers/auth/auth.controller");
const {CreateFarmBoundary} = require("../controllers/maps/createMapRegion.controller");
const {GetMapRegions} = require("../controllers/maps/getMapRegions.controller");
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
const {
  GetSearchAll,
  GetAllDistricts,
  GetSearchDate,
  GetStationPositionSalinity,
  GetStationPositionHydrometeorology,
} = require("../controllers/search/getSearch.controller");
const {GetHydrometeorology, GetHydrometeorologyData} = require("../controllers/hydrometeorology/hydrometeorology.controller");

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

  // Map Region
  router.get("/map", {onRequest: [VerifyToken]}, GetMapRegions);
  router.post("/map/farmBoundary", {onRequest: [VerifyToken]}, CreateFarmBoundary);

  //Feedback
  router.post("/feedback", CreateFeedback);
  router.get("/feedback", GetFeedback);
  router.put("/feedback", ChangeFeedback);

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

  //search
  router.get("/search/:id", GetSearchAll);
  router.get("/districts", GetAllDistricts);
  router.get("/search-date/:id", GetSearchDate);
  router.get("/station-position-salinity/:code", GetStationPositionSalinity);
  router.get("/station-position-hydrometeorology/:code", GetStationPositionHydrometeorology);

  //hydrometeorology
  router.get("/hydrometeorology-station", GetHydrometeorology);
  router.get("/hydrometeorology-data/:kihieu", GetHydrometeorologyData);

  next();
};

module.exports = router;
