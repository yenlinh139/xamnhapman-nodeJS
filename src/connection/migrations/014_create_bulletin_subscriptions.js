// Đăng ký nhận bản tin dự báo, cảnh báo xâm nhập mặn theo điểm đo mặn / trạm IoT / huyện
module.exports = {
  name: "014_create_bulletin_subscriptions",
  async up(QueryDatabase) {
    await QueryDatabase(`
      CREATE TABLE IF NOT EXISTS public.bulletin_subscriptions (
        id SERIAL PRIMARY KEY,
        user_email VARCHAR(255) NOT NULL,
        target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('salinity', 'iot', 'huyen')),
        target_code VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_email, target_type, target_code)
      );
    `);
  },
};
