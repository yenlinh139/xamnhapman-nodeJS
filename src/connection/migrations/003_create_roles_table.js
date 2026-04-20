module.exports = {
  name: "003_create_roles_table",
  async up(QueryDatabase) {
    // Tạo bảng roles
    await QueryDatabase(`
      CREATE TABLE IF NOT EXISTS public.roles (
        id        SMALLINT     PRIMARY KEY,
        slug      VARCHAR(50)  NOT NULL UNIQUE,
        name      VARCHAR(100) NOT NULL
      );
    `);

    // Seed dữ liệu vai trò
    await QueryDatabase(`
      INSERT INTO public.roles (id, slug, name) VALUES
        (-1, 'anonymous',   'Chưa đăng nhập'),
        ( 0, 'guest',       'Khách'),
        ( 2, 'technician',  'Kĩ thuật viên'),
        ( 1, 'admin',       'Quản trị viên')
      ON CONFLICT (id) DO NOTHING;
    `);

    // FK từ users.role → roles.id
    await QueryDatabase(`
      ALTER TABLE public.users
        ADD CONSTRAINT fk_users_role
        FOREIGN KEY (role) REFERENCES public.roles(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
        NOT VALID;
    `);
  },
};
