require("dotenv").config();
const nodemailer = require("nodemailer");

const MAIL_PROVIDER_DEFAULTS = {
  gmail: {host: "smtp.gmail.com", port: 587, secure: false},
  mailtrap: {host: "sandbox.smtp.mailtrap.io", port: 2525, secure: false},
  brevo: {host: "smtp-relay.brevo.com", port: 587, secure: false},
  sendgrid: {host: "smtp.sendgrid.net", port: 587, secure: false, user: "apikey"},
};

function getMailConfig() {
  const provider = String(process.env.MAIL_PROVIDER || "gmail").trim().toLowerCase();
  const defaults = MAIL_PROVIDER_DEFAULTS[provider] || MAIL_PROVIDER_DEFAULTS.gmail;

  return {
    provider,
    host: String(process.env.MAIL_HOST || defaults.host || "").trim(),
    port: Number(process.env.MAIL_PORT || defaults.port || 0),
    secure: String(process.env.MAIL_SECURE || "").trim()
      ? String(process.env.MAIL_SECURE).toLowerCase() === "true"
      : Boolean(defaults.secure),
    user: String(process.env.MAIL_USER || process.env.EMAIL || defaults.user || "").trim(),
    pass: String(process.env.MAIL_PASS || process.env.EMAIL_PASSWORD || "").trim(),
    from: String(process.env.MAIL_FROM || process.env.MAIL_USER || process.env.EMAIL || "").trim(),
  };
}

async function main() {
  const cfg = getMailConfig();
  const safeConfig = {
    provider: cfg.provider,
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: cfg.user,
    pass: cfg.pass ? "[set]" : "[missing]",
    from: cfg.from,
  };

  console.log("Mail config:", safeConfig);

  if (!cfg.host || !cfg.port || !cfg.user || !cfg.pass) {
    throw new Error("Missing mail configuration. Check MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS.");
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: !cfg.secure,
    logger: true,
    debug: true,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
    tls: {
      minVersion: "TLSv1.2",
      servername: cfg.host,
    },
  });

  console.log("\nVerifying SMTP connection...");
  await transporter.verify();
  console.log("✅ SMTP verify successful");

  const to = process.env.MAIL_TEST_TO || process.argv[2];
  if (!to) {
    console.log("No test recipient provided. Set MAIL_TEST_TO or pass an email as argument to send a test email.");
    return;
  }

  console.log(`\nSending test email to ${to}...`);
  const info = await transporter.sendMail({
    from: cfg.from || cfg.user,
    to,
    subject: `[${cfg.provider}] SMTP test`,
    text: `SMTP test successful at ${new Date().toISOString()}`,
  });

  console.log("✅ Test email sent", {
    messageId: info.messageId,
    response: info.response,
    accepted: info.accepted,
    rejected: info.rejected,
  });
}

main().catch((err) => {
  console.error("❌ SMTP verify/send failed");
  console.error({
    message: err.message,
    code: err.code,
    command: err.command,
    responseCode: err.responseCode,
    response: err.response,
  });
  process.exit(1);
});
