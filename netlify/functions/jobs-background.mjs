// Background function for longer AI jobs (learning a new document format, reading a worksheet with AI).
import { jobKey } from './lib/auth.mjs';
import { runJob } from './lib/jobs.mjs';

export default async (req) => {
  let b = {};
  try { b = await req.json(); } catch { /* ignore */ }
  if (!process.env.APP_SECRET || !b.id || b.key !== jobKey(b.id, 'job')) return new Response('forbidden', { status: 403 });
  await runJob(b.id);
  return new Response('done', { status: 200 });
};
