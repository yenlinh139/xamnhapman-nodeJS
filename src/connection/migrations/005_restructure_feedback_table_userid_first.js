module.exports = {
  name: "005_restructure_feedback_table_userid_first",
  async up(QueryDatabase) {
    await QueryDatabase(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    await QueryDatabase(`
      UPDATE public.users
      SET id = uuid_generate_v4()
      WHERE id IS NULL;
    `);

    // Backfill user_id lần cuối từ email (nếu còn dữ liệu cũ)
    await QueryDatabase(`
      UPDATE public.feedbacks f
      SET user_id = u.id
      FROM public.users u
      WHERE f.user_id IS NULL
        AND f.email IS NOT NULL
        AND LOWER(f.email) = LOWER(u.email);
    `);

    // Chuẩn hóa email thiếu để có thể map user_id cho dữ liệu legacy
    await QueryDatabase(`
      UPDATE public.feedbacks
      SET email = CONCAT('legacy-feedback-', id, '@local.invalid')
      WHERE user_id IS NULL
        AND (email IS NULL OR TRIM(email) = '');
    `);

    // Tạo user legacy cho các feedback chưa map được user_id
    await QueryDatabase(`
      INSERT INTO public.users (id, email, name, role)
      SELECT
        uuid_generate_v4(),
        f.email,
        COALESCE(NULLIF(TRIM(f.name), ''), CONCAT('Legacy User ', f.id::text)),
        0
      FROM public.feedbacks f
      WHERE f.user_id IS NULL
        AND f.email IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.users u
          WHERE LOWER(u.email) = LOWER(f.email)
        );
    `);

    // Map lại user_id sau khi đã tạo legacy users
    await QueryDatabase(`
      UPDATE public.feedbacks f
      SET user_id = u.id
      FROM public.users u
      WHERE f.user_id IS NULL
        AND f.email IS NOT NULL
        AND LOWER(f.email) = LOWER(u.email);
    `);

    // Không cho phép mất liên kết user
    await QueryDatabase(`
      DO $$
      DECLARE missing_user_count INTEGER;
      BEGIN
        SELECT COUNT(*) INTO missing_user_count
        FROM public.feedbacks
        WHERE user_id IS NULL;

        IF missing_user_count > 0 THEN
          RAISE EXCEPTION 'feedbacks contains % rows without user_id. Please clean data before migration 005.', missing_user_count;
        END IF;
      END $$;
    `);

    // Đổi tên bảng cũ để tạo lại bảng mới theo đúng thứ tự cột: id, user_id, ...
    await QueryDatabase(`
      ALTER TABLE public.feedbacks RENAME TO feedbacks_old;
    `);

    await QueryDatabase(`
      CREATE TABLE public.feedbacks (
        id SERIAL PRIMARY KEY,
        user_id uuid NOT NULL,
        feedback_type VARCHAR(30) NOT NULL DEFAULT 'Khác',
        content TEXT NOT NULL,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(30) NOT NULL DEFAULT 'Chưa xem',
        CONSTRAINT feedbacks_feedback_type_check
          CHECK (feedback_type IN ('Báo cáo lỗi', 'Cải thiện hệ thống', 'Khác')),
        CONSTRAINT feedbacks_status_check
          CHECK (status IN ('Chưa xem', 'Đã xem', 'Đang giải quyết', 'Đã giải quyết')),
        CONSTRAINT fk_feedbacks_user_id
          FOREIGN KEY (user_id) REFERENCES public.users(id)
          ON UPDATE CASCADE
          ON DELETE NO ACTION
      );
    `);

    await QueryDatabase(`
      INSERT INTO public.feedbacks (id, user_id, feedback_type, content, image_url, created_at, status)
      SELECT
        id,
        user_id,
        COALESCE(feedback_type, 'Khác'),
        COALESCE(content, message, ''),
        image_url,
        COALESCE(created_at, CURRENT_TIMESTAMP),
        COALESCE(status, 'Chưa xem')
      FROM public.feedbacks_old;
    `);

    await QueryDatabase(`
      SELECT setval(
        pg_get_serial_sequence('public.feedbacks', 'id'),
        COALESCE((SELECT MAX(id) FROM public.feedbacks), 1),
        true
      );
    `);

    await QueryDatabase(`
      DROP TABLE public.feedbacks_old;
    `);
  },
};
