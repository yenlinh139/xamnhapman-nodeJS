const escape = require("escape-html");
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

const FEEDBACK_TYPE_BY_CODE = {
  1: "Báo cáo lỗi",
  2: "Cải thiện hệ thống",
  3: "Khác",
};
const FEEDBACK_TYPE_CODE_BY_LABEL = {
  "Báo cáo lỗi": 1,
  "Cải thiện hệ thống": 2,
  "Khác": 3,
};

const normalizeFeedbackType = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericCode = Number(value);
  if (!Number.isNaN(numericCode) && FEEDBACK_TYPE_BY_CODE[numericCode]) {
    return FEEDBACK_TYPE_BY_CODE[numericCode];
  }

  const rawText = String(value).trim();
  return FEEDBACK_TYPE_CODE_BY_LABEL[rawText] ? rawText : null;
};

const CreateFeedback = async (req, reply) => {
  try {
    const role = Number(req.user?.role);
    const requesterEmail = req.user?.email;

    if (!req.user || Number.isNaN(role) || !requesterEmail) {
      return reply.code(401).send({code: 401, message: "Không có quyền truy cập"});
    }

    if (!req.body) {
      return reply.code(400).send({status: 400, message: "Thiếu dữ liệu yêu cầu"});
    }

    const feedbackType = normalizeFeedbackType(req.body.feedbackType ?? req.body.feedback_type ?? req.body.feedbackTypeCode ?? req.body.feedback_type_code);
    const content = escape(String(req.body.content || req.body.message || "").trim());
    const imageUrl = req.body.imageUrl ? escape(String(req.body.imageUrl).trim()) : req.body.image_url ? escape(String(req.body.image_url).trim()) : null;

    if (!feedbackType || !content) {
      return reply.code(400).send({code: 400, message: "Vui lòng điền đầy đủ loại góp ý và nội dung chi tiết"});
    }

    if (!feedbackType) {
      return reply.code(400).send({code: 400, message: "Loại góp ý không hợp lệ"});
    }

    const userResult = await QueryDatabase(`SELECT id FROM "users" WHERE email = $1 LIMIT 1`, [requesterEmail]);
    if (userResult.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy thông tin người dùng"});
    }

    const currentUser = userResult.rows[0];

    const sql = `
      INSERT INTO "feedbacks" (user_id, feedback_type, content, image_url, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, feedback_type, content, image_url, created_at, status;
    `;

    const createdFeedback = await QueryDatabase(sql, [
      currentUser.id,
      feedbackType,
      content,
      imageUrl,
      "Chưa xem",
    ]);

    return reply.code(201).send({
      code: 201,
      message: "Gửi góp ý thành công",
      data: {
        ...createdFeedback.rows[0],
        feedbackTypeCode: FEEDBACK_TYPE_CODE_BY_LABEL[createdFeedback.rows[0].feedback_type] || null,
      },
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

module.exports = CreateFeedback;
