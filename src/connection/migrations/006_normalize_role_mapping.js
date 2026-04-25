module.exports = {
  name: "006_normalize_role_mapping",
  async up(QueryDatabase) {
    await QueryDatabase(`
      CREATE TABLE IF NOT EXISTS public.roles (
        id SMALLINT PRIMARY KEY,
        slug VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL
      );
    `);

    // Ensure baseline rows exist (old or new environments)
    await QueryDatabase(`
      INSERT INTO public.roles (id, slug, name) VALUES
        (-1, 'anonymous', 'Chưa đăng nhập'),
        (0, 'guest', 'Khách'),
        (1, 'admin', 'Quản trị viên'),
        (2, 'technician', 'Kĩ thuật viên')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Remap IDs with ON UPDATE CASCADE effect to users.role:
    // old: 0=guest,1=admin,2=technician -> new: 0=admin,1=technician,2=guest
    await QueryDatabase(`UPDATE public.roles SET id = 10 WHERE id = 0;`);
    await QueryDatabase(`UPDATE public.roles SET id = 11 WHERE id = 1;`);
    await QueryDatabase(`UPDATE public.roles SET id = 12 WHERE id = 2;`);

    await QueryDatabase(`UPDATE public.roles SET id = 0 WHERE id = 11;`);
    await QueryDatabase(`UPDATE public.roles SET id = 1 WHERE id = 12;`);
    await QueryDatabase(`UPDATE public.roles SET id = 2 WHERE id = 10;`);

    // Normalize role metadata to match new IDs
    await QueryDatabase(`
      UPDATE public.roles
      SET slug = 'admin', name = 'Quản trị viên'
      WHERE id = 0;
    `);

    await QueryDatabase(`
      UPDATE public.roles
      SET slug = 'technician', name = 'Kĩ thuật viên'
      WHERE id = 1;
    `);

    await QueryDatabase(`
      UPDATE public.roles
      SET slug = 'guest', name = 'Khách'
      WHERE id = 2;
    `);

    // Keep only expected role IDs
    await QueryDatabase(`
      DELETE FROM public.roles
      WHERE id NOT IN (-1, 0, 1, 2);
    `);
  },
};
