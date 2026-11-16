// Luu them ten tai khoan (lay tu JWT, cot "name" trong bang users) ben canh user_email, de biet
// NGAY trong bang bulletin_subscriptions ai da dang ky ma khong phai join sang bang users.
module.exports = {
  name: "020_add_user_name_to_bulletin_subscriptions",
  async up(QueryDatabase) {
    await QueryDatabase(
      `ALTER TABLE public.bulletin_subscriptions ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);`,
    );
  },
};
