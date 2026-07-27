// =====================================================================
// Match Engine — Regras de D&D aplicadas ao futebol
// --------------------------------------------------------------------
// Conceitos D&D:
//   - d20 = dado de 20 faces (rolagem aleatória de 1 a 20)
//   - skillBonus = bônus de proficiência do jogador (análogo a +STR, +DEX)
//   - DC (Difficulty Class) = dificuldade da ação
//   - Rolagem total = d20 + skillBonus
//   - Sucesso se rolagem >= DC
//
// Regras especiais D&D:
//   - Natural 20 (rolagem 1 no d20) = sucesso automático (Critical Hit)
//   - Natural 1  (rolagem 1 no d20) = falha automática (Critical Fail / Fumble)
//   - Margem de sucesso = rolagem - DC
//     - Margem >= 5 = sucesso excepcional (vantagem extra, ex: gol)
//     - Margem <= -5 = falha crítica (perde bola imediatamente)
//
// Fluxo da partida:
//   1. Coin flip → define quem começa (HOME ou AWAY)
//   2. Jogador inicial escolhe 3 ações de KICKOFF
//   3. Seleciona 1 → rola d20 + skillBonus vs DC
//   4. Se sucesso: ganha progresso (0-100), continua com posse
//   5. Se progress >= 100 → GOL! Placar +1, bola volta pro meio
//   6. Se fracasso: posse passa ao adversário
//   7. Próximo turno: jogador com posse recebe 5 ações mistas
//   8. Repete até condição de término (gols, tempo ou turnos)
//
// Modos de Jogo:
//   - QUICK_MATCH: Primeiro a marcar 2 gols vence (sem timer)
//   - TIMED_10: Partida de 10 minutos (tempo real)
//   - FULL_90: Partida completa de 90 min com intervalo (tempo real)
// =====================================================================

import type { FootballAction } from './dnd-actions'

export type Possession = 'HOME' | 'AWAY'
export type CoinResult = 'heads' | 'tails'

// ===== GAME MODE TYPES =====
export type GameMode = 'QUICK_MATCH' | 'TIMED_10' | 'FULL_90'

// ===== GAME MODE CONSTANTS =====
export const GAME_MODE_CONFIG: Record<GameMode, {
  label: string
  description: string
  emoji: string
  /** Duração total em milissegundos (0 = sem limite de tempo) */
  durationMs: number
  /** Gols para vencer (0 = sem limite de gols) */
  goalsToWin: number
  /** Tempo de decisão por turno em segundos */
  turnTimerSeconds: number
  /** Duração do intervalo em ms (0 = sem intervalo) */
  halftimeDurationMs: number
  /** XP para vitória */
  xpWin: number
  /** XP para derrota */
  xpLose: number
  /** XP para empate */
  xpDraw: number
  /** Limite de turnos (0 = sem limite) */
  maxTurns: number
}> = {
  QUICK_MATCH: {
    label: 'Partida Rápida',
    description: 'Primeiro a marcar 2 gols vence. Sem limite de tempo.',
    emoji: '⚡',
    durationMs: 0,
    goalsToWin: 2,
    turnTimerSeconds: 30,
    halftimeDurationMs: 0,
    xpWin: 30,
    xpLose: 5,
    xpDraw: 15,
    maxTurns: 0,
  },
  TIMED_10: {
    label: '10 Minutos',
    description: 'Partida de 10 minutos. Quem tiver mais gols no fim vence.',
    emoji: '⏱️',
    durationMs: 10 * 60 * 1000,
    goalsToWin: 0,
    turnTimerSeconds: 45,
    halftimeDurationMs: 0,
    xpWin: 50,
    xpLose: 10,
    xpDraw: 25,
    maxTurns: 0,
  },
  FULL_90: {
    label: '90 Minutos',
    description: 'Partida completa: 2 tempos de 45 min com intervalo de 15 min.',
    emoji: '🏆',
    durationMs: 90 * 60 * 1000,
    goalsToWin: 0,
    turnTimerSeconds: 60,
    halftimeDurationMs: 15 * 60 * 1000,
    xpWin: 100,
    xpLose: 20,
    xpDraw: 40,
    maxTurns: 0,
  },
}

/**
 * Calcula o tempo restante em ms de uma partida baseado nos timestamps do DB.
 * Retorna null se não houver timer (QUICK_MATCH ou partida não iniciada).
 */
export function calculateRemainingTimeMs(params: {
  gameMode: GameMode
  matchStartedAt: Date | null
  pausedAt: Date | null
  totalPausedMs: number
  halftimeTaken: boolean
  secondHalfStartedAt: Date | null
}): number | null {
  const config = GAME_MODE_CONFIG[params.gameMode]
  if (config.durationMs === 0 || !params.matchStartedAt) return null

  const now = Date.now()
  const startedAt = new Date(params.matchStartedAt).getTime()

  // Se está pausado, o tempo permanece congelado
  if (params.pausedAt) {
    const pausedAtTime = new Date(params.pausedAt).getTime()
    const elapsedBeforePause = pausedAtTime - startedAt - params.totalPausedMs
    return Math.max(0, config.durationMs - elapsedBeforePause)
  }

  // Para FULL_90: se no intervalo, tempo fica congelado no fim do 1o tempo
  if (params.gameMode === 'FULL_90' && !params.halftimeTaken) {
    const elapsedSinceStart = now - startedAt - params.totalPausedMs
    const firstHalfMs = 45 * 60 * 1000
    if (elapsedSinceStart >= firstHalfMs) {
      return Math.max(0, config.durationMs - firstHalfMs) // 45 min restantes
    }
  }

  const elapsed = now - startedAt - params.totalPausedMs
  return Math.max(0, config.durationMs - elapsed)
}

/**
 * Calcula o tempo de jogo simulado (em formato MM:SS) baseado no modo.
 * Para FULL_90: mapeia o tempo real decorrido para o tempo de jogo (0-90 min).
 */
export function calculateMatchTime(params: {
  gameMode: GameMode
  matchStartedAt: Date | null
  pausedAt: Date | null
  totalPausedMs: number
  halftimeTaken: boolean
  secondHalfStartedAt: Date | null
}): string {
  if (!params.matchStartedAt) return '00:00'

  const config = GAME_MODE_CONFIG[params.gameMode]
  if (config.durationMs === 0) return '--:--'

  const remaining = calculateRemainingTimeMs(params)
  if (remaining === null) return '--:--'

  const totalMs = config.durationMs
  const elapsedMs = totalMs - remaining

  // Converter ms decorridos para minutos:segundos de jogo
  const matchMinutes = Math.floor(elapsedMs / 60000)
  const matchSeconds = Math.floor((elapsedMs % 60000) / 1000)

  return `${String(matchMinutes).padStart(2, '0')}:${String(matchSeconds).padStart(2, '0')}`
}

/**
 * Verifica se a partida deve entrar no intervalo (apenas FULL_90).
 */
export function isHalftimeReached(params: {
  gameMode: GameMode
  matchStartedAt: Date | null
  pausedAt: Date | null
  totalPausedMs: number
  halftimeTaken: boolean
}): boolean {
  if (params.gameMode !== 'FULL_90' || !params.matchStartedAt || params.halftimeTaken) return false

  const config = GAME_MODE_CONFIG[params.gameMode]
  const now = Date.now()
  const startedAt = new Date(params.matchStartedAt).getTime()

  let elapsed = now - startedAt - params.totalPausedMs
  if (params.pausedAt) {
    elapsed = new Date(params.pausedAt).getTime() - startedAt - params.totalPausedMs
  }

  const firstHalfMs = 45 * 60 * 1000
  return elapsed >= firstHalfMs
}

/**
 * Verifica se o tempo da partida expirou.
 */
export function isTimeExpired(params: {
  gameMode: GameMode
  matchStartedAt: Date | null
  pausedAt: Date | null
  totalPausedMs: number
  halftimeTaken: boolean
  secondHalfStartedAt: Date | null
}): boolean {
  const remaining = calculateRemainingTimeMs(params)
  return remaining !== null && remaining <= 0
}

/**
 * Verifica se a condição de término da partida foi atingida baseada no modo de jogo.
 */
