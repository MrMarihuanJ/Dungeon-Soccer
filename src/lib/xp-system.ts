// =====================================================================
// XP System — Regras de XP para equipes e jogadores
// --------------------------------------------------------------------
// Responsável por:
//   1. Calcular XP concedido após uma partida (vitória/derrota/empate)
//   2. Calcular nível e progressão a partir do XP total
//   3. Definir recompensas por nível (bônus, habilidades, desbloqueios)
//   4. Garantir idempotência — uma mesma origem (ex.: matchId) não concede
//      XP mais de uma vez
//   5. Computar estatísticas de partida (gols, cartões, faltas, etc.)
//      a partir dos eventos e incorporá-las ao cálculo de XP
//
// IDempotência:
//   - Cada concessão é registrada na tabela `XpGrant` com `source` único
//     por usuário (ex.: "match:<matchId>:win").
//   - Tentar conceder a mesma origem duas vezes falha com P2002 (unique
//     constraint) e é tratada como no-op pelo caller.
//   - O campo `Match.xpGranted` é uma segunda camada de defesa: a transação
//     de fim de partida faz `UPDATE WHERE xpGranted = false`.
// =====================================================================

import type { GameMode } from './match-engine'
import { GAME_MODE_CONFIG } from './match-engine'

// ---------------------------------------------------------------------
// Constantes (REGRAS_DE_XP)
// ---------------------------------------------------------------------

/**
 * XP necessário para alcançar cada nível.
 * Curva: nível N requer N * 100 XP cumulativos.
 *   Nível 1: 0 XP (inicial)
 *   Nível 2: 100 XP
 *   Nível 3: 300 XP
 *   Nível 4: 600 XP
 *   Nível 5: 1000 XP
 *   Nível 10: 4500 XP
 *   Nível 20: 19000 XP
 */
export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0
  // Soma de 1..(level-1) * 100 = (level-1) * level * 50
  return (level - 1) * level * 50
}

/** Nível máximo alcançável */
export const MAX_LEVEL = 50

/**
 * Calcula nível e progresso a partir do XP total.
 */
export function getLevelFromXp(totalXp: number): {
  level: number
  currentLevelXp: number
  nextLevelXp: number
  progressPct: number
  isMaxLevel: boolean
} {
  let level = 1
  while (level < MAX_LEVEL && xpRequiredForLevel(level + 1) <= totalXp) {
    level += 1
  }
  const isMaxLevel = level >= MAX_LEVEL
  const currentLevelXp = xpRequiredForLevel(level)
  const nextLevelXp = isMaxLevel ? currentLevelXp : xpRequiredForLevel(level + 1)
  const progressIntoLevel = totalXp - currentLevelXp
  const levelRange = nextLevelXp - currentLevelXp
  const progressPct = isMaxLevel ? 100 : Math.min(100, (progressIntoLevel / levelRange) * 100)

  return { level, currentLevelXp, nextLevelXp, progressPct, isMaxLevel }
}

// ---------------------------------------------------------------------
// Recompensas por nível
// ---------------------------------------------------------------------

export type RewardKind =
  | 'BONUS_XP'
  | 'BONUS_SUBSTITUTION'
  | 'UNLOCK_FORMATION'
  | 'UNLOCK_PLAYER_TIER'
  | 'COSMETIC_BADGE'
  | 'FREEKICK_BONUS'

export interface LevelReward {
  level: number
  kind: RewardKind
  label: string
  description: string
  emoji: string
}

/**
 * Tabela de recompensas por nível.
 * Projetada para progressão equilibrada — sem vantagens competitivas
// significativas que prejudiquem jogadores iniciantes.
 */
