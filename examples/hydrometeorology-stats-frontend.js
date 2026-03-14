/**
 * React Hooks và Components cho Hydrometeorology Statistics API
 * Sử dụng với axios và React
 */

import {useState, useEffect, useMemo, useCallback} from "react";
import axiosInstance from "./axiosConfig"; // Assume you have axios configured

// ================================
// CUSTOM HOOKS
// ================================

/**
 * Hook để lấy thống kê tổng quan
 */
export const useHydroSummary = (startDate, endDate) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const response = await axiosInstance.get(`/hydrometeorology-stats/summary?${params.toString()}`);
      setData(response.data.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {data, loading, error, refetch: fetchSummary};
};

/**
 * Hook để lấy thống kê mưa theo trạm
 */
export const useRainfallStats = (options = {}) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const {startDate, endDate, orderBy = "total_desc"} = options;

  const fetchRainfallStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({orderBy});
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const response = await axiosInstance.get(`/hydrometeorology-stats/rainfall-by-station?${params.toString()}`);
      setData(response.data.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, orderBy]);

  useEffect(() => {
    fetchRainfallStats();
  }, [fetchRainfallStats]);

  return {data, loading, error, refetch: fetchRainfallStats};
};

/**
 * Hook để lấy dashboard data
 */
export const useHydroDashboard = (period = "7days") => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axiosInstance.get(`/hydrometeorology-stats/dashboard?period=${period}`);
      setDashboard(response.data.dashboard);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return {dashboard, loading, error, refetch: fetchDashboard};
};

/**
 * Hook để lấy cảnh báo
 */
export const useWeatherAlerts = (alertType = "all", days = 7) => {
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const endDate = new Date().toISOString().split("T")[0];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const params = new URLSearchParams({
        alertType,
        startDate,
        endDate,
      });

      const response = await axiosInstance.get(`/hydrometeorology-stats/alerts?${params.toString()}`);
      setAlerts(response.data.data);
      setSummary(response.data.summary);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [alertType, days]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return {alerts, summary, loading, error, refetch: fetchAlerts};
};

/**
 * Hook để lấy thống kê theo tháng/năm
 */
export const useMonthlyStats = (period = "monthly", year, stationType = "all") => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({period, stationType});
      if (year) params.append("year", year);

      const response = await axiosInstance.get(`/hydrometeorology-stats/monthly-yearly?${params.toString()}`);
      setData(response.data.data);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [period, year, stationType]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {data, loading, error, refetch: fetchStats};
};

// ================================
// REACT COMPONENTS
// ================================

/**
 * Dashboard Component
 */
