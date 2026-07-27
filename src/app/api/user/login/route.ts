// =====================================================================
// POST /api/user/login
// Body: { identifier: string (email ou username), password: string }
// Autentica usuário e seta cookie HTTP-only
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import {
  findUserByEmailOrUsername,
  verifyPassword,
  signUserToken,
  buildUserCookieHeader,
} from '@/lib/user-auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const identifier = String(body.identifier ?? '').trim()
    const password = String(body.password ?? '')

    if (!identifier || !password) {
      return NextResponse.json(
        { ok: false, error: 'Informe usuário/email e senha.' },
        { status: 400 },
      )
    }

    const user = await findUserByEmailOrUsername(identifier)
    if (!user || !verifyPassword(password, user.passwordHash)) {
      await new Promise((r) => setTimeout(r, 400)) // anti brute-force
      return NextResponse.json(
        { ok: false, error: 'Credenciais inválidas.' },
        { status: 401 },
      )
    }

    // ===== CORREÇÃO v3: registra último login — base para exclusão de inativos =====
    // O cron /api/cron/cleanup-inactive deleta usuários com lastLoginAt > 180 dias.
    // Atualizamos de forma não-bloqueante: se falhar (ex.: coluna ainda não existe
    // em dev), o login ainda assim proceeds.
    try {
      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
    } catch (updateErr) {
      console.warn('[user/login] falha ao registrar lastLoginAt (ignorado):', updateErr)
    }

    const token = signUserToken({
      userId: user.id,
      username: user.username,
      email: user.email,
    })

    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        xp: user.xp ?? 0,
        wins: user.wins ?? 0,
        losses: user.losses ?? 0,
        draws: user.draws ?? 0,
      },
    })
    res.headers.set('Set-Cookie', buildUserCookieHeader(token))
    return res
  } catch (err) {
    console.error('[user/login] erro:', err)
    return NextResponse.json({ ok: false, error: 'Erro interno no login.' }, { status: 500 })
  }
}
