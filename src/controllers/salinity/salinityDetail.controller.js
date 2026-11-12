// CRUD cho hochiminh."DoManChiTiet" (tung lan do thuc te, co ngay+gio) - dung cho trang quan tri
// "Diem do man" moi (sua truc tiep tung lan do thay vi 1 dong/ngay nhu truoc). Sau moi
// them/sua/xoa, TU DONG tinh lai gia tri trung binh/ngay o hochiminh."DoMan"/"ChiSoNuoc" (bang
// dang nuoi bieu do cong khai) de bieu do luon khop voi du lieu chi tiet.
const QueryDatabase = require("../../utils/queryDatabase");
const logger = require("../../loggers/loggers.config");

const VALID_SALINITY_STATIONS = ["CRT", "CTT", "COT", "CKC", "KXAH", "MNB", "PCL", "KXD2"];

const avg = (arr) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

// Tinh lai trung binh/ngay cho 1 (tram, ngay) tu toan bo cac dong "DoManChiTiet" cua ngay+tram
// do (gio VN), roi UPSERT vao DoMan/ChiSoNuoc - hoac xoa/null hoa neu ngay do khong con dong nao.
const recomputeDailyAggregate = async (kiHieu, isoDate) => {
  const detailResult = await QueryDatabase(
    `
      SELECT "DoMan", "pH", "DoDanDien", "DoDuc"
      FROM hochiminh."DoManChiTiet"
      WHERE "KiHieu" = $1 AND ("ThoiDiem" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $2::date
    `,
    [kiHieu, isoDate],
  );

  const rows = detailResult.rows;
  const doManAvg = avg(rows.map((r) => r.DoMan).filter((v) => v !== null).map(Number));
  const phAvg = avg(rows.map((r) => r.pH).filter((v) => v !== null).map(Number));
  const ecAvg = avg(rows.map((r) => r.DoDanDien).filter((v) => v !== null).map(Number));
  const turbidityAvg = avg(rows.map((r) => r.DoDuc).filter((v) => v !== null).map(Number));

  // hochiminh."DoMan": UPSERT 1 cot (theo dung ten tram) cho dong ung voi "Ngày" nay.
  const existingDoManRow = await QueryDatabase(
    `SELECT 1 FROM hochiminh."DoMan" WHERE "Ngày" = $1::date`,
    [isoDate],
  );
  if (existingDoManRow.rowCount > 0) {
    await QueryDatabase(
      `UPDATE hochiminh."DoMan" SET "${kiHieu}" = $1 WHERE "Ngày" = $2::date`,
      [doManAvg, isoDate],
    );
  } else if (doManAvg !== null) {
    await QueryDatabase(
      `INSERT INTO hochiminh."DoMan" ("Ngày", "${kiHieu}") VALUES ($1::date, $2)`,
      [isoDate, doManAvg],
    );
  }

  // hochiminh."ChiSoNuoc": UPSERT theo PK (Ngay, KiHieu), hoac xoa neu ca 3 chi so deu khong con.
  if (phAvg !== null || ecAvg !== null || turbidityAvg !== null) {
    await QueryDatabase(
      `
        INSERT INTO hochiminh."ChiSoNuoc" ("Ngày", "KiHieu", "pH", "DoDanDien", "DoDuc")
        VALUES ($1::date, $2, $3, $4, $5)
        ON CONFLICT ("Ngày", "KiHieu")
        DO UPDATE SET "pH" = $3, "DoDanDien" = $4, "DoDuc" = $5
      `,
      [isoDate, kiHieu, phAvg, ecAvg, turbidityAvg],
    );
  } else {
    await QueryDatabase(`DELETE FROM hochiminh."ChiSoNuoc" WHERE "Ngày" = $1::date AND "KiHieu" = $2`, [
      isoDate,
      kiHieu,
    ]);
  }
};

// Ngay VN (YYYY-MM-DD) cua 1 moc ThoiDiem - dung de biet ngay nao can tinh lai sau khi sua/xoa.
const toVNIsoDate = async (thoiDiem) => {
  const result = await QueryDatabase(
    `SELECT ($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d`,
    [thoiDiem],
  );
  return result.rows[0]?.d;
};

