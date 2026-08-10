// =====================================================================
// POST /api/match/penalty-taker-select
// --------------------------------------------------------------------
// Passo 6: Permite que o usuário escolha qual jogador elegível da
// própria equipe fará a cobrança do pênalti.
//
// Body:
//   { matchId, takerPlayerId }
//
// Validações (Passo 12 — backend protegido):
//   1. Usuário autenticado.
//   2. Usuário é participante da partida.
//   3. Existe pendingPenaltyEventJson E é um PENALTY_KICK.
//   4. Usuário é o jogador favorecido (favoredPossession corresponde
//      ao seu lado).
//   5. takerPlayerId é elegível:
//      - Está no playerStates do time favorecido.
//      - Status é ACTIVE (em campo, não lesionado, não expulso,
//        não substituído, não indisponível).
//   6. Optimistic concurrency via version field.
//
// Após a validação, substitui o taker sorteado automaticamente pelo
// taker escolhido pelo usuário, preservando o multiplicador (que
// continua aleatório e gerado no servidor).
//
// Retorna o taker atualizado para o cliente exibir.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'
import {
  deserializePendingFreeKick,
  serializePendingFreeKick,
  setTakerByUser,
  isEligibleTaker,
  type FreeKickTaker,
} from '@/lib/free-kick-system'
import {
  normalizeTeamState,
  getPlayerStatus,
  type ExtendedTeamMatchState,
} from '@/lib/player-match-state'
import { hydrateTeamStateFromUserId } from '@/lib/team-state-hydration'
import type { TeamMatchState } from '@/lib/match-engine'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    await ensureDbSync()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[match/penalty-taker-select] DB sync failed:', msg.slice(0, 200))
  }

  const body = await req.json().catch(() => ({}))
  const matchId = String(body.matchId ?? '')
  const takerPlayerId = String(body.takerPlayerId ?? '').trim()

  if (!matchId || !takerPlayerId) {
    return NextResponse.json(
      { ok: false, error: 'matchId e takerPlayerId são obrigatórios.' },
      { status: 400 },
    )
  }

  const match = await db.match.findUnique({ where: { id: matchId } })
  if (!match) {
    return NextResponse.json({ ok: false, error: 'Partida não encontrada.' }, { status: 404 })
  }

  // ===== Autorização: participante =====
  const isParticipant =
    match.homeUserId === session.userId ||
    (match.awayUserId !== null && match.awayUserId === session.userId)
  if (!isParticipant) {
    return NextResponse.json({ ok: false, error: 'Sem acesso a esta partida.' }, { status: 403 })
  }

  if (match.status === 'FINISHED') {
    return NextResponse.json({ ok: false, error: 'Partida já encerrada.' }, { status: 400 })
  }

  // ===== Lê o pending =====
  const pending = deserializePendingFreeKick(match.pendingPenaltyEventJson)
  if (!pending) {
    return NextResponse.json(
      { ok: false, error: 'Nenhuma cobrança pendente.' },
      { status: 400 },
    )
  }

  // ===== Apenas para pênalti =====
  if (pending.penaltyEvent.type !== 'PENALTY_KICK') {
    return NextResponse.json(
      {
        ok: false,
        error: 'Seleção de cobrador disponível apenas para pênaltis.',
      },
      { status: 400 },
    )
  }

  // ===== Apenas o jogador favorecido pode escolher =====
  const favoredSide = pending.favoredPossession
  const isFavoredUser =
    (favoredSide === 'HOME' && match.homeUserId === session.userId) ||
    (favoredSide === 'AWAY' && match.awayUserId === session.userId) ||
    (match.isOffline && session.userId === match.homeUserId)

  if (!isFavoredUser) {
    return NextResponse.json(
      { ok: false, error: 'Não é sua vez de cobrar.' },
      { status: 400 },
    )
  }

  // ===== Reconstrói o estado do time favorecido =====
  const favoredUserId = favoredSide === 'HOME' ? match.homeUserId : match.awayUserId
  const stateJson = favoredSide === 'HOME' ? match.homeTeamStateJson : match.awayTeamStateJson

  const defaultTeamState: TeamMatchState = {
    substitutionsUsed: 0,
    maxSubstitutions: 5,
    redCards: 0,
    yellowCards: 0,
    injuredPlayers: [],
    sentOffPlayers: [],
  }

  let teamState: ExtendedTeamMatchState = defaultTeamState
  try {
    if (stateJson && stateJson !== '{}') {
      teamState = normalizeTeamState(JSON.parse(stateJson) as TeamMatchState)
    } else {
      teamState = normalizeTeamState(defaultTeamState)
    }
  } catch {
    teamState = normalizeTeamState(defaultTeamState)
  }

  // Hydration fallback para partidas legadas
  if ((teamState.playerStates ?? []).length === 0 && favoredUserId) {
    teamState = await hydrateTeamStateFromUserId(favoredUserId, teamState)
  }

  // ===== Lista de candidatos elegíveis =====
  // Passo 6: "apenas jogadores que estejam em campo, estejam disponíveis
  // e possam participar da jogada segundo as regras atuais do sistema."
  const candidateIds = (teamState.playerStates ?? [])
    .filter((ps) => ps.status === 'ACTIVE')
    .map((ps) => ps.playerId)

  // ===== Validação: takerPlayerId é elegível? =====
  if (!isEligibleTaker(candidateIds, takerPlayerId)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Jogador não é elegível para cobrar o pênalti. Apenas jogadores ativos em campo podem ser selecionados.',
        eligiblePlayerIds: candidateIds,
      },
      { status: 400 },
    )
  }

  // ===== Constrói o novo taker =====
  // O cliente envia nome/posição via body; se não enviar, usamos o ID.
  const playersMap =
    (body.players as Record<string, { name?: string; position?: string; overall?: number }> | undefined) ?? {}
  const playerInfo = playersMap[takerPlayerId]
  const newTaker: FreeKickTaker = {
    playerId: takerPlayerId,
    playerName: playerInfo?.name ?? takerPlayerId,
    position: playerInfo?.position ?? 'MF',
  }

  // ===== Atualiza o pending preservando o multiplicador =====
  const updatedPending = setTakerByUser(pending, newTaker)

  // ===== Persiste com optimistic concurrency =====
  try {
    await db.match.update({
      where: { id: matchId, version: match.version },
      data: {
        pendingPenaltyEventJson: serializePendingFreeKick(updatedPending),
        version: { increment: 1 },
      },
    })
  } catch (err) {
    console.error('[match/penalty-taker-select] concurrency conflict:', err)
    return NextResponse.json(
      { ok: false, error: 'Conflito de concorrência. Recarregue e tente novamente.' },
      { status: 409 },
    )
  }

  return NextResponse.json({
    ok: true,
    taker: newTaker,
    multiplier: updatedPending.assignment.multiplier,
    takerSelectedByUser: true,
    eligiblePlayerIds: candidateIds,
  })
}

