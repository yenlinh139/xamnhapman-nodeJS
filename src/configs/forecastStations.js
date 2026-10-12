// Mapping station của API dự báo ngoài (station_code: ST01..ST07) sang mã trạm
// nội bộ (KiHieu trong hochiminh."DiemDoMan" / cột trong hochiminh."DoMan").
// KXD2 (Kênh Xáng đứng 2) không có trong API dự báo -> has_forecast: false.
const FORECAST_STATION_MAP = {
  ST01: {manualCode: "MNB", displayName: "Mũi Nhà Bè"},
  ST02: {manualCode: "PCL", displayName: "Phà Cát Lái"},
  ST03: {manualCode: "CTT", displayName: "Cầu Thủ Thiêm"},
  ST04: {manualCode: "COT", displayName: "Cầu Ông Thìn"},
  ST05: {manualCode: "CKC", displayName: "Cống Kênh C"},
  ST06: {manualCode: "KXAH", displayName: "Kênh Xáng đứng 1"},
  ST07: {manualCode: "CRT", displayName: "Cầu Rạch Tra"},
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

module.exports = {
  FORECAST_STATION_MAP,
  ALL_SALINITY_STATIONS_FORECAST_STATUS,
  FORECAST_VALUE_COLUMNS,
};
