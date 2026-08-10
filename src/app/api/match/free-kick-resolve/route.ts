// =====================================================================
// POST /api/match/free-kick-resolve
// --------------------------------------------------------------------
// Body:
//   { matchId, actionId }
//
// O cliente chama este endpoint quando o jogador cobrou uma falta (após
// o FreeKickDialog exibir o multiplicador e o cobrador). O servidor:
//   1. Lê o pendingPenaltyEventJson (multiplicador e cobrador já sorteados).
//   2. Rola o d20 no SERVIDOR (não confia no cliente).
//   3. Aplica o multiplicador (bônus/penalidade) à rolagem.
//   4. Atualiza o estado da partida (progresso, posse, possível gol).
//   5. Limpa o pendingPenaltyEventJson.
//
// Retorna o resultado da cobrança para o cliente animar.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { ensureDbSync } from '@/lib/db-sync'
import {
  resolveAction,
  applyActionToState,
  rollD20,
  GAME_MODE_CONFIG,
  type MatchState, type CoinResult, type TeamMatchState, type GameMode,
} from '@/lib/match-engine'
import type { FootballAction } from '@/lib/dnd-actions'
import { ALL_ACTIONS } from '@/lib/dnd-actions'
import {
  deserializePendingFreeKick,
  applyFreeKickMultiplier,
} from '@/lib/free-kick-system'
import { normalizeTeamState, type ExtendedTeamMatchState } from '@/lib/player-match-state'
import { hydrateTeamStateFromUserId } from '@/lib/team-state-hydration'
import { grantMatchXp } from './../action/grant-xp-helper'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  try {
    await ensureDbSync()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[match/free-kick-resolve] DB sync failed:', msg.slice(0, 200))
  }

  const body = await req.json().catch(() => ({}))
  const matchId = String(body.matchId ?? '')
  const actionId = String(body.actionId ?? '')
  // Para pênaltis, o usuário escolhe o cobrador. Para faltas normais, o
  // cobrador já foi sorteado pelo servidor — takerId é ignorado.
  const takerId = body.takerId ? String(body.takerId) : ''

  if (!matchId || !actionId) {
    return NextResponse.json({ ok: false, error: 'matchId e actionId obrigatórios.' }, { status: 400 })
  }

  const match = await db.match.findUnique({ where: { id: matchId } })
  if (!match) return NextResponse.json({ ok: false, error: 'Partida não encontrada.' }, { status: 404 })

  const isParticipant =
    match.homeUserId === session.userId ||
    (match.awayUserId !== null && match.awayUserId === session.userId)
  if (!isParticipant) {
    return NextResponse.json({ ok: false, error: 'Sem acesso.' }, { status: 403 })
  }

  const pending = deserializePendingFreeKick(match.pendingPenaltyEventJson)
  if (!pending) {
    return NextResponse.json({ ok: false, error: 'Nenhuma cobrança de falta pendente.' }, { status: 400 })
  }

  const favoredSide = pending.favoredPossession
  const isFavoredUser =
    (favoredSide === 'HOME' && match.homeUserId === session.userId) ||
    (favoredSide === 'AWAY' && match.awayUserId === session.userId) ||
    (match.isOffline && session.userId === match.homeUserId)

  if (!isFavoredUser) {
    return NextResponse.json({ ok: false, error: 'Não é sua vez de cobrar.' }, { status: 400 })
  }

  // ===== Determina se é pênalti (escolha do cobrador) ou falta normal =====
  const isPenaltyKick = pending.isPenaltyKick === true || pending.penaltyEvent.type === 'PENALTY_KICK'

  // Valida a ação escolhida
  const action = ALL_ACTIONS.find((a) => a.id === actionId)
  if (!action) {
    return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 })
  }
  if (isPenaltyKick) {
    // Pênalti: só aceita jogadas de pênalti (id começa com 'pk') ou o
    // chute s12 ("Chute na Marca do Pênalti") por compatibilidade.
    const isPenaltyAction = action.id.startsWith('pk') || action.id === 's12'
    if (!isPenaltyAction) {
      return NextResponse.json({
        ok: false,
        error: 'Em pênalti, escolha uma jogada de cobrança de pênalti.',
      }, { status: 400 })
    }
  } else {
    // Falta normal: só aceita jogadas FREE_KICK
    const isFreeKickAction = action.category === 'FREE_KICK'
    if (!isFreeKickAction) {
      return NextResponse.json({
        ok: false,
        error: 'Em cobrança de falta, escolha uma jogada de cobrança.',
      }, { status: 400 })
    }
  }

  // ===== Reconstrói estado =====
  const gameMode = (match.gameMode || 'QUICK_MATCH') as GameMode
  const modeConfig = GAME_MODE_CONFIG[gameMode]
  const defaultTeamState: TeamMatchState = {
    substitutionsUsed: 0, maxSubstitutions: 5, redCards: 0, yellowCards: 0,
    injuredPlayers: [], sentOffPlayers: [],
  }

  let homeTeamState: ExtendedTeamMatchState = defaultTeamState
  let awayTeamState: ExtendedTeamMatchState = defaultTeamState
  try {
    if (match.homeTeamStateJson && match.homeTeamStateJson !== '{}') {
      homeTeamState = normalizeTeamState(JSON.parse(match.homeTeamStateJson) as TeamMatchState)
    }
  } catch { /* default */ }
  try {
    if (match.awayTeamStateJson && match.awayTeamStateJson !== '{}') {
      awayTeamState = normalizeTeamState(JSON.parse(match.awayTeamStateJson) as TeamMatchState)
    }
  } catch { /* default */ }

  // ===== HYDRATION FALLBACK (v3.2) =====
  if ((homeTeamState.playerStates ?? []).length === 0) {
    homeTeamState = await hydrateTeamStateFromUserId(match.homeUserId, homeTeamState)
  }
  if ((awayTeamState.playerStates ?? []).length === 0 && match.awayUserId) {
    awayTeamState = await hydrateTeamStateFromUserId(match.awayUserId, awayTeamState)
  }

  const state: MatchState = {
    matchId: match.id,
    status: match.status as MatchState['status'],
    coinResult: match.coinResult as CoinResult | null,
    startingSide: match.startingUserId === match.homeUserId ? 'HOME' : (match.awayUserId === match.startingUserId ? 'AWAY' : null),
    currentPossession: favoredSide,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    homeProgress: match.homeProgress ?? 0,
    awayProgress: match.awayProgress ?? 0,
    turnCount: match.turnCount,
    maxTurns: modeConfig.maxTurns > 0 ? modeConfig.maxTurns : 999,
    events: JSON.parse(match.eventsJson),
    winner: null,
    homeTeamState,
    awayTeamState,
    gameMode,
    matchStartedAt: match.matchStartedAt,
    pausedAt: match.pausedAt,
    totalPausedMs: match.totalPausedMs || 0,
    halftimeTaken: match.halftimeTaken || false,
    secondHalfStartedAt: match.secondHalfStartedAt,
    xpReward: match.xpReward || modeConfig.xpWin,
    turnStartedAt: match.turnStartedAt,
    matchEndReason: '',
  }

  // ===== Determina cobrador e multiplicador =====
  // Para pênaltis: o usuário ESCOLHEU o cobrador (takerId). Buscamos esse
  // cobrador na lista de elegíveis e usamos o marcador de bônus associado.
  // Para faltas normais: o cobrador foi sorteado automaticamente no action
  // route — usamos `pending.assignment` direto.
  let chosenTaker: { playerId: string; playerName: string; position: string }
  let chosenMultiplier: { value: number; kind: 'BONUS' | 'PENALTY' | 'NEUTRAL'; target: 'SUCCESS_CHANCE' | 'DICE_BONUS' | 'GOAL_CHANCE'; label: string; description: string }

  if (isPenaltyKick) {
    if (!takerId) {
      return NextResponse.json({
        ok: false,
        error: 'takerId é obrigatório para pênalti. Escolha o cobrador.',
      }, { status: 400 })
    }
    // Valida que o takerId está na lista de elegíveis (anti-cheat)
    const prep = pending.penaltyKickPrep
    if (!prep) {
      return NextResponse.json({
        ok: false,
        error: 'Estado de pênalti inválido (sem preparação).',
      }, { status: 400 })
    }
    const option = prep.eligibleTakers.find((t) => t.taker.playerId === takerId)
    if (!option) {
      return NextResponse.json({
        ok: false,
        error: 'Cobrador selecionado não está na lista de elegíveis.',
      }, { status: 400 })
    }
    chosenTaker = option.taker
    chosenMultiplier = option.bonusMarker
  } else {
    // Falta normal — usa assignment pré-existente
    if (!pending.assignment) {
      return NextResponse.json({
        ok: false,
        error: 'Estado de cobrança de falta inválido (sem assignment).',
      }, { status: 400 })
    }
    chosenTaker = pending.assignment.taker
    chosenMultiplier = pending.assignment.multiplier
  }

  // ===== Rola d20 no servidor e aplica multiplicador =====
  const baseDice = rollD20()
  const adjusted = applyFreeKickMultiplier(
    baseDice,
    action.skillBonus,
    action.dc,
    action.goalChance,
    chosenMultiplier,
  )

  let success: boolean
  let exceptional: boolean
  let critical: 'none' | 'crit_hit' | 'crit_fail' = 'none'
  if (adjusted.adjustedDice === 20) {
    critical = 'crit_hit'
    success = true
    exceptional = true
  } else if (adjusted.adjustedDice === 1) {
    critical = 'crit_fail'
    success = false
    exceptional = false
  } else {
    success = adjusted.margin >= 0
    exceptional = adjusted.margin >= 5
  }

  const roll = {
    dice: adjusted.adjustedDice,
    bonus: adjusted.adjustedBonus,
    total: adjusted.total,
    dc: adjusted.adjustedDc,
    margin: adjusted.margin,
    success,
    critical,
    exceptional,
  }

  const newState = applyActionToState(
    state,
    action as FootballAction,
    roll,
    chosenTaker.playerName,
    undefined,
  )

  // Adiciona metadados da cobrança ao último evento
  const lastEvent = newState.events[newState.events.length - 1]
  if (lastEvent) {
    lastEvent.narrative =
      `${chosenMultiplier.label}. ` +
      `${lastEvent.narrative ?? ''}`.trim()
    // Anexa info do multiplicador via cast seguro para extensão ad-hoc
    const ext = lastEvent as unknown as Record<string, unknown>
    ext.freeKickMultiplier = chosenMultiplier
    ext.freeKickTaker = chosenTaker
    if (isPenaltyKick) {
      ext.isPenaltyKick = true
    }
  }

  // ===== Persiste com optimistic concurrency =====
  const updateData: Prisma.MatchUpdateInput = {
    currentPossession: newState.currentPossession,
    homeScore: newState.homeScore,
    awayScore: newState.awayScore,
    turnCount: newState.turnCount,
    homeProgress: newState.homeProgress,
    awayProgress: newState.awayProgress,
    eventsJson: JSON.stringify(newState.events),
    homeTeamStateJson: JSON.stringify(newState.homeTeamState),
    awayTeamStateJson: JSON.stringify(newState.awayTeamState),
    turnStartedAt: new Date(),
    pendingPenaltyEventJson: null,
    version: { increment: 1 },
  }

  if (newState.status === 'FINISHED') {
    updateData.status = 'FINISHED'
    updateData.winner = newState.winner
  }

  try {
    await db.match.update({
      where: { id: matchId, version: match.version },
      data: updateData,
    })
  } catch (err) {
    console.error('[match/free-kick-resolve] concurrency conflict:', err)
    return NextResponse.json(
      { ok: false, error: 'Conflito de concorrência. Recarregue e tente novamente.' },
      { status: 409 },
    )
  }

  if (newState.status === 'FINISHED') {
    await grantMatchXp({
      matchId,
      homeUserId: match.homeUserId,
      awayUserId: match.awayUserId ?? 'BOT_PLAYER_DUNGEON_SOCER_001',
      winner: newState.winner,
      gameMode,
      isOffline: match.isOffline || false,
    })
  }

  return NextResponse.json({
    ok: true,
    event: lastEvent,
    multiplier: chosenMultiplier,
    taker: chosenTaker,
    isPenaltyKick,
    roll,
    newState: {
      status: newState.status,
      currentPossession: newState.currentPossession,
      homeScore: newState.homeScore,
      awayScore: newState.awayScore,
      homeProgress: newState.homeProgress,
      awayProgress: newState.awayProgress,
      turnCount: newState.turnCount,
      winner: newState.winner,
      homeTeamState: newState.homeTeamState,
      awayTeamState: newState.awayTeamState,
      gameMode,
      matchEndReason: newState.matchEndReason,
    },
  })
}
