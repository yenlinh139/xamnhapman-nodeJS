const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

const GetMapRegions = async (req, res, next) => {
  try {
    const sql = `SELECT * FROM "map_regions"`;
    const result = await QueryDatabase(sql);
    if (result.rowCount === 0) {
      res.status(404).send({status: 404, message: "No map regions found"});
    } else {
      res.status(200).send({status: 200, data: result.rows});
    }
  } catch (error) {
    logger.error(error);
    res.status(500).send({status: 500, message: "Internal Server Error"});
  }
};

module.exports = {GetMapRegions};
