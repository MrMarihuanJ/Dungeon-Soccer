// POST /api/user/logout — limpa cookie de sessão do usuário
import { NextResponse } from 'next/server'
import { buildClearUserCookieHeader } from '@/lib/user-auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.headers.set('Set-Cookie', buildClearUserCookieHeader())
  return res
}
