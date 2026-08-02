// =====================================================================
// POST /api/match/action - processa uma ação na partida
// --------------------------------------------------------------------
// Body:
//   { matchId, type: 'COIN_FLIP' | 'PLAY_ACTION', coinChoice?, action?,
//     playerName?, targetPlayerName?, starterIds?, reserveIds? }
//
// CORREÇÕES APLICADAS:
//   - H1: Autorização verifica `isParticipant` corretamente (sem bypass
//     quando awayUserId é null).
//   - H4: Optimistic concurrency via `version` field — se outro request
//     atualizou a Match entre o read e o update, o update falha com 409.
//   - C4: XP é concedido em transação atômica com `WHERE xpGranted = false`.
//     Se a transação não tocar nenhuma linha, XP já foi concedido — não
//     duplica.
//   - H5: W/L/D + XP wrapped em db.$transaction.
//   - FREE_KICK: Quando uma jogada gera `requiresFreeKick`, persiste um
//     `pendingPenaltyEventJson` na Match para o cobrador (mesmo se for AWAY)
//     poder ver e abrir o FreeKickDialog ao pollar.
//   - Player state machine: Quando uma jogada gera cartão vermelho ou lesão,
//     atualiza o estado granular do jogador via player-match-state.ts.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import {
  flipCoin, coinToPossession, resolveAction, applyActionToState,
  createInitialMatchState, GAME_MODE_CONFIG,
  checkMatchEndCondition, isHalftimeReached, isTimeExpired,
  type MatchState, type CoinResult, type TeamMatchState, type GameMode,
} from '@/lib/match-engine'
import type { FootballAction } from '@/lib/dnd-actions'
import { ALL_ACTIONS } from '@/lib/dnd-actions'
import { ensureDbSync } from '@/lib/db-sync'
import {
  normalizeTeamState,
  applyRedCard,
  markPlayerInjured,
  applyYellowCard,
  type ExtendedTeamMatchState,
} from '@/lib/player-match-state'
import { assignFreeKick, serializePendingFreeKick, type PendingFreeKickState } from '@/lib/free-kick-system'
import { grantMatchXp } from './grant-xp-helper'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  try {
    await ensureDbSync()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[match/action] DB sync failed:', msg.slice(0, 200))
    // Don't abort — tables might already exist
  }

  const body = await req.json().catch(() => ({}))
  const matchId = String(body.matchId ?? '')
  const type = String(body.type ?? '')

  if (!matchId || !type) {
    return NextResponse.json({ ok: false, error: 'matchId e type obrigatórios.' }, { status: 400 })
  }

  const match = await db.match.findUnique({ where: { id: matchId } })
  if (!match) return NextResponse.json({ ok: false, error: 'Partida não encontrada.' }, { status: 404 })

  // ===== FIX H1: Autorização correta — participante OU (offline + home) =====
  const isParticipant =
    match.homeUserId === session.userId ||
    (match.awayUserId !== null && match.awayUserId === session.userId)
  if (!isParticipant) {
    return NextResponse.json({ ok: false, error: 'Sem acesso a esta partida.' }, { status: 403 })
  }

  // Durante WAITING (awayUserId null), apenas homeUser pode fazer COIN_FLIP
  if (match.awayUserId === null && type !== 'COIN_FLIP') {
    return NextResponse.json({ ok: false, error: 'Oponente ainda não entrou na partida.' }, { status: 400 })
  }
  if (match.status === 'FINISHED') {
    return NextResponse.json({ ok: false, error: 'Partida já encerrada.' }, { status: 400 })
  }
  if (match.status === 'WAITING') {
    return NextResponse.json({ ok: false, error: 'A partida ainda está esperando o oponente entrar.' }, { status: 400 })
  }

  // ===== Validação de turno =====
  if (type === 'PLAY_ACTION') {
    const currentPossession = match.currentPossession || 'HOME'
    const expectedUserId = currentPossession === 'HOME' ? match.homeUserId : (match.awayUserId ?? '')

    const isOfflineMatch = match.isOffline || false
    const BOT_USER_ID = 'BOT_PLAYER_DUNGEON_SOCER_001'

    if (!isOfflineMatch || session.userId !== match.homeUserId) {
      if (session.userId !== expectedUserId) {
        return NextResponse.json({
          ok: false,
          error: 'Não é seu turno. Espere o oponente jogar.',
          currentPossession: match.currentPossession,
        }, { status: 400 })
      }
    }
  }

  const gameMode = (match.gameMode || 'QUICK_MATCH') as GameMode
  const modeConfig = GAME_MODE_CONFIG[gameMode]

  // ===== Verifica tempo expirado =====
  if (type === 'PLAY_ACTION' && modeConfig.durationMs > 0 && match.matchStartedAt) {
    if (isTimeExpired({
      gameMode,
      matchStartedAt: match.matchStartedAt,
      pausedAt: match.pausedAt,
      totalPausedMs: match.totalPausedMs || 0,
      halftimeTaken: match.halftimeTaken || false,
      secondHalfStartedAt: match.secondHalfStartedAt,
    })) {
      let winner: string | null = null
      if (match.homeScore > match.awayScore) winner = 'HOME'
      else if (match.awayScore > match.homeScore) winner = 'AWAY'
      else winner = 'DRAW'

      // Transação atômica: marca xpGranted=true E atualiza stats E cria XpGrant
      const xpResult = await grantMatchXp({
        matchId,
        homeUserId: match.homeUserId,
        awayUserId: match.awayUserId ?? BOT_USER_ID_FALLBACK,
        winner,
        gameMode,
        isOffline: match.isOffline || false,
      })

      await db.match.update({
        where: { id: matchId },
        data: { status: 'FINISHED', winner, xpGranted: true, version: { increment: 1 } },
      })

      return NextResponse.json({
        ok: true,
        timeExpired: true,
        xpGranted: xpResult.granted,
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
      await db.match.update({
        where: { id: matchId },
        data: { status: 'HALFTIME', pausedAt: new Date(), version: { increment: 1 } },
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
        where: { id: matchId, version: match.version },
        data: {
          status: 'IN_PROGRESS',
          coinResult: coin,
          startingUserId: startingSide === 'HOME' ? match.homeUserId : match.awayUserId,
          currentPossession: startingSide,
          matchStartedAt: new Date(),
          turnStartedAt: new Date(),
          version: { increment: 1 },
        },
      })
    } catch (err) {
      // Conflito de versão = outro request atualizou primeiro
      console.error('[match/action] coin flip conflict:', err)
      return NextResponse.json(
        { ok: false, error: 'Conflito de concorrência. Recarregue e tente novamente.' },
        { status: 409 },
      )
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

    // Valida que a ação existe na biblioteca (anti-cheat)
    const action = ALL_ACTIONS.find((a) => a.id === actionInput.id)
    if (!action) {
      return NextResponse.json({ ok: false, error: 'Ação inválida.' }, { status: 400 })
    }

    // ===== Reconstrói estado a partir do banco =====
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
    } catch { /* use default */ }
    try {
      if (match.awayTeamStateJson && match.awayTeamStateJson !== '{}') {
        awayTeamState = normalizeTeamState(JSON.parse(match.awayTeamStateJson) as TeamMatchState)
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

    const playerName = body.playerName ? String(body.playerName) : undefined
    const targetPlayerName = body.targetPlayerName ? String(body.targetPlayerName) : undefined

    // Processa a jogada
    const roll = resolveAction(action)
    const newState = applyActionToState(state, action, roll, playerName, targetPlayerName)
    const lastEvent = newState.events[newState.events.length - 1]

    // ===== Aplicar efeitos de cartão/lesão na máquina de estados granular =====
    // applyActionToState já mexeu nos arrays legados; agora sincronizamos o
    // playerStates granular via player-match-state.ts.
    let updatedHomeTeamState = newState.homeTeamState as ExtendedTeamMatchState
    let updatedAwayTeamState = newState.awayTeamState as ExtendedTeamMatchState
    updatedHomeTeamState = normalizeTeamState(updatedHomeTeamState)
    updatedAwayTeamState = normalizeTeamState(updatedAwayTeamState)

    if (lastEvent?.penaltyEvent) {
      const pe = lastEvent.penaltyEvent
      // Time que COMETEU a falta = `possession` (quem estava com a bola quando errou)
      const committingSide = pe.possession
      const ts = committingSide === 'HOME' ? updatedHomeTeamState : updatedAwayTeamState

      if (pe.type === 'RED_CARD' && pe.cardPlayerId) {
        const updated = applyRedCard(ts, pe.cardPlayerId, newState.turnCount)
        if (committingSide === 'HOME') updatedHomeTeamState = updated
        else updatedAwayTeamState = updated
      }
      if (pe.type === 'INJURY' && pe.injuredPlayerId) {
        const updated = markPlayerInjured(ts, pe.injuredPlayerId, newState.turnCount)
        if (committingSide === 'HOME') updatedHomeTeamState = updated
        else updatedAwayTeamState = updated
      }
      if (pe.type === 'YELLOW_CARD' && pe.cardPlayerId) {
        const updated = applyYellowCard(ts, pe.cardPlayerId)
        if (committingSide === 'HOME') updatedHomeTeamState = updated
        else updatedAwayTeamState = updated
      }

      // ===== FREE KICK assignment =====
      // Se a jogada gerou uma cobrança de falta, persiste o estado pendente
      // para o cliente do cobrador abrir o FreeKickDialog.
      if (pe.requiresFreeKick || pe.type === 'PENALTY_KICK') {
        const favoredSide = pe.favoredPossession
        // Candidatos a cobrador: jogadores ativos do time favorecido.
        // O cliente envia starterIds/reserveIds opcionalmente; se ausente,
        // usamos apenas os IDs dos playerStates ACTIVE como fallback.
        const favoredState = favoredSide === 'HOME' ? updatedHomeTeamState : updatedAwayTeamState
        const candidateIds = (favoredState.playerStates ?? [])
          .filter((ps) => ps.status === 'ACTIVE')
          .map((ps) => ps.playerId)

        // Para narrativa, precisamos dos nomes — o cliente pode enviar
        // `players` map. Se não enviar, usamos IDs como nomes temporários
        // (serão substituídos quando o cliente ver o estado).
        const playersMap = (body.players as Record<string, { name: string; position: string; overall?: number }> | undefined) ?? {}
        const candidates = candidateIds.map((id) => ({
          id,
          name: playersMap[id]?.name ?? id,
          position: playersMap[id]?.position ?? 'MF',
          overall: playersMap[id]?.overall,
        }))

        if (candidates.length > 0) {
          try {
            const assignment = assignFreeKick(candidates, favoredState.lastFreeKickTakerId)
            // Marca o último cobrador para a próxima cobrança
            favoredState.lastFreeKickTakerId = assignment.taker.playerId
            if (favoredSide === 'HOME') updatedHomeTeamState = { ...favoredState }
            else updatedAwayTeamState = { ...favoredState }

            const pending: PendingFreeKickState = {
              penaltyEvent: pe,
              assignment,
              favoredPossession: favoredSide,
              createdAt: Date.now(),
              previousTakerId: favoredState.lastFreeKickTakerId,
            }

            const updateData: Prisma.MatchUpdateInput = {
              currentPossession: newState.currentPossession,
              homeScore: newState.homeScore,
              awayScore: newState.awayScore,
              turnCount: newState.turnCount,
              homeProgress: newState.homeProgress,
              awayProgress: newState.awayProgress,
              eventsJson: JSON.stringify(newState.events),
              homeTeamStateJson: JSON.stringify(updatedHomeTeamState),
              awayTeamStateJson: JSON.stringify(updatedAwayTeamState),
              turnStartedAt: new Date(),
              pendingPenaltyEventJson: serializePendingFreeKick(pending),
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
              console.error('[match/action] concurrency conflict:', err)
              return NextResponse.json(
                { ok: false, error: 'Conflito de concorrência. Recarregue e tente novamente.' },
                { status: 409 },
              )
            }

            // Se terminou, conceder XP
            if (newState.status === 'FINISHED') {
              await grantMatchXp({
                matchId,
                homeUserId: match.homeUserId,
                awayUserId: match.awayUserId ?? BOT_USER_ID_FALLBACK,
                winner: newState.winner,
                gameMode,
                isOffline: match.isOffline || false,
              })
            }

            return NextResponse.json({
              ok: true,
              event: lastEvent,
              pendingFreeKick: {
                multiplier: assignment.multiplier,
                taker: assignment.taker,
                nonce: assignment.nonce,
                favoredPossession: favoredSide,
              },
              newState: {
                status: newState.status,
                currentPossession: newState.currentPossession,
                homeScore: newState.homeScore,
                awayScore: newState.awayScore,
                homeProgress: newState.homeProgress,
                awayProgress: newState.awayProgress,
                turnCount: newState.turnCount,
                winner: newState.winner,
                homeTeamState: updatedHomeTeamState,
                awayTeamState: updatedAwayTeamState,
                gameMode,
                matchEndReason: newState.matchEndReason,
              },
            })
          } catch (err) {
            console.error('[match/action] free kick assignment failed:', err)
            // Continua para o fluxo normal abaixo
          }
        }
      }
    }

    // ===== Update normal (sem free kick pendente) =====
    const updateData: Prisma.MatchUpdateInput = {
      currentPossession: newState.currentPossession,
      homeScore: newState.homeScore,
      awayScore: newState.awayScore,
      turnCount: newState.turnCount,
      homeProgress: newState.homeProgress,
      awayProgress: newState.awayProgress,
      eventsJson: JSON.stringify(newState.events),
      homeTeamStateJson: JSON.stringify(updatedHomeTeamState),
      awayTeamStateJson: JSON.stringify(updatedAwayTeamState),
      turnStartedAt: new Date(),
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
      console.error('[match/action] update error / conflict:', err)
      return NextResponse.json(
        { ok: false, error: 'Conflito de concorrência. Recarregue e tente novamente.' },
        { status: 409 },
      )
    }

    // ===== Conceder XP se a partida terminou =====
    let xpGranted = false
    if (newState.status === 'FINISHED') {
      const xpResult = await grantMatchXp({
        matchId,
        homeUserId: match.homeUserId,
        awayUserId: match.awayUserId ?? BOT_USER_ID_FALLBACK,
        winner: newState.winner,
        gameMode,
        isOffline: match.isOffline || false,
      })
      xpGranted = xpResult.granted
    }

    return NextResponse.json({
      ok: true,
      event: lastEvent,
      xpGranted,
      newState: {
        status: newState.status,
        currentPossession: newState.currentPossession,
        homeScore: newState.homeScore,
        awayScore: newState.awayScore,
        homeProgress: newState.homeProgress,
        awayProgress: newState.awayProgress,
        turnCount: newState.turnCount,
        winner: newState.winner,
        homeTeamState: updatedHomeTeamState,
        awayTeamState: updatedAwayTeamState,
        gameMode,
        matchEndReason: newState.matchEndReason,
      },
    })
  }

  return NextResponse.json({ ok: false, error: 'type inválido.' }, { status: 400 })
}
// (grantMatchXp extraído para ./grant-xp-helper.ts)

// ID fallback usado quando awayUserId é null (offline matches).
const BOT_USER_ID_FALLBACK = 'BOT_PLAYER_DUNGEON_SOCER_001'