export const LEVEL_REWARDS: LevelReward[] = [
  { level: 2,  kind: 'COSMETIC_BADGE',       label: 'Badge Estreante',     description: 'Selô de jogador estreante na Dungeon.',                       emoji: '🌱' },
  { level: 3,  kind: 'BONUS_XP',             label: '+5% XP por vitória',   description: 'Bônus de XP em vitórias (cap 50/match).',                     emoji: '✨' },
  { level: 5,  kind: 'UNLOCK_FORMATION',     label: 'Formação 3-4-3',       description: 'Desbloqueia a formação ofensiva 3-4-3.',                       emoji: '📐' },
  { level: 7,  kind: 'FREEKICK_BONUS',       label: 'Cobrador Especialista',description: '+1 em jogadas de dado de cobrança de falta.',                  emoji: '🎯' },
  { level: 10, kind: 'UNLOCK_PLAYER_TIER',   label: 'Tier TOP5 liberado',   description: 'Acesso a jogadores do TOP5 (Premier, La Liga, etc.).',         emoji: '⭐' },
  { level: 12, kind: 'BONUS_SUBSTITUTION',   label: 'Sub extra (6 no total)', description: 'Limite de substituições aumentado para 6 (apenas PVE).',     emoji: '↔️' },
  { level: 15, kind: 'UNLOCK_FORMATION',     label: 'Formação 4-2-3-1',     description: 'Desbloqueia a formação equilibrada 4-2-3-1.',                  emoji: '📐' },
  { level: 20, kind: 'COSMETIC_BADGE',       label: 'Badge Veterano',       description: 'Selo de veterano da Dungeon.',                                 emoji: '🏅' },
  { level: 25, kind: 'BONUS_XP',             label: '+10% XP por vitória',  description: 'Bônus de XP em vitórias (cap 100/match). Substitui o bônus anterior.', emoji: '✨' },
  { level: 30, kind: 'UNLOCK_PLAYER_TIER',   label: 'Tier TOP10 liberado',  description: 'Acesso a jogadores do TOP10.',                                  emoji: '⭐' },
  { level: 40, kind: 'COSMETIC_BADGE',       label: 'Badge Lendário',       description: 'Selo lendário da Dungeon.',                                    emoji: '🏆' },
  { level: 50, kind: 'COSMETIC_BADGE',       label: 'Badge Mestre da Dungeon', description: 'O maior título do Dungeon & Soccer.',                       emoji: '👑' },
]

export function getRewardsForLevel(level: number): LevelReward[] {
  return LEVEL_REWARDS.filter((r) => r.level === level)
}

export function getAllEarnedRewards(currentLevel: number): LevelReward[] {
  return LEVEL_REWARDS.filter((r) => r.level <= currentLevel)
}

/**
 * Calcula o multiplicador de XP por nível do usuário.
 * Nível 3-9: +5%, Nível 25+: +10%, outros: +0%.
 */
export function getXpMultiplierForLevel(level: number): number {
  if (level >= 25) return 0.10
  if (level >= 3) return 0.05
  return 0
}

// ---------------------------------------------------------------------
// ===== ESTATÍSTICAS DE PARTIDA (NOVO v3.2) =====
// ---------------------------------------------------------------------
// O usuário pediu que o XP considerasse: gols, cartões, faltas cometidas
// e sofridas, impedimentos, roubadas de bola e defesas do goleiro.
// Esta função extrai essas estatísticas dos eventos da partida.
// ---------------------------------------------------------------------

/**
 * Estatísticas de um time em uma partida, extraídas dos eventos.
 * Cada valor é computado a partir do array de MatchEvent.
 */
export interface TeamMatchStats {
  /** Gols marcados pelo time */
  goals: number
  /** Cartões amarelos recebidos */
  yellowCards: number
  /** Cartões vermelhos recebidos */
  redCards: number
  /** Faltas cometidas pelo time (FOUL + PENALTY_KICK) */
  foulsCommitted: number
  /** Faltas sofridas pelo time (quando o adversário cometeu falta) */
  foulsSuffered: number
  /** Impedimentos cometidos */
  offsides: number
  /** Roubadas de bola (defensive plays bem-sucedidas com ballStolen) */
  ballSteals: number
  /** Defesas do goleiro (defensive plays bem-sucedidas sem ballStolen, por goleiro) */
  goalkeeperSaves: number
  /** Total de jogadas (turnos) */
  totalPlays: number
  /** Jogadas bem-sucedidas (sucesso no dado) */
  successfulPlays: number
  /** Eventos especiais (crit hits, gols, etc.) */
  specialEvents: number
}

