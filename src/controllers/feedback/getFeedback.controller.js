const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

const FEEDBACK_TYPE_CODE_BY_LABEL = {
  "Báo cáo lỗi": 1,
  "Cải thiện hệ thống": 2,
  "Khác": 3,
};
const FEEDBACK_STATUS_CODE_BY_LABEL = {
  "Chưa xem": 1,
  "Đã xem": 2,
  "Đang giải quyết": 3,
  "Đã giải quyết": 4,
};

const GetFeedback = async (req, reply) => {
  try {
    const role = Number(req.user?.role);
    const email = req.user?.email;

    if (!req.user || Number.isNaN(role) || !email) {
      return reply.code(401).send({code: 401, message: "Không có quyền truy cập"});
    }

    let sql = `
      SELECT
        f.id,
        f.user_id,
        f.feedback_type,
        f.content,
        f.image_url,
        f.created_at,
        f.status,
        u.name AS user_name,
        u.email AS user_email,
        u.role AS user_role
      FROM "feedbacks" f
      LEFT JOIN "users" u
        ON u.id = f.user_id
    `;
    const params = [];

    if (role === 0) {
      sql += ` ORDER BY created_at DESC`;
    } else if (role === 1 || role === 2) {
      sql += ` WHERE LOWER(u.email) = LOWER($1) ORDER BY created_at DESC`;
      params.push(email);
    } else {
      return reply.code(403).send({code: 403, message: "Bạn không có quyền xem danh sách góp ý"});
    }

    const result = await QueryDatabase(sql, params);

    const mappedData = result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      feedbackType: row.feedback_type,
      feedbackTypeCode: FEEDBACK_TYPE_CODE_BY_LABEL[row.feedback_type] || null,
      content: row.content,
      imageUrl: row.image_url,
      createdAt: row.created_at,
      status: row.status,
      statusCode: FEEDBACK_STATUS_CODE_BY_LABEL[row.status] || null,
      user: {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email,
        role: row.user_role,
      },
    }));

    return reply.code(200).send({
      code: 200,
      data: mappedData,
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

module.exports = GetFeedback;