// GET /api/salinity-detail?kihieu=&startDate=&endDate=&page=&limit=
const GetSalinityDetailList = async (req, reply) => {
  try {
    const {kihieu, startDate, endDate, page = 1, limit = 50} = req.query;

    if (kihieu && !VALID_SALINITY_STATIONS.includes(kihieu)) {
      return reply.code(400).send({code: 400, message: "Ký hiệu không hợp lệ"});
    }

    const limitVal = Math.min(Math.max(parseInt(limit) || 50, 1), 500);
    const pageVal = Math.max(parseInt(page) || 1, 1);
    const offsetVal = (pageVal - 1) * limitVal;

    const where = [];
    const params = [];
    if (kihieu) {
      params.push(kihieu);
      where.push(`"KiHieu" = $${params.length}`);
    }
    if (startDate) {
      params.push(startDate);
      where.push(`"ThoiDiem" >= $${params.length}::date`);
    }
    if (endDate) {
      params.push(endDate);
      where.push(`"ThoiDiem" < $${params.length}::date + interval '1 day'`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [dataResult, countResult] = await Promise.all([
      QueryDatabase(
        `
          SELECT id, "ThoiDiem", "KiHieu", "DoMan", "pH", "DoDanDien", "DoDuc"
          FROM hochiminh."DoManChiTiet"
          ${whereSql}
          ORDER BY "ThoiDiem" DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `,
        [...params, limitVal, offsetVal],
      ),
      QueryDatabase(`SELECT COUNT(*) AS total FROM hochiminh."DoManChiTiet" ${whereSql}`, params),
    ]);

    const total = parseInt(countResult.rows[0]?.total || 0);

    return reply.code(200).send({
      code: 200,
      data: dataResult.rows,
      pagination: {
        page: pageVal,
        limit: limitVal,
        total,
        totalPages: Math.ceil(total / limitVal),
      },
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// GET /api/salinity-detail/range/:kihieu - khoang ngay+gio hien co cua 1 tram, dung de khoa
// date-time picker khi them/sua o trang quan tri (khong cho chon ngoai khoang nay).
const GetSalinityDetailRange = async (req, reply) => {
  try {
    const {kihieu} = req.params;
    if (!VALID_SALINITY_STATIONS.includes(kihieu)) {
      return reply.code(400).send({code: 400, message: "Ký hiệu không hợp lệ"});
    }

    const result = await QueryDatabase(
      `SELECT MIN("ThoiDiem") AS min_time, MAX("ThoiDiem") AS max_time, COUNT(*) AS total
       FROM hochiminh."DoManChiTiet" WHERE "KiHieu" = $1`,
      [kihieu],
    );

    return reply.code(200).send({
      code: 200,
      kihieu,
      minTime: result.rows[0]?.min_time || null,
      maxTime: result.rows[0]?.max_time || null,
      total: parseInt(result.rows[0]?.total || 0),
    });
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// POST /api/salinity-detail
const CreateSalinityDetail = async (req, reply) => {
  try {
    const {ThoiDiem, KiHieu, DoMan, pH, DoDanDien, DoDuc} = req.body;

    if (!ThoiDiem || !KiHieu) {
      return reply.code(400).send({code: 400, message: "Thiếu Thời điểm hoặc ký hiệu điểm đo"});
    }
    if (!VALID_SALINITY_STATIONS.includes(KiHieu)) {
      return reply.code(400).send({code: 400, message: "Ký hiệu không hợp lệ"});
    }

    const result = await QueryDatabase(
      `
        INSERT INTO hochiminh."DoManChiTiet" ("ThoiDiem", "KiHieu", "DoMan", "pH", "DoDanDien", "DoDuc")
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, "ThoiDiem", "KiHieu", "DoMan", "pH", "DoDanDien", "DoDuc"
      `,
      [ThoiDiem, KiHieu, DoMan ?? null, pH ?? null, DoDanDien ?? null, DoDuc ?? null],
    );

    const isoDate = await toVNIsoDate(ThoiDiem);
    await recomputeDailyAggregate(KiHieu, isoDate);

    return reply.code(201).send({code: 201, message: "Thêm bản ghi thành công", data: result.rows[0]});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// PUT /api/salinity-detail/:id
const UpdateSalinityDetail = async (req, reply) => {
  try {
    const {id} = req.params;
    const {ThoiDiem, KiHieu, DoMan, pH, DoDanDien, DoDuc} = req.body;

    if (KiHieu && !VALID_SALINITY_STATIONS.includes(KiHieu)) {
      return reply.code(400).send({code: 400, message: "Ký hiệu không hợp lệ"});
    }

    const existing = await QueryDatabase(
      `SELECT "ThoiDiem", "KiHieu", "DoMan", "pH", "DoDanDien", "DoDuc"
       FROM hochiminh."DoManChiTiet" WHERE id = $1`,
      [id],
    );
    if (existing.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy bản ghi"});
    }
    const oldRow = existing.rows[0];

    // Chi ghi de truong nao duoc gui len (!== undefined) - truong bi BO QUA trong body thi GIU
    // NGUYEN gia tri cu (khong tu dong xoa ve null), de sua 1 truong khong lam mat 3 truong kia.
    const nextThoiDiem = ThoiDiem !== undefined ? ThoiDiem : oldRow.ThoiDiem;
    const nextKiHieu = KiHieu !== undefined ? KiHieu : oldRow.KiHieu;
    const nextDoMan = DoMan !== undefined ? DoMan : oldRow.DoMan;
    const nextPH = pH !== undefined ? pH : oldRow.pH;
    const nextDoDanDien = DoDanDien !== undefined ? DoDanDien : oldRow.DoDanDien;
    const nextDoDuc = DoDuc !== undefined ? DoDuc : oldRow.DoDuc;

    const result = await QueryDatabase(
      `
        UPDATE hochiminh."DoManChiTiet"
        SET "ThoiDiem" = $1, "KiHieu" = $2, "DoMan" = $3, "pH" = $4, "DoDanDien" = $5, "DoDuc" = $6
        WHERE id = $7
        RETURNING id, "ThoiDiem", "KiHieu", "DoMan", "pH", "DoDanDien", "DoDuc"
      `,
      [
        nextThoiDiem,
        nextKiHieu,
        nextDoMan,
        nextPH,
        nextDoDanDien,
        nextDoDuc,
        id,
      ],
    );
    const updated = result.rows[0];

    const oldIsoDate = await toVNIsoDate(oldRow.ThoiDiem);
    const newIsoDate = await toVNIsoDate(updated.ThoiDiem);

    await recomputeDailyAggregate(oldRow.KiHieu, oldIsoDate);
    if (oldRow.KiHieu !== updated.KiHieu || oldIsoDate !== newIsoDate) {
      await recomputeDailyAggregate(updated.KiHieu, newIsoDate);
    }

    return reply.code(200).send({code: 200, message: "Cập nhật thành công", data: updated});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

// DELETE /api/salinity-detail/:id
const DeleteSalinityDetail = async (req, reply) => {
  try {
    const {id} = req.params;

    const result = await QueryDatabase(
      `DELETE FROM hochiminh."DoManChiTiet" WHERE id = $1 RETURNING "ThoiDiem", "KiHieu"`,
      [id],
    );
    if (result.rowCount === 0) {
      return reply.code(404).send({code: 404, message: "Không tìm thấy bản ghi"});
    }

    const {ThoiDiem, KiHieu} = result.rows[0];
    const isoDate = await toVNIsoDate(ThoiDiem);
    await recomputeDailyAggregate(KiHieu, isoDate);

    return reply.code(200).send({code: 200, message: "Xóa bản ghi thành công"});
  } catch (error) {
    logger.error(error);
    return reply.code(500).send({code: 500, message: "Lỗi máy chủ"});
  }
};

module.exports = {
  GetSalinityDetailList,
  GetSalinityDetailRange,
  CreateSalinityDetail,
  UpdateSalinityDetail,
  DeleteSalinityDetail,
};
