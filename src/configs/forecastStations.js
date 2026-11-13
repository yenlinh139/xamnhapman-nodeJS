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

// Dự báo riêng cho trạm IoT (API dự báo trả thêm từ 13/11/2026): "Station" của API -> station_code
// trong iot_system.iot_stations, cũng là tên cột trong forecast_system.forecast_values. API có lúc
// trả tên kèm hậu tố "_iot" (KenhC_iot) có lúc không (KenhC) nên so khớp sau khi bỏ hậu tố.
// Chuỗi dự báo IoT có lưới thời gian RIÊNG, không trùng với lưới của 7 điểm đo mặn.
const IOT_FORECAST_STATION_MAP = {
  KenhAnHa: "CAH_IoT",
  KenhC: "CKC_IoT",
  KenhVuonThom: "CVT_IoT",
};
const FORECAST_IOT_COLUMNS = Object.values(IOT_FORECAST_STATION_MAP);
// Danh sách trạm IoT có dự báo (cùng dạng với ALL_SALINITY_STATIONS_FORECAST_STATUS) cho trang quản trị
const IOT_STATIONS_FORECAST_STATUS = [
  {manualCode: "CKC_IoT", displayName: "Cống Kênh C", hasForecast: true},
  {manualCode: "CAH_IoT", displayName: "Cống An Hạ", hasForecast: true},
  {manualCode: "CVT_IoT", displayName: "Cống Vườn Thơm", hasForecast: true},
];
const FORECAST_ALL_VALUE_COLUMNS = [...FORECAST_VALUE_COLUMNS, ...FORECAST_IOT_COLUMNS];
const FORECAST_ALL_DAILY_COLUMNS = FORECAST_ALL_VALUE_COLUMNS.map((c) => `${c}_Daily`);

const resolveForecastColumn = (apiStation) =>
  FORECAST_STATION_MAP[apiStation]?.manualCode ||
  IOT_FORECAST_STATION_MAP[String(apiStation || "").replace(/_iot$/i, "")] ||
  null;

module.exports = {
  FORECAST_STATION_MAP,
  ALL_SALINITY_STATIONS_FORECAST_STATUS,
  FORECAST_VALUE_COLUMNS,
  FORECAST_DAILY_COLUMNS,
  FORECAST_IOT_COLUMNS,
  IOT_STATIONS_FORECAST_STATUS,
  FORECAST_ALL_VALUE_COLUMNS,
  FORECAST_ALL_DAILY_COLUMNS,
  resolveForecastColumn,
};
