// Static demonstration only: the checker reads this file without running it.
export const settings = {
  database: process.env.DATABASE_URL,
  apiKey: process.env['API_KEY'],
  port: Number(process.env.PORT ?? '3000')
};
