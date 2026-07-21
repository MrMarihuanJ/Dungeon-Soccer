// =====================================================================
// /api/user/team - Salvar/carregar time do usuário logado
// GET    -> retorna o time primário do usuário
// POST   -> salva o time (formation + starters + reserves)
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })
  }

  const team = await db.userTeam.findFirst({
    where: { userId: session.userId, isPrimary: true },
  })

  if (!team) {
    return NextResponse.json({
      ok: true,
      team: { formation: '4-3-3', starters: {}, reserves: [] },
    })
  }

  return NextResponse.json({
    ok: true,
    team: {
      id: team.id,
      name: team.name,
      formation: team.formation,
      starters: JSON.parse(team.starters),
      reserves: JSON.parse(team.reserves),
    },
  })
}

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const formation = String(body.formation ?? '4-3-3')
    const starters = JSON.stringify(body.starters ?? {})
    const reserves = JSON.stringify(body.reserves ?? [])

    // Upsert: se existir um time primário, atualiza; senão, cria
    const existing = await db.userTeam.findFirst({
      where: { userId: session.userId, isPrimary: true },
    })

    if (existing) {
      const updated = await db.userTeam.update({
        where: { id: existing.id },
        data: { formation, starters, reserves },
      })
      return NextResponse.json({ ok: true, teamId: updated.id })
    }

    const created = await db.userTeam.create({
      data: {
        userId: session.userId,
        name: 'Meu Time',
        formation,
        starters,
        reserves,
        isPrimary: true,
      },
    })
    return NextResponse.json({ ok: true, teamId: created.id })
  } catch (err) {
    console.error('[user/team POST] erro:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
