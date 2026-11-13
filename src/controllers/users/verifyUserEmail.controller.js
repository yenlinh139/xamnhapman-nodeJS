const escape = require("escape-html");
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

// PUT /user/verify-email - cho phep admin tu kich hoat tai khoan (danh dau email_verified = true)
// thay vi phai cho nguoi dung bam link trong email xac thuc - can thiet khi tinh nang gui mail
// chua hoat dong dung tren moi truong (vd mail provider la sandbox, khong gui duoc toi hop thu
// that - xem phan dieu tra rieng ve van de nay).
const VerifyUserEmail = async (req, res, next) => {
  try {
    const id = escape(req.body.id);

    if (!id) {
      res.status(400);
      return {code: 400, message: "Thiếu id"};
    }

    const checkId = await QueryDatabase(`SELECT * FROM "users" WHERE id='${id}'`);
    if (checkId.rowCount === 0) {
      res.status(404);
      return {code: 404, message: "Không tìm thấy người dùng"};
    }

    if (checkId.rows[0].email_verified) {
      return {code: 200, message: "Tài khoản đã được xác thực trước đó"};
    }

    await QueryDatabase(
      `UPDATE "users"
       SET email_verified = TRUE, email_verify_token = NULL, email_verify_token_expires = NULL
       WHERE id = $1`,
      [id],
    );

    return {code: 200, message: "Kích hoạt tài khoản thành công"};
  } catch (error) {
    logger.error(error);
    res.status(500);
    return {code: 500, message: "Lỗi máy chủ nội bộ"};
  }
};

module.exports = VerifyUserEmail;
