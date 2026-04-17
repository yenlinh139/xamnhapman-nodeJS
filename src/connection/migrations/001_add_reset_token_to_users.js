module.exports = {
  name: "001_add_reset_token_to_users",
  async up(QueryDatabase) {
    await QueryDatabase(`
      ALTER TABLE public.users
        ADD COLUMN IF NOT EXISTS reset_token character varying(200) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ DEFAULT NULL;
    `);
  },
};
