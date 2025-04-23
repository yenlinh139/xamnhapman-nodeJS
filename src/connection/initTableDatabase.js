const logger = require("../loggers/loggers.config");
const QueryDatabase = require("../utils/queryDatabase");

const initPostGISExtension = async () => {
  try {
    const createExtensionSQL = `
      CREATE EXTENSION IF NOT EXISTS postgis;
    `;
    await QueryDatabase(createExtensionSQL);
    console.log("PostGIS extension has been successfully created.");
  } catch (error) {
    console.error("Error creating PostGIS extension:", error);
    logger.error(error);
  }
};

const initUsersTable = async () => {
  try {
    const checkIsHaveUsers = `
      SELECT EXISTS (
          SELECT 1 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
      );
    `;
    const checkIsHaveRowsUsers = `
      SELECT COUNT(*)
      FROM users u;
    `;
    const addUser = `
      INSERT INTO public.users
        ("email", "password", "name", "role", "email_verified", "birthdate", "phone")
      VALUES
        ('admin@gmail.com','$2b$10$ZHJTMlQTwGfwUMCqBPDgx.F.PrbksZ6wH6FOHR4m2MY.7fKlN7uyC', 'admin', '1', TRUE, '1990-01-01', '0123456789'),
        ('admin1@gmail.com','$2b$10$ZHJTMlQTwGfwUMCqBPDgx.F.PrbksZ6wH6FOHR4m2MY.7fKlN7uyC', 'admin1', '1', TRUE, '1992-02-02', '0987654321'),
        ('test@gmail.com','$2b$10$ZHJTMlQTwGfwUMCqBPDgx.F.PrbksZ6wH6FOHR4m2MY.7fKlN7uyC', 'test', '0', TRUE, '1995-05-05', '0912345678');  
    `;
    const checkUsers = await QueryDatabase(checkIsHaveUsers);

    if (checkUsers.rows[0].exists === true) {
      const checkRowUsers = await QueryDatabase(checkIsHaveRowsUsers);
      if (checkRowUsers.rows[0].count == 0) {
        await QueryDatabase(addUser);
      }
      return;
    } else {
      const sql = `
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        CREATE TABLE public.Users (
          Id uuid default uuid_generate_v4() NOT NULL,
          Email character varying(50) DEFAULT NULL::character varying,
          Password character varying(100) DEFAULT NULL::character varying,
          Name character varying(50) DEFAULT NULL::character varying,
          email_verified boolean DEFAULT FALSE,
          Role smallint,
          Birthdate DATE DEFAULT NULL, -- Thêm cột ngày sinh
          Phone character varying(15) DEFAULT NULL -- Thêm cột số điện thoại
        );
      `;
      await QueryDatabase(sql);
      const checkRowUsers = await QueryDatabase(checkIsHaveRowsUsers);
      if (checkRowUsers.rows[0].count == 0) {
        await QueryDatabase(addUser);
      }
    }
  } catch (error) {
    console.log("Error init table Users :: ", error);
    logger.error(error);
  }
};

const initMapRegionsTable = async () => {
  try {
    // Kiểm tra xem bảng map_regions đã tồn tại trong schema public chưa
    const checkIsHaveMapRegions = `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'map_regions'
      );
    `;

    // Kiểm tra xem bảng map_regions có dữ liệu hay không
    const checkIsHaveRowsMapRegions = `
      SELECT COUNT(*)
      FROM map_regions;
    `;

    // Thêm một số vùng mặc định nếu bảng chưa có dữ liệu
    const addMapRegion = `
      INSERT INTO public.map_regions
        ("email", "geometry", "created_at")
      VALUES
        ('admin@gmail.com', ST_GeomFromText('POLYGON((104.0 23.5, 104.0 10.4, 109.5 10.4, 109.5 23.5, 104.0 23.5))', 4326), NOW());
    `;

    // Kiểm tra sự tồn tại của bảng map_regions
    const checkMapRegions = await QueryDatabase(checkIsHaveMapRegions);

    if (checkMapRegions.rows[0].exists === true) {
      // Nếu bảng đã tồn tại, kiểm tra xem bảng có dữ liệu không
      const checkRowMapRegions = await QueryDatabase(checkIsHaveRowsMapRegions);
      if (checkRowMapRegions.rows[0].count == 0) {
        // Nếu bảng không có dữ liệu, thêm dữ liệu mặc định vào bảng
        await QueryDatabase(addMapRegion);
      }
      return;
    } else {
      // Nếu bảng chưa tồn tại, tạo bảng mới
      const sql = `
        CREATE TABLE public.map_regions (
            Id uuid DEFAULT uuid_generate_v4() NOT NULL,
            Email character varying(50) DEFAULT NULL::character varying,
            Geometry geometry(POLYGON, 4326) NOT NULL, -- Lưu ranh giới dưới dạng Geometry
            Created_at timestamp DEFAULT NOW(),
            PRIMARY KEY (id)
        );
      `;
      await QueryDatabase(sql);

      // Sau khi tạo bảng xong, kiểm tra xem có dữ liệu không
      const checkRowMapRegions = await QueryDatabase(checkIsHaveRowsMapRegions);
      if (checkRowMapRegions.rows[0].count == 0) {
        // Nếu không có dữ liệu, thêm dữ liệu mặc định
        await QueryDatabase(addMapRegion);
      }
    }
  } catch (error) {
    console.log("Error init table MapRegions :: ", error);
    logger.error(error);
  }
};

const initFeedbacksTable = async () => {
  try {
    const checkIsHaveFeedbacks = `
      SELECT EXISTS (
          SELECT 1 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'feedbacks'
      );
    `;

    const checkIsHaveRowsFeedbacks = `SELECT COUNT(*) FROM feedbacks;`;

    const addFeedbacks = `
      INSERT INTO public.feedbacks (name, email, rating, message)
      VALUES
        ('admin', 'admin@gmail.com', 5, 'Tôi muốn biết thêm về sản phẩm của bạn.'),
        ('admin1', 'admin11@gmail.com', 4, 'Bạn có thể tư vấn cho tôi về dịch vụ không?'),
        ('Lê Văn C', 'test@gmail.com',  3, 'Tôi gặp sự cố khi đăng nhập vào hệ thống.');
    `;

    const checkFeedbacks = await QueryDatabase(checkIsHaveFeedbacks);

    if (checkFeedbacks.rows[0].exists === true) {
      const checkRowFeedbacks = await QueryDatabase(checkIsHaveRowsFeedbacks);
      if (checkRowFeedbacks.rows[0].count == 0) {
        await QueryDatabase(addFeedbacks);
      }
      return;
    } else {
      const sql = `
        CREATE TABLE public.feedbacks (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(100) NOT NULL UNIQUE,
          rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
          message TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;
      await QueryDatabase(sql);
      const checkRowFeedbacks = await QueryDatabase(checkIsHaveRowsFeedbacks);
      if (checkRowFeedbacks.rows[0].count == 0) {
        await QueryDatabase(addFeedbacks);
      }
    }
  } catch (error) {
    console.log("Error initializing feedbacks table :: ", error);
    logger.error(error);
  }
};

const initTableDatabase = async () => {
  try {
    await initPostGISExtension(); // Tạo PostGIS Extension trước
    await initUsersTable(); // Tạo bảng Users
    await initFeedbacksTable(); // Tạo bảng Feedabcks
    await initMapRegionsTable(); // Tạo bảng MapRegions
    console.log("Init table database PostgreSQL success");
  } catch (error) {
    console.log("Error init table database :: ", error);
    logger.error(error);
  }
};

module.exports = initTableDatabase;
