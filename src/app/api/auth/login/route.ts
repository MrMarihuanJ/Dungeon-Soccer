// =====================================================================
// POST /api/auth/login
// Body: { username: string, password: string }
// Sucesso (200): { ok: true, user: { username } } + cookie HTTP-only
// Falha (401): { ok: false, error: string }
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { verifyCredentials, signToken, buildCookieHeader } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const username = String(body.username ?? '').trim()
    const password = String(body.password ?? '')

    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: 'Informe usuário e senha.' },
        { status: 400 },
      )
    }

    if (!verifyCredentials(username, password)) {
      // Pequeno delay para dificultar brute-force
      await new Promise((r) => setTimeout(r, 400))
      return NextResponse.json(
        { ok: false, error: 'Usuário ou senha incorretos.' },
        { status: 401 },
      )
    }

    const token = signToken({ username })
    const res = NextResponse.json({
      ok: true,
      user: { username, role: 'admin' as const },
    })
    res.headers.set('Set-Cookie', buildCookieHeader(token))
    return res
  } catch (err) {
    console.error('[auth/login] erro:', err)
    return NextResponse.json(
      { ok: false, error: 'Erro interno no login.' },
      { status: 500 },
    )
  }
}
