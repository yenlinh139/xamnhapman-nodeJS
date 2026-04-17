const escape = require("escape-html");
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

const CreateFeedback = async (req, reply) => {
  try {
    if (!req.body) {
      return reply.code(400).send({status: 400, message: "Thiếu dữ liệu yêu cầu"});
    }

    const name = escape(req.body.name);
    const email = escape(req.body.email);
    const message = escape(req.body.message);
    const rating = req.body.rating ?? 0; // Nếu không có rating, mặc định là 0

    if (!name || !email || !message) {
      return reply.code(400).send({code: 400, message: "Vui lòng điền đầy đủ các trường bắt buộc"});
    }

    // Kiểm tra xem email đã liên hệ trước đó chưa
    const checkEmail = await QueryDatabase(`SELECT * FROM "feedbacks" WHERE email='${email}'`);
    if (checkEmail.rowCount > 0) {
      return reply.code(409).send({code: 409, message: "Bạn đã gửi liên hệ trước đó rồi"});
    }

    // Chèn dữ liệu vào bảng feedbacks
    const sql = `
      INSERT INTO "feedbacks" (name, email,  message, rating) 
      VALUES ('${name}', '${email}',  '${message}', ${rating});
    `;

    await QueryDatabase(sql);
    return reply.code(201).send({code: 201, message: "Yêu cầu liên hệ của bạn đã được gửi thành công"});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

module.exports = CreateFeedback;
