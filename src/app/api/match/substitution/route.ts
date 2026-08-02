// =====================================================================
// POST /api/match/substitution - persiste uma substituição no banco
// --------------------------------------------------------------------
// Body:
//   { matchId, outPlayerId, inPlayerId, isForced }
//
// CORREÇÕES APLICADAS:
//   - C3: Agora é efetivamente chamado pelo cliente (SubstitutionModal
//     e MatchArena.handleSubstitution).
//   - C7-style: Autorização via `isParticipant` (sem bypass em awayUserId null).
//   - H4: Optimistic concurrency via version field.
//   - Limite de 5: Táticas e por lesão contam no mesmo contador.
//   - Quando limite é atingido e há lesão: jogador fica UNAVAILABLE
//     (não retorna a campo), time joga com um a menos.
//   - Validações anti-cheat:
//     * outPlayerId deve estar ACTIVE
//     * inPlayerId deve estar RESERVE
//     * Não pode substituir jogador já substituído/expulso/lesionado
//     * Não pode entrar reserva já usado
//   - Usa a máquina de estados (player-match-state.ts) para transições.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { TeamMatchState } from '@/lib/match-engine'
import {
  normalizeTeamState,
  performSubstitution,
  markPlayerUnavailable,
  getPlayerStatus,
  isSubstitutionLimitReached,
  getRemainingSubstitutions,
  type ExtendedTeamMatchState,
} from '@/lib/player-match-state'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const matchId = String(body.matchId ?? '')
  const outPlayerId = String(body.outPlayerId ?? '').trim()
  const inPlayerId = String(body.inPlayerId ?? '').trim()
  const isForced = Boolean(body.isForced ?? false)

  if (!matchId) {
    return NextResponse.json({ ok: false, error: 'matchId obrigatório.' }, { status: 400 })
  }

  const match = await db.match.findUnique({ where: { id: matchId } })
  if (!match) return NextResponse.json({ ok: false, error: 'Partida não encontrada.' }, { status: 404 })

  // FIX H1: Autorização correta
  const isParticipant =
    match.homeUserId === session.userId ||
    (match.awayUserId !== null && match.awayUserId === session.userId)
  if (!isParticipant) {
    return NextResponse.json({ ok: false, error: 'Sem acesso a esta partida.' }, { status: 403 })
  }
  if (match.status === 'FINISHED') {
    return NextResponse.json({ ok: false, error: 'Partida já encerrada.' }, { status: 400 })
  }
  if (match.status !== 'IN_PROGRESS' && match.status !== 'PAUSED' && match.status !== 'HALFTIME') {
    return NextResponse.json({ ok: false, error: 'Partida não está em andamento.' }, { status: 400 })
  }

  const isHome = match.homeUserId === session.userId

  // Parse team state
  const defaultTeamState: TeamMatchState = {
    substitutionsUsed: 0, maxSubstitutions: 5, redCards: 0, yellowCards: 0,
    injuredPlayers: [], sentOffPlayers: [],
  }

  let teamState: ExtendedTeamMatchState = defaultTeamState
  const stateJson = isHome ? match.homeTeamStateJson : match.awayTeamStateJson
  try {
    if (stateJson && stateJson !== '{}') {
      teamState = normalizeTeamState(JSON.parse(stateJson) as TeamMatchState)
    } else {
      teamState = normalizeTeamState(defaultTeamState)
    }
  } catch { /* use default */ }

  // ===== Validação: limite de substituições =====
  if (isSubstitutionLimitReached(teamState)) {
    if (isForced && outPlayerId) {
      // Lesão após limite esgotado: jogador fica UNAVAILABLE, time joga com 1 a menos.
      const outStatus = getPlayerStatus(teamState, outPlayerId)
      if (outStatus !== 'ACTIVE' && outStatus !== 'INJURED') {
        return NextResponse.json({
          ok: false,
          error: `Jogador não pode ser processado: status = ${outStatus}.`,
        }, { status: 400 })
      }
      const updatedState = markPlayerUnavailable(teamState, outPlayerId)
      try {
        await db.match.update({
          where: { id: matchId, version: match.version },
          data: {
            ...(isHome ? { homeTeamStateJson: JSON.stringify(updatedState) } : { awayTeamStateJson: JSON.stringify(updatedState) }),
            version: { increment: 1 },
          },
        })
      } catch (err) {
        console.error('[match/substitution] concurrency conflict:', err)
        return NextResponse.json(
          { ok: false, error: 'Conflito de concorrência. Recarregue e tente novamente.' },
          { status: 409 },
        )
      }
      return NextResponse.json({
        ok: true,
        playedWithLess: true,
        message: 'Limite de substituições atingido. Time joga com um jogador a menos.',
        substitutionsUsed: updatedState.substitutionsUsed,
        maxSubstitutions: updatedState.maxSubstitutions,
        remaining: 0,
        teamState: updatedState,
      })
    }
    return NextResponse.json({
      ok: false,
      error: `Limite de ${teamState.maxSubstitutions} substituições atingido. Nenhuma substituição adicional é permitida.`,
      substitutionsUsed: teamState.substitutionsUsed,
      maxSubstitutions: teamState.maxSubstitutions,
    }, { status: 400 })
  }

  // ===== Validações de input =====
  if (!outPlayerId || !inPlayerId) {
    return NextResponse.json({
      ok: false,
      error: 'outPlayerId e inPlayerId são obrigatórios.',
    }, { status: 400 })
  }

  if (outPlayerId === inPlayerId) {
    return NextResponse.json({
      ok: false,
      error: 'Não é possível substituir um jogador por ele mesmo.',
    }, { status: 400 })
  }

  // ===== Aplicar substituição via máquina de estados =====
  try {
    const updatedState = performSubstitution(
      teamState,
      outPlayerId,
      inPlayerId,
      match.turnCount,
      isForced,
    )

    // Persistir com optimistic concurrency
    try {
      await db.match.update({
        where: { id: matchId, version: match.version },
        data: {
          ...(isHome ? { homeTeamStateJson: JSON.stringify(updatedState) } : { awayTeamStateJson: JSON.stringify(updatedState) }),
          version: { increment: 1 },
        },
      })
    } catch (err) {
      console.error('[match/substitution] concurrency conflict:', err)
      return NextResponse.json(
        { ok: false, error: 'Conflito de concorrência. Recarregue e tente novamente.' },
        { status: 409 },
      )
    }

    return NextResponse.json({
      ok: true,
      playedWithLess: false,
      substitutionsUsed: updatedState.substitutionsUsed,
      maxSubstitutions: updatedState.maxSubstitutions,
      remaining: getRemainingSubstitutions(updatedState),
      teamState: updatedState,
      outPlayerId,
      inPlayerId,
      isForced,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao processar substituição.'
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}
