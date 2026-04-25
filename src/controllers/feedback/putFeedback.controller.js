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
const FEEDBACK_STATUS_BY_CODE = {
  1: "Chưa xem",
  2: "Đã xem",
  3: "Đang giải quyết",
  4: "Đã giải quyết",
};
const FEEDBACK_STATUS_CODE_BY_LABEL = {
  "Chưa xem": 1,
  "Đã xem": 2,
  "Đang giải quyết": 3,
  "Đã giải quyết": 4,
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

const normalizeFeedbackStatus = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericCode = Number(value);
  if (!Number.isNaN(numericCode) && FEEDBACK_STATUS_BY_CODE[numericCode]) {
    return FEEDBACK_STATUS_BY_CODE[numericCode];
  }

  const rawText = String(value).trim();
  return FEEDBACK_STATUS_CODE_BY_LABEL[rawText] ? rawText : null;
};

const ChangeFeedback = async (req, reply) => {
  try {
    const role = Number(req.user?.role);
    const requesterEmail = req.user?.email;
    const feedbackId = Number(req.params?.id);

    if (!req.user || Number.isNaN(role) || !requesterEmail) {
      return reply.code(401).send({code: 401, message: "Không có quyền truy cập"});
    }

    if (!feedbackId || Number.isNaN(feedbackId)) {
      return reply.code(400).send({code: 400, message: "ID góp ý không hợp lệ"});
    }

    const feedbackTypeRaw = req.body?.feedbackType ?? req.body?.feedback_type ?? req.body?.feedbackTypeCode ?? req.body?.feedback_type_code;
    const content = req.body?.content ?? req.body?.message;
    const imageUrl = req.body?.imageUrl ?? req.body?.image_url;
    const statusRaw = req.body?.status ?? req.body?.statusCode ?? req.body?.status_code;
    const feedbackType = normalizeFeedbackType(feedbackTypeRaw);
    const status = normalizeFeedbackStatus(statusRaw);

    if (feedbackTypeRaw === undefined && !content && imageUrl === undefined && statusRaw === undefined) {
      return reply.code(400).send({code: 400, message: "Không có dữ liệu cập nhật"});
    }

    if (feedbackTypeRaw !== undefined && !feedbackType) {
      return reply.code(400).send({code: 400, message: "Loại góp ý không hợp lệ"});
    }

    if (statusRaw !== undefined && !status) {
      return reply.code(400).send({code: 400, message: "Trạng thái góp ý không hợp lệ"});
    }

    if (role !== 0 && status) {
      return reply.code(403).send({code: 403, message: "Bạn không có quyền cập nhật trạng thái góp ý"});
    }

    const checkFeedback = await QueryDatabase(
      `
        SELECT f.id, u.email AS owner_email
        FROM "feedbacks" f
        LEFT JOIN "users" u ON u.id = f.user_id
        WHERE f.id = $1
        LIMIT 1;
      `,
      [feedbackId]
    );

    if (checkFeedback.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy góp ý"});
    }

    if (role !== 0 && checkFeedback.rows[0].owner_email?.toLowerCase() !== requesterEmail.toLowerCase()) {
      return reply.code(403).send({code: 403, message: "Bạn không có quyền cập nhật góp ý này"});
    }

    const setClauses = [];
    const params = [];

    if (feedbackType) {
      setClauses.push(`feedback_type = $${params.length + 1}`);
      params.push(escape(String(feedbackType).trim()));
    }

    if (content) {
      const safeContent = escape(String(content).trim());
      setClauses.push(`content = $${params.length + 1}`);
      params.push(safeContent);
    }

    if (imageUrl !== undefined) {
      const safeImageUrl = imageUrl ? escape(String(imageUrl).trim()) : null;
      setClauses.push(`image_url = $${params.length + 1}`);
      params.push(safeImageUrl);
    }

    if (status && role === 0) {
      setClauses.push(`status = $${params.length + 1}`);
      params.push(escape(String(status).trim()));
    }

    if (setClauses.length === 0) {
      return reply.code(400).send({code: 400, message: "Không có dữ liệu hợp lệ để cập nhật"});
    }

    params.push(feedbackId);

    await QueryDatabase(
      `UPDATE "feedbacks" SET ${setClauses.join(", ")} WHERE id = $${params.length}`,
      params
    );

    return reply.code(200).send({code: 200, message: "Cập nhật góp ý thành công"});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

module.exports = ChangeFeedback;
