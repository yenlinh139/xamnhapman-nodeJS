const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

// Helper function to safely convert string to numeric in SQL
const toNumeric = (field) => `COALESCE(NULLIF("${field}", '')::numeric, 0)`;
const toNumericNullable = (field) => `NULLIF("${field}", '')::numeric`;

// Helper function to generate station rainfall query
const generateStationRainQuery = (stationCode, stationName, rainField, timeCondition) => `
  SELECT 
    '${stationCode}' as station_code,
    '${stationName}' as station_name,
    COUNT(*) as record_count,
    COUNT(CASE WHEN ${toNumeric(rainField)} > 0 THEN 1 END) as rainy_days,
    SUM(${toNumeric(rainField)}) as total_rainfall,
    AVG(${toNumeric(rainField)}) as avg_rainfall,
    MAX(${toNumeric(rainField)}) as max_rainfall,
    MIN(CASE WHEN ${toNumeric(rainField)} > 0 THEN ${toNumeric(rainField)} END) as min_positive_rainfall
  FROM hochiminh."KhiTuong"
  WHERE 1=1 ${timeCondition}
`;

/**
 * API thống kê tổng quan về khí tượng thủy văn
 */
const GetHydrometeorologySummaryStats = async (req, reply) => {
  try {
    const {startDate, endDate} = req.query;

    // Tạo điều kiện WHERE cho thời gian
    let timeCondition = "";
    if (startDate && endDate) {
      timeCondition = ` AND "Ngày"::date BETWEEN '${startDate}' AND '${endDate}'`;
    } else if (startDate) {
      timeCondition = ` AND "Ngày"::date >= '${startDate}'`;
    } else if (endDate) {
      timeCondition = ` AND "Ngày"::date <= '${endDate}'`;
    }

    const query = `
      WITH weather_stats AS (
        SELECT 
          COUNT(*) as total_weather_records,
          COUNT(DISTINCT "Ngày"::date) as total_weather_days,
          -- Tính tổng lượng mưa các trạm (cast string to numeric)
          AVG(${toNumeric("R_AP")} + ${toNumeric("R_BC")} + ${toNumeric("R_CG")} + 
              ${toNumeric("R_CL")} + ${toNumeric("R_CC")} + ${toNumeric("R_HM")} + 
              ${toNumeric("R_LMX")} + ${toNumeric("R_LS")} + ${toNumeric("R_MDC")} + 
              ${toNumeric("R_NB")} + ${toNumeric("R_PVC")} + ${toNumeric("R_TTH")} + 
              ${toNumeric("R_TSH")} + ${toNumeric("R_TD")}) as avg_total_rainfall,
          
          MAX(${toNumeric("R_AP")} + ${toNumeric("R_BC")} + ${toNumeric("R_CG")} + 
              ${toNumeric("R_CL")} + ${toNumeric("R_CC")} + ${toNumeric("R_HM")} + 
              ${toNumeric("R_LMX")} + ${toNumeric("R_LS")} + ${toNumeric("R_MDC")} + 
              ${toNumeric("R_NB")} + ${toNumeric("R_PVC")} + ${toNumeric("R_TTH")} + 
              ${toNumeric("R_TSH")} + ${toNumeric("R_TD")}) as max_daily_rainfall,
          
          -- Thống kê nhiệt độ từ trạm Tân Sơn Hòa
          AVG(${toNumericNullable("Ttb_TSH")}) as avg_temperature,
          MAX(${toNumericNullable("Tx_TSH")}) as max_temperature,
          MIN(${toNumericNullable("Tm_TSH")}) as min_temperature,
          
          -- Đếm số ngày mưa (>0mm)
          COUNT(CASE WHEN (${toNumeric("R_AP")} + ${toNumeric("R_BC")} + ${toNumeric("R_CG")} + 
                           ${toNumeric("R_CL")} + ${toNumeric("R_CC")} + ${toNumeric("R_HM")} + 
                           ${toNumeric("R_LMX")} + ${toNumeric("R_LS")} + ${toNumeric("R_MDC")} + 
                           ${toNumeric("R_NB")} + ${toNumeric("R_PVC")} + ${toNumeric("R_TTH")} + 
                           ${toNumeric("R_TSH")} + ${toNumeric("R_TD")}) > 0 THEN 1 END) as rainy_days,
          
          -- Đếm số ngày mưa to (>= 30mm)
          COUNT(CASE WHEN (${toNumeric("R_AP")} + ${toNumeric("R_BC")} + ${toNumeric("R_CG")} + 
                           ${toNumeric("R_CL")} + ${toNumeric("R_CC")} + ${toNumeric("R_HM")} + 
                           ${toNumeric("R_LMX")} + ${toNumeric("R_LS")} + ${toNumeric("R_MDC")} + 
                           ${toNumeric("R_NB")} + ${toNumeric("R_PVC")} + ${toNumeric("R_TTH")} + 
                           ${toNumeric("R_TSH")} + ${toNumeric("R_TD")}) >= 30 THEN 1 END) as heavy_rain_days
        FROM hochiminh."KhiTuong"
        WHERE 1=1 ${timeCondition}
      ),
      hydro_stats AS (
        SELECT 
          COUNT(*) as total_hydro_records,
          COUNT(DISTINCT "Ngày"::date) as total_hydro_days,
          -- Thống kê mực nước Nhà Bè
          AVG(${toNumericNullable("Htb_NB")}) as avg_water_nb,
          MAX(${toNumericNullable("Hx_NB")}) as max_water_nb,
          MIN(${toNumericNullable("Hm_NB")}) as min_water_nb,
          STDDEV(${toNumericNullable("Htb_NB")}) as stddev_water_nb,
          
          -- Thống kê mực nước Phú An
          AVG(${toNumericNullable("Htb_PA")}) as avg_water_pa,
          MAX(${toNumericNullable("Hx_PA")}) as max_water_pa,
          MIN(${toNumericNullable("Hm_PA")}) as min_water_pa,
          STDDEV(${toNumericNullable("Htb_PA")}) as stddev_water_pa
        FROM hochiminh."ThuyVan"
        WHERE 1=1 ${timeCondition}
      )
      SELECT 
        w.*,
        h.*
      FROM weather_stats w, hydro_stats h
    `;

    const result = await QueryDatabase(query);
    const data = result.rows[0];

    return reply.code(200).send({
      success: true,
      data: {
        summary: {
          weather: {
            total_records: data.total_weather_records,
            total_days: data.total_weather_days,
            avg_daily_rainfall: parseFloat(data.avg_total_rainfall || 0).toFixed(2) + " mm",
            max_daily_rainfall: parseFloat(data.max_daily_rainfall || 0).toFixed(2) + " mm",
            rainy_days: data.rainy_days,
            heavy_rain_days: data.heavy_rain_days,
            rainy_percentage: parseFloat((data.rainy_days / Math.max(data.total_weather_days, 1)) * 100).toFixed(1) + "%",
          },
          temperature: {
            average: parseFloat(data.avg_temperature || 0).toFixed(1) + "°C",
            maximum: parseFloat(data.max_temperature || 0).toFixed(1) + "°C",
            minimum: parseFloat(data.min_temperature || 0).toFixed(1) + "°C",
          },
          hydro: {
            total_records: data.total_hydro_records,
            total_days: data.total_hydro_days,
            nha_be: {
              avg_level: parseFloat(data.avg_water_nb || 0).toFixed(2) + " cm",
              max_level: parseFloat(data.max_water_nb || 0).toFixed(2) + " cm",
              min_level: parseFloat(data.min_water_nb || 0).toFixed(2) + " cm",
              variability: parseFloat(data.stddev_water_nb || 0).toFixed(2) + " cm",
            },
            phu_an: {
              avg_level: parseFloat(data.avg_water_pa || 0).toFixed(2) + " cm",
              max_level: parseFloat(data.max_water_pa || 0).toFixed(2) + " cm",
              min_level: parseFloat(data.min_water_pa || 0).toFixed(2) + " cm",
              variability: parseFloat(data.stddev_water_pa || 0).toFixed(2) + " cm",
            },
          },
        },
        period: {
          start_date: startDate || "all_time",
          end_date: endDate || "all_time",
        },
      },
    });
  } catch (error) {
    logger.error("Error in GetHydrometeorologySummaryStats:", error);
    return reply.code(500).send({
      success: false,
      code: 500,
      message: "Lỗi máy chủ khi lấy thống kê tổng quan",
    });
  }
};

