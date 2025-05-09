const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const XLSX = require("xlsx");

const GetHydrometeorology = async (req, reply) => {
  try {
    const result = await QueryDatabase(`
      SELECT * FROM hochiminh."TramKTTV"
      WHERE "KinhDo" IS NOT NULL AND "ViDo" IS NOT NULL
    `);

    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Internal Server Error"});
  }
};

module.exports = {
  GetHydrometeorology,
};
