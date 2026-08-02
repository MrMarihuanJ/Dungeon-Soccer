// =====================================================================
// Free Kick System — Sistema de cobrança de falta
// --------------------------------------------------------------------
// Responsável por:
//   1. Gerar multiplicadores aleatórios (positivos ou negativos) que
//      afetam a chance de sucesso, o bônus do dado e a probabilidade
//      de gol em cobranças de falta.
//   2. Selecionar o cobrador de forma aleatória, respeitando elegibilidade
//      e evitando repetição consecutiva do mesmo jogador.
//   3. Garantir que a aleatoriedade seja gerada no servidor (esta função
//      é chamada APENAS em API routes — nunca no cliente).
//
// Estratégia de balanceamento:
//   - Multiplicadores positivos: bônus de +1 a +3 (raros +4 ou +5)
//   - Multiplicadores negativos: penalidade de -1 a -3 (raros -4)
//   - Distribuição: ~55% positivos, ~35% negativos, ~10% neutros
//   - Distribuição assimétrica favorece levemente o atacante para manter
//     o jogo ofensivo, mas com risco real de penalidade.
//
// Idempotência:
//   - Esta função é puramente computacional (não toca DB).
//   - O resultado é persistido no campo `pendingPenaltyEventJson` da Match
//     pelo endpoint /api/match/action quando gera uma cobrança de falta.
//   - O endpoint /api/match/free-kick-resolve consome e limpa o pendente.
// =====================================================================

import type { PenaltyEvent, Possession } from './match-engine'

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------

/** Indica a direção do multiplicador (para UI/coloração) */
export type MultiplierKind = 'BONUS' | 'PENALTY' | 'NEUTRAL'

/** Onde o multiplicador é aplicado */
export type MultiplierTarget = 'SUCCESS_CHANCE' | 'DICE_BONUS' | 'GOAL_CHANCE'

export interface FreeKickMultiplier {
  /** Valor inteiro do multiplicador (positivo, negativo ou zero) */
  value: number
  kind: MultiplierKind
  /** A que aspecto da cobrança o multiplicador afeta */
  target: MultiplierTarget
  /** Rótulo curto para exibição imediata ("Bônus de cobrança: +2") */
  label: string
  /** Descrição narrativa para o log de eventos */
  description: string
}

export interface FreeKickTaker {
  /** ID do jogador escolhido como cobrador */
  playerId: string
  /** Nome do jogador (para narrativa) */
  playerName: string
  /** Posição no campo (FW, MF, etc.) */
  position: string
}

export interface FreeKickAssignment {
  multiplier: FreeKickMultiplier
  taker: FreeKickTaker
  /** Hash determinístico da jogada para idempotência no cliente */
  nonce: string
}

// ---------------------------------------------------------------------
// Constantes de balanceamento
// ---------------------------------------------------------------------

// Pesos para o valor do multiplicador.
// Soma 100. Favorecemos leve os bônus para manter o jogo ofensivo.
const MULTIPLIER_WEIGHTS: Array<{ value: number; weight: number }> = [
  { value: -4, weight: 2 },  // 2%  — penalidade severa (raro)
  { value: -3, weight: 5 },  // 5%  — penalidade forte
  { value: -2, weight: 12 }, // 12% — penalidade média
  { value: -1, weight: 16 }, // 16% — penalidade leve
  { value:  0, weight: 10 }, // 10% — neutro (apenas muda o target)
  { value:  1, weight: 18 }, // 18% — bônus leve
  { value:  2, weight: 18 }, // 18% — bônus médio
  { value:  3, weight: 13 }, // 13% — bônus forte
  { value:  4, weight: 5 },  // 5%  — bônus severo (raro)
  { value:  5, weight: 1 },  // 1%  — bônus crítico (muito raro)
]

// Pesos para o target do multiplicador.
const TARGET_WEIGHTS: Array<{ value: MultiplierTarget; weight: number }> = [
  { value: 'DICE_BONUS',     weight: 50 }, // mais comum — afeta a rolagem
  { value: 'SUCCESS_CHANCE', weight: 30 }, // afeta a probabilidade de sucesso
  { value: 'GOAL_CHANCE',    weight: 20 }, // afeta a chance de gol
]

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

