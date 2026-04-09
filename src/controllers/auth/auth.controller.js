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
      return res.status(400).send({status: 400, message: "Missing req.body data"});
    }

    const rawName = req.body.name;
    const rawEmail = req.body.email;
    const rawPassword = req.body.password || req.body.pswd;

    // Check email, user Not Null
    if (!rawName || !rawEmail || !rawPassword) {
      return res.status(400).send({code: 400, message: "Missing required fields"});
    }

    const escapedEmail = escape(String(rawEmail).trim());
    const escapedName = escape(String(rawName).trim());
    const escapedPassword = escape(String(rawPassword));

    // Check if the email already exists
    const existingUser = await QueryDatabase(`SELECT * FROM "users" WHERE email = $1`, [escapedEmail]);
    if (existingUser.rows.length > 0) {
      return res.status(409).send({code: 409, message: "Email already exists"});
    }

    if (!isEmailConfigured()) {
      return res.status(500).send({
        code: 500,
        message: "Email service is not configured. Please contact the administrator.",
      });
    }

    const hashedPassword = await hashPassword(escapedPassword);

    const insertUserSql = `
      INSERT INTO "users" (name, email, password, role, email_verified)
      VALUES ($1, $2, $3, $4, $5)
    `;
    await QueryDatabase(insertUserSql, [escapedName, escapedEmail, hashedPassword, 0, false]);

    // Mã hóa email trước khi đưa vào URL
    const encodedEmail = encodeURIComponent(escapedEmail); // Mã hóa email
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const verifyUrl = `${frontendUrl}/verify-email/${encodedEmail}`;

    // Gửi email xác nhận sau khi đăng ký thành công
    const subject = "Xác thực email";
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
            <p>Cảm ơn bạn đã đăng ký! Để hoàn tất quá trình đăng ký, vui lòng xác thực email của bạn bằng cách nhấn vào nút bên dưới:</p>
            <a href="${verifyUrl}" class="verify-button">Xác Thực Email</a>
          </div>
          <div class="email-footer">
            <p>Tất cả quyền được bảo vệ.  Email này không thể nhận được phản hồi.</p>
            <p>Nếu bạn không yêu cầu đăng ký này, vui lòng bỏ qua email này.</p>
            <p><a href="#">Chính sách bảo mật</a> | <a href="#">Điều khoản sử dụng</a></p>
            <p>© 2025 Xâm nhập mặn Tp. Hồ Chí Minh.</p>
          </div>
        </div>
      </body>
    </html>
    `;

    let emailSent = true;
    let responseMessage = "Created account successfully. Please verify your email.";

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
    console.error("Internal Server Error 🔥:: ", error);
    return res.status(500).send({code: 500, message: "Internal Server Error"});
  }
};

// Hàm xác thực email
const verifyEmail = async (req, res) => {
  const escapedEmail = decodeURIComponent(req.params.userId);
  try {
    // Kiểm tra người dùng trong cơ sở dữ liệu
    const checkUserSql = `SELECT * FROM "users" WHERE email = '${escapedEmail}'`;
    const user = await QueryDatabase(checkUserSql);

    if (!user.rows.length) {
      return res.status(404).send({status: 404, message: "User not found"});
    }

    // Cập nhật trạng thái email_verified trong cơ sở dữ liệu
    const updatedUserSql = `
      UPDATE "users"
      SET email_verified = TRUE
      WHERE email = '${escapedEmail}'
    `;
    await QueryDatabase(updatedUserSql);

    return res.status(200).send({
      status: 200,
      message: "Email successfully verified!",
      redirectUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/login`, // Đường dẫn quay lại đăng nhập
    });
  } catch (error) {
    logger.error(error);
    return res.status(500).send({status: 500, message: "Internal Server Error"});
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
      return {code: 404, message: "Email not found"};
    }

    const foundUser = user.rows[0];

    // Kiểm tra xem email đã được xác thực chưa
    if (!foundUser.email_verified || foundUser.email_verified === false) {
      res.status(403);
      return {code: 403, message: "Please verify your email before logging in"};
    }

    // Kiểm tra mật khẩu
    const matchPassword = await compareHashPassword(password, foundUser?.password);
    if (!matchPassword) {
      res.status(401);
      return {code: 401, message: "Password is wrong"};
    }

    const accessToken = GenerateAccessToken({name: foundUser?.name, email: foundUser?.email, role: foundUser?.role});
    const refreshToken = GenerateRefreshToken({name: foundUser?.name, email: foundUser?.email, role: foundUser?.role});

    return res.status(200).send({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (error) {
    logger.error(error);
    console.error("Internal Server Error 🔥:: ", error);
    res.status(500);
    return {code: 500, message: "Internal Server Error"};
  }
};

const RefreshToken = async (req, res) => {
  try {
    const authHeaders = req.headers["authorization"];

    if (!authHeaders) {
      res.status(401);
      return {code: 401, message: "Can not find authorization header"};
    }

    const checkBearer = authHeaders.includes("Bearer");
    if (!checkBearer) {
      res.status(401);
      return {code: 401, message: "Do not have Bearer"};
    }

    const token = authHeaders.replace("Bearer ", "");
    if (!token) {
      res.status(401);
      return {code: 401, message: "Unauthorized"};
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
    return {code: 401, message: "Unauthorized"};
  }
};

module.exports = {
  SignUp,
  Login,
  RefreshToken,
  verifyEmail,
};