export function checkMatchEndCondition(params: {
  gameMode: GameMode
  homeScore: number
  awayScore: number
  turnCount: number
  matchStartedAt: Date | null
  pausedAt: Date | null
  totalPausedMs: number
  halftimeTaken: boolean
  secondHalfStartedAt: Date | null
}): { finished: boolean; winner: Possession | 'DRAW' | null; reason: string } {
  const config = GAME_MODE_CONFIG[params.gameMode]

  // 1. Verifica limite de gols (QUICK_MATCH)
  if (config.goalsToWin > 0) {
    if (params.homeScore >= config.goalsToWin) {
      return { finished: true, winner: 'HOME', reason: `${config.goalsToWin} gols atingidos!` }
    }
    if (params.awayScore >= config.goalsToWin) {
      return { finished: true, winner: 'AWAY', reason: `${config.goalsToWin} gols atingidos!` }
    }
  }

  // 2. Verifica tempo expirado
  if (isTimeExpired(params)) {
    if (params.homeScore > params.awayScore) {
      return { finished: true, winner: 'HOME', reason: 'Tempo esgotado!' }
    }
    if (params.awayScore > params.homeScore) {
      return { finished: true, winner: 'AWAY', reason: 'Tempo esgotado!' }
    }
    return { finished: true, winner: 'DRAW', reason: 'Tempo esgotado! Empate!' }
  }

  // 3. Verifica limite de turnos (se configurado)
  if (config.maxTurns > 0 && params.turnCount >= config.maxTurns) {
    if (params.homeScore > params.awayScore) {
      return { finished: true, winner: 'HOME', reason: 'Limite de turnos atingido!' }
    }
    if (params.awayScore > params.homeScore) {
      return { finished: true, winner: 'AWAY', reason: 'Limite de turnos atingido!' }
    }
    return { finished: true, winner: 'DRAW', reason: 'Limite de turnos atingido! Empate!' }
  }

  return { finished: false, winner: null, reason: '' }
}

export interface DiceRollResult {
  dice: number          // 1-20 (rolagem pura do d20)
  bonus: number         // skillBonus aplicado
  total: number         // dice + bonus
  dc: number            // dificuldade da ação
  margin: number        // total - dc (positivo = sucesso)
  success: boolean      // sucesso geral?
  critical: 'none' | 'crit_hit' | 'crit_fail'  // natural 20 / natural 1
  exceptional: boolean  // sucesso excecional (margem >= 5)
}

// ===== PENALTY/FOUL EVENTS =====
export type PenaltyEventType =
  | 'FOUL'           // Falta comum
  | 'OFFSIDE'        // Impedimento
  | 'CORNER'         // Escanteio
  | 'BALL_OUT'       // Bola para fora
  | 'YELLOW_CARD'    // Cartão amarelo
  | 'RED_CARD'       // Cartão vermelho
  | 'INJURY'         // Jogador lesionado
  | 'PENALTY_KICK'   // Pênalti
  | 'VAR_REVIEW'     // Revisão do VAR

export interface PenaltyEvent {
  type: PenaltyEventType
  possession: Possession  // quem sofreu a penalidade (time que COMETEU a falta)
  favoredPossession: Possession  // quem foi favorecido
  description: string
  injuredPlayerId?: string  // se houver lesão
  cardPlayerId?: string     // quem recebeu cartão
  requiresSubstitution: boolean  // se precisa substituição por lesão
  requiresVAR: boolean      // se precisa revisão do VAR
  varDecision?: 'CONFIRMED' | 'OVERTURNED'  // decisão do VAR
  requiresFreeKick: boolean  // se precisa cobrança de falta
}

export interface TeamMatchState {
  substitutionsUsed: number
  maxSubstitutions: number
  redCards: number
  yellowCards: number
  injuredPlayers: string[]   // IDs dos jogadores lesionados
  sentOffPlayers: string[]   // IDs dos jogadores expulsos por cartão vermelho
  // ===== CORREÇÃO 6/8: rastreia jogadores que saíram por substituição =====
  // Impede que um jogador já substituído (saiu de campo) continue aparecendo
  // como ativo na lista de titulares em campo.
  substitutedOut: string[]   // IDs dos jogadores que saíram via substituição
}

export interface MatchEvent {
  turn: number
  possession: Possession
  action: {
    id: string
    name: string
    emoji: string
    category: string
    dc: number
  }
  roll: DiceRollResult
  progressGained: number
  totalProgress: number
  isGoal: boolean
  possessionChanged: boolean
  timestamp: number
  penaltyEvent?: PenaltyEvent | null
  varResult?: { decision: 'CONFIRMED' | 'OVERTURNED'; dice: number; description: string } | null
  // ===== Narrativa com nome de jogador =====
  playerName?: string
  targetPlayerName?: string
  narrative?: string
}

export interface MatchState {
  matchId: string
  status: 'WAITING' | 'COIN_FLIP' | 'IN_PROGRESS' | 'PAUSED' | 'HALFTIME' | 'FINISHED'
  coinResult: CoinResult | null
  startingSide: Possession | null
  currentPossession: Possession | null
  homeScore: number
  awayScore: number
  homeProgress: number  // 0-100 progresso no campo (reseta a cada gol)
  awayProgress: number
  turnCount: number
  maxTurns: number
  events: MatchEvent[]
  winner: Possession | 'DRAW' | null
  homeTeamState: TeamMatchState
  awayTeamState: TeamMatchState
  // ===== Timer & Game Mode =====
  gameMode: GameMode
  matchStartedAt: Date | null
  pausedAt: Date | null
  totalPausedMs: number
  halftimeTaken: boolean
  secondHalfStartedAt: Date | null
  xpReward: number
  turnStartedAt: Date | null
  matchEndReason: string
}

// =====================================================================
// Rolagem de d20
// =====================================================================
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1
}

// =====================================================================
// Resolução de jogada
// =====================================================================
export function resolveAction(action: FootballAction, extraBonus = 0): DiceRollResult {
  const dice = rollD20()
  const bonus = action.skillBonus + extraBonus
  const total = dice + bonus
  const dc = action.dc
  const margin = total - dc

  // Regras D&D: Natural 20 = crit hit, Natural 1 = crit fail
  let critical: DiceRollResult['critical'] = 'none'
  let success: boolean
  let exceptional: boolean

  if (dice === 20) {
    critical = 'crit_hit'
    success = true
    exceptional = true
  } else if (dice === 1) {
    critical = 'crit_fail'
    success = false
    exceptional = false
  } else {
    success = margin >= 0
    exceptional = margin >= 5
  }

  return {
    dice,
    bonus,
    total,
    dc,
    margin,
    success,
    critical,
    exceptional,
  }
}

// =====================================================================
// Sistema de Penalizações — gerado a partir de rolagens baixas
// =====================================================================
const PENALTY_DESCRIPTIONS: Record<PenaltyEventType, string[]> = {
  FOUL: [
    'Falta dura no meio-campo!',
    'Carrinho por trinho! Falta perigosa!',
    'Entrada forte, o juiz marca falta!',
    'Empurrão na área! Falta cobrar.',
    'Mão na bola do adversário, falta!',
    'Corte agressivo, falta marcada!',
  ],
  OFFSIDE: [
    'Impedimento! Jogador adiantado.',
    'Linha traçada, impedimento marcado!',
    'Tava na cara do gol, mas tava impedido!',
  ],
  CORNER: [
    'Escanteio para o ataque! Bola sai pela linha de fundo.',
    'Defensor espalmou pra escanteio!',
    'Cruzamento desviado, escanteio!',
  ],
  BALL_OUT: [
    'Bola vai pra lateral! Arremesso.',
    'Passe longo demais, bola saiu!',
    'Chutou pro lado, bola fora do campo!',
  ],
  YELLOW_CARD: [
    'Cartão amarelo! Falta reiterada.',
    'Amarelo! Protestou demais com o juiz.',
    'Cartão amarelo por falta tática dura!',
    'Amarelo! Simulação detectada.',
    'Cartão amarelo por demora no jogo!',
  ],
  RED_CARD: [
    'CARTÃO VERMELHO! Falta violentíssima!',
    'Vermelho direto! Voo dangerous play!',
    'Segundo amarelo = vermelho! Expulso!',
    'Vermelho! Mão na bola na área impedindo gol!',
  ],
  INJURY: [
    'Jogador caiu e não consegue continuar! Lesão!',
    'Medical team entra! Jogador machucado!',
    'Tropeço feio! Parece lesão muscular!',
    'Colisão forte! Jogador no chão!',
  ],
  PENALTY_KICK: [
    'PÊNALTI! Falta dentro da área!',
    'Mão na bola do defensor! Pênalti marcado!',
    'Carrinho na área! Pênalti!',
  ],
  VAR_REVIEW: [
    '📺 VAR! Juiz pede revisão!',
    '📺 VAR! Lance sendo analisado!',
    '📺 VAR! Decisão sendo revista!',
  ],
}

