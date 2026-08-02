// GET /api/match/state?id=... - retorna estado completo da partida
// --------------------------------------------------------------------
// Inclui pendingPenaltyEventJson (para o cliente do cobrador abrir o
// FreeKickDialog) e os campos de controle (xpGranted, version).
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import type { TeamMatchState } from '@/lib/match-engine'
import { ensureDbSync } from '@/lib/db-sync'
import { deserializePendingFreeKick } from '@/lib/free-kick-system'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  try {
    await ensureDbSync()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[match/state] DB sync failed:', msg.slice(0, 200))
  }

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

  // FIX H1: Autorização correta — participante OU home (se offline)
  const isParticipant =
    match.homeUserId === session.userId ||
    (match.awayUserId !== null && match.awayUserId === session.userId)
  if (!isParticipant) {
    return NextResponse.json({ ok: false, error: 'Sem acesso a esta partida.' }, { status: 403 })
  }

  // Parse team states
  const defaultTeamState: TeamMatchState = {
    substitutionsUsed: 0, maxSubstitutions: 5, redCards: 0, yellowCards: 0,
    injuredPlayers: [], sentOffPlayers: [], substitutedOut: [],
  }

  let homeTeamState = defaultTeamState
  let awayTeamState = defaultTeamState

  try {
    if (match.homeTeamStateJson && match.homeTeamStateJson !== '{}') {
      homeTeamState = JSON.parse(match.homeTeamStateJson) as TeamMatchState
    }
  } catch { /* use default */ }
  try {
    if (match.awayTeamStateJson && match.awayTeamStateJson !== '{}') {
      awayTeamState = JSON.parse(match.awayTeamStateJson) as TeamMatchState
    }
  } catch { /* use default */ }

  // Decodifica o pending free kick (se houver) para o cliente saber abrir o dialog
  const pendingFreeKick = deserializePendingFreeKick(match.pendingPenaltyEventJson)

  return NextResponse.json({
    ok: true,
    match: {
      ...match,
      events: JSON.parse(match.eventsJson),
      homeProgress: match.homeProgress ?? 0,
      awayProgress: match.awayProgress ?? 0,
      homeTeamState,
      awayTeamState,
      // pendingPenaltyEventJson é exposto apenas ao cliente correto (o cobrador)
      pendingFreeKick:
        pendingFreeKick && pendingFreeKick.favoredPossession === (match.homeUserId === session.userId ? 'HOME' : 'AWAY')
          ? {
              multiplier: pendingFreeKick.assignment.multiplier,
              taker: pendingFreeKick.assignment.taker,
              nonce: pendingFreeKick.assignment.nonce,
              favoredPossession: pendingFreeKick.favoredPossession,
              penaltyType: pendingFreeKick.penaltyEvent.type,
              description: pendingFreeKick.penaltyEvent.description,
            }
          : null,
      matchEndReason: match.status === 'FINISHED'
        ? (match.winner === 'DRAW' ? 'Empate!' : `Vitória de ${match.winner === 'HOME' ? match.homeUser?.username || 'Home' : match.awayUser?.username || 'Away'}!`)
        : '',
    },
  })
}
