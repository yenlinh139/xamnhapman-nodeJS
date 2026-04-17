const escape = require("escape-html");
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

const ChangeRoleUser = async (req, res, next) => {
  try {
    if (!req.body) {
      res.status(400).send({status: 400, message: "Thiếu dữ liệu yêu cầu"});
    }

    const email = escape(req.body.email);
    const role = escape(req.body.role);

    // Check Email có trong CSDL hay không
    const checkEmail = await QueryDatabase(`SELECT * FROM "users" WHERE email = '${email}'`);
    if (checkEmail.rowCount === 0) {
      res.status(404);
      return {code: 404, message: "Email không tồn tại"};
    }

    const sql = ` UPDATE "users" SET role = '${role}' WHERE email = '${email}' `;
    await QueryDatabase(sql);
    return {code: 200, message: "Cập nhật quyền người dùng thành công"};
  } catch (error) {
    logger.error(error);
    res.status(500);
    return {code: 500, message: "Lỗi máy chủ nội bộ"};
  }
};

module.exports = ChangeRoleUser;