export function generatePenaltyEvent(
  dice: number,
  possession: Possession,
  playerIds: string[] = [],
): PenaltyEvent | null {
  // Only trigger penalties on low dice rolls (1-5) or critical fails
  if (dice > 5 && dice !== 1) return null

  const opponent: Possession = possession === 'HOME' ? 'AWAY' : 'HOME'
  
  // Weight-based random selection depending on dice value
  const roll = Math.random()
  
  // Dice 1 (critical fail) = much more likely to get severe penalties
  if (dice === 1) {
    // Critical fail: 40% red card, 25% penalty, 20% injury, 10% yellow, 5% foul
    if (roll < 0.25) {
      const pid = playerIds.length > 0 ? playerIds[Math.floor(Math.random() * playerIds.length)] : undefined
      return {
        type: 'PENALTY_KICK',
        possession,
        favoredPossession: opponent,
        description: PENALTY_DESCRIPTIONS.PENALTY_KICK[Math.floor(Math.random() * PENALTY_DESCRIPTIONS.PENALTY_KICK.length)],
        requiresSubstitution: false,
        requiresVAR: Math.random() < 0.7, // Penalty often goes to VAR
        requiresFreeKick: false,
      }
    }
    if (roll < 0.65) {
      const pid = playerIds.length > 0 ? playerIds[Math.floor(Math.random() * playerIds.length)] : undefined
      return {
        type: 'RED_CARD',
        possession,
        favoredPossession: opponent,
        description: PENALTY_DESCRIPTIONS.RED_CARD[Math.floor(Math.random() * PENALTY_DESCRIPTIONS.RED_CARD.length)],
        cardPlayerId: pid,
        requiresSubstitution: false,
        requiresVAR: Math.random() < 0.5,
        requiresFreeKick: false,
      }
    }
    if (roll < 0.85) {
      const pid = playerIds.length > 0 ? playerIds[Math.floor(Math.random() * playerIds.length)] : undefined
      return {
        type: 'INJURY',
        possession,
        favoredPossession: opponent,
        description: PENALTY_DESCRIPTIONS.INJURY[Math.floor(Math.random() * PENALTY_DESCRIPTIONS.INJURY.length)],
        injuredPlayerId: pid,
        requiresSubstitution: true,
        requiresVAR: false,
        requiresFreeKick: false,
      }
    }
    if (roll < 0.95) {
      const pid = playerIds.length > 0 ? playerIds[Math.floor(Math.random() * playerIds.length)] : undefined
      return {
        type: 'YELLOW_CARD',
        possession,
        favoredPossession: opponent,
        description: PENALTY_DESCRIPTIONS.YELLOW_CARD[Math.floor(Math.random() * PENALTY_DESCRIPTIONS.YELLOW_CARD.length)],
        cardPlayerId: pid,
        requiresSubstitution: false,
        requiresVAR: Math.random() < 0.3,
        requiresFreeKick: false,
      }
    }
    return {
      type: 'FOUL',
      possession,
      favoredPossession: opponent,
      description: PENALTY_DESCRIPTIONS.FOUL[Math.floor(Math.random() * PENALTY_DESCRIPTIONS.FOUL.length)],
      requiresSubstitution: false,
      requiresVAR: Math.random() < 0.2,
      requiresFreeKick: true,
    }
  }

  // Dice 2-5: less severe but still possible
  // 35% foul, 20% offside, 15% ball out, 12% corner, 8% yellow, 5% injury, 3% penalty, 2% VAR direct
  if (dice <= 5) {
    if (roll < 0.35) {
      return {
        type: 'FOUL',
        possession,
        favoredPossession: opponent,
        description: PENALTY_DESCRIPTIONS.FOUL[Math.floor(Math.random() * PENALTY_DESCRIPTIONS.FOUL.length)],
        requiresSubstitution: false,
        requiresVAR: Math.random() < 0.2,
        requiresFreeKick: true,
      }
    }
    if (roll < 0.55) {
      return {
        type: 'OFFSIDE',
        possession,
        favoredPossession: opponent,
        description: PENALTY_DESCRIPTIONS.OFFSIDE[Math.floor(Math.random() * PENALTY_DESCRIPTIONS.OFFSIDE.length)],
        requiresSubstitution: false,
        requiresVAR: Math.random() < 0.6, // Offside commonly goes to VAR
        requiresFreeKick: false,
      }
    }
    if (roll < 0.70) {
      return {
        type: 'BALL_OUT',
        possession,
        favoredPossession: opponent,
        description: PENALTY_DESCRIPTIONS.BALL_OUT[Math.floor(Math.random() * PENALTY_DESCRIPTIONS.BALL_OUT.length)],
        requiresSubstitution: false,
        requiresVAR: false,
        requiresFreeKick: false,
      }
    }
    if (roll < 0.82) {
      return {
        type: 'CORNER',
        possession,
        favoredPossession: opponent,
        description: PENALTY_DESCRIPTIONS.CORNER[Math.floor(Math.random() * PENALTY_DESCRIPTIONS.CORNER.length)],
        requiresSubstitution: false,
        requiresVAR: false,
        requiresFreeKick: false,
      }
    }
    if (roll < 0.90) {
      const pid = playerIds.length > 0 ? playerIds[Math.floor(Math.random() * playerIds.length)] : undefined
      return {
        type: 'YELLOW_CARD',
        possession,
        favoredPossession: opponent,
        description: PENALTY_DESCRIPTIONS.YELLOW_CARD[Math.floor(Math.random() * PENALTY_DESCRIPTIONS.YELLOW_CARD.length)],
        cardPlayerId: pid,
        requiresSubstitution: false,
        requiresVAR: Math.random() < 0.3,
        requiresFreeKick: false,
      }
    }
    if (roll < 0.95) {
      const pid = playerIds.length > 0 ? playerIds[Math.floor(Math.random() * playerIds.length)] : undefined
      return {
        type: 'INJURY',
        possession,
        favoredPossession: opponent,
        description: PENALTY_DESCRIPTIONS.INJURY[Math.floor(Math.random() * PENALTY_DESCRIPTIONS.INJURY.length)],
        injuredPlayerId: pid,
        requiresSubstitution: true,
        requiresVAR: false,
        requiresFreeKick: false,
      }
    }
    if (roll < 0.98) {
      return {
        type: 'PENALTY_KICK',
        possession,
        favoredPossession: opponent,
        description: PENALTY_DESCRIPTIONS.PENALTY_KICK[Math.floor(Math.random() * PENALTY_DESCRIPTIONS.PENALTY_KICK.length)],
        requiresSubstitution: false,
        requiresVAR: Math.random() < 0.8,
        requiresFreeKick: false,
      }
    }
    return {
      type: 'VAR_REVIEW',
      possession,
      favoredPossession: opponent,
      description: PENALTY_DESCRIPTIONS.VAR_REVIEW[Math.floor(Math.random() * PENALTY_DESCRIPTIONS.VAR_REVIEW.length)],
      requiresSubstitution: false,
      requiresVAR: true,
      requiresFreeKick: false,
    }
  }

  return null
}

// =====================================================================
// VAR Decision — rolagem de dado para decidir
// =====================================================================
export function resolveVARDecision(): { decision: 'CONFIRMED' | 'OVERTURNED'; dice: number; description: string } {
  const dice = rollD20()
  // DC 12: se total >= 12, mantém a decisão original. Se < 12, inverte.
  if (dice >= 12) {
    return {
      decision: 'CONFIRMED',
      dice,
      description: `📺 VAR CONFIRMA a decisão original! (d20=${dice} ≥ 12)`,
    }
  }
  return {
    decision: 'OVERTURNED',
    dice,
    description: `📺 VAR INVERTE a decisão! (d20=${dice} < 12)`,
  }
}

