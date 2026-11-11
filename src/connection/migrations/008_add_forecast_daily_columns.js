// Them cot luu gia tri DailyForecast (du bao theo ngay, LeadDay) ben canh cot
// cu (do_man - du bao theo moc 2h) de UI co the hien ca 2.
const {FORECAST_VALUE_COLUMNS} = require("../../configs/forecastStations");

module.exports = {
  name: "008_add_forecast_daily_columns",
  async up(QueryDatabase) {
    for (const col of FORECAST_VALUE_COLUMNS) {
      await QueryDatabase(`
        ALTER TABLE forecast_system.forecast_values
        ADD COLUMN IF NOT EXISTS "${col}_Daily" NUMERIC(6, 2);
      `);
    }
  },
};
