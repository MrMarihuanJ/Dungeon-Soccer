// =====================================================================
// POST /api/user/register
// Body: { username, email, password, displayName? }
// Cria novo usuário e faz login automático (seta cookie)
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import {
  createUser,
  validateEmail,
  validatePassword,
  signUserToken,
  buildUserCookieHeader,
  findUserByEmailOrUsername,
} from '@/lib/user-auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const username = String(body.username ?? '').trim()
    const email = String(body.email ?? '').trim()
    const password = String(body.password ?? '')
    const displayName = String(body.displayName ?? '').trim() || username

    // Validações
    if (!username || username.length < 3) {
      return NextResponse.json(
        { ok: false, error: 'Usuário deve ter ao menos 3 caracteres.' },
        { status: 400 },
      )
    }
    if (username.length > 30) {
      return NextResponse.json({ ok: false, error: 'Usuário muito longo.' }, { status: 400 })
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return NextResponse.json(
        { ok: false, error: 'Usuário só pode conter letras, números, _, . e -.' },
        { status: 400 },
      )
    }

    const emailCheck = validateEmail(email)
    if (!emailCheck.ok) {
      return NextResponse.json({ ok: false, error: emailCheck.error }, { status: 400 })
    }

    const passCheck = validatePassword(password)
    if (!passCheck.ok) {
      return NextResponse.json({ ok: false, error: passCheck.error }, { status: 400 })
    }

    // Verifica duplicidade
    const existing = await findUserByEmailOrUsername(identifierForDup(email, username))
    if (existing) {
      if (existing.email === email.toLowerCase()) {
        return NextResponse.json({ ok: false, error: 'Email já cadastrado.' }, { status: 409 })
      }
      return NextResponse.json({ ok: false, error: 'Nome de usuário já existe.' }, { status: 409 })
    }

    // Cria usuário
    const user = await createUser({ email, username, password, displayName })

    // Cria time primário vazio para o usuário
    await db.userTeam.create({
      data: {
        userId: user.id,
        name: 'Meu Time',
        formation: '4-3-3',
        starters: '{}',
        reserves: '[]',
        isPrimary: true,
      },
    })

    // Login automático
    const token = signUserToken({ userId: user.id, username: user.username, email: user.email })
    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, username: user.username, email: user.email, displayName: user.displayName },
    })
    res.headers.set('Set-Cookie', buildUserCookieHeader(token))
    return res
  } catch (err) {
    console.error('[user/register] erro:', err)
    return NextResponse.json({ ok: false, error: 'Erro interno no cadastro.' }, { status: 500 })
  }
}

// Helper: busca por email OU username (para detectar duplicidade)
function identifierForDup(email: string, username: string): string {
  // findUserByEmailOrUsername faz OR, basta passar um dos dois — passamos o email
  // mas a função busca ambos. Aqui apenas retornamos o email.
  return email
}