// =====================================================================
// Cria estado inicial da partida
// =====================================================================
export function createInitialMatchState(matchId: string, gameMode: GameMode = 'QUICK_MATCH', maxTurns?: number): MatchState {
  const config = GAME_MODE_CONFIG[gameMode]
  return {
    matchId,
    status: 'WAITING',
    coinResult: null,
    startingSide: null,
    currentPossession: null,
    homeScore: 0,
    awayScore: 0,
    homeProgress: 0,
    awayProgress: 0,
    turnCount: 0,
    maxTurns: maxTurns ?? (config.maxTurns > 0 ? config.maxTurns : 999),
    events: [],
    winner: null,
    homeTeamState: { substitutionsUsed: 0, maxSubstitutions: 5, redCards: 0, yellowCards: 0, injuredPlayers: [], sentOffPlayers: [], substitutedOut: [] },
    awayTeamState: { substitutionsUsed: 0, maxSubstitutions: 5, redCards: 0, yellowCards: 0, injuredPlayers: [], sentOffPlayers: [], substitutedOut: [] },
    gameMode,
    matchStartedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
    halftimeTaken: false,
    secondHalfStartedAt: null,
    xpReward: config.xpWin,
    turnStartedAt: null,
    matchEndReason: '',
  }
}

// =====================================================================
// Lançamento da moeda (cara ou coroa)
// =====================================================================
export function flipCoin(): CoinResult {
  return Math.random() < 0.5 ? 'heads' : 'tails'
}

// Mapeia o resultado da moeda para quem começa
// (Home escolhe cara, Away escolhe coroa — simplificação)
export function coinToPossession(coin: CoinResult): Possession {
  return coin === 'heads' ? 'HOME' : 'AWAY'
}

// =====================================================================
// Gera narrativa com nome de jogador para a ação
// =====================================================================
const NARRATIVE_TEMPLATES: Record<string, string[]> = {
  KICKOFF: [
    '{player} faz a saída de bola.',
    '{player} inicia a jogada pelo meio.',
    '{player} toca a bola para começar.',
  ],
  PASS: [
    '{player} faz {action} para {target}.',
    '{player} executa {action} encontrando {target}.',
    '{target} recebe {action} de {player}.',
    '{player} procura {target} com {action}.',
  ],
  DRIBBLE: [
    '{player} tenta {action}!',
    '{player} arrisca {action} pelo lado!',
    '{player} sai driblando com {action}!',
  ],
  SHOOT: [
    '{player} arrisca {action}!',
    '{player} solta {action} de fora da área!',
    '{player} finaliza com {action}!',
  ],
  DEFEND: [
    '{player} faz {action}!',
    '{player} corta o ataque com {action}!',
    '{player} intercepta com {action}!',
  ],
  SPECIAL: [
    '{player} executa {action}!',
    '{player} brilha com {action}!',
    '{player} tenta a jogada especial: {action}!',
  ],
  FREE_KICK: [
    '{player} cobra a falta com {action}!',
    '{player} bate a falta: {action}!',
    '{player} prepara {action} na cobrança!',
  ],
}

const GOAL_NARRATIVE_TEMPLATES: string[] = [
  'GOOOL! {player} faz {action} e marca!',
  'GOOOL! {player} bateu {action} e balançou a rede!',
  'GOOOL! {player} marca com {action}!',
  'GOOOL! Que golaço de {player}! {action} perfeito!',
  'GOOOL! {player} não perdoa! {action} no ângulo!',
]

const FAIL_NARRATIVE_TEMPLATES: string[] = [
  '{player} erra {action}.',
  '{player} perde a bola tentando {action}.',
  '{action} de {player} não funciona.',
]

/**
 * Gera uma narrativa descritiva para a jogada.
 * @param action Ação de futebol
 * @param playerName Nome do jogador que executa
 * @param targetPlayerName Nome do jogador que recebe (para passes)
 * @param isGoal Se resultou em gol
 * @param success Se a jogada foi bem-sucedida
 */
export function generateNarrative(
  action: FootballAction | { id: string; name: string; emoji: string; category: string; dc: number },
  playerName: string,
  targetPlayerName?: string,
  isGoal?: boolean,
  success?: boolean,
): string {
  const category = action.category as string
  const actionName = action.name.toLowerCase()

  if (isGoal) {
    const templates = GOAL_NARRATIVE_TEMPLATES
    const template = templates[Math.floor(Math.random() * templates.length)]
    return template
      .replace('{player}', playerName)
      .replace('{action}', actionName)
  }

  if (!success) {
    const templates = FAIL_NARRATIVE_TEMPLATES
    const template = templates[Math.floor(Math.random() * templates.length)]
    return template
      .replace('{player}', playerName)
      .replace('{action}', actionName)
  }

  const templates = NARRATIVE_TEMPLATES[category] || NARRATIVE_TEMPLATES['PASS']
  const template = templates[Math.floor(Math.random() * templates.length)]
  return template
    .replace('{player}', playerName)
    .replace('{action}', actionName)
    .replace('{target}', targetPlayerName || 'companheiro')
}

/**
 * Seleciona um jogador aleatório da lista de titulares.
 * Pode filtrar por posição preferida da ação.
 */
export function pickRandomPlayer(players: { name: string; position: string }[]): string {
  if (players.length === 0) return 'Jogador'
  const idx = Math.floor(Math.random() * players.length)
  return players[idx].name
}

/**
 * Seleciona dois jogadores diferentes da lista (para passes/passes longos).
 */
export function pickTwoRandomPlayers(players: { name: string; position: string }[]): { player: string; target: string } {
  if (players.length <= 1) return { player: pickRandomPlayer(players), target: 'companheiro' }
  const idx1 = Math.floor(Math.random() * players.length)
  let idx2 = Math.floor(Math.random() * players.length)
  while (idx2 === idx1 && players.length > 1) {
    idx2 = Math.floor(Math.random() * players.length)
  }
  return { player: players[idx1].name, target: players[idx2].name }
}

/**
 * Seleciona jogador baseado na categoria da ação (prioriza posição adequada).
 */
export function pickPlayerForAction(
  players: { name: string; position: string }[],
  category: string,
): { player: string; target: string } {
  if (players.length === 0) return { player: 'Jogador', target: 'companheiro' }

  // Para chutes, prioriza atacantes
  if (category === 'SHOOT' || category === 'FREE_KICK') {
    const attackers = players.filter(p => p.position === 'FW')
    if (attackers.length > 0) {
      const player = attackers[Math.floor(Math.random() * attackers.length)].name
      const { target } = pickTwoRandomPlayers(players)
      return { player, target }
    }
    const midfielders = players.filter(p => p.position === 'MF')
    if (midfielders.length > 0) {
      const player = midfielders[Math.floor(Math.random() * midfielders.length)].name
      const { target } = pickTwoRandomPlayers(players)
      return { player, target }
    }
  }

  // Para defesa, prioriza defensores
  if (category === 'DEFEND') {
    const defenders = players.filter(p => p.position === 'DF' || p.position === 'LD' || p.position === 'LE' || p.position === 'GK')
    if (defenders.length > 0) {
      const player = defenders[Math.floor(Math.random() * defenders.length)].name
      const { target } = pickTwoRandomPlayers(players)
      return { player, target }
    }
  }

  // Para passes, pega dois jogadores diferentes
  if (category === 'PASS' || category === 'KICKOFF') {
    return pickTwoRandomPlayers(players)
  }

  // Para outros, seleciona aleatoriamente
  return pickTwoRandomPlayers(players)
}

