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
  createInitialMatchState, type MatchState, type CoinResult, type TeamMatchState,
} from '@/lib/match-engine'
import type { FootballAction } from '@/lib/dnd-actions'
import { ALL_ACTIONS } from '@/lib/dnd-actions'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const matchId = String(body.matchId ?? '')
  const type = String(body.type ?? '')

  if (!matchId || !type) {
    return NextResponse.json({ ok: false, error: 'matchId e type obrigatórios.' }, { status: 400 })
  }

  const match = await db.match.findUnique({ where: { id: matchId } })
  if (!match) return NextResponse.json({ ok: false, error: 'Partida não encontrada.' }, { status: 404 })
  if (match.homeUserId !== session.userId && match.awayUserId !== session.userId) {
    return NextResponse.json({ ok: false, error: 'Sem acesso.' }, { status: 403 })
  }
  if (match.status === 'FINISHED') {
    return NextResponse.json({ ok: false, error: 'Partida já encerrada.' }, { status: 400 })
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
        },
      })
    } catch (err) {
      console.error('[match/action] coin flip update error:', err)
      return NextResponse.json({ ok: false, error: 'Erro ao atualizar partida. Verifique se o banco está atualizado.' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      coinResult: coin,
      startingSide,
      startingUserId: startingSide === 'HOME' ? match.homeUserId : match.awayUserId,
      currentPossession: startingSide,
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

    const isHome = match.homeUserId === session.userId
    const currentSide = (match.currentPossession as 'HOME' | 'AWAY') || 'HOME'

    // Reconstrói o estado a partir do banco (agora com progresso persistido!)
    const defaultTeamState: TeamMatchState = {
      substitutionsUsed: 0, maxSubstitutions: 5, redCards: 0, yellowCards: 0,
      injuredPlayers: [], sentOffPlayers: [],
    }

    let homeTeamState = defaultTeamState
    let awayTeamState = defaultTeamState

    // Parse team states from JSON
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
      startingSide: match.startingUserId === match.homeUserId ? 'HOME' : match.awayUserId === match.startingUserId ? 'AWAY' : null,
      currentPossession: currentSide,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      homeProgress: match.homeProgress ?? 0,
      awayProgress: match.awayProgress ?? 0,
      turnCount: match.turnCount,
      maxTurns: 24,
      events: JSON.parse(match.eventsJson),
      winner: null,
      homeTeamState,
      awayTeamState,
    }

    // Processa a jogada
    const roll = resolveAction(action)
    const newState = applyActionToState(state, action, roll)
    const lastEvent = newState.events[newState.events.length - 1]

    // Atualiza a partida no banco (agora persistindo progresso e team states!)
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
    }
    if (newState.status === 'FINISHED') {
      updateData.status = 'FINISHED'
      updateData.winner = newState.winner
      // Atualiza W/L/D dos usuários
      if (newState.winner === 'HOME') {
        await db.user.update({ where: { id: match.homeUserId }, data: { wins: { increment: 1 }, xp: { increment: 50 } } })
        await db.user.update({ where: { id: match.awayUserId }, data: { losses: { increment: 1 }, xp: { increment: 10 } } })
      } else if (newState.winner === 'AWAY') {
        await db.user.update({ where: { id: match.awayUserId }, data: { wins: { increment: 1 }, xp: { increment: 50 } } })
        await db.user.update({ where: { id: match.homeUserId }, data: { losses: { increment: 1 }, xp: { increment: 10 } } })
      } else {
        await db.user.update({ where: { id: match.homeUserId }, data: { draws: { increment: 1 }, xp: { increment: 20 } } })
        await db.user.update({ where: { id: match.awayUserId }, data: { draws: { increment: 1 }, xp: { increment: 20 } } })
      }
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
      },
    })
  }

  return NextResponse.json({ ok: false, error: 'type inválido.' }, { status: 400 })
}
