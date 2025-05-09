const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

// const GetSearchAll = async (req, reply) => {
//   try {
//     const {keyword} = req.body;

//     if (!keyword) {
//       return reply.code(400).send({code: 400, message: "Keyword is required"});
//     }

//     const query = `
//       SELECT * FROM "hochiminh"."DiaPhanXa"
//       WHERE "tenxa" ILIKE $1
//          OR "tenhuyen" ILIKE $1
//          OR "maxa"::text = $2
//          OR "mahuyen"::text = $2
//     `;

//     const values = [`%${keyword}%`, keyword];
//     const result = await QueryDatabase(query, values);

//     if (!result || result.rowCount === 0) {
//       return reply.code(404).send({code: 404, message: "No matching results found"});
//     }

//     return reply.code(200).send(result.rows);
//   } catch (error) {
//     logger.error("GetSearchAll Error:", error);
//     return reply.code(500).send({code: 500, message: "Internal Server Error"});
//   }
// };

const GetSearchAll = async (req, reply) => {
  try {
    const {id} = req.params;

    if (!id) {
      return reply.code(400).send({code: 400, message: "id is required"});
    }

    const escapedId = id.replace(/'/g, "''");

    const result = await QueryDatabase(
      `SELECT * FROM hochiminh. "DiaPhanXa" WHERE maxa='${escapedId}' or mahuyen='${escapedId}'  OR tenxa ILIKE '%${escapedId}%'
         OR tenhuyen ILIKE '%${escapedId}%'`,
    );

    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Contact not found"});
    }

    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Internal Server Error"});
  }
};

module.exports = {GetSearchAll};