// =====================================================================
// Processa uma jogada e atualiza o estado
// =====================================================================
export function applyActionToState(
  state: MatchState,
  action: FootballAction,
  roll: DiceRollResult,
  playerName?: string,
  targetPlayerName?: string,
): MatchState {
  const newState: MatchState = {
    ...state,
    events: [...state.events],
    homeTeamState: { ...state.homeTeamState, injuredPlayers: [...state.homeTeamState.injuredPlayers], sentOffPlayers: [...state.homeTeamState.sentOffPlayers] },
    awayTeamState: { ...state.awayTeamState, injuredPlayers: [...state.awayTeamState.injuredPlayers], sentOffPlayers: [...state.awayTeamState.sentOffPlayers] },
  }
  const possession = newState.currentPossession!
  const event: MatchEvent = {
    turn: newState.turnCount + 1,
    possession,
    action: {
      id: action.id,
      name: action.name,
      emoji: action.emoji,
      category: action.category,
      dc: action.dc,
    },
    roll,
    progressGained: 0,
    totalProgress: 0,
    isGoal: false,
    possessionChanged: false,
    timestamp: Date.now(),
    playerName: playerName || undefined,
    targetPlayerName: targetPlayerName || undefined,
  }

  newState.turnCount += 1

  // ===== PENALTY EVENT GENERATION =====
  // Generate penalty events on low dice rolls
  if (!roll.success && roll.dice <= 5) {
    const penaltyEvent = generatePenaltyEvent(roll.dice, possession)
    if (penaltyEvent) {
      event.penaltyEvent = penaltyEvent
      
      // Apply immediate effects
      const teamState = possession === 'HOME' ? newState.homeTeamState : newState.awayTeamState
      
      if (penaltyEvent.type === 'YELLOW_CARD') {
        teamState.yellowCards += 1
      }
      if (penaltyEvent.type === 'RED_CARD') {
        teamState.redCards += 1
        if (penaltyEvent.cardPlayerId) {
          teamState.sentOffPlayers.push(penaltyEvent.cardPlayerId)
        }
      }
      if (penaltyEvent.type === 'INJURY') {
        if (penaltyEvent.injuredPlayerId) {
          teamState.injuredPlayers.push(penaltyEvent.injuredPlayerId)
        }
      }
      
      // Offside always changes possession
      if (penaltyEvent.type === 'OFFSIDE') {
        newState.currentPossession = possession === 'HOME' ? 'AWAY' : 'HOME'
        event.possessionChanged = true
      }
      
      // Foul gives ball to favored team
      if (penaltyEvent.type === 'FOUL' && penaltyEvent.requiresFreeKick) {
        newState.currentPossession = penaltyEvent.favoredPossession
        event.possessionChanged = true
      }
      
      // Red card changes possession
      if (penaltyEvent.type === 'RED_CARD') {
        newState.currentPossession = penaltyEvent.favoredPossession
        event.possessionChanged = true
      }
      
      // Penalty kick gives ball to favored team with high progress
      if (penaltyEvent.type === 'PENALTY_KICK') {
        newState.currentPossession = penaltyEvent.favoredPossession
        event.possessionChanged = true
        // Set high progress for the favored team
        if (penaltyEvent.favoredPossession === 'HOME') {
          newState.homeProgress = Math.min(100, newState.homeProgress + 60)
        } else {
          newState.awayProgress = Math.min(100, newState.awayProgress + 60)
        }
      }
    }
  }
  // Critical fail always generates a penalty
  if (roll.critical === 'crit_fail') {
    const penaltyEvent = generatePenaltyEvent(1, possession)
    if (penaltyEvent && !event.penaltyEvent) {
      event.penaltyEvent = penaltyEvent
      
      const teamState = possession === 'HOME' ? newState.homeTeamState : newState.awayTeamState
      if (penaltyEvent.type === 'RED_CARD') {
        teamState.redCards += 1
        if (penaltyEvent.cardPlayerId) teamState.sentOffPlayers.push(penaltyEvent.cardPlayerId)
      }
      if (penaltyEvent.type === 'INJURY') {
        if (penaltyEvent.injuredPlayerId) teamState.injuredPlayers.push(penaltyEvent.injuredPlayerId)
      }
      if (penaltyEvent.type === 'YELLOW_CARD') {
        teamState.yellowCards += 1
      }
    }
  }

  if (roll.success) {
    // ===== SUCESSO: ganha progresso =====
    const progressGained = action.progress
    const isAttackAction = action.category !== 'DEFEND'

    if (isAttackAction) {
      if (possession === 'HOME') {
        newState.homeProgress = Math.min(100, newState.homeProgress + progressGained)
        event.totalProgress = newState.homeProgress
      } else {
        newState.awayProgress = Math.min(100, newState.awayProgress + progressGained)
        event.totalProgress = newState.awayProgress
      }
      event.progressGained = progressGained

      // Verifica gol
      const reachedGoal =
        (possession === 'HOME' && newState.homeProgress >= 100) ||
        (possession === 'AWAY' && newState.awayProgress >= 100)

      // Gol automático se chegou a 100 OU se for ação de SHOOT com chance de gol
      if (reachedGoal) {
        event.isGoal = true
        if (possession === 'HOME') {
          newState.homeScore += 1
          newState.homeProgress = 0
        } else {
          newState.awayScore += 1
          newState.awayProgress = 0
        }
        // Após o gol, o time que sofreu o gol reinicia
        newState.currentPossession = possession === 'HOME' ? 'AWAY' : 'HOME'
        event.possessionChanged = true
      } else if (action.category === 'SHOOT' && action.goalChance > 0) {
        // Ação de chute com chance de gol (mesmo sem chegar a 100)
        const goalRoll = Math.random()
        if (goalRoll < action.goalChance) {
          // Gol!
          event.isGoal = true
          if (possession === 'HOME') {
            newState.homeScore += 1
            newState.homeProgress = 0
          } else {
            newState.awayScore += 1
            newState.awayProgress = 0
          }
          newState.currentPossession = possession === 'HOME' ? 'AWAY' : 'HOME'
          event.possessionChanged = true
        } else if (action.ballRetentionOnFail > 0 && Math.random() < action.ballRetentionOnFail) {
          // Chute defendido mas mantém a bola (rebote)
          // continua com posse
        } else {
          // Perdeu a bola (goleiro pegou)
          newState.currentPossession = possession === 'HOME' ? 'AWAY' : 'HOME'
          event.possessionChanged = true
        }
      } else if (action.category === 'SPECIAL' && action.goalChance > 0 && Math.random() < action.goalChance) {
        // Ação especial com chance de gol
        event.isGoal = true
        if (possession === 'HOME') {
          newState.homeScore += 1
          newState.homeProgress = 0
        } else {
          newState.awayScore += 1
          newState.awayProgress = 0
        }
        newState.currentPossession = possession === 'HOME' ? 'AWAY' : 'HOME'
        event.possessionChanged = true
      }
      // Se não foi gol e não perdeu posse, continua com a posse
    } else {
      // Ação de defesa bem-sucedida: rouba a bola
      newState.currentPossession = possession === 'HOME' ? 'AWAY' : 'HOME'
      event.possessionChanged = true
    }
  } else {
    // ===== FRACASSO =====
    // Verifica se mantém a bola (ballRetentionOnFail) ou perde
    const retention = Math.random()
    if (retention < action.ballRetentionOnFail) {
      // Mantém a bola, mas sem progresso
      event.progressGained = 0
      if (possession === 'HOME') {
        event.totalProgress = newState.homeProgress
      } else {
        event.totalProgress = newState.awayProgress
      }
    } else {
      // Perde a posse
      newState.currentPossession = possession === 'HOME' ? 'AWAY' : 'HOME'
      event.possessionChanged = true
      // Reset progresso do time que perdeu (opcional: reset parcial)
      if (possession === 'HOME') {
        newState.homeProgress = Math.max(0, newState.homeProgress - 10)
      } else {
        newState.awayProgress = Math.max(0, newState.awayProgress - 10)
      }
    }
  }

  // Gera narrativa com nome de jogador
  if (event.playerName) {
    event.narrative = generateNarrative(
      event.action,
      event.playerName,
      event.targetPlayerName,
      event.isGoal,
      event.roll.success,
    )
  }

  newState.events.push(event)

  // Verifica fim de partida baseado no modo de jogo
  const endCheck = checkMatchEndCondition({
    gameMode: newState.gameMode,
    homeScore: newState.homeScore,
    awayScore: newState.awayScore,
    turnCount: newState.turnCount,
    matchStartedAt: newState.matchStartedAt,
    pausedAt: newState.pausedAt,
    totalPausedMs: newState.totalPausedMs,
    halftimeTaken: newState.halftimeTaken,
    secondHalfStartedAt: newState.secondHalfStartedAt,
  })

  if (endCheck.finished) {
    newState.status = 'FINISHED'
    newState.winner = endCheck.winner
    newState.matchEndReason = endCheck.reason
  } else if (newState.turnCount >= newState.maxTurns) {
    // Fallback: limite de turnos atingido
    newState.status = 'FINISHED'
    if (newState.homeScore > newState.awayScore) newState.winner = 'HOME'
    else if (newState.awayScore > newState.homeScore) newState.winner = 'AWAY'
    else newState.winner = 'DRAW'
    newState.matchEndReason = 'Limite de turnos atingido!'
  }

  return newState
}

