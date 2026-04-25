const crypto = require("crypto");
const escape = require("escape-html");
const jwt = require("jsonwebtoken");
const {GenerateAccessToken, GenerateRefreshToken} = require("../../utils/generateJWT");
const QueryDatabase = require("../../utils/queryDatabase");
const {compareHashPassword, hashPassword} = require("../../utils/hashBcrypt");
const logger = require("../../loggers/loggers.config");
const nodemailer = require("nodemailer");

const MAIL_PROVIDER_DEFAULTS = {
  // Gmail thường ổn định hơn với STARTTLS port 587 trong môi trường VPS/Docker.
  gmail: {host: "smtp.gmail.com", port: 587, secure: false},
  mailtrap: {host: "sandbox.smtp.mailtrap.io", port: 2525, secure: false},
  brevo: {host: "smtp-relay.brevo.com", port: 587, secure: false},
  sendgrid: {host: "smtp.sendgrid.net", port: 587, secure: false, user: "apikey"},
};

function getMailConfig() {
  const provider = String(process.env.MAIL_PROVIDER || "gmail").trim().toLowerCase();
  const defaults = MAIL_PROVIDER_DEFAULTS[provider] || MAIL_PROVIDER_DEFAULTS.gmail;

  const host = String(process.env.MAIL_HOST || defaults.host || "").trim();
  const port = Number(process.env.MAIL_PORT || defaults.port || 0);
  const secure = String(process.env.MAIL_SECURE || "").trim()
    ? String(process.env.MAIL_SECURE).toLowerCase() === "true"
    : Boolean(defaults.secure);
  const user = String(process.env.MAIL_USER || process.env.EMAIL || defaults.user || "").trim();
  const pass = String(process.env.MAIL_PASS || process.env.EMAIL_PASSWORD || "").trim();
  const from = String(process.env.MAIL_FROM || user || "noreply@xamnhapman.local").trim();

  return {provider, host, port, secure, user, pass, from};
}

function createTransporter() {
  const mailConfig = getMailConfig();
  const enableDebug = String(process.env.MAIL_DEBUG || "").trim().toLowerCase() === "true";

  return nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    requireTLS: !mailConfig.secure,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    logger: enableDebug,
    debug: enableDebug,
    auth: {
      user: mailConfig.user,
      pass: mailConfig.pass,
    },
    tls: {
      minVersion: "TLSv1.2",
      servername: mailConfig.host,
    },
  });
}

// Hàm gửi email
function isEmailConfigured() {
  const mailConfig = getMailConfig();
  return Boolean(mailConfig.host && mailConfig.port && mailConfig.user && mailConfig.pass);
}

function sendEmail(to, subject, htmlContent) {
  if (!isEmailConfigured()) {
    throw new Error("Email service is not configured");
  }

  const mailConfig = getMailConfig();
  const transporter = createTransporter();
  let mailOptions = {
    from: mailConfig.from, // Lấy từ .env
    to: to, // Người nhận
    subject: subject, // Tiêu đề email
    html: htmlContent, // Nội dung email
  };

  return transporter.sendMail(mailOptions);
}