/**
 * Tipo minimalista para MatchEvent — usado para não criar dependência
 * circular com match-engine.ts. Apenas os campos necessários.
 */
interface MinimalMatchEvent {
  possession: string
  isGoal?: boolean
  roll?: { success?: boolean; critical?: string }
  penaltyEvent?: {
    type: string
    possession: string
    favoredPossession: string
  } | null
  // Eventos de jogada defensiva (roubada de bola / defesa)
  defensivePlay?: {
    possession: string  // quem defendeu
    ballStolen?: boolean
    success?: boolean
    isGoalkeeper?: boolean
  } | null
  // Eventos de cobrança de falta
  freeKickMultiplier?: { value?: number; kind?: string } | null
}

/**
 * Computa estatísticas de um time a partir dos eventos da partida.
 *
 * @param events Array de eventos (do eventsJson)
 * @param teamSide 'HOME' ou 'AWAY' — qual time estamos computando
 * @returns Estatísticas agregadas
 */
export function computeTeamMatchStats(
  events: MinimalMatchEvent[],
  teamSide: 'HOME' | 'AWAY',
): TeamMatchStats {
  const opponentSide = teamSide === 'HOME' ? 'AWAY' : 'HOME'
  const stats: TeamMatchStats = {
    goals: 0,
    yellowCards: 0,
    redCards: 0,
    foulsCommitted: 0,
    foulsSuffered: 0,
    offsides: 0,
    ballSteals: 0,
    goalkeeperSaves: 0,
    totalPlays: 0,
    successfulPlays: 0,
    specialEvents: 0,
  }

  for (const ev of events) {
    // Total de jogadas do time
    if (ev.possession === teamSide) {
      stats.totalPlays += 1
      if (ev.roll?.success) stats.successfulPlays += 1
      if (ev.isGoal) {
        stats.goals += 1
        stats.specialEvents += 1
      }
      if (ev.roll?.critical === 'crit_hit') stats.specialEvents += 1
    }

    // Penalty events
    if (ev.penaltyEvent) {
      const pe = ev.penaltyEvent
      // Time que COMETEU a falta = pe.possession (quem estava com a bola)
      if (pe.possession === teamSide) {
        // Este time cometeu a infração
        switch (pe.type) {
          case 'FOUL':
            stats.foulsCommitted += 1
            break
          case 'PENALTY_KICK':
            stats.foulsCommitted += 1 // pênalti é falta grave
            break
          case 'YELLOW_CARD':
            stats.yellowCards += 1
            stats.foulsCommitted += 1 // amarelo geralmente vem de falta
            break
          case 'RED_CARD':
            stats.redCards += 1
            stats.foulsCommitted += 1
            break
          case 'OFFSIDE':
            stats.offsides += 1
            break
        }
      }
      // Time que SOFREU a falta = pe.favoredPossession
      if (pe.favoredPossession === teamSide) {
        if (pe.type === 'FOUL' || pe.type === 'PENALTY_KICK') {
          stats.foulsSuffered += 1
        }
      }
    }

    // Defensive plays (roubada de bola / defesa)
    if (ev.defensivePlay) {
      const dp = ev.defensivePlay
      if (dp.possession === teamSide) {
        if (dp.ballStolen) {
          stats.ballSteals += 1
          stats.specialEvents += 1
        } else if (dp.success && dp.isGoalkeeper) {
          stats.goalkeeperSaves += 1
          stats.specialEvents += 1
        }
      }
    }
  }

  return stats
}

// ---------------------------------------------------------------------
// Cálculo de XP por partida (REGRAS_DE_XP)
// ---------------------------------------------------------------------

export interface XpBreakdown {
  baseXp: number
  difficultyBonus: number
  performanceBonus: number
  specialBonus: number
  levelMultiplier: number
  statsBonus: number
  totalXp: number
  cap: number
  capped: boolean
  breakdown: Array<{ label: string; amount: number; sign: '+' | '-' }>
}

