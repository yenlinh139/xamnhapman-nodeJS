// Them cot nhiet do (Ttb/Tx/Tm) cho 2 tram khi tuong Mac Dinh Chi (MDC) va Nha Be (NB_KT), hien chi
// co cot luong mua (R_MDC/R_NB). Chua co du lieu lich su -> cot de trong, admin nhap dan tu gio.
module.exports = {
  name: "021_add_mdc_nb_meteo_temperature_columns",
  async up(QueryDatabase) {
    await QueryDatabase(`ALTER TABLE hochiminh."KhiTuong" ADD COLUMN IF NOT EXISTS "Ttb_MDC" TEXT;`);
    await QueryDatabase(`ALTER TABLE hochiminh."KhiTuong" ADD COLUMN IF NOT EXISTS "Tx_MDC" TEXT;`);
    await QueryDatabase(`ALTER TABLE hochiminh."KhiTuong" ADD COLUMN IF NOT EXISTS "Tm_MDC" TEXT;`);
    await QueryDatabase(`ALTER TABLE hochiminh."KhiTuong" ADD COLUMN IF NOT EXISTS "Ttb_NB" TEXT;`);
    await QueryDatabase(`ALTER TABLE hochiminh."KhiTuong" ADD COLUMN IF NOT EXISTS "Tx_NB" TEXT;`);
    await QueryDatabase(`ALTER TABLE hochiminh."KhiTuong" ADD COLUMN IF NOT EXISTS "Tm_NB" TEXT;`);
  },
};
