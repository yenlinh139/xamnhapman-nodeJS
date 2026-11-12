const escape = require("escape-html");
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const {hashPassword} = require("../../utils/hashBcrypt");

const PutUser = async (req, res, next) => {
  try {
    if (!req.body) {
      res.status(400).send({status: 400, message: "Thiếu dữ liệu yêu cầu"});
    }

    const name = escape(req.body.name);
    const email = escape(req.body.email);
    // Số điện thoại không bắt buộc (không có dấu * trong EditUserModal.jsx) - lưu NULL khi để
    // trống thay vì chuỗi rỗng/"undefined", khớp với cách CreateUser xử lý.
    const phone = req.body.phone ? escape(req.body.phone) : null;
    const password = escape(req.body.password);

    if (!name) {
      res.status(404);
      return {code: 404, message: "Thiếu tên người dùng"};
    }

    // Check Email có trong CSDL hay không
    const checkEmail = await QueryDatabase(`SELECT * FROM "users" WHERE email = '${email}'`);
    if (checkEmail.rowCount === 0) {
      res.status(404);
      return {code: 404, message: "Email không tồn tại"};
    }

    const phoneSql = phone ? `'${phone}'` : "NULL";

    if (!password || req.body.password == undefined) {
      const sql = `
        UPDATE users
        SET name = '${name}', phone = ${phoneSql}
        WHERE email = '${email}'
      `;
      await QueryDatabase(sql);
      return {code: 200, message: "Cập nhật người dùng thành công"};
    } else {
      const hashedPassword = await hashPassword(password);
      const sql = `
        UPDATE users
        SET password = '${hashedPassword}', name = '${name}', phone = ${phoneSql}
        WHERE email = '${email}'
      `;
      await QueryDatabase(sql);
      return {code: 200, message: "Cập nhật người dùng thành công"};
    }
  } catch (error) {
    logger.error(error);
    res.status(500);
    return {code: 500, message: "Lỗi máy chủ nội bộ"};
  }
};

module.exports = PutUser;
