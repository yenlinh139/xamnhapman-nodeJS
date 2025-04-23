const escape = require("escape-html");
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

const ChangeFeedback = async (req, reply) => {
  try {
    const {email} = req.params;

    if (!email) {
      return reply.code(400).send({code: 400, message: "Email is required"});
    }

    const {name, message, rating} = req.body;

    if (!name || !message) {
      return reply.code(400).send({code: 400, message: "Missing required fields"});
    }

    // Kiểm tra xem email có tồn tại không
    const checkEmail = await QueryDatabase(`SELECT * FROM "feedbacks" WHERE email='${email}'`);
    if (checkEmail.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Contact not found"});
    }

    // Cập nhật thông tin liên hệ
    const sql = `UPDATE "feedbacks" 
                 SET name='${escape(name)}', message='${escape(message)}', rating=${rating}
                 WHERE email='${email}';`;
    await QueryDatabase(sql);

    return reply.code(200).send({code: 200, message: "Contact updated successfully"});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Internal Server Error"});
  }
};

module.exports = ChangeFeedback;
