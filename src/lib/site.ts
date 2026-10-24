/** The public address of the site, used for search engines and link previews. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
).replace(/\/$/, "");

export const SITE_NAME = "BMSCE Room Management";
export const SITE_DESCRIPTION =
  "BMSCE Room Management: live classroom allotment, free classrooms and room booking for the Department of Machine Learning, B.M.S. College of Engineering, Bengaluru.";
