module.exports = {
  name: "002_add_email_verify_token_to_users",
  async up(QueryDatabase) {
    await QueryDatabase(`
      ALTER TABLE public.users
        ADD COLUMN IF NOT EXISTS email_verify_token character varying(200) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS email_verify_token_expires TIMESTAMPTZ DEFAULT NULL;
    `);
  },
};
