// =====================================================================
// XP System — Regras de XP para equipes e jogadores
// --------------------------------------------------------------------
// Responsável por:
//   1. Calcular XP concedido após uma partida (vitória/derrota/empate)
//   2. Calcular nível e progressão a partir do XP total
//   3. Definir recompensas por nível (bônus, habilidades, desbloqueios)
//   4. Garantir idempotência — uma mesma origem (ex.: matchId) não concede
//      XP mais de uma vez
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
// Cálculo de XP por partida (REGRAS_DE_XP)
// ---------------------------------------------------------------------

export interface XpBreakdown {
  baseXp: number
  difficultyBonus: number
  performanceBonus: number
  specialBonus: number
  levelMultiplier: number
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
}

/**
 * Calcula o XP que será concedido ao final de uma partida.
 *
 * Regras:
 *   - Base: GAME_MODE_CONFIG[mode].xpWin|xpLose|xpDraw
 *   - Bônus de dificuldade: se opponentRating > ownRating, +2 por ponto de diferença (cap +20)
 *   - Bônus de desempenho: vitória com goalDifference ≥ 3 dá +10 XP
 *   - Bônus de eventos especiais: +5 por evento (cap +30)
 *   - Multiplicador de nível: aplica getXpMultiplierForLevel
 *   - Cap final: 100 XP por partida (configurável)
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

  // Subtotal antes do multiplicador
  const subtotal = baseXp + difficultyBonus + performanceBonus + specialBonus

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

  const uncapped = subtotal + multiplierBonus
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
