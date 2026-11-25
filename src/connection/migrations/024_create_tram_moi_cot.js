// Bang mapping cho tram MOI (them qua "Them vi tri") cua 4 lop bang rong rain/meteo/hydro/reservoir:
// moi tram MOI duoc ALTER TABLE them COT THAT ngay luc tao (xem utils/dynamicStationColumns.js),
// ten cot sinh tu dong theo ma tram - bang nay ghi lai "KiHieu + FieldKey nao ung voi ColumnName
// nao, cua Layer nao" de code doc/ghi dung cot, thay cho bang tam SoLieuTramMoi (JSONB, se bi drop
// o migration ke tiep).
module.exports = {
  name: "024_create_tram_moi_cot",
  async up(QueryDatabase) {
    await QueryDatabase(`
      CREATE TABLE IF NOT EXISTS hochiminh."TramMoiCot" (
        id SERIAL PRIMARY KEY,
        "Layer" TEXT NOT NULL,
        "KiHieu" TEXT NOT NULL,
        "FieldKey" TEXT NOT NULL,
        "ColumnName" TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE ("Layer", "KiHieu", "FieldKey")
      );
    `);
  },
};