/**
 * API thống kê lượng mưa theo trạm khí tượng
 */
const GetRainfallStatsByStation = async (req, reply) => {
  try {
    const {startDate, endDate, orderBy = "total_desc"} = req.query;

    let timeCondition = "";
    if (startDate && endDate) {
      timeCondition = ` AND "Ngày"::date BETWEEN '${startDate}' AND '${endDate}'`;
    } else if (startDate) {
      timeCondition = ` AND "Ngày"::date >= '${startDate}'`;
    } else if (endDate) {
      timeCondition = ` AND "Ngày"::date <= '${endDate}'`;
    }

    // Mapping orderBy values
    const orderByMapping = {
      total_desc: "total_rainfall DESC",
      total_asc: "total_rainfall ASC",
      avg_desc: "avg_rainfall DESC",
      avg_asc: "avg_rainfall ASC",
      max_desc: "max_rainfall DESC",
      max_asc: "max_rainfall ASC",
    };
    const orderClause = orderByMapping[orderBy] || "total_rainfall DESC";

    // Define rainfall stations
    const rainfallStations = [
      {code: "AP", name: "An Phú", column: "R_AP"},
      {code: "BC", name: "Bình Chánh", column: "R_BC"},
      {code: "CG", name: "Cai Giữa", column: "R_CG"},
      {code: "CL", name: "Cần Lộc", column: "R_CL"},
      {code: "CC", name: "Cần Cờ", column: "R_CC"},
      {code: "HM", name: "Hóc Môn", column: "R_HM"},
      {code: "LMX", name: "Lạc Mỹ Xa", column: "R_LMX"},
      {code: "LS", name: "Long Sơn", column: "R_LS"},
      {code: "MDC", name: "Mỹ Đức", column: "R_MDC"},
      {code: "NB_KT", name: "Nhà Bè (Khí tượng)", column: "R_NB"},
      {code: "PVC", name: "Phú Vĩnh Cảm", column: "R_PVC"},
      {code: "TTH", name: "Tân Thuận Hạ", column: "R_TTH"},
      {code: "TSH", name: "Tân Sơn Hòa", column: "R_TSH"},
      {code: "TD", name: "Tà Đây", column: "R_TD"},
    ];

    // Generate station queries using helper function
    const stationQueries = rainfallStations.map((station) => {
      return generateStationRainQuery(station.code, station.name, station.column, timeCondition);
    });

    const query = `
      WITH station_rainfall AS (
        ${stationQueries.join("\n        UNION ALL\n        ")}
      )
      SELECT 
        station_code,
        station_name,
        record_count,
        rainy_days,
        ROUND(total_rainfall::numeric, 2) as total_rainfall,
        ROUND(avg_rainfall::numeric, 2) as avg_rainfall,
        ROUND(max_rainfall::numeric, 2) as max_rainfall,
        ROUND(min_positive_rainfall::numeric, 2) as min_positive_rainfall,
        ROUND((rainy_days::numeric / NULLIF(record_count, 0) * 100)::numeric, 1) as rainy_days_percentage
      FROM station_rainfall
      WHERE record_count > 0
      ORDER BY ${orderClause}
    `;

    const result = await QueryDatabase(query);

    return reply.code(200).send({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    logger.error("Error in GetRainfallStatsByStation:", error);
    return reply.code(500).send({
      success: false,
      code: 500,
      message: "Lỗi máy chủ khi lấy thống kê lượng mưa theo trạm",
    });
  }
};

/**
 * API thống kê mực nước theo trạm thủy văn
 */
const GetWaterLevelStatsByStation = async (req, reply) => {
  try {
    const {startDate, endDate, orderBy = "avg_desc"} = req.query;

    let timeCondition = "";
    if (startDate && endDate) {
      timeCondition = ` AND "Ngày"::date BETWEEN '${startDate}' AND '${endDate}'`;
    } else if (startDate) {
      timeCondition = ` AND "Ngày"::date >= '${startDate}'`;
    } else if (endDate) {
      timeCondition = ` AND "Ngày"::date <= '${endDate}'`;
    }

    // Mapping orderBy values
    const orderByMapping = {
      avg_desc: "avg_water_level DESC",
      avg_asc: "avg_water_level ASC",
      max_desc: "max_water_level DESC",
      max_asc: "max_water_level ASC",
      min_desc: "min_water_level DESC",
      min_asc: "min_water_level ASC",
    };
    const orderClause = orderByMapping[orderBy] || "avg_water_level DESC";

    const query = `
      WITH water_level_stats AS (
        SELECT 
          'NB_TV' as station_code,
          'Nhà Bè (Thủy văn)' as station_name,
          COUNT(*) as record_count,
          AVG(${toNumericNullable("Htb_NB")}) as avg_water_level,
          MAX(${toNumericNullable("Hx_NB")}) as max_water_level,
          MIN(${toNumericNullable("Hm_NB")}) as min_water_level,
          STDDEV(${toNumericNullable("Htb_NB")}) as water_level_stddev,
          COUNT(CASE WHEN ${toNumeric("Hx_NB")} > (AVG(${toNumeric("Hx_NB")}) OVER() + 2 * STDDEV(${toNumeric("Hx_NB")}) OVER()) THEN 1 END) as high_water_days,
          COUNT(CASE WHEN ${toNumeric("Hm_NB")} < (AVG(${toNumeric("Hm_NB")}) OVER() - 2 * STDDEV(${toNumeric("Hm_NB")}) OVER()) THEN 1 END) as low_water_days
        FROM hochiminh."ThuyVan"
        WHERE "Htb_NB" IS NOT NULL OR "Hx_NB" IS NOT NULL OR "Hm_NB" IS NOT NULL ${timeCondition}
        
        UNION ALL
        
        SELECT 
          'PA' as station_code,
          'Phú An' as station_name,
          COUNT(*) as record_count,
          AVG(${toNumericNullable("Htb_PA")}) as avg_water_level,
          MAX(${toNumericNullable("Hx_PA")}) as max_water_level,
          MIN(${toNumericNullable("Hm_PA")}) as min_water_level,
          STDDEV(${toNumericNullable("Htb_PA")}) as water_level_stddev,
          COUNT(CASE WHEN ${toNumeric("Hx_PA")} > (AVG(${toNumeric("Hx_PA")}) OVER() + 2 * STDDEV(${toNumeric("Hx_PA")}) OVER()) THEN 1 END) as high_water_days,
          COUNT(CASE WHEN ${toNumeric("Hm_PA")} < (AVG(${toNumeric("Hm_PA")}) OVER() - 2 * STDDEV(${toNumeric("Hm_PA")}) OVER()) THEN 1 END) as low_water_days
        FROM hochiminh."ThuyVan"
        WHERE "Htb_PA" IS NOT NULL OR "Hx_PA" IS NOT NULL OR "Hm_PA" IS NOT NULL ${timeCondition}
      )
      SELECT 
        station_code,
        station_name,
        record_count,
        ROUND(avg_water_level::numeric, 2) as avg_water_level,
        ROUND(max_water_level::numeric, 2) as max_water_level,
        ROUND(min_water_level::numeric, 2) as min_water_level,
        ROUND(water_level_stddev::numeric, 2) as water_level_stddev,
        ROUND((max_water_level - min_water_level)::numeric, 2) as water_level_range,
        high_water_days,
        low_water_days
      FROM water_level_stats
      WHERE record_count > 0 AND avg_water_level IS NOT NULL
      ORDER BY ${orderClause}
    `;

    const result = await QueryDatabase(query);

    return reply.code(200).send({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    logger.error("Error in GetWaterLevelStatsByStation:", error);
    return reply.code(500).send({
      success: false,
      code: 500,
      message: "Lỗi máy chủ khi lấy thống kê mực nước theo trạm",
    });
  }
};

/**
 * API thống kê theo tháng/năm
 */
const GetMonthlyYearlyStats = async (req, reply) => {
  try {
    const {period = "monthly", year, stationType = "all"} = req.query;

    let yearCondition = "";
    if (year) {
      yearCondition = ` AND EXTRACT(YEAR FROM "Ngày"::date) = ${year}`;
    }

    let weatherQuery = "";
    let hydroQuery = "";
    let groupByClause = "";
    let selectPeriod = "";

    if (period === "monthly") {
      selectPeriod = `
        EXTRACT(YEAR FROM "Ngày"::date) as year,
        EXTRACT(MONTH FROM "Ngày"::date) as month,
        TO_CHAR("Ngày"::date, 'YYYY-MM') as period
      `;
      groupByClause = 'EXTRACT(YEAR FROM "Ngày"::date), EXTRACT(MONTH FROM "Ngày"::date)';
    } else {
      selectPeriod = `
        EXTRACT(YEAR FROM "Ngày"::date) as year,
        NULL as month,
        EXTRACT(YEAR FROM "Ngày"::date)::text as period
      `;
      groupByClause = 'EXTRACT(YEAR FROM "Ngày"::date)';
    }

    const totalRainfallSum = [
      "R_AP",
      "R_BC",
      "R_CG",
      "R_CL",
      "R_CC",
      "R_HM",
      "R_LMX",
      "R_LS",
      "R_MDC",
      "R_NB",
      "R_PVC",
      "R_TTH",
      "R_TSH",
      "R_TD",
    ]
      .map((col) => `${toNumericNullable(col)}`)
      .join(" + ");

    if (stationType === "weather" || stationType === "all") {
      weatherQuery = `
        WITH weather_monthly AS (
          SELECT 
            ${selectPeriod},
            COUNT(*) as record_count,
            SUM(${totalRainfallSum}) as total_rainfall,
            AVG(${totalRainfallSum}) as avg_daily_rainfall,
            AVG(${toNumericNullable("Ttb_TSH")}) as avg_temperature,
            MAX(${toNumericNullable("Tx_TSH")}) as max_temperature,
            MIN(${toNumericNullable("Tm_TSH")}) as min_temperature,
            COUNT(CASE WHEN (${totalRainfallSum}) > 0 THEN 1 END) as rainy_days
          FROM hochiminh."KhiTuong"
          WHERE 1=1 ${yearCondition}
          GROUP BY ${groupByClause}
        )
        SELECT 
          'weather' as data_type,
          period,
          year,
          month,
          record_count,
          ROUND(total_rainfall::numeric, 2) as total_rainfall,
          ROUND(avg_daily_rainfall::numeric, 2) as avg_daily_rainfall,
          ROUND(avg_temperature::numeric, 1) as avg_temperature,
          ROUND(max_temperature::numeric, 1) as max_temperature,
          ROUND(min_temperature::numeric, 1) as min_temperature,
          rainy_days,
          ROUND((rainy_days::numeric / NULLIF(record_count, 0) * 100)::numeric, 1) as rainy_days_percentage
        FROM weather_monthly
      `;
    }

    if (stationType === "hydro" || stationType === "all") {
      hydroQuery = `
        WITH hydro_monthly AS (
          SELECT 
            ${selectPeriod},
            COUNT(*) as record_count,
            AVG(${toNumericNullable("Htb_NB")}) as avg_water_level_nb,
            MAX(${toNumericNullable("Hx_NB")}) as max_water_level_nb,
            MIN(${toNumericNullable("Hm_NB")}) as min_water_level_nb,
            AVG(${toNumericNullable("Htb_PA")}) as avg_water_level_pa,
            MAX(${toNumericNullable("Hx_PA")}) as max_water_level_pa,
            MIN(${toNumericNullable("Hm_PA")}) as min_water_level_pa,
            STDDEV(${toNumericNullable("Htb_NB")}) as stddev_nb,
            STDDEV(${toNumericNullable("Htb_PA")}) as stddev_pa
          FROM hochiminh."ThuyVan"
          WHERE 1=1 ${yearCondition}
          GROUP BY ${groupByClause}
        )
        SELECT 
          'hydro' as data_type,
          period,
          year,
          month,
          record_count,
          ROUND(avg_water_level_nb::numeric, 2) as avg_water_level_nb,
          ROUND(max_water_level_nb::numeric, 2) as max_water_level_nb,
          ROUND(min_water_level_nb::numeric, 2) as min_water_level_nb,
          ROUND(avg_water_level_pa::numeric, 2) as avg_water_level_pa,
          ROUND(max_water_level_pa::numeric, 2) as max_water_level_pa,
          ROUND(min_water_level_pa::numeric, 2) as min_water_level_pa,
          ROUND(stddev_nb::numeric, 2) as stddev_nb,
          ROUND(stddev_pa::numeric, 2) as stddev_pa
        FROM hydro_monthly
      `;
    }

    let finalQuery = "";
    if (stationType === "all") {
      finalQuery = `${weatherQuery} UNION ALL ${hydroQuery} ORDER BY period DESC, data_type`;
    } else if (stationType === "weather") {
      finalQuery = `${weatherQuery} ORDER BY period DESC`;
    } else {
      finalQuery = `${hydroQuery} ORDER BY period DESC`;
    }

    const result = await QueryDatabase(finalQuery);

    return reply.code(200).send({
      success: true,
      data: result.rows,
      count: result.rows.length,
      params: {
        period,
        year: year || "all",
        stationType,
      },
    });
  } catch (error) {
    logger.error("Error in GetMonthlyYearlyStats:", error);
    return reply.code(500).send({
      success: false,
      code: 500,
      message: "Lỗi máy chủ khi lấy thống kê theo tháng/năm",
    });
  }
};

/**
 * API thống kê cảnh báo (mực nước cao/thấp bất thường, mưa lớn)
 */
const GetWeatherHydroAlerts = async (req, reply) => {
  try {
    const {startDate, endDate, alertType = "all"} = req.query;

    let timeCondition = "";
    if (startDate && endDate) {
      timeCondition = ` AND "Ngày"::date BETWEEN '${startDate}' AND '${endDate}'`;
    } else if (startDate) {
      timeCondition = ` AND "Ngày"::date >= '${startDate}'`;
    } else if (endDate) {
      timeCondition = ` AND "Ngày"::date <= '${endDate}'`;
    }

    const totalRainfallSum = [
      "R_AP",
      "R_BC",
      "R_CG",
      "R_CL",
      "R_CC",
      "R_HM",
      "R_LMX",
      "R_LS",
      "R_MDC",
      "R_NB",
      "R_PVC",
      "R_TTH",
      "R_TSH",
      "R_TD",
    ]
      .map((col) => `${toNumericNullable(col)}`)
      .join(" + ");

    const query = `
      WITH rainfall_alerts AS (
        SELECT 
          "Ngày",
          'heavy_rain' as alert_type,
          'Mưa lớn' as alert_description,
          (${totalRainfallSum}) as value,
          'mm' as unit,
          CASE 
            WHEN (${totalRainfallSum}) >= 100 THEN 'critical'
            WHEN (${totalRainfallSum}) >= 50 THEN 'high'
            ELSE 'medium'
          END as severity
        FROM hochiminh."KhiTuong"
        WHERE (${totalRainfallSum}) >= 30
          ${timeCondition}
          ${alertType !== "all" && alertType !== "heavy_rain" ? "AND 1=0" : ""}
      ),
      water_level_alerts AS (
        SELECT 
          "Ngày",
          alert_type,
          alert_description,
          value,
          unit,
          severity
        FROM (
          SELECT 
            "Ngày",
            CASE 
              WHEN ${toNumeric("Hx_NB")} > (SELECT AVG(${toNumeric("Hx_NB")}) + 2 * STDDEV(${toNumeric("Hx_NB")}) FROM hochiminh."ThuyVan" WHERE "Hx_NB" IS NOT NULL AND "Hx_NB" != '') 
              THEN 'high_water_nb'
              WHEN ${toNumeric("Hm_NB")} < (SELECT AVG(${toNumeric("Hm_NB")}) - 2 * STDDEV(${toNumeric("Hm_NB")}) FROM hochiminh."ThuyVan" WHERE "Hm_NB" IS NOT NULL AND "Hm_NB" != '')
              THEN 'low_water_nb'
              WHEN ${toNumeric("Hx_PA")} > (SELECT AVG(${toNumeric("Hx_PA")}) + 2 * STDDEV(${toNumeric("Hx_PA")}) FROM hochiminh."ThuyVan" WHERE "Hx_PA" IS NOT NULL AND "Hx_PA" != '')
              THEN 'high_water_pa'  
              WHEN ${toNumeric("Hm_PA")} < (SELECT AVG(${toNumeric("Hm_PA")}) - 2 * STDDEV(${toNumeric("Hm_PA")}) FROM hochiminh."ThuyVan" WHERE "Hm_PA" IS NOT NULL AND "Hm_PA" != '')
              THEN 'low_water_pa'
            END as alert_type,
            CASE 
              WHEN ${toNumeric("Hx_NB")} > (SELECT AVG(${toNumeric("Hx_NB")}) + 2 * STDDEV(${toNumeric("Hx_NB")}) FROM hochiminh."ThuyVan" WHERE "Hx_NB" IS NOT NULL AND "Hx_NB" != '')
              THEN 'Mực nước cao bất thường tại Nhà Bè'
              WHEN ${toNumeric("Hm_NB")} < (SELECT AVG(${toNumeric("Hm_NB")}) - 2 * STDDEV(${toNumeric("Hm_NB")}) FROM hochiminh."ThuyVan" WHERE "Hm_NB" IS NOT NULL AND "Hm_NB" != '')
              THEN 'Mực nước thấp bất thường tại Nhà Bè'
              WHEN ${toNumeric("Hx_PA")} > (SELECT AVG(${toNumeric("Hx_PA")}) + 2 * STDDEV(${toNumeric("Hx_PA")}) FROM hochiminh."ThuyVan" WHERE "Hx_PA" IS NOT NULL AND "Hx_PA" != '')
              THEN 'Mực nước cao bất thường tại Phú An'
              WHEN ${toNumeric("Hm_PA")} < (SELECT AVG(${toNumeric("Hm_PA")}) - 2 * STDDEV(${toNumeric("Hm_PA")}) FROM hochiminh."ThuyVan" WHERE "Hm_PA" IS NOT NULL AND "Hm_PA" != '')
              THEN 'Mực nước thấp bất thường tại Phú An'
            END as alert_description,
            CASE
              WHEN ${toNumeric("Hx_NB")} > (SELECT AVG(${toNumeric("Hx_NB")}) + 2 * STDDEV(${toNumeric("Hx_NB")}) FROM hochiminh."ThuyVan" WHERE "Hx_NB" IS NOT NULL AND "Hx_NB" != '') THEN ${toNumeric("Hx_NB")}
              WHEN ${toNumeric("Hm_NB")} < (SELECT AVG(${toNumeric("Hm_NB")}) - 2 * STDDEV(${toNumeric("Hm_NB")}) FROM hochiminh."ThuyVan" WHERE "Hm_NB" IS NOT NULL AND "Hm_NB" != '') THEN ${toNumeric("Hm_NB")}
              WHEN ${toNumeric("Hx_PA")} > (SELECT AVG(${toNumeric("Hx_PA")}) + 2 * STDDEV(${toNumeric("Hx_PA")}) FROM hochiminh."ThuyVan" WHERE "Hx_PA" IS NOT NULL AND "Hx_PA" != '') THEN ${toNumeric("Hx_PA")}
              WHEN ${toNumeric("Hm_PA")} < (SELECT AVG(${toNumeric("Hm_PA")}) - 2 * STDDEV(${toNumeric("Hm_PA")}) FROM hochiminh."ThuyVan" WHERE "Hm_PA" IS NOT NULL AND "Hm_PA" != '') THEN ${toNumeric("Hm_PA")}
            END as value,
            'cm' as unit,
            CASE
              WHEN (${toNumeric("Hx_NB")} > (SELECT AVG(${toNumeric("Hx_NB")}) + 3 * STDDEV(${toNumeric("Hx_NB")}) FROM hochiminh."ThuyVan" WHERE "Hx_NB" IS NOT NULL AND "Hx_NB" != ''))
                OR (${toNumeric("Hm_NB")} < (SELECT AVG(${toNumeric("Hm_NB")}) - 3 * STDDEV(${toNumeric("Hm_NB")}) FROM hochiminh."ThuyVan" WHERE "Hm_NB" IS NOT NULL AND "Hm_NB" != ''))
                OR (${toNumeric("Hx_PA")} > (SELECT AVG(${toNumeric("Hx_PA")}) + 3 * STDDEV(${toNumeric("Hx_PA")}) FROM hochiminh."ThuyVan" WHERE "Hx_PA" IS NOT NULL AND "Hx_PA" != ''))
                OR (${toNumeric("Hm_PA")} < (SELECT AVG(${toNumeric("Hm_PA")}) - 3 * STDDEV(${toNumeric("Hm_PA")}) FROM hochiminh."ThuyVan" WHERE "Hm_PA" IS NOT NULL AND "Hm_PA" != ''))
              THEN 'critical'
              ELSE 'high'
            END as severity
          FROM hochiminh."ThuyVan"
          WHERE (${toNumeric("Hx_NB")} > (SELECT AVG(${toNumeric("Hx_NB")}) + 2 * STDDEV(${toNumeric("Hx_NB")}) FROM hochiminh."ThuyVan" WHERE "Hx_NB" IS NOT NULL AND "Hx_NB" != '')
             OR ${toNumeric("Hm_NB")} < (SELECT AVG(${toNumeric("Hm_NB")}) - 2 * STDDEV(${toNumeric("Hm_NB")}) FROM hochiminh."ThuyVan" WHERE "Hm_NB" IS NOT NULL AND "Hm_NB" != '')
             OR ${toNumeric("Hx_PA")} > (SELECT AVG(${toNumeric("Hx_PA")}) + 2 * STDDEV(${toNumeric("Hx_PA")}) FROM hochiminh."ThuyVan" WHERE "Hx_PA" IS NOT NULL AND "Hx_PA" != '')
             OR ${toNumeric("Hm_PA")} < (SELECT AVG(${toNumeric("Hm_PA")}) - 2 * STDDEV(${toNumeric("Hm_PA")}) FROM hochiminh."ThuyVan" WHERE "Hm_PA" IS NOT NULL AND "Hm_PA" != ''))
            ${timeCondition}
        ) sub
        WHERE alert_type IS NOT NULL
          ${alertType !== "all" && !alertType.includes("water") ? "AND 1=0" : ""}
          ${alertType === "high_water" ? "AND alert_type LIKE 'high_water%'" : ""}
          ${alertType === "low_water" ? "AND alert_type LIKE 'low_water%'" : ""}
      ),
      all_alerts AS (
        SELECT * FROM rainfall_alerts
        UNION ALL
        SELECT * FROM water_level_alerts
      )
      SELECT 
        "Ngày"::date as alert_date,
        alert_type,
        alert_description,
        ROUND(value::numeric, 2) as value,
        unit,
        severity,
        CASE 
          WHEN alert_type = 'heavy_rain' THEN 'Khí tượng'
          ELSE 'Thủy văn'
        END as category
      FROM all_alerts
      ORDER BY "Ngày" DESC, severity DESC
    `;

    const result = await QueryDatabase(query);

    const summary = {
      critical: result.rows.filter((row) => row.severity === "critical").length,
      high: result.rows.filter((row) => row.severity === "high").length,
      medium: result.rows.filter((row) => row.severity === "medium").length,
    };

    return reply.code(200).send({
      success: true,
      data: result.rows,
      summary,
      count: result.rows.length,
      params: {
        alertType,
        startDate: startDate || "all",
        endDate: endDate || "all",
      },
    });
  } catch (error) {
    logger.error("Error in GetWeatherHydroAlerts:", error);
    return reply.code(500).send({
      success: false,
      code: 500,
      message: "Lỗi máy chủ khi lấy cảnh báo thời tiết thủy văn",
    });
  }
};

/**
 * API dashboard - tổng hợp các thống kê quan trọng
 */
const GetHydrometeorologicalDashboard = async (req, reply) => {
  try {
    const {period = "7days"} = req.query;

    let timeCondition = "";
    let dayRange = 7;

    switch (period) {
      case "30days":
        timeCondition = ` AND "Ngày"::date >= CURRENT_DATE - INTERVAL '30 days'`;
        dayRange = 30;
        break;
      case "90days":
        timeCondition = ` AND "Ngày"::date >= CURRENT_DATE - INTERVAL '90 days'`;
        dayRange = 90;
        break;
      case "1year":
        timeCondition = ` AND "Ngày"::date >= CURRENT_DATE - INTERVAL '1 year'`;
        dayRange = 365;
        break;
      default:
        timeCondition = ` AND "Ngày"::date >= CURRENT_DATE - INTERVAL '7 days'`;
    }

    const totalRainfallSum = [
      "R_AP",
      "R_BC",
      "R_CG",
      "R_CL",
      "R_CC",
      "R_HM",
      "R_LMX",
      "R_LS",
      "R_MDC",
      "R_NB",
      "R_PVC",
      "R_TTH",
      "R_TSH",
      "R_TD",
    ]
      .map((col) => `${toNumericNullable(col)}`)
      .join(" + ");

    const dashboardQuery = `
      WITH weather_summary AS (
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT "Ngày"::date) as total_days,
          SUM(${totalRainfallSum}) as total_rainfall,
          AVG(${totalRainfallSum}) as avg_daily_rainfall,
          MAX(${totalRainfallSum}) as max_daily_rainfall,
          AVG(${toNumericNullable("Ttb_TSH")}) as avg_temperature,
          MAX(${toNumericNullable("Tx_TSH")}) as max_temperature,
          MIN(${toNumericNullable("Tm_TSH")}) as min_temperature,
          COUNT(CASE WHEN (${totalRainfallSum}) > 0 THEN 1 END) as rainy_days,
          COUNT(CASE WHEN (${totalRainfallSum}) >= 30 THEN 1 END) as heavy_rain_days
        FROM hochiminh."KhiTuong"
        WHERE 1=1 ${timeCondition}
      ),
      hydro_summary AS (
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT "Ngày"::date) as total_days,
          AVG(${toNumericNullable("Htb_NB")}) as avg_water_level_nb,
          MAX(${toNumericNullable("Hx_NB")}) as max_water_level_nb,
          MIN(${toNumericNullable("Hm_NB")}) as min_water_level_nb,
          AVG(${toNumericNullable("Htb_PA")}) as avg_water_level_pa,
          MAX(${toNumericNullable("Hx_PA")}) as max_water_level_pa,
          MIN(${toNumericNullable("Hm_PA")}) as min_water_level_pa,
          STDDEV(${toNumericNullable("Htb_NB")}) as stddev_nb,
          STDDEV(${toNumericNullable("Htb_PA")}) as stddev_pa
        FROM hochiminh."ThuyVan"
        WHERE 1=1 ${timeCondition}
      ),
      recent_alerts AS (
        SELECT COUNT(*) as alert_count
        FROM (
          SELECT "Ngày"
          FROM hochiminh."KhiTuong"
          WHERE (${totalRainfallSum}) >= 50
            ${timeCondition}
          UNION
          SELECT "Ngày"
          FROM hochiminh."ThuyVan"
          WHERE (${toNumeric("Hx_NB")} > (SELECT AVG(${toNumeric("Hx_NB")}) + 2 * STDDEV(${toNumeric("Hx_NB")}) FROM hochiminh."ThuyVan" WHERE "Hx_NB" IS NOT NULL AND "Hx_NB" != '')
             OR ${toNumeric("Hm_NB")} < (SELECT AVG(${toNumeric("Hm_NB")}) - 2 * STDDEV(${toNumeric("Hm_NB")}) FROM hochiminh."ThuyVan" WHERE "Hm_NB" IS NOT NULL AND "Hm_NB" != '')
             OR ${toNumeric("Hx_PA")} > (SELECT AVG(${toNumeric("Hx_PA")}) + 2 * STDDEV(${toNumeric("Hx_PA")}) FROM hochiminh."ThuyVan" WHERE "Hx_PA" IS NOT NULL AND "Hx_PA" != '')
             OR ${toNumeric("Hm_PA")} < (SELECT AVG(${toNumeric("Hm_PA")}) - 2 * STDDEV(${toNumeric("Hm_PA")}) FROM hochiminh."ThuyVan" WHERE "Hm_PA" IS NOT NULL AND "Hm_PA" != ''))
            ${timeCondition}
        ) alerts
      ),
      latest_data AS (
        SELECT 
          MAX("Ngày") as last_update_weather
        FROM hochiminh."KhiTuong"
      ),
      latest_hydro AS (
        SELECT 
          MAX("Ngày") as last_update_hydro
        FROM hochiminh."ThuyVan"
      )
      SELECT 
        w.*,
        h.total_records as hydro_total_records,
        h.total_days as hydro_total_days,
        h.avg_water_level_nb,
        h.max_water_level_nb,
        h.min_water_level_nb,
        h.avg_water_level_pa,
        h.max_water_level_pa,
        h.min_water_level_pa,
        h.stddev_nb,
        h.stddev_pa,
        a.alert_count,
        l.last_update_weather,
        lh.last_update_hydro
      FROM weather_summary w, hydro_summary h, recent_alerts a, latest_data l, latest_hydro lh
    `;

    const result = await QueryDatabase(dashboardQuery);
    const data = result.rows[0];

    const dashboard = {
      period: {
        name: period,
        days: dayRange,
        description:
          period === "7days"
            ? "7 ngày qua"
            : period === "30days"
              ? "30 ngày qua"
              : period === "90days"
                ? "90 ngày qua"
                : "1 năm qua",
      },
      data_coverage: {
        weather: {
          total_records: data.total_records,
          total_days: data.total_days,
          last_update: data.last_update_weather,
        },
        hydro: {
          total_records: data.hydro_total_records,
          total_days: data.hydro_total_days,
          last_update: data.last_update_hydro,
        },
      },
      weather_summary: {
        rainfall: {
          total: parseFloat(data.total_rainfall || 0).toFixed(2) + " mm",
          daily_average: parseFloat(data.avg_daily_rainfall || 0).toFixed(2) + " mm",
          max_daily: parseFloat(data.max_daily_rainfall || 0).toFixed(2) + " mm",
          rainy_days: data.rainy_days,
          heavy_rain_days: data.heavy_rain_days,
          rainy_percentage: parseFloat((data.rainy_days / Math.max(data.total_days, 1)) * 100).toFixed(1) + "%",
        },
        temperature: {
          average: parseFloat(data.avg_temperature || 0).toFixed(1) + "°C",
          maximum: parseFloat(data.max_temperature || 0).toFixed(1) + "°C",
          minimum: parseFloat(data.min_temperature || 0).toFixed(1) + "°C",
        },
      },
      hydro_summary: {
        nha_be: {
          avg_level: parseFloat(data.avg_water_level_nb || 0).toFixed(2) + " cm",
          max_level: parseFloat(data.max_water_level_nb || 0).toFixed(2) + " cm",
          min_level: parseFloat(data.min_water_level_nb || 0).toFixed(2) + " cm",
          variability: parseFloat(data.stddev_nb || 0).toFixed(2) + " cm",
        },
        phu_an: {
          avg_level: parseFloat(data.avg_water_level_pa || 0).toFixed(2) + " cm",
          max_level: parseFloat(data.max_water_level_pa || 0).toFixed(2) + " cm",
          min_level: parseFloat(data.min_water_level_pa || 0).toFixed(2) + " cm",
          variability: parseFloat(data.stddev_pa || 0).toFixed(2) + " cm",
        },
      },
      alerts: {
        count: data.alert_count,
        description: data.alert_count > 0 ? `${data.alert_count} cảnh báo trong ${dayRange} ngày qua` : "Không có cảnh báo",
      },
    };

    return reply.code(200).send({
      success: true,
      dashboard,
    });
  } catch (error) {
    logger.error("Error in GetHydrometeorologicalDashboard:", error);
    return reply.code(500).send({
      success: false,
      code: 500,
      message: "Lỗi máy chủ khi lấy dashboard khí tượng thủy văn",
    });
  }
};

module.exports = {
  GetHydrometeorologySummaryStats,
  GetRainfallStatsByStation,
  GetWaterLevelStatsByStation,
  GetMonthlyYearlyStats,
  GetWeatherHydroAlerts,
  GetHydrometeorologicalDashboard,
};
