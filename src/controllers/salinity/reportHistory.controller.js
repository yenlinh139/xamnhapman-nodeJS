const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

// Lưu log tải báo cáo
const LogReportDownload = async (req, reply) => {
  try {
    const {reportType, reportDate, userName, userEmail, userRole, reportParams, fileSize, status = "success"} = req.body;

    // Validate required fields
    if (!reportType || !reportDate) {
      return reply.code(400).send({
        code: 400,
        message: "Loại báo cáo và ngày báo cáo là bắt buộc",
      });
    }

    // Get client info
    const clientIP = req.ip || req.connection.remoteAddress || req.headers["x-forwarded-for"];
    const userAgent = req.headers["user-agent"] || "";

    const insertQuery = `
      INSERT INTO hochiminh."BaoCaoLichSu" 
      ("LoaiBaoCao", "NgayBaoCao", "TenNguoiDung", "EmailNguoiDung", "VaiTro", 
       "ThongSoBaoCao", "KichThuocFile", "DiaChi_IP", "User_Agent", "TrangThai")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING "ID", "NgayTao"
    `;

    const values = [
      reportType,
      reportDate,
      userName || null,
      userEmail || null,
      userRole || null,
      JSON.stringify(reportParams || {}),
      fileSize || null,
      clientIP,
      userAgent,
      status,
    ];

    const result = await QueryDatabase(insertQuery, values);

    if (result.rows.length > 0) {
      const logEntry = result.rows[0];
      logger.info(`Report download logged: ${reportType} for ${reportDate} by ${userEmail || "anonymous"}`);

      return reply.code(201).send({
        code: 201,
        message: "Đã ghi log tải báo cáo thành công",
        data: {
          logId: logEntry.ID,
          createdAt: logEntry.NgayTao,
        },
      });
    } else {
      throw new Error("Không thể tạo log");
    }
  } catch (error) {
    logger.error("LogReportDownload Error:", error);
    return reply.code(500).send({
      code: 500,
      message: "Lỗi máy chủ khi ghi log báo cáo",
    });
  }
};

// Lấy lịch sử tải báo cáo (cho admin)
const GetReportHistory = async (req, reply) => {
  try {
    const {page = 1, limit = 20, reportType, startDate, endDate, userEmail, status} = req.query;

    const offset = (page - 1) * limit;

    // Build WHERE conditions
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (reportType) {
      whereConditions.push(`"LoaiBaoCao" = $${paramIndex}`);
      params.push(reportType);
      paramIndex++;
    }

    if (startDate) {
      whereConditions.push(`"NgayTao" >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereConditions.push(`"NgayTao" <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (userEmail) {
      whereConditions.push(`"EmailNguoiDung" ILIKE $${paramIndex}`);
      params.push(`%${userEmail}%`);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`"TrangThai" = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM hochiminh."BaoCaoLichSu" 
      ${whereClause}
    `;

    // Get data
    const dataQuery = `
      SELECT "ID", "NgayTao", "LoaiBaoCao", "NgayBaoCao", "TenNguoiDung", 
             "EmailNguoiDung", "VaiTro", "ThongSoBaoCao", "KichThuocFile", 
             "DiaChi_IP", "TrangThai"
      FROM hochiminh."BaoCaoLichSu" 
      ${whereClause}
      ORDER BY "NgayTao" DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const [countResult, dataResult] = await Promise.all([
      QueryDatabase(countQuery, params.slice(0, -2)),
      QueryDatabase(dataQuery, params),
    ]);

    const totalRecords = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalRecords / limit);

    return reply.code(200).send({
      code: 200,
      message: "Lấy lịch sử báo cáo thành công",
      data: {
        reports: dataResult.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalRecords,
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    logger.error("GetReportHistory Error:", error);
    return reply.code(500).send({
      code: 500,
      message: "Lỗi máy chủ khi lấy lịch sử báo cáo",
    });
  }
};

// Lấy thống kê báo cáo
const GetReportStatistics = async (req, reply) => {
  try {
    const {startDate, endDate} = req.query;

    let whereClause = "";
    let params = [];

    if (startDate && endDate) {
      whereClause = 'WHERE "NgayTao" BETWEEN $1 AND $2';
      params = [startDate, endDate];
    } else if (startDate) {
      whereClause = 'WHERE "NgayTao" >= $1';
      params = [startDate];
    } else if (endDate) {
      whereClause = 'WHERE "NgayTao" <= $1';
      params = [endDate];
    }

    const queries = {
      // Tổng số báo cáo
      totalReports: `
        SELECT COUNT(*) as total 
        FROM hochiminh."BaoCaoLichSu" 
        ${whereClause}
      `,

      // Báo cáo theo loại
      reportsByType: `
        SELECT "LoaiBaoCao", COUNT(*) as total 
        FROM hochiminh."BaoCaoLichSu" 
        ${whereClause}
        GROUP BY "LoaiBaoCao"
        ORDER BY total DESC
      `,

      // Báo cáo theo ngày (7 ngày gần nhất)
      reportsByDay: `
        SELECT DATE("NgayTao") as date, COUNT(*) as total 
        FROM hochiminh."BaoCaoLichSu" 
        WHERE "NgayTao" >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY DATE("NgayTao")
        ORDER BY date DESC
      `,

      // Top users
      topUsers: `
        SELECT "EmailNguoiDung", COUNT(*) as total 
        FROM hochiminh."BaoCaoLichSu" 
        ${whereClause}
        AND "EmailNguoiDung" IS NOT NULL
        GROUP BY "EmailNguoiDung"
        ORDER BY total DESC
        LIMIT 10
      `,

      // Thống kê theo trạng thái
      statusStats: `
        SELECT "TrangThai", COUNT(*) as total 
        FROM hochiminh."BaoCaoLichSu" 
        ${whereClause}
        GROUP BY "TrangThai"
      `,
    };

    const results = await Promise.all(Object.values(queries).map((query) => QueryDatabase(query, params)));

    const statistics = {
      totalReports: parseInt(results[0].rows[0]?.total || 0),
      reportsByType: results[1].rows,
      reportsByDay: results[2].rows,
      topUsers: results[3].rows,
      statusStats: results[4].rows,
    };

    return reply.code(200).send({
      code: 200,
      message: "Lấy thống kê báo cáo thành công",
      data: statistics,
    });
  } catch (error) {
    logger.error("GetReportStatistics Error:", error);
    return reply.code(500).send({
      code: 500,
      message: "Lỗi máy chủ khi lấy thống kê báo cáo",
    });
  }
};

// Xóa log báo cáo (chỉ admin)
const DeleteReportLog = async (req, reply) => {
  try {
    const {id} = req.params;

    if (!id) {
      return reply.code(400).send({
        code: 400,
        message: "ID log là bắt buộc",
      });
    }

    const deleteQuery = `
      DELETE FROM hochiminh."BaoCaoLichSu" 
      WHERE "ID" = $1
      RETURNING "ID"
    `;

    const result = await QueryDatabase(deleteQuery, [id]);

    if (result.rows.length > 0) {
      return reply.code(200).send({
        code: 200,
        message: "Xóa log báo cáo thành công",
      });
    } else {
      return reply.code(404).send({
        code: 404,
        message: "Không tìm thấy log báo cáo",
      });
    }
  } catch (error) {
    logger.error("DeleteReportLog Error:", error);
    return reply.code(500).send({
      code: 500,
      message: "Lỗi máy chủ khi xóa log báo cáo",
    });
  }
};

module.exports = {
  LogReportDownload,
  GetReportHistory,
  GetReportStatistics,
  DeleteReportLog,
};
