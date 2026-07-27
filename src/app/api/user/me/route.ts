// GET /api/user/me - retorna usuário logado ou 401
// --------------------------------------------------------------------
// CORREÇÃO v3: agora busca no banco e retorna xp/wins/losses/draws
// além dos dados básicos da sessão. Necessário para a UI atualizar a
// barra de XP após o fim de uma partida sem precisar recarregar a página.
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { computeXpLevelInfo } from '@/lib/match-engine'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 })
  }

  // Busca dados frescos no banco (xp pode ter mudado desde a emissão do token)
  let userRow: {
    id: string
    username: string
    email: string
    displayName: string | null
    xp: number
    wins: number
    losses: number
    draws: number
    lastLoginAt: Date | null
  } | null = null

  try {
    userRow = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        xp: true,
        wins: true,
        losses: true,
        draws: true,
        lastLoginAt: true,
      },
    })
  } catch (err) {
    console.warn('[user/me] DB error, caindo para dados do token:', err)
  }

  // Fallback: usa dados do token se o banco estiver indisponível
  if (!userRow) {
    return NextResponse.json({
      ok: true,
      authenticated: true,
      user: {
        id: session.userId,
        username: session.username,
        email: session.email,
        xp: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        level: 1,
      },
    })
  }

  const levelInfo = computeXpLevelInfo(userRow.xp ?? 0)

  return NextResponse.json({
    ok: true,
    authenticated: true,
    user: {
      id: userRow.id,
      username: userRow.username,
      email: userRow.email,
      displayName: userRow.displayName,
      xp: userRow.xp ?? 0,
      wins: userRow.wins ?? 0,
      losses: userRow.losses ?? 0,
      draws: userRow.draws ?? 0,
      level: levelInfo.level,
      lastLoginAt: userRow.lastLoginAt?.toISOString() ?? null,
    },
  })
}
