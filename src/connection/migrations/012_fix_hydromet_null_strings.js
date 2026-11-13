// hochiminh."KhiTuong"/"ThuyVan" co cung mot loi du lieu cu nhu hochiminh."DoMan" truoc
// migration 010: nhieu cot do luu gia tri NULL duoi dang CHUOI VAN BAN "NULL" (text) thay vi SQL
// NULL that. Vi du R_LS (Long Son) co 2922/12784 dong la chuoi "NULL", R_TTH co 1461/12784 dong.
// Dieu nay khien moi dieu kien "IS NOT NULL" (vd trong GetHydrometeorologyData) khong loai duoc
// nhung dong nay, lam "gia tri moi nhat"/tong so ban ghi tinh nham ca cac dong khong co so lieu
// thuc (hien thi 0mm thay vi bo qua).
//
// Khong doi kieu cot (van giu character varying, vi "Ngay" trong cung bang la text dang
// MM/DD/YYYY, ung dung dang parse cac cot so qua TO_DATE/parseFloat o tang code, khong can doi
// schema) - chi chuan hoa lai dung gia tri NULL.
const KHITUONG_COLUMNS = [
  "R_AP",
  "R_BC",
  "R_CG",
  "R_CL",
  "R_CC",
  "R_HM",
  "R_LMX",
  "R_LS",
  "R_MDC",
  "R_NB",
  "R_PVC",
  "R_TTH",
  "R_TSH",
  "R_TD",
  "Ttb_TSH",
  "Tx_TSH",
  "Tm_TSH",
];
const THUYVAN_COLUMNS = ["Htb_NB", "Hx_NB", "Hm_NB", "Htb_PA", "Hx_PA", "Hm_PA"];

module.exports = {
  name: "012_fix_hydromet_null_strings",
  async up(QueryDatabase) {
    for (const col of KHITUONG_COLUMNS) {
      await QueryDatabase(`UPDATE hochiminh."KhiTuong" SET "${col}" = NULL WHERE "${col}" = 'NULL';`);
    }
    for (const col of THUYVAN_COLUMNS) {
      await QueryDatabase(`UPDATE hochiminh."ThuyVan" SET "${col}" = NULL WHERE "${col}" = 'NULL';`);
    }
  },
};
