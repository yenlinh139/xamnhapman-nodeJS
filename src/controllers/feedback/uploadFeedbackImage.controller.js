const fs = require("fs");
const path = require("path");
const logger = require("../../loggers/loggers.config");
const {uploadDir} = require("../../configs/uploadImage");

const UploadFeedbackImage = async (req, reply) => {
  try {
    if (!req.file) {
      return reply.code(400).send({code: 400, message: "Thiếu file ảnh"});
    }

    const imageUrl = `/api/uploads/${encodeURIComponent(req.file.filename)}`;

    return reply.code(201).send({
      code: 201,
      message: "Upload ảnh thành công",
      data: {
        fileName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        imageUrl,
      },
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

const GetUploadedImage = async (req, reply) => {
  try {
    const rawFileName = req.params?.fileName;
    const fileName = path.basename(String(rawFileName || "")).trim();

    if (!fileName) {
      return reply.code(400).send({code: 400, message: "Tên file không hợp lệ"});
    }

    const filePath = path.join(uploadDir, fileName);

    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy file"});
    }

    return reply.send(fs.createReadStream(filePath));
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

const DeleteUploadedImage = async (req, reply) => {
  try {
    const rawFileName = req.params?.fileName;
    const fileName = path.basename(String(rawFileName || "")).trim();

    if (!fileName) {
      return reply.code(400).send({code: 400, message: "Tên file không hợp lệ"});
    }

    const filePath = path.join(uploadDir, fileName);

    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy file"});
    }

    fs.unlinkSync(filePath);

    return reply.code(200).send({
      code: 200,
      message: "Xóa ảnh thành công",
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ nội bộ"});
  }
};

module.exports = {
  UploadFeedbackImage,
  GetUploadedImage,
  DeleteUploadedImage,
};