export interface MatchXpInput {
  gameMode: GameMode
  result: 'WIN' | 'LOSS' | 'DRAW'
  /** Diferença de gols (para vitórias) — usado para bônus de desempenho */
  goalDifference?: number
  /** Dificuldade do adversário (rating do time adversário, 0-100) */
  opponentRating?: number
  /** Próprio rating (0-100) — para calcular dificuldade relativa */
  ownRating?: number
  /** Nível do usuário (para multiplicador de nível) */
  userLevel: number
  /** Eventos especiais (gols contra, críticos, etc.) — cada um dá +5 XP */
  specialEvents?: number
  /** Cap de XP por partida — default 100 */
  cap?: number
  /** Estatísticas detalhadas do time (NOVO v3.2) — habilita bônus por stats */
  stats?: TeamMatchStats
}

/**
 * Calcula o XP que será concedido ao final de uma partida.
 *
 * Regras:
 *   - Base: GAME_MODE_CONFIG[mode].xpWin|xpLose|xpDraw
 *   - Bônus de dificuldade: se opponentRating > ownRating, +2 por ponto de diferença (cap +20)
 *   - Bônus de desempenho: vitória com goalDifference ≥ 3 dá +10 XP
 *   - Bônus de eventos especiais: +5 por evento (cap +30)
 *   - Bônus de estatísticas (NOVO v3.2):
 *       * +3 por gol marcado (cap +15)
 *       * +2 por roubo de bola (cap +10)
 *       * +3 por defesa do goleiro (cap +12)
 *       * +1 por falta sofrida (cap +5)
 *       * -1 por cartão amarelo (cap -6)
 *       * -3 por cartão vermelho (cap -9)
 *       * -1 por impedimento (cap -3)
 *   - Multiplicador de nível: aplica getXpMultiplierForLevel
 *   - Cap final: 100 XP por partida (configurável)
 *
 * NOTA: Penalidades (cartões, impedimentos) reduzem XP mas nunca abaixo de 0.
 */
