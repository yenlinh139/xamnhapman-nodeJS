const escape = require("escape-html");
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

const GetUser = async (req, res, next) => {
  try {
    const sql = `
      SELECT 
        u.*,
        f.name as feedback_name,
        f.message as feedback_message,
        f.rating as feedback_rating
      FROM "users" u
      LEFT JOIN "feedbacks" f ON u.email = f.email;
    `;

    const data = await QueryDatabase(sql);
    res.send(
      data.rows.map((row) => {
        delete row.password;
        return row;
      }),
    );
  } catch (error) {
    logger.error(error);
    res.status(500);
    return {code: 500, message: "Lỗi máy chủ nội bộ"};
  }
};

const GetUserById = async (req, res, next) => {
  try {
    const id = escape(req.params.id);
    const sql = `
      SELECT * FROM "users" WHERE email = '${id}'
    `;

    const data = await QueryDatabase(sql);
    res.send(
      data.rows.map((row) => {
        delete row.password;
        return row;
      }),
    );
  } catch (error) {
    logger.error(error);
    res.status(500);
    return {code: 500, message: "Lỗi máy chủ nội bộ"};
  }
};

module.exports = {
  GetUser,
  GetUserById,
};
