// =====================================================================
// POST /api/match/action - processa uma ação na partida
// --------------------------------------------------------------------
// Body:
//   { matchId, type: 'COIN_FLIP' | 'PLAY_ACTION', coinChoice?, action? }
//
// COIN_FLIP: joga a moeda, define startingSide, muda status pra IN_PROGRESS
// PLAY_ACTION: processa a ação escolhida, atualiza placar/posse/progress
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import {
  flipCoin, coinToPossession, resolveAction, applyActionToState,
  createInitialMatchState, GAME_MODE_CONFIG,
  checkMatchEndCondition, isHalftimeReached, isTimeExpired,
  type MatchState, type CoinResult, type TeamMatchState, type GameMode,
} from '@/lib/match-engine'
import type { FootballAction } from '@/lib/dnd-actions'
import { ALL_ACTIONS } from '@/lib/dnd-actions'
import { ensureDbSync } from '@/lib/db-sync'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  await ensureDbSync()

  const body = await req.json().catch(() => ({}))
  const matchId = String(body.matchId ?? '')
  const type = String(body.type ?? '')

  if (!matchId || !type) {
    return NextResponse.json({ ok: false, error: 'matchId e type obrigatórios.' }, { status: 400 })
  }

  const match = await db.match.findUnique({ where: { id: matchId } })
  if (!match) return NextResponse.json({ ok: false, error: 'Partida não encontrada.' }, { status: 404 })
  if (match.homeUserId !== session.userId && (match.awayUserId !== null && match.awayUserId !== session.userId)) {
    return NextResponse.json({ ok: false, error: 'Sem acesso.' }, { status: 403 })
  }
  // During WAITING phase (awayUserId null), only homeUser can perform COIN_FLIP
  if (match.awayUserId === null && type !== 'COIN_FLIP') {
    return NextResponse.json({ ok: false, error: 'Oponente ainda não entrou na partida.' }, { status: 400 })
  }
  if (match.status === 'FINISHED') {
    return NextResponse.json({ ok: false, error: 'Partida já encerrada.' }, { status: 400 })
  }
  if (match.status === 'WAITING') {
    return NextResponse.json({ ok: false, error: 'A partida ainda está esperando o oponente entrar.' }, { status: 400 })
  }

  // ===== Validação de turno: só o jogador com posse pode submeter PLAY_ACTION =====
  // BUG FIX: Always validate turn, even when currentPossession is null.
  // Previously, the condition `match.currentPossession` (truthy check) skipped
  // validation when currentPossession was null, allowing any player to submit
  // actions. Now we default to HOME if null, and always validate.
  //
  // EXCEPTION: For offline matches (vs bot), the home user submits actions
  // for BOTH sides. The bot doesn't have a real session, so we allow the
  // home user to submit when it's the bot's turn.
  if (type === 'PLAY_ACTION') {
    const currentPossession = match.currentPossession || 'HOME'
    const expectedUserId = currentPossession === 'HOME' ? match.homeUserId : (match.awayUserId ?? '')

    // For offline matches: home user can submit bot's actions too
    const isOfflineMatch = match.isOffline || false
    const BOT_USER_ID = 'BOT_PLAYER_DUNGEON_SOCER_001'

    if (!isOfflineMatch || session.userId !== match.homeUserId) {
      // Normal validation: only the player with possession can submit
      if (session.userId !== expectedUserId) {
        return NextResponse.json({
          ok: false,
          error: 'Não é seu turno. Espere o oponente jogar.',
          currentPossession: match.currentPossession,
        }, { status: 400 })
      }
    }
    // Offline + home user: always allowed (they control the bot too)
  }

  const gameMode = (match.gameMode || 'QUICK_MATCH') as GameMode
  const modeConfig = GAME_MODE_CONFIG[gameMode]

  // ===== Verifica tempo expirado (para modos com timer) =====
  if (type === 'PLAY_ACTION' && modeConfig.durationMs > 0 && match.matchStartedAt) {
    if (isTimeExpired({
      gameMode,
      matchStartedAt: match.matchStartedAt,
      pausedAt: match.pausedAt,
      totalPausedMs: match.totalPausedMs || 0,
      halftimeTaken: match.halftimeTaken || false,
      secondHalfStartedAt: match.secondHalfStartedAt,
    })) {
      // Tempo expirou — finaliza a partida
      let winner: string | null = null
      if (match.homeScore > match.awayScore) winner = 'HOME'
      else if (match.awayScore > match.homeScore) winner = 'AWAY'
      else winner = 'DRAW'

      await db.match.update({
        where: { id: matchId },
        data: { status: 'FINISHED', winner },
      })

      // Atualiza W/L/D e XP
      await updateUserStats(match.homeUserId, match.awayUserId ?? '', winner, modeConfig)

      return NextResponse.json({
        ok: true,
        timeExpired: true,
        newState: {
          status: 'FINISHED',
          currentPossession: match.currentPossession,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          homeProgress: match.homeProgress,
          awayProgress: match.awayProgress,
          turnCount: match.turnCount,
          winner,
          gameMode,
          matchEndReason: 'Tempo esgotado!',
        },
      })
    }
  }

  // ===== Verifica intervalo (FULL_90) =====
  if (type === 'PLAY_ACTION' && gameMode === 'FULL_90' && match.matchStartedAt && !match.halftimeTaken) {
    if (isHalftimeReached({
      gameMode,
      matchStartedAt: match.matchStartedAt,
      pausedAt: match.pausedAt,
      totalPausedMs: match.totalPausedMs || 0,
      halftimeTaken: false,
    })) {
      // Entra no intervalo
      await db.match.update({
        where: { id: matchId },
        data: { status: 'HALFTIME', pausedAt: new Date() },
      })

      return NextResponse.json({
        ok: true,
        halftimeReached: true,
        newState: {
          status: 'HALFTIME',
          currentPossession: match.currentPossession,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          homeProgress: match.homeProgress,
          awayProgress: match.awayProgress,
          turnCount: match.turnCount,
          winner: null,
          gameMode,
        },
      })
    }
  }

  // ===== COIN_FLIP =====
  if (type === 'COIN_FLIP') {
    if (match.status !== 'COIN_FLIP') {
      return NextResponse.json({ ok: false, error: 'Moeda já foi lançada.' }, { status: 400 })
    }
    const coin = flipCoin()
    const startingSide = coinToPossession(coin)

    try {
      await db.match.update({
        where: { id: matchId },
        data: {
          status: 'IN_PROGRESS',
          coinResult: coin,
          startingUserId: startingSide === 'HOME' ? match.homeUserId : match.awayUserId,
          currentPossession: startingSide,
          matchStartedAt: new Date(),
          turnStartedAt: new Date(),
        },
      })
    } catch (err) {
      console.error('[match/action] coin flip update error:', err)
      return NextResponse.json({ ok: false, error: 'Erro ao atualizar partida.' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      coinResult: coin,
      startingSide,
      startingUserId: startingSide === 'HOME' ? match.homeUserId : match.awayUserId,
      currentPossession: startingSide,
      gameMode,
    })
  }

  // ===== PLAY_ACTION =====
  if (type === 'PLAY_ACTION') {
    if (match.status !== 'IN_PROGRESS') {
      return NextResponse.json({ ok: false, error: 'Partida não está em andamento.' }, { status: 400 })
    }

    const actionInput = body.action as FootballAction | undefined
    if (!actionInput || !actionInput.id) {
      return NextResponse.json({ ok: false, error: 'action obrigatória.' }, { status: 400 })
    }

    // Valida que a ação existe na nossa biblioteca (evita trapaça)
    const action = ALL_ACTIONS.find((a) => a.id === actionInput.id)
    if (!action) {
      return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 })
    }

    // Reconstrói o estado a partir do banco
    const defaultTeamState: TeamMatchState = {
      substitutionsUsed: 0, maxSubstitutions: 5, redCards: 0, yellowCards: 0,
      injuredPlayers: [], sentOffPlayers: [],
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

    const state: MatchState = {
      matchId: match.id,
      status: match.status as MatchState['status'],
      coinResult: match.coinResult as CoinResult | null,
      startingSide: match.startingUserId === match.homeUserId ? 'HOME' : (match.awayUserId === match.startingUserId ? 'AWAY' : null),
      currentPossession: (match.currentPossession as 'HOME' | 'AWAY') || 'HOME',
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

    // Player names para narrativa (enviados pelo cliente)
    const playerName = body.playerName ? String(body.playerName) : undefined
    const targetPlayerName = body.targetPlayerName ? String(body.targetPlayerName) : undefined

    // Processa a jogada
    const roll = resolveAction(action)
    const newState = applyActionToState(state, action, roll, playerName, targetPlayerName)
    const lastEvent = newState.events[newState.events.length - 1]

    // Atualiza a partida no banco
    const updateData: any = {
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
    }

    if (newState.status === 'FINISHED') {
      updateData.status = 'FINISHED'
      updateData.winner = newState.winner
      // Atualiza W/L/D dos usuários com XP baseado no modo
      await updateUserStats(match.homeUserId, match.awayUserId ?? '', newState.winner, modeConfig)
    }

    try {
      await db.match.update({ where: { id: matchId }, data: updateData })
    } catch (err) {
      console.error('[match/action] update error:', err)
      return NextResponse.json({ ok: false, error: 'Erro ao salvar jogada. Tente novamente.' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      event: lastEvent,
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

  return NextResponse.json({ ok: false, error: 'type inválido.' }, { status: 400 })
}

// ===== Helper: atualizar W/L/D e XP baseado no modo de jogo =====
async function updateUserStats(
  homeUserId: string,
  awayUserId: string,
  winner: string | null,
  modeConfig: typeof GAME_MODE_CONFIG['QUICK_MATCH'],
) {
  if (winner === 'HOME') {
    await db.user.update({ where: { id: homeUserId }, data: { wins: { increment: 1 }, xp: { increment: modeConfig.xpWin } } })
    await db.user.update({ where: { id: awayUserId }, data: { losses: { increment: 1 }, xp: { increment: modeConfig.xpLose } } })
  } else if (winner === 'AWAY') {
    await db.user.update({ where: { id: awayUserId }, data: { wins: { increment: 1 }, xp: { increment: modeConfig.xpWin } } })
    await db.user.update({ where: { id: homeUserId }, data: { losses: { increment: 1 }, xp: { increment: modeConfig.xpLose } } })
  } else {
    await db.user.update({ where: { id: homeUserId }, data: { draws: { increment: 1 }, xp: { increment: modeConfig.xpDraw } } })
    await db.user.update({ where: { id: awayUserId }, data: { draws: { increment: 1 }, xp: { increment: modeConfig.xpDraw } } })
  }
}
