// =====================================================================
// POST /api/auth/logout
// Limpa o cookie de sessão admin.
// =====================================================================

import { NextResponse } from 'next/server'
import { buildClearCookieHeader } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.headers.set('Set-Cookie', buildClearCookieHeader())
  return res
}
