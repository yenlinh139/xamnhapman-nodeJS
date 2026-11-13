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
    // Số điện thoại không bắt buộc (khớp với CreateUserModal.jsx, chỉ Họ và tên/Email/Mật khẩu
    // mới có dấu *) - escape(undefined) sẽ ra chuỗi "undefined" nên phải tự giữ null khi trống.
    const phone = req.body.phone ? escape(req.body.phone) : null;
    const VALID_ROLES = ["0", "1", "2"];
    const requestedRole = String(req.body.role ?? "");
    const role = VALID_ROLES.includes(requestedRole) ? requestedRole : "2";

    if (!email || !name || !password) {
      res.status(400);
      return {code: 400, message: "Vui lòng điền đầy đủ các trường bắt buộc"};
    }

    // Check email ko được trùng với cái đã có trong hệ thống (name chỉ là tên hiển thị, được phép trùng)
    const checkEmail = await QueryDatabase(`SELECT * FROM "users" WHERE email='${email}'`);
    if (checkEmail.rowCount > 0) {
      res.status(409);
      return {code: 409, message: "Email đã được sử dụng"};
    }
    // Hash password
    const hashedPassword = await hashPassword(password);

    // Admin tạo tài khoản qua endpoint này (yêu cầu VerifyToken) nên kích hoạt sẵn, không cần xác thực email
    const sql = `
      INSERT INTO "users" (name, email, password , role, phone, email_verified)
      VALUES ('${name}', '${email}', '${hashedPassword}', '${role}', ${phone ? `'${phone}'` : "NULL"}, TRUE);
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
