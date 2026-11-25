// Them cot theo doi lich su chinh sua + xoa mem cho cac bang "tram/diem":
//   - deleted_at : thoi diem xoa mem (NULL = chua xoa). Thay cho hard delete khi nguoi dung bam "Xoa".
//   - updated_at : thoi diem sua gan nhat (NULL = chua tung sua).
//   - updated_by : email nguoi sua gan nhat (NULL = chua tung sua). Du an dung JWT voi payload
//     {name, email, role} (xem utils/generateJWT.js) - KHONG co id so nguoi dung - nen dung email
//     lam dinh danh, giong quy uoc da dung o "bulletin_subscriptions.user_email" (migration 020).
//
// hochiminh."DiemDoMan"/"TramKTTV"/"HoChua": chua co ca 3 cot -> them moi.
// iot_system.iot_stations: DA CO "deleted_at" va "updated_at" tu truoc (xem iot.controller.js) nhung
// chi "updated_at" duoc code dung toi (tu dong set CURRENT_TIMESTAMP khi tao/sua); "deleted_at" co
// san trong schema nhung chua tung duoc ghi (deleteStation dang hard delete) - se chuyen sang dung
// no o buoc sua code, khong can them cot. Chi thieu "updated_by".
module.exports = {
  name: "023_add_station_audit_columns",
  async up(QueryDatabase) {
    const tablesNeedingAllThree = [
      {schema: "hochiminh", table: "DiemDoMan"},
      {schema: "hochiminh", table: "TramKTTV"},
      {schema: "hochiminh", table: "HoChua"},
    ];

    for (const {schema, table} of tablesNeedingAllThree) {
      await QueryDatabase(`ALTER TABLE ${schema}."${table}" ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`);
      await QueryDatabase(`ALTER TABLE ${schema}."${table}" ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;`);
      await QueryDatabase(`ALTER TABLE ${schema}."${table}" ADD COLUMN IF NOT EXISTS updated_by TEXT;`);
    }

    await QueryDatabase(`ALTER TABLE iot_system.iot_stations ADD COLUMN IF NOT EXISTS updated_by TEXT;`);
  },
};
