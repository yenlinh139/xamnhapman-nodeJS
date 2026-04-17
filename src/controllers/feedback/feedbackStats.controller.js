const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

/**
 * Lấy thống kê tổng quan về feedback
 */
const GetFeedbackStats = async (req, reply) => {
  try {
    const sql = `
      SELECT 
        COUNT(*) as total_feedbacks,
        AVG(rating) as average_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star,
        COUNT(CASE WHEN rating >= 4 THEN 1 END) as positive_feedbacks,
        COUNT(CASE WHEN rating <= 2 THEN 1 END) as negative_feedbacks
      FROM "feedbacks"
    `;

    const result = await QueryDatabase(sql);
    const stats = result.rows[0];

    // Tính phần trăm
    const totalFeedbacks = parseInt(stats.total_feedbacks);
    const response = {
      total_feedbacks: totalFeedbacks,
      average_rating: parseFloat(parseFloat(stats.average_rating).toFixed(2)),
      rating_distribution: {
        five_star: {
          count: parseInt(stats.five_star),
          percentage: totalFeedbacks > 0 ? parseFloat(((parseInt(stats.five_star) / totalFeedbacks) * 100).toFixed(2)) : 0,
        },
        four_star: {
          count: parseInt(stats.four_star),
          percentage: totalFeedbacks > 0 ? parseFloat(((parseInt(stats.four_star) / totalFeedbacks) * 100).toFixed(2)) : 0,
        },
        three_star: {
          count: parseInt(stats.three_star),
          percentage: totalFeedbacks > 0 ? parseFloat(((parseInt(stats.three_star) / totalFeedbacks) * 100).toFixed(2)) : 0,
        },
        two_star: {
          count: parseInt(stats.two_star),
          percentage: totalFeedbacks > 0 ? parseFloat(((parseInt(stats.two_star) / totalFeedbacks) * 100).toFixed(2)) : 0,
        },
        one_star: {
          count: parseInt(stats.one_star),
          percentage: totalFeedbacks > 0 ? parseFloat(((parseInt(stats.one_star) / totalFeedbacks) * 100).toFixed(2)) : 0,
        },
      },
      sentiment_analysis: {
        positive: {
          count: parseInt(stats.positive_feedbacks),
          percentage:
            totalFeedbacks > 0 ? parseFloat(((parseInt(stats.positive_feedbacks) / totalFeedbacks) * 100).toFixed(2)) : 0,
        },
        negative: {
          count: parseInt(stats.negative_feedbacks),
          percentage:
            totalFeedbacks > 0 ? parseFloat(((parseInt(stats.negative_feedbacks) / totalFeedbacks) * 100).toFixed(2)) : 0,
        },
        neutral: {
          count: parseInt(stats.three_star),
          percentage: totalFeedbacks > 0 ? parseFloat(((parseInt(stats.three_star) / totalFeedbacks) * 100).toFixed(2)) : 0,
        },
      },
    };

    return reply.code(200).send(response);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

/**
 * Lấy thống kê feedback theo thời gian
 */
const GetFeedbackStatsByTime = async (req, reply) => {
  try {
    const {period = "month"} = req.query; // day, week, month, year

    let dateFormat;
    let groupBy;

    switch (period) {
      case "day":
        dateFormat = "YYYY-MM-DD";
        groupBy = "DATE(created_at)";
        break;
      case "week":
        dateFormat = 'YYYY-"W"WW';
        groupBy = "DATE_TRUNC('week', created_at)";
        break;
      case "year":
        dateFormat = "YYYY";
        groupBy = "DATE_TRUNC('year', created_at)";
        break;
      default: // month
        dateFormat = "YYYY-MM";
        groupBy = "DATE_TRUNC('month', created_at)";
    }

    const sql = `
      SELECT 
        TO_CHAR(${groupBy}, '${dateFormat}') as period,
        COUNT(*) as total_feedbacks,
        AVG(rating) as average_rating,
        COUNT(CASE WHEN rating >= 4 THEN 1 END) as positive_feedbacks,
        COUNT(CASE WHEN rating <= 2 THEN 1 END) as negative_feedbacks
      FROM "feedbacks"
      WHERE created_at >= NOW() - INTERVAL '1 year'
      GROUP BY ${groupBy}
      ORDER BY ${groupBy} DESC
      LIMIT 12
    `;

    const result = await QueryDatabase(sql);

    const stats = result.rows.map((row) => ({
      period: row.period,
      total_feedbacks: parseInt(row.total_feedbacks),
      average_rating: parseFloat(parseFloat(row.average_rating).toFixed(2)),
      positive_feedbacks: parseInt(row.positive_feedbacks),
      negative_feedbacks: parseInt(row.negative_feedbacks),
    }));

    return reply.code(200).send(stats);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

/**
 * Lấy danh sách feedback gần đây
 */
const GetRecentFeedbacks = async (req, reply) => {
  try {
    const {limit = 10} = req.query;

    const sql = `
      SELECT 
        id,
        name,
        email,
        rating,
        message,
        created_at
      FROM "feedbacks"
      ORDER BY created_at DESC
      LIMIT ${parseInt(limit)}
    `;

    const result = await QueryDatabase(sql);

    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

/**
 * Lấy thống kê chi tiết theo rating
 */
const GetDetailedRatingStats = async (req, reply) => {
  try {
    const sql = `
      SELECT 
        rating,
        COUNT(*) as count,
        ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "feedbacks")), 2) as percentage
      FROM "feedbacks"
      GROUP BY rating
      ORDER BY rating DESC
    `;

    const result = await QueryDatabase(sql);

    return reply.code(200).send(result.rows);
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

module.exports = {
  GetFeedbackStats,
  GetFeedbackStatsByTime,
  GetRecentFeedbacks,
  GetDetailedRatingStats,
};
