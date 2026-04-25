module.exports = {
  name: "004_update_feedback_schema",
  async up(QueryDatabase) {
    // Bảo đảm users.id đủ điều kiện làm khóa tham chiếu
    await QueryDatabase(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    await QueryDatabase(`
      UPDATE public.users
      SET id = uuid_generate_v4()
      WHERE id IS NULL;
    `);

    await QueryDatabase(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'public.users'::regclass
            AND conname = 'users_id_key'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'public.users'::regclass
            AND contype = 'p'
            AND conkey = ARRAY[
              (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.users'::regclass AND attname = 'id')
            ]
        ) THEN
          ALTER TABLE public.users
            ADD CONSTRAINT users_id_key UNIQUE (id);
        END IF;
      END $$;
    `);

    // Bổ sung các cột theo format feedback mới
    await QueryDatabase(`
      ALTER TABLE public.feedbacks
        ADD COLUMN IF NOT EXISTS user_id uuid,
        ADD COLUMN IF NOT EXISTS feedback_type VARCHAR(30),
        ADD COLUMN IF NOT EXISTS content TEXT,
        ADD COLUMN IF NOT EXISTS image_url TEXT,
        ADD COLUMN IF NOT EXISTS status VARCHAR(30);
    `);

    // Backfill dữ liệu cũ
    await QueryDatabase(`
      UPDATE public.feedbacks
      SET content = COALESCE(content, message),
          feedback_type = COALESCE(feedback_type, 'Khác'),
          status = COALESCE(status, 'Chưa xem')
      WHERE content IS NULL OR feedback_type IS NULL OR status IS NULL;
    `);

    // Đồng bộ user_id theo email đã có
    await QueryDatabase(`
      UPDATE public.feedbacks f
      SET user_id = u.id
      FROM public.users u
      WHERE f.user_id IS NULL
        AND LOWER(f.email) = LOWER(u.email);
    `);

    // Bỏ unique email để mỗi user có thể gửi nhiều góp ý
    await QueryDatabase(`
      ALTER TABLE public.feedbacks
      DROP CONSTRAINT IF EXISTS feedbacks_email_key;
    `);

    // Bảo đảm default theo format mới
    await QueryDatabase(`
      ALTER TABLE public.feedbacks
        ALTER COLUMN feedback_type SET DEFAULT 'Khác',
        ALTER COLUMN status SET DEFAULT 'Chưa xem';
    `);

    // Ràng buộc loại góp ý
    await QueryDatabase(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'feedbacks_feedback_type_check'
        ) THEN
          ALTER TABLE public.feedbacks
            ADD CONSTRAINT feedbacks_feedback_type_check
            CHECK (feedback_type IN ('Báo cáo lỗi', 'Cải thiện hệ thống', 'Khác'));
        END IF;
      END $$;
    `);

    // Ràng buộc trạng thái
    await QueryDatabase(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'feedbacks_status_check'
        ) THEN
          ALTER TABLE public.feedbacks
            ADD CONSTRAINT feedbacks_status_check
            CHECK (status IN ('Chưa xem', 'Đã xem', 'Đang giải quyết', 'Đã giải quyết'));
        END IF;
      END $$;
    `);

    // FK liên kết feedback -> users theo user_id
    await QueryDatabase(`
      ALTER TABLE public.feedbacks
      DROP CONSTRAINT IF EXISTS fk_feedbacks_user_id;
    `);

    await QueryDatabase(`
      ALTER TABLE public.feedbacks
        ADD CONSTRAINT fk_feedbacks_user_id
        FOREIGN KEY (user_id) REFERENCES public.users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
        NOT VALID;
    `);
  },
};
