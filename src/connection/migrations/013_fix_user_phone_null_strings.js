// hochiminh."DoMan"/"KhiTuong"/"ThuyVan" khong phai bang duy nhat gap loi luu NULL duoi dang
// chuoi van ban: "users".phone cung co truong hop bi luu la chuoi "null"/"undefined" (vd qua
// createUser.controller.js truoc khi sua, khi client gui phone: null hoac khong gui gi va code
// cu lam `escape(req.body.phone)` -> "null"/"undefined" dang chuoi that). Chuan hoa lai ve NULL
// that de hien thi dung (bang quan tri tai khoan) va de cac so sanh "IS NOT NULL" hoat dong dung.
module.exports = {
  name: "013_fix_user_phone_null_strings",
  async up(QueryDatabase) {
    await QueryDatabase(`UPDATE "users" SET phone = NULL WHERE LOWER(phone) IN ('null', 'undefined');`);
  },
};
