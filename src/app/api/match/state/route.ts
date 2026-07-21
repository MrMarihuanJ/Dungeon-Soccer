// GET /api/match/state?id=... - retorna estado completo da partida
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id obrigatório.' }, { status: 400 })

  const match = await db.match.findUnique({
    where: { id },
    include: {
      homeUser: { select: { id: true, username: true, displayName: true, wins: true, losses: true, draws: true, xp: true } },
      awayUser: { select: { id: true, username: true, displayName: true, wins: true, losses: true, draws: true, xp: true } },
    },
  })
  if (!match) return NextResponse.json({ ok: false, error: 'Partida não encontrada.' }, { status: 404 })

  // Verifica permissão
  if (match.homeUserId !== session.userId && match.awayUserId !== session.userId) {
    return NextResponse.json({ ok: false, error: 'Sem acesso a esta partida.' }, { status: 403 })
  }

  return NextResponse.json({
    ok: true,
    match: {
      ...match,
      events: JSON.parse(match.eventsJson),
    },
  })
}
