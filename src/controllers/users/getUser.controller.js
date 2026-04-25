const escape = require("escape-html");
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

const GetUser = async (req, res, next) => {
  try {
    const sql = `
      SELECT 
        u.*,
        f.feedback_type as feedback_type,
        f.content as feedback_content,
        f.status as feedback_status,
        f.created_at as feedback_created_at
      FROM "users" u
      LEFT JOIN LATERAL (
        SELECT feedback_type, content, status, created_at
        FROM "feedbacks"
        WHERE user_id = u.id
        ORDER BY created_at DESC
        LIMIT 1
      ) f ON TRUE;
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