// =====================================================================
// Helpers para UI
// =====================================================================
export function getRollLabel(roll: DiceRollResult): string {
  if (roll.critical === 'crit_hit') return 'CRITICAL HIT! 🎉'
  if (roll.critical === 'crit_fail') return 'CRITICAL FAIL! 💀'
  if (roll.exceptional) return 'Sucesso Excepcional! ⭐'
  if (roll.success) return 'Sucesso! ✅'
  return 'Fracasso! ❌'
}

export function getRollColor(roll: DiceRollResult): string {
  if (roll.critical === 'crit_hit') return 'text-yellow-400'
  if (roll.critical === 'crit_fail') return 'text-red-500'
  if (roll.exceptional) return 'text-emerald-400'
  if (roll.success) return 'text-emerald-500'
  return 'text-red-400'
}

// =====================================================================
// ===== CORREÇÃO 3: SISTEMA DE MULTIPLICADORES PARA COBRANÇA DE FALTA ===
// ---------------------------------------------------------------------
// A cada cobrança de falta:
//   - Gerar aleatoriamente um multiplicador positivo OU negativo
//   - Aplicar o multiplicador à chance de gol do batedor escolhido
//   - Garantir imprevisibilidade: jogador da vez nunca é o mesmo da
//     última cobrança, e o sinal do multiplicador alterna com peso
//   - Mostrar claramente ao usuário se o batedor tem bônus ou penalidade
// =====================================================================

export type MultiplierSign = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'

export interface FreeKickMultiplier {
  /** ID único da instância do multiplicador (para controle de UI) */
  id: string
  /** Sinal do multiplicador: POSITIVE = bônus; NEGATIVE = penalidade; NEUTRAL = sem efeito */
  sign: MultiplierSign
  /** Valor numérico aplicado: positivo aumenta chance de gol, negativo diminui */
  value: number
  /** Rótulo amigável para exibição: "BÔNUS +20%" ou "PENALIDADE -15%" */
  label: string
  /** Emoji representativo */
  emoji: string
  /** Descrição narrativa para exibir ao usuário */
  description: string
}

/**
 * Histórico de multiplicadores por partida (em memória no cliente).
 * Usado para evitar repetições consecutivas do mesmo sinal e do mesmo jogador.
 */
export interface MultiplierHistory {
  lastKickerId: string | null
  lastSign: MultiplierSign | null
  turnCount: number
}

/**
 * Gera um multiplicador aleatório para a cobrança de falta.
 *
 * Estratégia de imprevisibilidade:
 *   - 45% positivo (bônus entre +5% e +30%)
 *   - 40% negativo (penalidade entre -5% e -25%)
 *   - 15% neutro (sem efeito, mas ainda mostra mensagem)
 *
 * Para evitar repetições consecutivas do mesmo sinal, se o último
 * multiplicador foi POSITIVE, a chance de gerar outro POSITIVE cai pela metade
 * (e vice-versa para NEGATIVE).
 *
 * @param history histórico da partida (opcional, para anti-repetição)
 */
