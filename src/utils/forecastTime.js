// pg trả timestamptz dạng "2024-08-01 02:00:00+07" (custom type parser trong
// database.connection.js) - chuẩn hoá về ISO 8601 có dấu ":" ở offset
// ("...+07:00") để Date parser của mọi trình duyệt đều đọc được nhất quán.
const toIsoWithOffset = (raw) => {
  if (!raw) return raw;
  const isoLike = String(raw).replace(" ", "T");
  return /[+-]\d{2}$/.test(isoLike) ? `${isoLike}:00` : isoLike;
};

/**
 * "Now" dùng để xác định mốc dự báo "hiện tại" (popup bản đồ, mặc định bộ lọc
 * "Từ ngày" ở trang quản trị, v.v). Mặc định dùng thời gian thực. Phục vụ test/demo
 * khi dữ liệu dự báo là dữ liệu mẫu cố định (vd tháng 8/2024): set FORECAST_NOW_OVERRIDE
 * trong .env để giả lập "bây giờ" là một thời điểm nằm trong chuỗi dự báo, thay vì luôn
 * rơi vào mốc cuối cùng do toàn bộ dữ liệu mẫu đã ở quá khứ so với thời gian thực.
 *   FORECAST_NOW_OVERRIDE không set, rỗng, hoặc "now" -> dùng thời gian thực.
 *   FORECAST_NOW_OVERRIDE="20240801" -> 2024-08-01 00:00 gio VN.
 *   FORECAST_NOW_OVERRIDE="2024080102" -> 2024-08-01 02:00 gio VN (them gio, 10 chu so).
 *   FORECAST_NOW_OVERRIDE="202408010230" -> 2024-08-01 02:30 gio VN (them phut, 12 chu so).
 *   FORECAST_NOW_OVERRIDE="2024-08-01..." (ISO day du) -> dung nguyen nhu Date hieu.
 */
const resolveReferenceNow = () => {
  const override = (process.env.FORECAST_NOW_OVERRIDE || "").trim();
  if (!override || override.toLowerCase() === "now") return new Date();

  // "20240801" -> "2024-08-01" | "2024080102" -> "2024-08-01T02" | "202408010230" -> "2024-08-01T02:30"
  let normalized = override;
  if (/^\d{8}$/.test(override)) {
    normalized = `${override.slice(0, 4)}-${override.slice(4, 6)}-${override.slice(6, 8)}`;
  } else if (/^\d{10}$/.test(override)) {
    normalized = `${override.slice(0, 4)}-${override.slice(4, 6)}-${override.slice(6, 8)}T${override.slice(8, 10)}`;
  } else if (/^\d{12}$/.test(override)) {
    normalized = `${override.slice(0, 4)}-${override.slice(4, 6)}-${override.slice(6, 8)}T${override.slice(8, 10)}:${override.slice(10, 12)}`;
  }

  // Khong co offset timezone -> gan la gio VN (+07:00), khop forecast_timezone, thay vi de
  // Date tu hieu la UTC (se lech 7 tieng so voi y dinh).
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    normalized = `${normalized}T00:00:00+07:00`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(normalized)) {
    normalized = `${normalized}:00:00+07:00`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    normalized = `${normalized}:00+07:00`;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

module.exports = {toIsoWithOffset, resolveReferenceNow};