export function calculateMatchXp(input: MatchXpInput): XpBreakdown {
  const config = GAME_MODE_CONFIG[input.gameMode]
  const baseXp =
    input.result === 'WIN' ? config.xpWin : input.result === 'DRAW' ? config.xpDraw : config.xpLose

  const breakdown: XpBreakdown['breakdown'] = []
  breakdown.push({ label: `Base (${input.result} em ${input.gameMode})`, amount: baseXp, sign: '+' })

  // Bônus de dificuldade
  let difficultyBonus = 0
  if (input.opponentRating && input.ownRating) {
    const diff = input.opponentRating - input.ownRating
    if (diff > 0) {
      difficultyBonus = Math.min(20, diff * 2)
      breakdown.push({ label: `Adversário +${diff} rating`, amount: difficultyBonus, sign: '+' })
    }
  }

  // Bônus de desempenho
  let performanceBonus = 0
  if (input.result === 'WIN' && input.goalDifference && input.goalDifference >= 3) {
    performanceBonus = 10
    breakdown.push({ label: 'Vitória dominante (≥3 gols)', amount: performanceBonus, sign: '+' })
  }

  // Bônus de eventos especiais
  let specialBonus = 0
  if (input.specialEvents && input.specialEvents > 0) {
    specialBonus = Math.min(30, input.specialEvents * 5)
    breakdown.push({ label: `${input.specialEvents} evento(s) especial(is)`, amount: specialBonus, sign: '+' })
  }

  // ===== BÔNUS DE ESTATÍSTICAS (NOVO v3.2) =====
  let statsBonus = 0
  if (input.stats) {
    const s = input.stats

    // Positivos
    const goalsBonus = Math.min(15, s.goals * 3)
    if (goalsBonus > 0) {
      statsBonus += goalsBonus
      breakdown.push({ label: `${s.goals} gol(s) marcado(s)`, amount: goalsBonus, sign: '+' })
    }

    const stealsBonus = Math.min(10, s.ballSteals * 2)
    if (stealsBonus > 0) {
      statsBonus += stealsBonus
      breakdown.push({ label: `${s.ballSteals} roubo(s) de bola`, amount: stealsBonus, sign: '+' })
    }

    const savesBonus = Math.min(12, s.goalkeeperSaves * 3)
    if (savesBonus > 0) {
      statsBonus += savesBonus
      breakdown.push({ label: `${s.goalkeeperSaves} defesa(s) do goleiro`, amount: savesBonus, sign: '+' })
    }

    const foulsSufferedBonus = Math.min(5, s.foulsSuffered)
    if (foulsSufferedBonus > 0) {
      statsBonus += foulsSufferedBonus
      breakdown.push({ label: `${s.foulsSuffered} falta(s) sofrida(s)`, amount: foulsSufferedBonus, sign: '+' })
    }

    // Negativos (penalidades por Fair Play)
    const yellowPenalty = Math.min(6, s.yellowCards * 1)
    if (yellowPenalty > 0) {
      statsBonus -= yellowPenalty
      breakdown.push({ label: `${s.yellowCards} cartão(ões) amarelo(s)`, amount: yellowPenalty, sign: '-' })
    }

    const redPenalty = Math.min(9, s.redCards * 3)
    if (redPenalty > 0) {
      statsBonus -= redPenalty
      breakdown.push({ label: `${s.redCards} cartão(ões) vermelho(s)`, amount: redPenalty, sign: '-' })
    }

    const offsidePenalty = Math.min(3, s.offsides * 1)
    if (offsidePenalty > 0) {
      statsBonus -= offsidePenalty
      breakdown.push({ label: `${s.offsides} impedimento(s)`, amount: offsidePenalty, sign: '-' })
    }
  }

  // Subtotal antes do multiplicador
  const subtotal = baseXp + difficultyBonus + performanceBonus + specialBonus + statsBonus

  // Multiplicador de nível
  const levelMultiplier = getXpMultiplierForLevel(input.userLevel)
  let multiplierBonus = 0
  if (levelMultiplier > 0) {
    multiplierBonus = Math.floor(subtotal * levelMultiplier)
    breakdown.push({
      label: `Bônus de nível (+${(levelMultiplier * 100).toFixed(0)}%)`,
      amount: multiplierBonus,
      sign: '+',
    })
  }

  const uncapped = Math.max(0, subtotal + multiplierBonus) // nunca negativo
  const cap = input.cap ?? 100
  const capped = uncapped > cap
  const totalXp = Math.min(cap, uncapped)

  if (capped) {
    breakdown.push({ label: `Cap aplicado (${cap})`, amount: uncapped - cap, sign: '-' })
  }

  return {
    baseXp,
    difficultyBonus,
    performanceBonus,
    specialBonus,
    levelMultiplier,
    statsBonus,
    totalXp,
    cap,
    capped,
    breakdown,
  }
}

// ---------------------------------------------------------------------
// Source keys (para idempotência)
// ---------------------------------------------------------------------

/** Gera a chave única de origem para uma concessão de XP de partida. */
export function matchXpSource(matchId: string, result: 'WIN' | 'LOSS' | 'DRAW'): string {
  return `match:${matchId}:${result.toLowerCase()}`
}

/** Gera a chave única para um achievement. */
export function achievementXpSource(slug: string): string {
  return `achievement:${slug}`
}

// ---------------------------------------------------------------------
// Verificação de level-up
// ---------------------------------------------------------------------

export interface LevelUpResult {
  leveledUp: boolean
  oldLevel: number
  newLevel: number
  newRewards: LevelReward[]
}

export function checkLevelUp(oldXp: number, newXp: number): LevelUpResult {
  const oldLevel = getLevelFromXp(oldXp).level
  const newLevel = getLevelFromXp(newXp).level
  const leveledUp = newLevel > oldLevel
  const newRewards: LevelReward[] = []

  if (leveledUp) {
    for (let lv = oldLevel + 1; lv <= newLevel; lv++) {
      newRewards.push(...getRewardsForLevel(lv))
    }
  }

  return { leveledUp, oldLevel, newLevel, newRewards }
}
