const escape = require("escape-html");
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

// CREATE - Thêm dữ liệu độ mặn mới
const CreateSalinityData = async (req, reply) => {
  try {
    const {Ngày, CRT, CTT, COT, CKC, KXAH, MNB, PCL} = req.body;

    if (!Ngày) {
      return reply.code(400).send({code: 400, message: "Ngày là bắt buộc"});
    }

    // Escape inputs để tránh SQL injection
    const escapedNgay = escape(Ngày);
    const escapedCRT = CRT ? escape(CRT.toString()) : null;
    const escapedCTT = CTT ? escape(CTT.toString()) : null;
    const escapedCOT = COT ? escape(COT.toString()) : null;
    const escapedCKC = CKC ? escape(CKC.toString()) : null;
    const escapedKXAH = KXAH ? escape(KXAH.toString()) : null;
    const escapedMNB = MNB ? escape(MNB.toString()) : null;
    const escapedPCL = PCL ? escape(PCL.toString()) : null;

    // Kiểm tra xem dữ liệu cho ngày này đã tồn tại chưa
    const checkExist = await QueryDatabase(`
      SELECT * FROM hochiminh."DoMan" 
      WHERE "Ngày" = '${escapedNgay}'
    `);

    if (checkExist.rowCount > 0) {
      return reply.code(409).send({code: 409, message: "Dữ liệu cho ngày này đã tồn tại"});
    }

    // Tạo câu lệnh INSERT
    const columns = [`"Ngày"`];
    const values = [`'${escapedNgay}'`];

    if (escapedCRT !== null) {
      columns.push(`"CRT"`);
      values.push(`${escapedCRT}`);
    }
    if (escapedCTT !== null) {
      columns.push(`"CTT"`);
      values.push(`${escapedCTT}`);
    }
    if (escapedCOT !== null) {
      columns.push(`"COT"`);
      values.push(`${escapedCOT}`);
    }
    if (escapedCKC !== null) {
      columns.push(`"CKC"`);
      values.push(`${escapedCKC}`);
    }
    if (escapedKXAH !== null) {
      columns.push(`"KXAH"`);
      values.push(`${escapedKXAH}`);
    }
    if (escapedMNB !== null) {
      columns.push(`"MNB"`);
      values.push(`${escapedMNB}`);
    }
    if (escapedPCL !== null) {
      columns.push(`"PCL"`);
      values.push(`${escapedPCL}`);
    }

    const insertQuery = `
      INSERT INTO hochiminh."DoMan" (${columns.join(", ")})
      VALUES (${values.join(", ")})
      RETURNING *
    `;

    const result = await QueryDatabase(insertQuery);
    return reply.code(201).send({
      code: 201,
      message: "Tạo dữ liệu độ mặn thành công",
      data: result.rows[0],
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// READ - Lấy tất cả dữ liệu độ mặn với phân trang
const GetAllSalinityData = async (req, reply) => {
  try {
    const {page = 1, limit = 50, startDate, endDate} = req.query;
    const offset = (page - 1) * limit;

    let whereCondition = "";
    if (startDate && endDate) {
      const escapedStartDate = escape(startDate);
      const escapedEndDate = escape(endDate);
      whereCondition = `WHERE "Ngày" BETWEEN '${escapedStartDate}' AND '${escapedEndDate}'`;
    } else if (startDate) {
      const escapedStartDate = escape(startDate);
      whereCondition = `WHERE "Ngày" >= '${escapedStartDate}'`;
    } else if (endDate) {
      const escapedEndDate = escape(endDate);
      whereCondition = `WHERE "Ngày" <= '${escapedEndDate}'`;
    }

    const query = `
      SELECT "Ngày", "CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL"
      FROM hochiminh."DoMan"
      ${whereCondition}
      ORDER BY "Ngày" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM hochiminh."DoMan"
      ${whereCondition}
    `;

    const [result, countResult] = await Promise.all([QueryDatabase(query), QueryDatabase(countQuery)]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return reply.code(200).send({
      code: 200,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// UPDATE - Cập nhật dữ liệu độ mặn
const UpdateSalinityData = async (req, reply) => {
  try {
    const {date} = req.params;
    const {CRT, CTT, COT, CKC, KXAH, MNB, PCL} = req.body;

    if (!date) {
      return reply.code(400).send({code: 400, message: "Ngày là bắt buộc"});
    }

    const escapedDate = escape(date);

    // Kiểm tra xem bản ghi có tồn tại không
    const checkExist = await QueryDatabase(`
      SELECT * FROM hochiminh."DoMan" 
      WHERE "Ngày" = '${escapedDate}'
    `);

    if (checkExist.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy dữ liệu cho ngày này"});
    }

    // Tạo câu lệnh UPDATE
    const updateFields = [];

    if (CRT !== undefined) updateFields.push(`"CRT" = ${CRT !== null ? escape(CRT.toString()) : "NULL"}`);
    if (CTT !== undefined) updateFields.push(`"CTT" = ${CTT !== null ? escape(CTT.toString()) : "NULL"}`);
    if (COT !== undefined) updateFields.push(`"COT" = ${COT !== null ? escape(COT.toString()) : "NULL"}`);
    if (CKC !== undefined) updateFields.push(`"CKC" = ${CKC !== null ? escape(CKC.toString()) : "NULL"}`);
    if (KXAH !== undefined) updateFields.push(`"KXAH" = ${KXAH !== null ? escape(KXAH.toString()) : "NULL"}`);
    if (MNB !== undefined) updateFields.push(`"MNB" = ${MNB !== null ? escape(MNB.toString()) : "NULL"}`);
    if (PCL !== undefined) updateFields.push(`"PCL" = ${PCL !== null ? escape(PCL.toString()) : "NULL"}`);

    if (updateFields.length === 0) {
      return reply.code(400).send({code: 400, message: "Không có dữ liệu để cập nhật"});
    }

    const updateQuery = `
      UPDATE hochiminh."DoMan"
      SET ${updateFields.join(", ")}
      WHERE "Ngày" = '${escapedDate}'
      RETURNING *
    `;

    const result = await QueryDatabase(updateQuery);
    return reply.code(200).send({
      code: 200,
      message: "Cập nhật dữ liệu độ mặn thành công",
      data: result.rows[0],
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// DELETE - Xóa dữ liệu độ mặn
const DeleteSalinityData = async (req, reply) => {
  try {
    const {date} = req.params;

    if (!date) {
      return reply.code(400).send({code: 400, message: "Ngày là bắt buộc"});
    }

    const escapedDate = escape(date);

    // Kiểm tra xem bản ghi có tồn tại không
    const checkExist = await QueryDatabase(`
      SELECT * FROM hochiminh."DoMan" 
      WHERE "Ngày" = '${escapedDate}'
    `);

    if (checkExist.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy dữ liệu cho ngày này"});
    }

    const deleteQuery = `
      DELETE FROM hochiminh."DoMan"
      WHERE "Ngày" = '${escapedDate}'
      RETURNING *
    `;

    const result = await QueryDatabase(deleteQuery);
    return reply.code(200).send({
      code: 200,
      message: "Xóa dữ liệu độ mặn thành công",
      data: result.rows[0],
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// DELETE - Xóa nhiều dữ liệu theo khoảng thời gian
const DeleteSalinityDataRange = async (req, reply) => {
  try {
    const {startDate, endDate} = req.body;

    if (!startDate || !endDate) {
      return reply.code(400).send({
        code: 400,
        message: "Ngày bắt đầu và ngày kết thúc là bắt buộc",
      });
    }

    const escapedStartDate = escape(startDate);
    const escapedEndDate = escape(endDate);

    // Kiểm tra xem có dữ liệu trong khoảng thời gian không
    const checkExist = await QueryDatabase(`
      SELECT COUNT(*) as count FROM hochiminh."DoMan" 
      WHERE "Ngày" BETWEEN '${escapedStartDate}' AND '${escapedEndDate}'
    `);

    const count = parseInt(checkExist.rows[0].count);
    if (count === 0) {
      return reply.code(404).send({
        code: 404,
        message: "Không tìm thấy dữ liệu trong khoảng thời gian này",
      });
    }

    const deleteQuery = `
      DELETE FROM hochiminh."DoMan"
      WHERE "Ngày" BETWEEN '${escapedStartDate}' AND '${escapedEndDate}'
    `;

    await QueryDatabase(deleteQuery);
    return reply.code(200).send({
      code: 200,
      message: `Xóa thành công ${count} bản ghi dữ liệu độ mặn`,
      deletedCount: count,
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};


module.exports = {
  CreateSalinityData,
  GetAllSalinityData,
  UpdateSalinityData,
  DeleteSalinityData,
  DeleteSalinityDataRange,
};
