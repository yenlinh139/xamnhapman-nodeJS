const escape = require("escape-html");
const {hashPassword} = require("../../utils/hashBcrypt");
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

const CreateUser = async (req, res, next) => {
  try {
    if (!req.body) {
      res.status(400).send({status: 400, message: "Thiếu dữ liệu yêu cầu"});
    }

    const email = escape(req.body.email);
    const name = escape(req.body.name);
    const password = escape(req.body.password);
    const phone = escape(req.body.phone);
    const role = escape(req.body.role);

    if (!email || !name || !password || !phone) {
      res.status(400);
      return {code: 400, message: "Vui lòng điền đầy đủ các trường bắt buộc"};
    }

    // Check user+email ko được trùng với cái đã có trong hệ thống
    const checkEmail = await QueryDatabase(`SELECT * FROM "users" WHERE email='${email}'`);
    const checkName = await QueryDatabase(`SELECT * FROM "users" WHERE name='${name}'`);
    if (checkEmail.rowCount > 0) {
      res.status(409);
      return {code: 409, message: "Email đã được sử dụng"};
    }
    if (checkName.rowCount > 0) {
      res.status(409);
      return {code: 409, message: "Tên người dùng đã tồn tại"};
    }
    // Hash password
    const hashedPassword = await hashPassword(password);

    const sql = `
      INSERT INTO "users" (name, email, password , role, phone) 
      VALUES ('${name}', '${email}', '${hashedPassword}','0', '${phone}');
    `;

    await QueryDatabase(sql);
    return {code: 201, message: "Tạo người dùng thành công"};
  } catch (error) {
    logger.error(error);
    res.status(500);
    return {code: 500, message: "Lỗi máy chủ nội bộ"};
  }
};

module.exports = CreateUser;
