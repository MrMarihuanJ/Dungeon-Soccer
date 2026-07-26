// =====================================================================
// POST /api/match/substitution - persiste uma substituição no banco
// --------------------------------------------------------------------
// Body:
//   { matchId, outPlayerId, inPlayerId, isForced }
//
// Atualiza o teamStateJson (homeTeamStateJson ou awayTeamStateJson)
// incrementando substitutionsUsed e removendo o jogador lesionado
// da lista de injuredPlayers, se houver.
//
// Isso garante que a contagem de substituições seja persistida corretamente
// entre jogadas, inclusive quando a substituição é por lesão.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import type { TeamMatchState } from '@/lib/match-engine'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const matchId = String(body.matchId ?? '')
  const outPlayerId = String(body.outPlayerId ?? '')
  const inPlayerId = String(body.inPlayerId ?? '')
  const isForced = Boolean(body.isForced ?? false)

  if (!matchId) {
    return NextResponse.json({ ok: false, error: 'matchId obrigatório.' }, { status: 400 })
  }

  const match = await db.match.findUnique({ where: { id: matchId } })
  if (!match) return NextResponse.json({ ok: false, error: 'Partida não encontrada.' }, { status: 404 })
  if (match.homeUserId !== session.userId && match.awayUserId !== session.userId) {
    return NextResponse.json({ ok: false, error: 'Sem acesso.' }, { status: 403 })
  }
  if (match.status === 'FINISHED') {
    return NextResponse.json({ ok: false, error: 'Partida já encerrada.' }, { status: 400 })
  }

  const isHome = match.homeUserId === session.userId

  // Parse team states from JSON
  const defaultTeamState: TeamMatchState = {
    substitutionsUsed: 0, maxSubstitutions: 5, redCards: 0, yellowCards: 0,
    injuredPlayers: [], sentOffPlayers: [],
  }

  let teamState: TeamMatchState = defaultTeamState

  const stateJson = isHome ? match.homeTeamStateJson : match.awayTeamStateJson
  try {
    if (stateJson && stateJson !== '{}') {
      teamState = JSON.parse(stateJson) as TeamMatchState
    }
  } catch { /* use default */ }

  // Verificar limite de substituições
  if (teamState.substitutionsUsed >= teamState.maxSubstitutions) {
    // Se for lesão e já atingiu limite, o time joga com um a menos
    // Retornamos sucesso mas indicamos que não foi possível substituir
    if (isForced) {
      // Remover o jogador lesionado da lista de injuredPlayers
      // (ele sai do campo mas nenhum reserva entra)
      if (outPlayerId) {
        teamState.injuredPlayers = teamState.injuredPlayers.filter(id => id !== outPlayerId)
      }
      const updatedJson = JSON.stringify(teamState)
      await db.match.update({
        where: { id: matchId },
        data: isHome ? { homeTeamStateJson: updatedJson } : { awayTeamStateJson: updatedJson },
      })
      return NextResponse.json({
        ok: true,
        playedWithLess: true,
        message: 'Limite atingido. Time joga com um jogador a menos.',
        teamState,
      })
    }
    return NextResponse.json({ ok: false, error: 'Limite de 5 substituições atingido.' }, { status: 400 })
  }

  // Incrementar contagem de substituições
  teamState.substitutionsUsed += 1

  // Remover jogador lesionado da lista de injuredPlayers
  if (outPlayerId) {
    teamState.injuredPlayers = teamState.injuredPlayers.filter(id => id !== outPlayerId)
  }

  // Persistir no banco
  const updatedJson = JSON.stringify(teamState)
  try {
    await db.match.update({
      where: { id: matchId },
      data: isHome ? { homeTeamStateJson: updatedJson } : { awayTeamStateJson: updatedJson },
    })
  } catch (err) {
    console.error('[match/substitution] update error:', err)
    return NextResponse.json({ ok: false, error: 'Erro ao salvar substituição.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    playedWithLess: false,
    substitutionsUsed: teamState.substitutionsUsed,
    maxSubstitutions: teamState.maxSubstitutions,
    teamState,
  })
}
