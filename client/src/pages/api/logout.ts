import type { APIRoute } from 'astro';
import { SESSION_COOKIE, clearedCookie } from '../../lib/auth';
import { deleteSession } from '../../lib/db';
import { getDb } from '../../lib/env';

export const POST: APIRoute = async ({ cookies }) => {
  const db = getDb();
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token && db) {
    try { await deleteSession(db, token); } catch { /* session stejně končí */ }
  }
  return new Response(null, {
    status: 303,
    headers: { Location: '/client/login', 'Set-Cookie': clearedCookie(), 'Cache-Control': 'no-store' }
  });
};
