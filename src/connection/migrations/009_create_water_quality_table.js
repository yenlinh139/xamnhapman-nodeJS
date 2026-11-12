// Bang luu 3 chi so chat luong nuoc moi (pH, Do dan dien, Do duc) theo tung diem do man,
// tach rieng khoi hochiminh."DoMan" (wide, 1 cot/tram cho rieng do man) vi day la cac thong so
// vat ly khac, do theo tung tram + tung ngay (long format) - thay vi nhan rong them 8 cot/chi so
// vao DoMan. Chua co du lieu that (se duoc nhap sau), cac truy van LEFT JOIN vao bang nay se tra
// ve NULL cho toi khi co du lieu.
module.exports = {
  name: "009_create_water_quality_table",
  async up(QueryDatabase) {
    await QueryDatabase(`
      CREATE TABLE IF NOT EXISTS hochiminh."ChiSoNuoc" (
        "Ngày" DATE NOT NULL,
        "KiHieu" TEXT NOT NULL,
        "pH" NUMERIC(5, 2),
        "DoDanDien" NUMERIC(10, 3),
        "DoDuc" NUMERIC(10, 3),
        PRIMARY KEY ("Ngày", "KiHieu")
      );
    `);
  },
};