export function generateFreeKickMultiplier(history?: MultiplierHistory | null): FreeKickMultiplier {
  // Pesos base
  let posWeight = 0.45
  let negWeight = 0.40
  const neutralWeight = 0.15

  // Anti-repetição: se o último foi POSITIVE, reduz chance de novo POSITIVE
  if (history?.lastSign === 'POSITIVE') {
    posWeight = 0.25
    negWeight = 0.60
  } else if (history?.lastSign === 'NEGATIVE') {
    posWeight = 0.60
    negWeight = 0.25
  }

  const roll = Math.random()
  let sign: MultiplierSign
  let value: number
  let label: string
  let emoji: string
  let description: string

  if (roll < posWeight) {
    sign = 'POSITIVE'
    // Bônus entre +5% e +30%
    value = 0.05 + Math.random() * 0.25
    const pct = Math.round(value * 100)
    label = `BÔNUS +${pct}%`
    emoji = '🔥'
    description = `${emoji} Batedor inspirado! Chance de gol aumentada em +${pct}%.`
  } else if (roll < posWeight + negWeight) {
    sign = 'NEGATIVE'
    // Penalidade entre -5% e -25%
    value = -(0.05 + Math.random() * 0.20)
    const pct = Math.abs(Math.round(value * 100))
    label = `PENALIDADE -${pct}%`
    emoji = '💀'
    description = `${emoji} Batedor desconcentrado! Chance de gol reduzida em -${pct}%.`
  } else {
    sign = 'NEUTRAL'
    value = 0
    label = 'NEUTRO'
    emoji = '⚖️'
    description = `${emoji} Condições normais. Sem bônus ou penalidade nesta cobrança.`
  }

  return {
    id: `mult_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    sign,
    value,
    label,
    emoji,
    description,
  }
}

/**
 * Aplica o multiplicador à chance base de gol de uma ação.
 * Retorna nova chance entre 0.05 (mínimo) e 0.95 (máximo).
 *
 * @param baseGoalChance Chance original da ação (0-1)
 * @param multiplier Multiplicador gerado por generateFreeKickMultiplier
 */
export function applyMultiplierToGoalChance(
  baseGoalChance: number,
  multiplier: FreeKickMultiplier,
): number {
  // chance final = base + (base * valor) -> valor positivo aumenta, negativo diminui
  // Exemplo: base 0.7, valor +0.20 -> 0.7 + 0.14 = 0.84
  //          base 0.7, valor -0.15 -> 0.7 - 0.105 = 0.595
  const adjusted = baseGoalChance + (baseGoalChance * multiplier.value)
  // Clamp entre 5% e 95% para manter jogabilidade
  return Math.max(0.05, Math.min(0.95, adjusted))
}

/**
 * Sorteia um batedor evitando repetição consecutiva do último batedor.
 *
 * @param availablePlayers Lista de jogadores em campo disponíveis
 * @param lastKickerId ID do último batedor (para evitar repetição)
 */
export function pickKickerAvoidingRepeat(
  availablePlayers: { id: string; name: string; position: string }[],
  lastKickerId?: string | null,
): { id: string; name: string; position: string } | null {
  if (availablePlayers.length === 0) return null
  if (availablePlayers.length === 1) return availablePlayers[0]

  // Filtra o último batedor
  const candidates = lastKickerId
    ? availablePlayers.filter(p => p.id !== lastKickerId)
    : availablePlayers

  // Se só sobrou o último (caso extremo), usa ele
  const pool = candidates.length > 0 ? candidates : availablePlayers
  return pool[Math.floor(Math.random() * pool.length)]
}

// =====================================================================
// ===== CORREÇÃO 7: JOGADA DEFENSIVA E ROUBADAS DE BOLA =================
// ---------------------------------------------------------------------
// Em momentos aleatórios durante a vez do oponente, o jogador pode
// ter a chance de lançar um dado para uma jogada defensiva.
//
// REGRA ATUALIZADA: em vez de apenas escolher um jogador, o usuário
// agora escolhe entre TRÊS OPÇÕES DEFENSIVAS DISTINTAS, cada uma com
// sua própria dificuldade (DC), bônus por posição, e efeito:
//
//   - CARRINHO AGRESSIVO: alto risco, alta recompensa. DC 16, mas se
//     bem-sucedido rouba a bola E reduz o progresso do oponente em 20%.
//   - INTERCEPTAÇÃO DE PASSE: jogada balanceada. DC 14, roubo normal.
//   - MARCAÇÃO PRESSIVA: baixo risco, baixa recompensa. DC 12, mas só
//     atrasa o oponente (reduz progresso em 10%) sem roubar a bola.
//
// Gatilho: em momentos aleatórios durante OPPONENT_TURN, com
// probabilidade base de 35%, escalando para 55% se o oponente está
// perto do gol (progresso >= 60%). O sorteio é refeito periodicamente
// (a cada 4-8s) enquanto durar o turno do oponente, para que a oferta
// apareça em "momentos aleatórios do jogo".
//
// REGRA ANTI-REPETIÇÃO: após uma roubada de bola bem-sucedida, a
// próxima jogada defensiva NÃO é oferecida no turno imediatamente
// seguinte. Isso evita múltiplas roubadas consecutivas.
// =====================================================================

/**
 * Catálogo de opções defensivas. Cada opção define:
 *   - id: identificador único
 *   - name, emoji, description: para exibição no card
 *   - dc: dificuldade do d20
 *   - bonusByPosition: faixa de bônus por posição do jogador escolhido
 *   - stealBall: se sucesso rouba a bola (true) ou só atrasa (false)
 *   - progressReduction: quanto reduz o progresso do oponente (0-100)
 *   - riskLabel: rótulo de risco para exibição (Baixo/Médio/Alto)
 *   - color: classe tailwind para o card
 */
export interface DefensiveOption {
  id: 'AGGRESSIVE_TACKLE' | 'PASS_INTERCEPTION' | 'PRESSING_MARK'
  name: string
  emoji: string
  description: string
  dc: number
  bonusByPosition: Record<string, [number, number]>
  stealBall: boolean
  progressReduction: number
  riskLabel: 'Baixo Risco' | 'Médio Risco' | 'Alto Risco'
  color: string
}

export const DEFENSIVE_OPTIONS: DefensiveOption[] = [
  {
    id: 'AGGRESSIVE_TACKLE',
    name: 'Carrinho Agressivo',
    emoji: '⚔️',
    description: 'Entrada dura para roubar a bola. Alto risco, alta recompensa: se bem-sucedido, rouba a posse E reduz o progresso do oponente em 20%.',
    dc: 16,
    bonusByPosition: {
      GK: [4, 6], DF: [5, 7], LD: [5, 7], LE: [5, 7], CB: [5, 7], DM: [5, 7],
      MF: [3, 5], AM: [2, 4], FW: [1, 3], ST: [1, 3], CF: [1, 3], RW: [1, 3], LW: [1, 3],
    },
    stealBall: true,
    progressReduction: 20,
    riskLabel: 'Alto Risco',
    color: 'from-rose-600 to-rose-800',
  },
  {
    id: 'PASS_INTERCEPTION',
    name: 'Interceptação de Passe',
    emoji: '🛡️',
    description: 'Antecipa o passe do oponente e intercepta. Jogada balanceada: se bem-sucedido, rouba a posse sem efeitos colaterais.',
    dc: 14,
    bonusByPosition: {
      GK: [4, 6], DF: [4, 6], LD: [4, 6], LE: [4, 6], CB: [4, 6], DM: [4, 6],
      MF: [3, 5], AM: [2, 4], FW: [1, 3], ST: [1, 3], CF: [1, 3], RW: [1, 3], LW: [1, 3],
    },
    stealBall: true,
    progressReduction: 0,
    riskLabel: 'Médio Risco',
    color: 'from-sky-600 to-sky-800',
  },
  {
    id: 'PRESSING_MARK',
    name: 'Marcação Pressiva',
    emoji: '🏃',
    description: 'Pressão alta para dificultar a saída do oponente. Baixo risco: mesmo se falhar não há punição, e se acertar reduz o progresso em 10% (mas não rouba a bola).',
    dc: 12,
    bonusByPosition: {
      GK: [3, 5], DF: [3, 5], LD: [3, 5], LE: [3, 5], CB: [3, 5], DM: [4, 6],
      MF: [4, 6], AM: [3, 5], FW: [2, 4], ST: [2, 4], CF: [2, 4], RW: [2, 4], LW: [2, 4],
    },
    stealBall: false,
    progressReduction: 10,
    riskLabel: 'Baixo Risco',
    color: 'from-amber-600 to-amber-800',
  },
]

/**
 * Sorteia 3 opções defensivas distintas para o usuário escolher.
 * Sempre retorna as 3 opções do catálogo, em ordem aleatória.
 */
export function sampleDefensiveOptions(): DefensiveOption[] {
  const shuffled = [...DEFENSIVE_OPTIONS].sort(() => Math.random() - 0.5)
  return shuffled
}

export interface DefensivePlayResult {
  /** Opção defensiva escolhida pelo usuário */
  optionId: DefensiveOption['id']
  /** Nome da opção (para exibição) */
  optionName: string
  /** Emoji da opção */
  optionEmoji: string
  /** Se a opção rouba a bola em caso de sucesso */
  optionStealsBall: boolean
  /** Redução de progresso aplicada ao oponente (0 se não houver) */
  progressReduction: number
  /** Jogador que executou a jogada defensiva */
  playerName: string
  /** Posição do jogador (para narrativa) */
  position: string
  /** Rolagem pura do d20 */
  dice: number
  /** Bônus de habilidade aplicado (baseado na posição e na opção) */
  bonus: number
  /** Total = dice + bonus */
  total: number
  /** Dificuldade da jogada */
  dc: number
  /** Sucesso geral? */
  success: boolean
  /** Tipo de crítico */
  critical: 'none' | 'crit_hit' | 'crit_fail'
  /** Se a roubada de bola foi bem-sucedida (success && option.stealBall && !crit_fail) */
  ballStolen: boolean
  /** Narrativa descritiva do lance */
  narrative: string
}

/**
 * Bônus de defesa por posição (espelha o que está no DefensivePlayDialog).
 * Mantido para compatibilidade — agora cada DefensiveOption tem seu próprio
 * bonusByPosition, mas este mapa é usado como fallback.
 */
const DEFENSIVE_BONUS_BY_POSITION: Record<string, [number, number]> = {
  GK:  [4, 6],  // Goleiro
  DF:  [4, 6],  // Zagueiro
  LD:  [4, 6],  // Lateral Direito
  LE:  [4, 6],  // Lateral Esquerdo
  CB:  [4, 6],  // Zagueiro Central
  DM:  [4, 6],  // Volante
  MF:  [2, 4],  // Meio-campo
  AM:  [2, 4],  // Meio-atacante
  FW:  [1, 3],  // Atacante
  ST:  [1, 3],  // Centroavante
  CF:  [1, 3],  // Centroavante
  RW:  [1, 3],  // Ponta Direita
  LW:  [1, 3],  // Ponta Esquerda
}

const DEFENSIVE_DC = 14  // Dificuldade base para jogada defensiva (legacy)

const DEFENSIVE_NARRATIVES_SUCCESS_STEAL = [
  '{player} antecipa o passe e rouba a bola!',
  '{player} faz carrinho certeiro e recupera a posse!',
  '{player} intercepta o lançamento e inicia contra-ataque!',
  '{player} vence a dividida e fica com a bola!',
  '{player} pressiona, rouba a bola e abre jogada!',
]

const DEFENSIVE_NARRATIVES_SUCCESS_PRESS = [
  '{player} faz marcação pressiva e atrasa o avanço!',
  '{player} fecha os espaços e o oponente recua!',
  '{player} corta o passe e o ataque perde o ímpeto!',
  '{player} adianta a linha e o oponente hesita!',
]

const DEFENSIVE_NARRATIVES_FAIL = [
  '{player} tenta interceptar mas falha — o oponente passa.',
  '{player} arrisca o carrinho mas erra — bola passa.',
  '{player} não consegue roubar a bola. Vez do oponente continua.',
  '{player} tenta antecipar mas o atacante se protege.',
]

const DEFENSIVE_NARRATIVES_CRIT_FAIL = [
  '{player} escorrega e tropeça! Falha automática — vez do oponente continua.',
  '{player} chega atrasado e comete falta! Vez do oponente continua.',
  '{player} perde o equilíbrio e o oponente se aproveita!',
]

/**
 * Resolve uma jogada defensiva com opção escolhida.
 *
 * @param option Opção defensiva escolhida pelo usuário (das 3 disponíveis)
 * @param position Posição do jogador escolhido para defender
 * @param playerName Nome do jogador (para narrativa)
 * @param userLevel Nível de XP do usuário (opcional). Aplica benefícios:
 *                  - Nível 2+ (Defensor Nato): +1 de bônus na jogada defensiva
 *                  - Nível 7+ (Tático): re-roll gratuito de falhas (1x por partida,
 *                    gerenciado pelo chamador, não por esta função)
 */
export function resolveDefensivePlay(
  option: DefensiveOption,
  position: string,
  playerName: string,
  userLevel: number = 1,
): DefensivePlayResult {
  const dice = rollD20()
  const bonusRange = option.bonusByPosition[position] ?? DEFENSIVE_BONUS_BY_POSITION[position] ?? [2, 4]
  let bonus = bonusRange[0] + Math.floor(Math.random() * (bonusRange[1] - bonusRange[0] + 1))

  // ===== CORREÇÃO v3: benefício de Nível 2 — Defensor Nato =====
  // +1 de bônus na jogada defensiva (representa ~5% de chance extra vs DC 14-16).
  // Aplicado APENAS em rolls não-críticos (natural 1 ou 20 continuam automáticos).
  const levelDefBonus = userLevel >= 2 ? 1 : 0
  bonus += levelDefBonus

  const total = dice + bonus
  const dc = option.dc

  let critical: DefensivePlayResult['critical'] = 'none'
  let success: boolean
  let ballStolen: boolean

  // Regras D&D: natural 20 = crit hit (roubou automaticamente se a opção rouba bola)
  if (dice === 20) {
    critical = 'crit_hit'
    success = true
    // No crit hit, mesmo opções de "pressing" reduzem o progresso do oponente em dobro
    ballStolen = option.stealBall
  } else if (dice === 1) {
    critical = 'crit_fail'
    success = false
    ballStolen = false
  } else {
    success = total >= dc
    // Só rouba a bola se a opção rouba E foi sucesso
    ballStolen = success && option.stealBall
  }

  // Gera narrativa conforme resultado
  let narrative: string
  if (critical === 'crit_fail') {
    narrative = DEFENSIVE_NARRATIVES_CRIT_FAIL[Math.floor(Math.random() * DEFENSIVE_NARRATIVES_CRIT_FAIL.length)]
      .replace('{player}', playerName)
  } else if (success) {
    const templates = ballStolen
      ? DEFENSIVE_NARRATIVES_SUCCESS_STEAL
      : DEFENSIVE_NARRATIVES_SUCCESS_PRESS
    narrative = templates[Math.floor(Math.random() * templates.length)].replace('{player}', playerName)
  } else {
    narrative = DEFENSIVE_NARRATIVES_FAIL[Math.floor(Math.random() * DEFENSIVE_NARRATIVES_FAIL.length)]
      .replace('{player}', playerName)
  }

  return {
    optionId: option.id,
    optionName: option.name,
    optionEmoji: option.emoji,
    optionStealsBall: option.stealBall,
    progressReduction: success ? option.progressReduction : 0,
    playerName,
    position,
    dice,
    bonus,
    total,
    dc,
    success,
    critical,
    ballStolen,
    narrative,
  }
}

/**
 * Decide se uma jogada defensiva deve ser oferecida neste momento.
 *
 * ATUALIZAÇÃO: agora aceita um parâmetro `attemptInTurn` que indica
 * quantas vezes já tentamos oferecer neste turno do oponente. O sorteio
 * é refeito periodicamente (a cada 4-8s) e a cada nova oferta a chance
 * aumenta ligeiramente, para garantir que o usuário eventualmente
 * tenha a oportunidade se o turno do oponente durar muito.
 *
 * @param opponentProgress Progresso atual do oponente (0-100)
 * @param lastTurnStole Se houve roubada de bola no turno anterior (anti-repetição)
 * @param attemptInTurn Número da tentativa de oferta neste turno (0, 1, 2, ...)
 * @param currentTurn Turno atual (para logging)
 */
export function shouldOfferDefensivePlay(
  opponentProgress: number,
  lastTurnStole: boolean,
  attemptInTurn: number = 0,
  currentTurn: number = 0,
): boolean {
  // ===== REGRA ANTI-REPETIÇÃO: se roubou no turno anterior, não oferece =====
  // Isto evita múltiplas roubadas de bola consecutivas, conforme exigido pelo usuário.
  if (lastTurnStole) return false

  // Probabilidade base 35%, escalando para 55% se oponente está perto do gol
  let chance = 0.35
  if (opponentProgress >= 60) chance = 0.55
  if (opponentProgress >= 80) chance = 0.65

  // A cada nova tentativa no mesmo turno, aumenta 10% a chance (cap 90%)
  // Isto garante que o usuário eventualmente terá oportunidade em turnos longos.
  chance = Math.min(0.90, chance + attemptInTurn * 0.10)

  return Math.random() < chance
}

/**
 * Sorteia um intervalo aleatório (em ms) para a próxima tentativa de
 * oferecer jogada defensiva. O intervalo fica entre 4s e 8s.
 */
export function nextDefensiveOfferDelayMs(): number {
  return 4000 + Math.floor(Math.random() * 4000)  // 4000-8000ms
}

// =====================================================================
// ===== CORREÇÃO 9: SISTEMA DE XP / RECOMPENSAS / PROGRESSÃO ===========
// ---------------------------------------------------------------------
// Cada vitória acumula XP no perfil do usuário.
// A cada nível, o usuário desbloqueia benefícios cumulativos:
//   - Nível 2: +5% chance de jogada defensiva bem-sucedida
//   - Nível 3: +1 substituição extra por partida (6 no total)
//   - Nível 5: Multiplicador de XP 1.25x em vitórias
//   - Nível 7: Acesso a ações especiais bônus
//   - Nível 10: Multiplicador de XP 1.5x em vitórias
//
// A UI exibe uma barra de progressão animada do nível atual -> próximo.
// =====================================================================

export interface XpLevelInfo {
  level: number
  currentLevelXp: number       // XP total acumulado para entrar no nível atual
  nextLevelXp: number          // XP total necessário para o próximo nível
  xpIntoCurrentLevel: number   // XP já acumulado dentro do nível atual
  xpToNextLevel: number        // XP restante para subir de nível
  progressPct: number          // 0-100, porcentagem da barra de progressão
  activeBenefits: XpBenefit[]  // benefícios atualmente ativos
}

export interface XpBenefit {
  level: number
  name: string
  description: string
  emoji: string
}

/** Tabela de benefícios desbloqueados por nível */
export const XP_BENEFITS: XpBenefit[] = [
  { level: 2, name: 'Defensor Nato', description: '+5% chance de sucesso em jogadas defensivas', emoji: '🛡️' },
  { level: 3, name: 'Banco Qualificado', description: '+1 substituição por partida (6 no total)', emoji: '👥' },
  { level: 5, name: 'Veterano', description: '+25% XP em cada vitória', emoji: '⭐' },
  { level: 7, name: 'Tático', description: 'Acesso a ações especiais extras', emoji: '🎯' },
  { level: 10, name: 'Lenda Viva', description: '+50% XP em cada vitória', emoji: '👑' },
]

/** Curva de XP: cada nível requer 100 XP a mais que o anterior */
export function xpRequiredForLevel(level: number): number {
  // nível 1 = 0, nível 2 = 100, nível 3 = 250, nível 4 = 450, ...
  // Fórmula: soma de 100 + 50*(n-2) para n>=2, ou seja, (n-1)*(n)*25
  if (level <= 1) return 0
  return (level - 1) * level * 25
}

/**
 * Calcula informações de nível e progressão a partir do XP total do usuário.
 */
export function computeXpLevelInfo(totalXp: number): XpLevelInfo {
  let level = 1
  while (xpRequiredForLevel(level + 1) <= totalXp) {
    level++
  }

  const currentLevelXp = xpRequiredForLevel(level)
  const nextLevelXp = xpRequiredForLevel(level + 1)
  const xpIntoCurrentLevel = totalXp - currentLevelXp
  const xpToNextLevel = nextLevelXp - totalXp
  const progressPct = nextLevelXp === currentLevelXp
    ? 100
    : Math.round((xpIntoCurrentLevel / (nextLevelXp - currentLevelXp)) * 100)

  const activeBenefits = XP_BENEFITS.filter(b => b.level <= level)

  return {
    level,
    currentLevelXp,
    nextLevelXp,
    xpIntoCurrentLevel,
    xpToNextLevel,
    progressPct,
    activeBenefits,
  }
}

/**
 * Calcula o número máximo de substituições com base no nível do usuário.
 * Base = 5; nível 3+ = 6.
 */
export function getMaxSubstitutionsForLevel(level: number): number {
  return level >= 3 ? 6 : 5
}

/**
 * Multiplicador de XP por vitória com base no nível.
 * Nível 5+ = 1.25x; nível 10+ = 1.5x.
 */
export function getXpMultiplierForLevel(level: number): number {
  if (level >= 10) return 1.5
  if (level >= 5) return 1.25
  return 1.0
}