const SignUp = async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).send({status: 400, message: "Thiếu dữ liệu yêu cầu"});
    }

    const rawName = req.body.name;
    const rawEmail = req.body.email;
    const rawPassword = req.body.password || req.body.pswd;

    // Check email, user Not Null
    if (!rawName || !rawEmail || !rawPassword) {
      return res.status(400).send({code: 400, message: "Vui lòng điền đầy đủ các trường bắt buộc"});
    }

    const escapedEmail = escape(String(rawEmail).trim());
    const escapedName = escape(String(rawName).trim());
    const escapedPassword = escape(String(rawPassword));

    // Check if the email already exists
    const existingUser = await QueryDatabase(`SELECT * FROM "users" WHERE email = $1`, [escapedEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(409).send({code: 409, message: "Email đã được sử dụng"});
    }

    if (!isEmailConfigured()) {
      return res.status(500).send({
        code: 500,
        message: "Dịch vụ email chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
      });
    }

    const hashedPassword = await hashPassword(escapedPassword);

    const insertUserSql = `
      INSERT INTO "users" (name, email, password, role, email_verified)
      VALUES ($1, $2, $3, $4, $5)
    `;
    await QueryDatabase(insertUserSql, [escapedName, escapedEmail, hashedPassword, 2, false]);

    // Tạo token xác thực email có hạn 24 giờ
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyTokenHash = crypto.createHash("sha256").update(verifyToken).digest("hex");
    const verifyTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 giờ

    await QueryDatabase(
      `UPDATE "users" SET email_verify_token = $1, email_verify_token_expires = $2 WHERE email = $3`,
      [verifyTokenHash, verifyTokenExpires.toISOString(), escapedEmail]
    );

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const verifyUrl = `${frontendUrl}/verify-email/${encodeURIComponent(verifyToken)}`;

    // Gửi email xác nhận sau khi đăng ký thành công
    const subject = "[WebGIS xâm nhập mặn] Xác thực email";
    const htmlContent = `
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
        <style>
          /* Reset CSS */
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          a { color: #fff}
          body {
            font-family: "Inter", sans-serif;
            line-height: 1.6;
            background-color: #f4f7fa;
            color: #333;
            padding: 20px;
          }
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
          }
          .email-header {
            background-color: #2a9d8f; /* Đặt màu chủ đạo */
            padding: 30px;
            text-align: center;
            color: #fff;
            font-size: 24px;
            font-weight: bold;
            letter-spacing: 1px;
          }
          .email-body {
            padding: 30px;
            text-align: center;
          }
          .email-body p {
            font-size: 16px;
            margin-bottom: 20px;
          }
          .verify-button {
            display: inline-block;
            background-color: #2a9d8f;
            color: #fff !important;
            padding: 12px 30px;
            text-decoration: none;
            font-size: 18px;
            font-weight: bold;
            border-radius: 5px;
            margin-top: 20px;
            transition: background-color 0.3s;
          }
          .verify-button:hover {
            background-color: #1f7a64; /* Tối màu khi hover */
          }
          .email-footer {
            background-color: #f1f1f1;
            color: #777;
            text-align: center;
            padding: 20px;
            font-size: 14px;
          }
          .email-footer a {
            color: #2a9d8f;
            text-decoration: none;
          }
          .email-footer a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="email-header">
            Xác Thực Email Của Bạn
          </div>
          <div class="email-body">
            <p>Chào <b>${escapedName}</b>,</p>
            <p>Để hoàn tất đăng kí tài khoản của bạn, vui lòng nhấn vào nút bên dưới:</p>
            <a href="${verifyUrl}" class="verify-button">Xác Thực Email</a>
          </div>
          <div class="email-footer">
            <p>Email này không thể nhận được phản hồi.</p>
            <p>Nếu bạn không đăng ký tài khoản, vui lòng bỏ qua email này.</p>
            <p><a href="#">Chính sách bảo mật</a> | <a href="#">Điều khoản sử dụng</a></p>
            <p>© 2026 | WebGIS hỗ trợ quản lý, khai thác và cung cấp thông tin mặn tại Thành phố Hồ Chí Minh</p>
          </div>
        </div>
      </body>
    </html>
    `;

    let emailSent = true;
    let responseMessage = "Tạo tài khoản thành công. Vui lòng kiểm tra email để xác thực."

    try {
      await sendEmail(escapedEmail, subject, htmlContent);
    } catch (mailError) {
      emailSent = false;
      const mailConfig = getMailConfig();
      const diagnostic = [
        `provider=${mailConfig.provider}`,
        `host=${mailConfig.host}`,
        `port=${mailConfig.port}`,
        `secure=${mailConfig.secure}`,
        mailError.code ? `code=${mailError.code}` : null,
        mailError.command ? `command=${mailError.command}` : null,
        mailError.responseCode ? `responseCode=${mailError.responseCode}` : null,
        mailError.response ? `response=${mailError.response}` : null,
        `message=${mailError.message}`,
      ]
        .filter(Boolean)
        .join(" | ");

      logger.error(`Send verification email failed for ${escapedEmail}: ${diagnostic}`);
      console.error("Send verification email failed :: ", {
        provider: mailConfig.provider,
        host: mailConfig.host,
        port: mailConfig.port,
        secure: mailConfig.secure,
        code: mailError.code,
        command: mailError.command,
        responseCode: mailError.responseCode,
        response: mailError.response,
        message: mailError.message,
      });
      responseMessage = "Tài khoản đã được tạo nhưng chưa gửi được email xác thực. Vui lòng thử lại sau hoặc liên hệ quản trị viên.";
    }

    // Trả về phản hồi sau khi đăng ký thành công
    return res.status(201).send({
      code: 201,
      message: responseMessage,
      emailSent,
      verifyUrl,
    });
  } catch (error) {
    logger.error(error);
    console.error("Lỗi máy chủ 🔥:: ", error);
    return res.status(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

// Hàm xác thực email
const verifyEmail = async (req, res) => {
  const rawToken = decodeURIComponent(req.params.userId);
  try {
    if (!rawToken) {
      return res.status(400).send({code: 400, message: "Token xác thực không hợp lệ"});
    }

    const tokenHash = crypto.createHash("sha256").update(String(rawToken)).digest("hex");

    // Kiểm tra token và hạn sử dụng
    const userResult = await QueryDatabase(
      `SELECT * FROM "users" WHERE email_verify_token = $1`,
      [tokenHash]
    );

    if (!userResult.rows.length) {
      return res.status(400).send({code: 400, message: "Link xác thực không hợp lệ hoặc đã được sử dụng"});
    }

    const user = userResult.rows[0];

    // Kiểm tra hết hạn
    if (!user.email_verify_token_expires || new Date(user.email_verify_token_expires) < new Date()) {
      return res.status(400).send({code: 400, expired: true, message: "Link xác thực đã hết hạn. Vui lòng đăng ký lại để nhận email mới."});
    }

    // Cập nhật email_verified và xóa token
    await QueryDatabase(
      `UPDATE "users" SET email_verified = TRUE, email_verify_token = NULL, email_verify_token_expires = NULL WHERE id = $1`,
      [user.id]
    );

    return res.status(200).send({
      code: 200,
      message: "Xác thực email thành công!",
      redirectUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/login`,
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

const Login = async (req, res) => {
  try {
    const {email, password} = req.body;
    const checkEmailSql = `SELECT * FROM "users" WHERE email = '${email}'`;
    const user = await QueryDatabase(checkEmailSql);

    // Kiểm tra email có tồn tại không
    if (!user.rows.length) {
      res.status(404);
      return {code: 404, message: "Email không tồn tại"};
    }

    const foundUser = user.rows[0];

    // Kiểm tra xem email đã được xác thực chưa
    if (!foundUser.email_verified || foundUser.email_verified === false) {
      res.status(403);
      return {code: 403, message: "Vui lòng xác thực email trước khi đăng nhập"};
    }

    // Kiểm tra mật khẩu
    const matchPassword = await compareHashPassword(password, foundUser?.password);
    if (!matchPassword) {
      res.status(401);
      return {code: 401, message: "Mật khẩu không đúng"};
    }

    const accessToken = GenerateAccessToken({name: foundUser?.name, email: foundUser?.email, role: foundUser?.role});
    const refreshToken = GenerateRefreshToken({name: foundUser?.name, email: foundUser?.email, role: foundUser?.role});

    return res.status(200).send({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (error) {
    logger.error(error);
    console.error("Lỗi máy chủ 🔥:: ", error);
    res.status(500);
    return {code: 500, message: "Lỗi máy chủ nội bộ"};
  }
};

const RefreshToken = async (req, res) => {
  try {
    const authHeaders = req.headers["authorization"];

    if (!authHeaders) {
      res.status(401);
      return {code: 401, message: "Không tìm thấy header xác thực"};
    }

    const checkBearer = authHeaders.includes("Bearer");
    if (!checkBearer) {
      res.status(401);
      return {code: 401, message: "Token không đúng định dạng Bearer"};
    }

    const token = authHeaders.replace("Bearer ", "");
    if (!token) {
      res.status(401);
      return {code: 401, message: "Không có quyền truy cập"};
    }

    const checkVerify = jwt.verify(token, process.env.REFRESH_TOKEN);

    const accessToken = GenerateAccessToken({name: checkVerify.name, email: checkVerify.email, role: checkVerify.role});
    const refreshToken = GenerateRefreshToken({name: checkVerify?.name, email: checkVerify?.email, role: checkVerify.role});
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  } catch (error) {
    logger.error(error);
    res.status(401);
    return {code: 401, message: "Không có quyền truy cập"};
  }
};

const ForgotPassword = async (req, res) => {
  try {
    const rawEmail = req.body && req.body.email;
    if (!rawEmail) {
      return res.status(400).send({code: 400, message: "Vui lòng nhập email"});
    }

    const email = escape(String(rawEmail).trim().toLowerCase());

    const userResult = await QueryDatabase(`SELECT * FROM "users" WHERE LOWER(email) = $1`, [email]);
    // Always return 200 to prevent email enumeration
    if (!userResult.rows.length) {
      return res.status(200).send({code: 200, message: "Liên kết đặt lại mật khẩu đã được gửi, vui lòng kiểm tra email của bạn."});
    }

    const user = userResult.rows[0];

    // Generate secure random token
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await QueryDatabase(
      `UPDATE "users" SET reset_token = $1, reset_token_expires = $2 WHERE LOWER(email) = $3`,
      [tokenHash, expires.toISOString(), email]
    );

    if (!isEmailConfigured()) {
      return res.status(500).send({code: 500, message: "Dịch vụ email chưa được cấu hình"});
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetUrl = `${frontendUrl}/reset-password/${encodeURIComponent(token)}`;

    const htmlContent = `
    <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: "Inter", sans-serif; background-color: #f4f7fa; color: #333; padding: 20px; }
          .email-container { max-width: 600px; margin: 0 auto; background-color: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
          .email-header { background-color: #2a9d8f; padding: 30px; text-align: center; color: #fff; font-size: 22px; font-weight: bold; }
          .email-body { padding: 30px; text-align: center; }
          .email-body p { font-size: 16px; margin-bottom: 15px; }
          .reset-button { display: inline-block; background-color: #2a9d8f; color: #fff !important; padding: 12px 30px; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 5px; margin-top: 10px; }
          .email-footer { background-color: #f1f1f1; color: #777; text-align: center; padding: 20px; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="email-header">Đặt Lại Mật Khẩu</div>
          <div class="email-body">
            <p>Chào <b>${escape(user.name || email)}</b>,</p>
            <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
            <p>Để đặt lại mật khẩu tài khoản của bạn, vui lòng nhấn vào nút bên dưới:</p>
            <a href="${resetUrl}" class="reset-button">Đặt Lại Mật Khẩu</a>
            </div>
          <div class="email-footer">
            <p>Email này không thể nhận được phản hồi.</p>
            <p style="margin-top:20px; font-size:13px; color:#888;">Nếu bạn không yêu cầu điều này, hãy bỏ qua email này. Mật khẩu của bạn sẽ không thay đổi.</p>
            <p>© 2026 | WebGIS hỗ trợ quản lý, khai thác và cung cấp thông tin mặn tại Thành phố Hồ Chí Minh</p>
          </div>
        </div>
      </body>
    </html>`;

    try {
      await sendEmail(email, "[WebGIS xâm nhập mặn] Đặt lại mật khẩu", htmlContent);
    } catch (mailError) {
      logger.error(`ForgotPassword send email failed for ${email}: ${mailError.message}`);
      return res.status(500).send({code: 500, message: "Không thể gửi email. Vui lòng thử lại sau."});
    }

    return res.status(200).send({code: 200, message: "Liên kết đặt lại mật khẩu đã được gửi, vui lòng kiểm tra email của bạn."});
  } catch (error) {
    logger.error(error);
    return res.status(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

const ResetPassword = async (req, res) => {
  try {
    const {token, password} = req.body || {};
    if (!token || !password) {
      return res.status(400).send({code: 400, message: "Token và mật khẩu mới là bắt buộc"});
    }

    const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");

    const userResult = await QueryDatabase(
      `SELECT * FROM "users" WHERE reset_token = $1 AND reset_token_expires > NOW()`,
      [tokenHash]
    );

    if (!userResult.rows.length) {
      return res.status(400).send({code: 400, message: "Token không hợp lệ hoặc đã hết hạn"});
    }

    const user = userResult.rows[0];
    const escapedPassword = escape(String(password));
    const hashedPassword = await hashPassword(escapedPassword);

    await QueryDatabase(
      `UPDATE "users" SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2`,
      [hashedPassword, user.id]
    );

    return res.status(200).send({code: 200, message: "Mật khẩu đã được đặt lại thành công"});
  } catch (error) {
    logger.error(error);
    return res.status(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

// Kiểm tra token đặt lại mật khẩu còn hạn không (dùng khi frontend load trang reset-password)
const ValidateResetToken = async (req, res) => {
  try {
    const rawToken = req.params.token;
    if (!rawToken) {
      return res.status(400).send({code: 400, message: "Token không hợp lệ"});
    }

    const tokenHash = crypto.createHash("sha256").update(String(rawToken)).digest("hex");

    const userResult = await QueryDatabase(
      `SELECT id, reset_token_expires FROM "users" WHERE reset_token = $1`,
      [tokenHash]
    );

    if (!userResult.rows.length) {
      return res.status(400).send({code: 400, message: "Link đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng"});
    }

    const user = userResult.rows[0];
    if (!user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) {
      return res.status(400).send({code: 400, expired: true, message: "Link đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu lại."});
    }

    return res.status(200).send({code: 200, valid: true});
  } catch (error) {
    logger.error(error);
    return res.status(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

module.exports = {
  SignUp,
  Login,
  RefreshToken,
  verifyEmail,
  ForgotPassword,
  ResetPassword,
  ValidateResetToken,
};