export const HydroDashboard = ({period = "7days", className = ""}) => {
  const {dashboard, loading, error} = useHydroDashboard(period);

  if (loading) return <div className="hydro-loading">Đang tải dashboard...</div>;
  if (error) return <div className="hydro-error">Lỗi: {error}</div>;
  if (!dashboard) return <div className="hydro-no-data">Không có dữ liệu</div>;

  return (
    <div className={`hydro-dashboard ${className}`}>
      <div className="dashboard-header">
        <h2>Dashboard Khí tượng Thủy văn</h2>
        <p>{dashboard.period.description}</p>
      </div>

      <div className="dashboard-grid">
        {/* Weather Summary Card */}
        <div className="weather-card">
          <h3>📊 Thời tiết</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Tổng lượng mưa</span>
              <span className="stat-value">{dashboard.weather_summary.rainfall.total}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Mưa TB/ngày</span>
              <span className="stat-value">{dashboard.weather_summary.rainfall.daily_average}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Ngày mưa</span>
              <span className="stat-value">
                {dashboard.weather_summary.rainfall.rainy_days} ngày ({dashboard.weather_summary.rainfall.rainy_percentage})
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Nhiệt độ TB</span>
              <span className="stat-value">{dashboard.weather_summary.temperature.average}</span>
            </div>
          </div>
        </div>

        {/* Hydro Summary Card */}
        <div className="hydro-card">
          <h3>🌊 Thủy văn</h3>
          <div className="stations-grid">
            <div className="station-data">
              <h4>Nhà Bè</h4>
              <p>TB: {dashboard.hydro_summary.nha_be.avg_level}</p>
              <p>Max: {dashboard.hydro_summary.nha_be.max_level}</p>
              <p>Min: {dashboard.hydro_summary.nha_be.min_level}</p>
            </div>
            <div className="station-data">
              <h4>Phú An</h4>
              <p>TB: {dashboard.hydro_summary.phu_an.avg_level}</p>
              <p>Max: {dashboard.hydro_summary.phu_an.max_level}</p>
              <p>Min: {dashboard.hydro_summary.phu_an.min_level}</p>
            </div>
          </div>
        </div>

        {/* Alerts Card */}
        <div className="alerts-card">
          <h3>⚠️ Cảnh báo</h3>
          <div className="alert-summary">
            {dashboard.alerts.count > 0 ? (
              <span className="has-alerts">{dashboard.alerts.description}</span>
            ) : (
              <span className="no-alerts">✅ Không có cảnh báo</span>
            )}
          </div>
        </div>

        {/* Data Coverage */}
        <div className="coverage-card">
          <h3>📈 Dữ liệu</h3>
          <div className="coverage-info">
            <p>Khí tượng: {dashboard.data_coverage.weather.total_records} bản ghi</p>
            <p>Thủy văn: {dashboard.data_coverage.hydro.total_records} bản ghi</p>
            <p>Cập nhật: {dashboard.data_coverage.weather.last_update}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Rainfall Stats Chart Component
 */
export const RainfallStatsChart = ({startDate, endDate, className = ""}) => {
  const [orderBy, setOrderBy] = useState("total_desc");
  const {data, loading, error} = useRainfallStats({startDate, endDate, orderBy});

  const chartData = useMemo(() => {
    return data.map((station) => ({
      name: station.station_name,
      code: station.station_code,
      total: parseFloat(station.total_rainfall),
      average: parseFloat(station.avg_rainfall),
      rainyDays: station.rainy_days,
      percentage: parseFloat(station.rainy_days_percentage),
    }));
  }, [data]);

  if (loading) return <div className="loading">Đang tải dữ liệu mưa...</div>;
  if (error) return <div className="error">Lỗi: {error}</div>;

  return (
    <div className={`rainfall-stats-chart ${className}`}>
      <div className="chart-header">
        <h3>📊 Thống kê lượng mưa theo trạm</h3>
        <select
          value={orderBy}
          onChange={(e) => setOrderBy(e.target.value)}
          className="sort-select">
          <option value="total_desc">Tổng lượng mưa (Giảm dần)</option>
          <option value="total_asc">Tổng lượng mưa (Tăng dần)</option>
          <option value="avg_desc">Trung bình (Giảm dần)</option>
          <option value="avg_asc">Trung bình (Tăng dần)</option>
        </select>
      </div>

      <div className="stations-list">
        {chartData.map((station) => (
          <div
            key={station.code}
            className="station-card">
            <div className="station-header">
              <h4>{station.name}</h4>
              <span className="station-code">({station.code})</span>
            </div>
            <div className="station-stats">
              <div className="stat">
                <span className="label">Tổng lượng mưa:</span>
                <span className="value">{station.total}mm</span>
              </div>
              <div className="stat">
                <span className="label">Trung bình/ngày:</span>
                <span className="value">{station.average}mm</span>
              </div>
              <div className="stat">
                <span className="label">Ngày mưa:</span>
                <span className="value">
                  {station.rainyDays} ngày ({station.percentage}%)
                </span>
              </div>
            </div>

            {/* Progress bar for visualization */}
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(station.percentage, 100)}%`,
                  backgroundColor: station.percentage > 50 ? "#4CAF50" : "#FF9800",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Weather Alerts Component
 */
export const WeatherAlerts = ({alertType = "all", days = 7, className = ""}) => {
  const {alerts, summary, loading, error} = useWeatherAlerts(alertType, days);

  const getSeverityColor = (severity) => {
    switch (severity) {
      case "critical":
        return "#FF4444";
      case "high":
        return "#FF8800";
      case "medium":
        return "#FFAA00";
      default:
        return "#888888";
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case "critical":
        return "🚨";
      case "high":
        return "⚠️";
      case "medium":
        return "⚡";
      default:
        return "ℹ️";
    }
  };

  if (loading) return <div className="loading">Đang tải cảnh báo...</div>;
  if (error) return <div className="error">Lỗi: {error}</div>;

  return (
    <div className={`weather-alerts ${className}`}>
      <div className="alerts-header">
        <h3>⚠️ Cảnh báo thời tiết & thủy văn ({days} ngày qua)</h3>
        <div className="alerts-summary">
          <span className="critical">Nghiêm trọng: {summary.critical || 0}</span>
          <span className="high">Cao: {summary.high || 0}</span>
          <span className="medium">Trung bình: {summary.medium || 0}</span>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="no-alerts">
          <p>✅ Không có cảnh báo nào trong {days} ngày qua</p>
        </div>
      ) : (
        <div className="alerts-list">
          {alerts.slice(0, 10).map((alert, index) => (
            <div
              key={index}
              className="alert-item"
              style={{
                borderLeft: `4px solid ${getSeverityColor(alert.severity)}`,
              }}>
              <div className="alert-header">
                <span className="alert-icon">{getSeverityIcon(alert.severity)}</span>
                <span className="alert-date">{alert.alert_date}</span>
                <span className={`alert-severity ${alert.severity}`}>
                  {alert.severity === "critical" ? "Nghiêm trọng" : alert.severity === "high" ? "Cao" : "Trung bình"}
                </span>
              </div>
              <div className="alert-content">
                <h5>{alert.alert_description}</h5>
                <p>
                  {alert.value} {alert.unit} - {alert.category}
                </p>
              </div>
            </div>
          ))}

          {alerts.length > 10 && (
            <div className="more-alerts">
              <p>... và {alerts.length - 10} cảnh báo khác</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Monthly Trends Component
 */
export const MonthlyTrends = ({period = "monthly", year, stationType = "weather", className = ""}) => {
  const {data, loading, error} = useMonthlyStats(period, year, stationType);

  const chartData = useMemo(() => {
    return data
      .filter((item) => item.data_type === stationType || stationType === "all")
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((item) => ({
        period: item.period,
        year: item.year,
        month: item.month,
        rainfall: item.total_rainfall ? parseFloat(item.total_rainfall) : null,
        temperature: item.avg_temperature ? parseFloat(item.avg_temperature) : null,
        rainyDays: item.rainy_days || null,
        waterLevelNB: item.avg_water_level_nb ? parseFloat(item.avg_water_level_nb) : null,
        waterLevelPA: item.avg_water_level_pa ? parseFloat(item.avg_water_level_pa) : null,
      }));
  }, [data, stationType]);

  if (loading) return <div className="loading">Đang tải xu hướng...</div>;
  if (error) return <div className="error">Lỗi: {error}</div>;

  return (
    <div className={`monthly-trends ${className}`}>
      <div className="trends-header">
        <h3>📈 Xu hướng {period === "monthly" ? "theo tháng" : "theo năm"}</h3>
      </div>

      <div className="trends-chart">
        {chartData.map((item, index) => (
          <div
            key={index}
            className="trend-item">
            <div className="trend-period">{period === "monthly" ? `${item.month}/${item.year}` : item.year}</div>

            {item.rainfall !== null && (
              <div className="trend-data">
                <span className="label">Mưa:</span>
                <span className="value">{item.rainfall}mm</span>
              </div>
            )}

            {item.temperature !== null && (
              <div className="trend-data">
                <span className="label">Nhiệt độ:</span>
                <span className="value">{item.temperature}°C</span>
              </div>
            )}

            {item.waterLevelNB !== null && (
              <div className="trend-data">
                <span className="label">Mực nước NB:</span>
                <span className="value">{item.waterLevelNB}cm</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Summary Stats Component
 */
export const HydroSummary = ({startDate, endDate, className = ""}) => {
  const {data, loading, error} = useHydroSummary(startDate, endDate);

  if (loading) return <div className="loading">Đang tải thống kê tổng quan...</div>;
  if (error) return <div className="error">Lỗi: {error}</div>;
  if (!data) return <div className="no-data">Không có dữ liệu</div>;

  return (
    <div className={`hydro-summary ${className}`}>
      <div className="summary-header">
        <h3>📋 Thống kê tổng quan</h3>
        {startDate && endDate && (
          <p>
            Từ {startDate} đến {endDate}
          </p>
        )}
      </div>

      <div className="summary-grid">
        <div className="summary-card">
          <h4>🏢 Hệ thống</h4>
          <div className="summary-stats">
            <p>
              Tổng số trạm: <strong>{data.summary.total_stations}</strong>
            </p>
            <p>
              Bản ghi khí tượng: <strong>{data.summary.total_weather_records}</strong>
            </p>
            <p>
              Bản ghi thủy văn: <strong>{data.summary.total_hydro_records}</strong>
            </p>
          </div>
        </div>

        <div className="summary-card">
          <h4>🌧️ Thời tiết</h4>
          <div className="summary-stats">
            <p>
              Mưa TB toàn vùng: <strong>{data.weather.rainfall.average_total}mm</strong>
            </p>
            <p>
              Mưa lớn nhất: <strong>{data.weather.rainfall.maximum_total}mm</strong>
            </p>
            <p>
              Nhiệt độ TB: <strong>{data.weather.temperature.average}°C</strong>
            </p>
            <p>
              Nhiệt độ cao nhất: <strong>{data.weather.temperature.maximum}°C</strong>
            </p>
          </div>
        </div>

        <div className="summary-card">
          <h4>🌊 Thủy văn</h4>
          <div className="summary-stats">
            <p>
              Mực nước TB (Nhà Bè): <strong>{data.hydrology.water_level_nb.average}cm</strong>
            </p>
            <p>
              Mực nước cao nhất (Nhà Bè): <strong>{data.hydrology.water_level_nb.maximum}cm</strong>
            </p>
            <p>
              Mực nước TB (Phú An): <strong>{data.hydrology.water_level_pa.average}cm</strong>
            </p>
            <p>
              Mực nước cao nhất (Phú An): <strong>{data.hydrology.water_level_pa.maximum}cm</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ================================
// UTILITY FUNCTIONS
// ================================

/**
 * Format date for API calls
 */
export const formatDate = (date) => {
  return new Date(date).toISOString().split("T")[0];
};

/**
 * Get date range presets
 */
export const getDateRangePresets = () => {
  const today = new Date();

  return {
    "7days": {
      startDate: formatDate(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)),
      endDate: formatDate(today),
      label: "7 ngày qua",
    },
    "30days": {
      startDate: formatDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)),
      endDate: formatDate(today),
      label: "30 ngày qua",
    },
    "90days": {
      startDate: formatDate(new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)),
      endDate: formatDate(today),
      label: "90 ngày qua",
    },
    thisMonth: {
      startDate: formatDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      endDate: formatDate(today),
      label: "Tháng này",
    },
    lastMonth: {
      startDate: formatDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      endDate: formatDate(new Date(today.getFullYear(), today.getMonth(), 0)),
      label: "Tháng trước",
    },
  };
};

/**
 * Export all components and hooks
 */
export default {
  // Hooks
  useHydroSummary,
  useRainfallStats,
  useHydroDashboard,
  useWeatherAlerts,
  useMonthlyStats,

  // Components
  HydroDashboard,
  RainfallStatsChart,
  WeatherAlerts,
  MonthlyTrends,
  HydroSummary,

  // Utils
  formatDate,
  getDateRangePresets,
};
