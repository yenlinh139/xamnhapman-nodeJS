const fs = require("fs");
const path = require("path");
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");
const {uploadDir} = require("../../configs/uploadImage");

const DeleteFeedback = async (req, reply) => {
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

    const feedbackResult = await QueryDatabase(
      `
        SELECT f.id, f.image_url, u.email AS owner_email
        FROM "feedbacks" f
        LEFT JOIN "users" u ON u.id = f.user_id
        WHERE f.id = $1
        LIMIT 1;
      `,
      [feedbackId]
    );

    if (feedbackResult.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy góp ý"});
    }

    const feedback = feedbackResult.rows[0];

    if (role !== 0 && feedback.owner_email?.toLowerCase() !== requesterEmail.toLowerCase()) {
      return reply.code(403).send({code: 403, message: "Bạn không có quyền xóa góp ý này"});
    }

    await QueryDatabase(`DELETE FROM "feedbacks" WHERE id = $1`, [feedbackId]);

    // Best-effort cleanup: remove local uploaded image when path belongs to /api/uploads/*
    if (feedback.image_url && typeof feedback.image_url === "string") {
      const prefix = "/api/uploads/";
      if (feedback.image_url.startsWith(prefix)) {
        const fileName = decodeURIComponent(feedback.image_url.slice(prefix.length));
        const safeFileName = path.basename(fileName).trim();
        if (safeFileName) {
          const imagePath = path.join(uploadDir, safeFileName);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
      }
    }

    return reply.code(200).send({code: 200, message: "Xóa góp ý thành công"});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

module.exports = DeleteFeedback;