/** Sorteia um item com base em pesos */
function weightedPick<T>(items: Array<{ value: T; weight: number }>): T {
  const total = items.reduce((sum, i) => sum + i.weight, 0)
  let r = Math.random() * total
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return item.value
  }
  return items[items.length - 1].value
}

/** Gera um nonce curto para idempotência visual no cliente */
function generateNonce(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// ---------------------------------------------------------------------
// Geração de multiplicador
// ---------------------------------------------------------------------

/**
 * Gera um multiplicador aleatório para uma cobrança de falta.
 *
 * Esta função DEVE ser chamada apenas no servidor (API route) — o cliente
 * nunca deve gerar multiplicadores para evitar manipulação.
 *
 * @param forcedValue Se informado, usa este valor (para testes determinísticos)
 * @param forcedTarget Se informado, usa este target (Para testes)
 */
export function generateFreeKickMultiplier(
  forcedValue?: number,
  forcedTarget?: MultiplierTarget,
): FreeKickMultiplier {
  const value = forcedValue ?? weightedPick(MULTIPLIER_WEIGHTS)
  const target = forcedTarget ?? weightedPick(TARGET_WEIGHTS)

  let kind: MultiplierKind
  if (value > 0) kind = 'BONUS'
  else if (value < 0) kind = 'PENALTY'
  else kind = 'NEUTRAL'

  const sign = value > 0 ? '+' : ''
  const valueStr = `${sign}${value}`

  const label =
    kind === 'BONUS'
      ? `Bônus de cobrança: ${valueStr}`
      : kind === 'PENALTY'
      ? `Penalidade de cobrança: ${valueStr}`
      : 'Cobrança neutra'

  const targetLabel =
    target === 'DICE_BONUS'
      ? 'no dado'
      : target === 'SUCCESS_CHANCE'
      ? 'na chance de sucesso'
      : 'na chance de gol'

  const description =
    kind === 'BONUS'
      ? `O cobrador recebeu um bônus de ${valueStr} ${targetLabel}.`
      : kind === 'PENALTY'
      ? `O cobrador sofreu uma penalidade de ${valueStr} ${targetLabel}.`
      : `Cobrança sem ajustes especiais.`

  return { value, kind, target, label, description }
}

// ---------------------------------------------------------------------
// Seleção do cobrador
// ---------------------------------------------------------------------

export interface TakerCandidate {
  id: string
  name: string
  position: string
  /** Overall rating — usado para desempate em caso de empate por posição */
  overall?: number
}

/**
 * Seleciona o cobrador da falta de forma aleatória, respeitando:
 *   - Apenas jogadores elegíveis (titulares ativos, não lesionados, não expulsos, não substituídos)
 *   - Não repetir o mesmo cobrador da última cobrança (variedade narrativa)
 *   - Prioriza atacantes e meias, mas com chance real de escolher outros
 *
 * Algoritmo:
 *   1. Filtra elegíveis (candidatos fornecidos pelo caller já filtrados)
 *   2. Remove o último cobrador se houver ≥2 candidatos
 *   3. Aplica peso por posição (FW: 3, MF: 2, DF: 1, GK: 0.1)
 *   4. Sorteio ponderado
 *
 * @param candidates Lista de jogadores elegíveis (já filtrhados por disponibilidade)
 * @param lastTakerId ID do último cobrador (para evitar repetição) — pode ser undefined
 */
export function pickFreeKickTaker(
  candidates: TakerCandidate[],
  lastTakerId?: string,
): FreeKickTaker {
  if (candidates.length === 0) {
    throw new Error('pickFreeKickTaker: nenhum candidato elegível')
  }

  // Evitar repetição consecutiva do mesmo cobrador
  let pool = candidates
  if (lastTakerId && candidates.length >= 2) {
    pool = candidates.filter((c) => c.id !== lastTakerId)
    if (pool.length === 0) pool = candidates // fallback: todos eram o último
  }

  // Pesos por posição — atacantes e meias têm preferência para cobranças
  const POSITION_WEIGHT: Record<string, number> = {
    FW: 3,
    ST: 3, CF: 3, RW: 2.5, LW: 2.5,
    MF: 2,
    AM: 2.5, CM: 2, DM: 1.5, RM: 2, LM: 2,
    DF: 1,
    CB: 0.8, LB: 1, RB: 1, LD: 1, LE: 1,
    GK: 0.1, // goleiro quase nunca cobra faltas
  }

  const weighted = pool.map((c) => ({
    value: c,
    weight: (POSITION_WEIGHT[c.position] ?? 1) * (1 + (c.overall ?? 70) / 200),
  }))

  const chosen = weightedPick(weighted)

  return {
    playerId: chosen.id,
    playerName: chosen.name,
    position: chosen.position,
  }
}

// ---------------------------------------------------------------------
// Orquestração: multiplicador + cobrador
// ---------------------------------------------------------------------

/**
 * Gera a atribuição completa para uma cobrança de falta:
 * multiplicador aleatório + cobrador aleatório.
 *
 * Deve ser chamada APENAS no servidor, no endpoint que detecta que uma
 * jogada gerou `requiresFreeKick: true`.
 *
 * @param candidates Lista de jogadores elegíveis para cobrar
 * @param lastTakerId ID do último cobrador (anti-repetição)
 */
export function assignFreeKick(
  candidates: TakerCandidate[],
  lastTakerId?: string,
): FreeKickAssignment {
  const multiplier = generateFreeKickMultiplier()
  const taker = pickFreeKickTaker(candidates, lastTakerId)
  return {
    multiplier,
    taker,
    nonce: generateNonce(),
  }
}

// ---------------------------------------------------------------------
// Aplicação do multiplicador na resolução da cobrança
// ---------------------------------------------------------------------

/**
 * Aplica o multiplicador a uma rolagem de cobrança de falta.
 *
 * @param baseDice Valor puro do d20 (1-20)
 * @param baseBonus Bônus base (skillBonus da ação)
 * @param baseDc DC original da ação
 * @param baseGoalChance Chance de gol original da ação (0-1)
 * @param multiplier O multiplicador sorteado
 *
 * @returns Os valores ajustados que o caller deve usar na resolução final
 */
export function applyFreeKickMultiplier(
  baseDice: number,
  baseBonus: number,
  baseDc: number,
  baseGoalChance: number,
  multiplier: FreeKickMultiplier,
): {
  adjustedDice: number
  adjustedBonus: number
  adjustedDc: number
  adjustedGoalChance: number
  total: number
  margin: number
} {
  let adjustedDice = baseDice
  let adjustedBonus = baseBonus
  let adjustedDc = baseDc
  let adjustedGoalChance = baseGoalChance

  if (multiplier.target === 'DICE_BONUS') {
    adjustedBonus = baseBonus + multiplier.value
  } else if (multiplier.target === 'SUCCESS_CHANCE') {
    // Ajusta o DC (multiplicador positivo reduz DC = mais fácil)
    adjustedDc = Math.max(1, baseDc - multiplier.value)
  } else if (multiplier.target === 'GOAL_CHANCE') {
    // Multiplicador positivo aumenta chance de gol (max 0.95)
    // Multiplicador negativo reduz (min 0)
    adjustedGoalChance = Math.max(0, Math.min(0.95, baseGoalChance + multiplier.value * 0.1))
  }

  const total = adjustedDice + adjustedBonus
  const margin = total - adjustedDc

  return { adjustedDice, adjustedBonus, adjustedDc, adjustedGoalChance, total, margin }
}

// ---------------------------------------------------------------------
// Serialização para persistência
// ---------------------------------------------------------------------

/** Estado pendente que fica salvo no `pendingPenaltyEventJson` da Match */
export interface PendingFreeKickState {
  penaltyEvent: PenaltyEvent
  assignment: FreeKickAssignment
  favoredPossession: Possession
  createdAt: number
  /** ID do último cobrador antes desta cobrança (para a próxima) */
  previousTakerId?: string
}

export function serializePendingFreeKick(state: PendingFreeKickState): string {
  return JSON.stringify(state)
}

export function deserializePendingFreeKick(json: string | null | undefined): PendingFreeKickState | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    if (typeof parsed === 'object' && parsed !== null && 'assignment' in parsed && 'penaltyEvent' in parsed) {
      return parsed as PendingFreeKickState
    }
    return null
  } catch {
    return null
  }
}
