// Mapping "Station" (chuỗi tên không dấu trong contract v0.4, field "rows[].Station")
// sang mã trạm nội bộ (KiHieu trong hochiminh."DiemDoMan" / cột trong hochiminh."DoMan").
// KXD2 (Kênh Xáng đứng 2) không có trong API dự báo -> has_forecast: false.
// Xac nhan voi doi API 2026-11-10: dung field "DailyForecast" (khong phai "do_man") lam gia tri du bao chinh thuc.
const FORECAST_STATION_MAP = {
  MuiNhaBe: {manualCode: "MNB", displayName: "Mũi Nhà Bè"},
  PhaCatLai: {manualCode: "PCL", displayName: "Phà Cát Lái"},
  CauThuThiem: {manualCode: "CTT", displayName: "Cầu Thủ Thiêm"},
  CauOngThin: {manualCode: "COT", displayName: "Cầu Ông Thìn"},
  CongKenhC: {manualCode: "CKC", displayName: "Cống Kênh C"},
  KenhXang_AnHa: {manualCode: "KXAH", displayName: "Kênh Xáng đứng 1"},
  CauRachTra: {manualCode: "CRT", displayName: "Cầu Rạch Tra"},
};

// Toàn bộ trạm đo mặn thủ công + cờ has_forecast, dùng cho FE biết trạm nào
// chưa có dữ liệu dự báo (hiện tại chỉ KXD2 bị thiếu).
const ALL_SALINITY_STATIONS_FORECAST_STATUS = [
  {manualCode: "MNB", displayName: "Mũi Nhà Bè", hasForecast: true},
  {manualCode: "PCL", displayName: "Phà Cát Lái", hasForecast: true},
  {manualCode: "CTT", displayName: "Cầu Thủ Thiêm", hasForecast: true},
  {manualCode: "COT", displayName: "Cầu Ông Thìn", hasForecast: true},
  {manualCode: "CKC", displayName: "Cống Kênh C", hasForecast: true},
  {manualCode: "KXAH", displayName: "Kênh Xáng đứng 1", hasForecast: true},
  {manualCode: "CRT", displayName: "Cầu Rạch Tra", hasForecast: true},
  {manualCode: "KXD2", displayName: "Kênh Xáng đứng 2", hasForecast: false},
];

const FORECAST_VALUE_COLUMNS = Object.values(FORECAST_STATION_MAP).map((s) => s.manualCode);
// Cot luu gia tri DailyForecast (du bao theo ngay) ben canh cot do_man (theo moc 2h)
const FORECAST_DAILY_COLUMNS = FORECAST_VALUE_COLUMNS.map((c) => `${c}_Daily`);

// Trạm IoT (station_code) dùng tạm dự báo của điểm đo mặn tương ứng - phải khớp với
// IOT_STATION_FORECAST_MAP ở frontend (components/map/IoTMarkers.jsx).
const IOT_STATION_FORECAST_MAP = {
  CAH_IoT: "KXAH",
  CKC_IoT: "CKC",
};

module.exports = {
  IOT_STATION_FORECAST_MAP,
  FORECAST_STATION_MAP,
  ALL_SALINITY_STATIONS_FORECAST_STATUS,
  FORECAST_VALUE_COLUMNS,
  FORECAST_DAILY_COLUMNS,
};
