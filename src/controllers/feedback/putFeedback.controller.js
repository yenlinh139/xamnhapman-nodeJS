const escape = require("escape-html");
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

const ChangeFeedback = async (req, reply) => {
  try {
    const {email} = req.params;

    if (!email) {
      return reply.code(400).send({code: 400, message: "Email là bắt buộc"});
    }

    const {name, message, rating} = req.body;

    if (!name || !message) {
      return reply.code(400).send({code: 400, message: "Vui lòng điền đầy đủ các trường bắt buộc"});
    }

    // Kiểm tra xem email có tồn tại không
    const checkEmail = await QueryDatabase(`SELECT * FROM "feedbacks" WHERE email='${email}'`);
    if (checkEmail.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy liên hệ"});
    }

    // Cập nhật thông tin liên hệ
    const sql = `UPDATE "feedbacks" 
                 SET name='${escape(name)}', message='${escape(message)}', rating=${rating}
                 WHERE email='${email}';`;
    await QueryDatabase(sql);

    return reply.code(200).send({code: 200, message: "Cập nhật liên hệ thành công"});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

module.exports = ChangeFeedback;
