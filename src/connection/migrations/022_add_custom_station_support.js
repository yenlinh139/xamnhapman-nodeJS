// Ho tro tram/diem MOI them qua nut "Them vi tri" (quan tri du lieu) cho cac lop luu kieu "bang
// rong" (moi tram 1 cot: KhiTuong, ThuyVan, TongLuongXa) va lop "DoMan" cua diem do man (DoManChiTiet
// + DoMan). Tram moi KHONG co cot rieng trong bang chinh thuc nen so lieu nhap vao duoc ghi tam vao
// day; khi dev xac nhan tram hoat dong on dinh se chuyen sang bang chinh (ALTER TABLE + mapping,
// giong migration 018_add_rbl_salinity_station.js) roi xoa cac dong tuong ung o day.
module.exports = {
  name: "022_add_custom_station_support",
  async up(QueryDatabase) {
    // Nhan layer cho tram moi dung chung bang hochiminh."TramKTTV" (mua/khi tuong/thuy van) - bang
    // nay khong co cot phan biet layer nen can bang rieng de biet 1 KiHieu moi thuoc layer nao.
    await QueryDatabase(`
      CREATE TABLE IF NOT EXISTS hochiminh."TramMoiLayer" (
        "KiHieu" TEXT PRIMARY KEY,
        "Layer" TEXT NOT NULL
      );
    `);

    // So lieu cua cac diem/tram MOI: "ThoiDiem" la moc GIO THAT (diem do man) hoac NGAY luc 00:00
    // gio VN (cac lop con lai, chi co do phan giai theo ngay) de dung chung 1 cot cho moi layer.
    await QueryDatabase(`
      CREATE TABLE IF NOT EXISTS hochiminh."SoLieuTramMoi" (
        id SERIAL PRIMARY KEY,
        "Layer" TEXT NOT NULL,
        "KiHieu" TEXT NOT NULL,
        "ThoiDiem" TIMESTAMPTZ NOT NULL,
        "Values" JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE ("Layer", "KiHieu", "ThoiDiem")
      );
    `);
  },
};
