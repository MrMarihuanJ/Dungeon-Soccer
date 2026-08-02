// =====================================================================
// POST /api/user/login
// Body: { identifier: string (email ou username), password: string }
// Autentica usuário e seta cookie HTTP-only
// --------------------------------------------------------------------
// Após autenticação bem-sucedida, atualiza `lastLoginAt` no banco.
// Este campo é a fonte confiável (server-side) usada pelo cron
// /api/cron/cleanup-inactive para excluir contas inativas (>180 dias).
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

    // Atualiza lastLoginAt APÓS autenticação bem-sucedida.
    // Não confiaremos em timestamps do cliente — apenas do servidor.
    // Tratamos falha de update como não-fatal: o login ainda é válido,
    // apenas o cron de cleanup pode não funcionar para este usuário
    // até o próximo login bem-sucedido.
    try {
      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
    } catch (updateErr) {
      console.error('[user/login] falha ao atualizar lastLoginAt:', updateErr)
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
        xp: user.xp,
      },
    })
    res.headers.set('Set-Cookie', buildUserCookieHeader(token))
    return res
  } catch (err) {
    console.error('[user/login] erro:', err)
    return NextResponse.json({ ok: false, error: 'Erro interno no login.' }, { status: 500 })
  }
}
