// POST /api/match/create - cria nova partida contra amigo
// Body: { opponentId: string }
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const opponentId = String(body.opponentId ?? '')
  if (!opponentId) return NextResponse.json({ ok: false, error: 'opponentId obrigatório.' }, { status: 400 })

  // Verifica se são amigos
  const friendship = await db.friendship.findFirst({
    where: {
      OR: [
        { userAId: session.userId, userBId: opponentId },
        { userAId: opponentId, userBId: session.userId },
      ],
    },
  })
  if (!friendship) {
    return NextResponse.json({ ok: false, error: 'Você só pode jogar com amigos.' }, { status: 403 })
  }

  // Cria a partida
  const match = await db.match.create({
    data: {
      homeUserId: session.userId,  // quem criou é o "Home"
      awayUserId: opponentId,
      status: 'COIN_FLIP',
    },
  })

  return NextResponse.json({
    ok: true,
    match: {
      id: match.id,
      status: match.status,
      homeUserId: match.homeUserId,
      awayUserId: match.awayUserId,
    },
  })
}
