const {Client} = require("pg");

const client = new Client({
  user: "postgres",
  host: "postgres", // Nếu chạy trong Docker: "postgres"
  database: "xamnhapman_tphcm",
  password: "51397",
  port: 5432,
});

client
  .connect()
  .then(() => console.log("✅ Kết nối PostgreSQL thành công!"))
  .catch((err) => console.error("❌ Lỗi kết nối:", err))
  .finally(() => client.end());