// =====================================================================
// GET /api/match/penalty-taker-select?matchId=...
// --------------------------------------------------------------------
// Retorna a lista de jogadores elegíveis para cobrar o pênalti.
// Usado pelo cliente para montar a UI de seleção de cobrador.
// =====================================================================
export async function GET(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    await ensureDbSync()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[match/penalty-taker-select GET] DB sync failed:', msg.slice(0, 200))
  }

  const { searchParams } = new URL(req.url)
  const matchId = searchParams.get('matchId')
  if (!matchId) {
    return NextResponse.json({ ok: false, error: 'matchId obrigatório.' }, { status: 400 })
  }

  const match = await db.match.findUnique({ where: { id: matchId } })
  if (!match) {
    return NextResponse.json({ ok: false, error: 'Partida não encontrada.' }, { status: 404 })
  }

  const isParticipant =
    match.homeUserId === session.userId ||
    (match.awayUserId !== null && match.awayUserId === session.userId)
  if (!isParticipant) {
    return NextResponse.json({ ok: false, error: 'Sem acesso a esta partida.' }, { status: 403 })
  }

  const pending = deserializePendingFreeKick(match.pendingPenaltyEventJson)
  if (!pending) {
    return NextResponse.json(
      { ok: false, error: 'Nenhuma cobrança pendente.' },
      { status: 400 },
    )
  }

  if (pending.penaltyEvent.type !== 'PENALTY_KICK') {
    return NextResponse.json(
      { ok: false, error: 'Seleção de cobrador disponível apenas para pênaltis.' },
      { status: 400 },
    )
  }

  const favoredSide = pending.favoredPossession
  const isFavoredUser =
    (favoredSide === 'HOME' && match.homeUserId === session.userId) ||
    (favoredSide === 'AWAY' && match.awayUserId === session.userId) ||
    (match.isOffline && session.userId === match.homeUserId)

  if (!isFavoredUser) {
    return NextResponse.json(
      { ok: false, error: 'Não é sua vez de cobrar.' },
      { status: 400 },
    )
  }

  // Reconstrói o estado do time favorecido
  const favoredUserId = favoredSide === 'HOME' ? match.homeUserId : match.awayUserId
  const stateJson = favoredSide === 'HOME' ? match.homeTeamStateJson : match.awayTeamStateJson

  const defaultTeamState: TeamMatchState = {
    substitutionsUsed: 0,
    maxSubstitutions: 5,
    redCards: 0,
    yellowCards: 0,
    injuredPlayers: [],
    sentOffPlayers: [],
  }

  let teamState: ExtendedTeamMatchState = defaultTeamState
  try {
    if (stateJson && stateJson !== '{}') {
      teamState = normalizeTeamState(JSON.parse(stateJson) as TeamMatchState)
    } else {
      teamState = normalizeTeamState(defaultTeamState)
    }
  } catch {
    teamState = normalizeTeamState(defaultTeamState)
  }

  if ((teamState.playerStates ?? []).length === 0 && favoredUserId) {
    teamState = await hydrateTeamStateFromUserId(favoredUserId, teamState)
  }

  // Lista de elegíveis com status detalhado para a UI
  const eligiblePlayers = (teamState.playerStates ?? [])
    .filter((ps) => ps.status === 'ACTIVE')
    .map((ps) => ({
      id: ps.playerId,
      status: getPlayerStatus(teamState, ps.playerId),
    }))

  return NextResponse.json({
    ok: true,
    favoredPossession: favoredSide,
    eligiblePlayers,
    currentTaker: pending.assignment.taker,
    takerSelectedByUser: pending.takerSelectedByUser === true,
    multiplier: pending.assignment.multiplier,
  })
}
