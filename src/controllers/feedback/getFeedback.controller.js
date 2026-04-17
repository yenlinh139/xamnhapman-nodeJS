const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

const GetFeedback = async (req, reply) => {
  try {
    const {email} = req.params;

    if (!email) {
      return reply.code(400).send({code: 400, message: "Email là bắt buộc"});
    }

    const result = await QueryDatabase(`SELECT * FROM "feedbacks" WHERE email='${email}'`);

    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy liên hệ"});
    }

    return reply.code(200).send(result.rows[0]);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

module.exports = GetFeedback;
