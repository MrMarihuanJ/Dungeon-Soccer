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
  /** Presente apenas para cobranças de falta normais (auto-atribuídas) */
  assignment?: FreeKickAssignment
  /** Presente apenas para pênaltis (escolha do cobrador pelo usuário) */
  penaltyKickPrep?: PenaltyKickPreparation
  favoredPossession: Possession
  createdAt: number
  /** Flag para identificar pênalti (escolha do usuário) vs falta normal */
  isPenaltyKick?: boolean
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
    if (typeof parsed === 'object' && parsed !== null && 'penaltyEvent' in parsed) {
      return parsed as PendingFreeKickState
    }
    return null
  } catch {
    return null
  }
}

// =====================================================================
// PÊNALTI — preparação com escolha do cobrador pelo usuário
// ---------------------------------------------------------------------
// Diferente da cobrança de falta normal (onde o cobrador é sorteado
// automaticamente), no PÊNALTI o usuário ESCOLHE quem vai bater. Cada
// cobrador elegível recebe um MARCADOR DE BÔNUS ALEATÓRIO (positivo OU
// negativo) que é exibido na UI antes da escolha. O bônus é RE-SORTEADO
// a cada pênalti — não há vantagem fixa por jogador.
//
// Requisitos do usuário:
//   - "Os jogadores terão marcadores de pontos bônus na batida do pênalti
//      de forma aleatória."
//   - "tudo o que tiver marcador de pontos bônus por jogada deve mudar de
//      forma aleatória sempre. Não mantenha uma vantagem fixa por jogador.
//      Cada um deve ter pontos bônus aleatórios que mudam conforme a
//      partida."
// =====================================================================

export interface PenaltyTakerOption {
  taker: FreeKickTaker
  /** Marcador de bônus aleatório (positivo OU negativo), exibido na UI */
  bonusMarker: FreeKickMultiplier
}

export interface PenaltyKickPreparation {
  /** Lista de cobradores elegíveis, cada um com seu marcador de bônus */
  eligibleTakers: PenaltyTakerOption[]
  favoredPossession: Possession
  nonce: string
  createdAt: number
}

/**
 * Prepara um pênalti: retorna a lista de cobradores elegíveis, cada um
 * com um marcador de bônus aleatório. O usuário vai ESCOLHER qual
 * cobrador usar (a UI mostra os marcadores para a decisão).
 *
 * Regras:
 *   - Apenas jogadores ACTIVE (em campo, não lesionados/expulsos/substituídos)
 *   - Marcador de bônus é RE-SORTEADO por jogador a cada pênalti
 *   - Não há vantagem fixa por jogador (cada pênalti é independente)
 *   - Atacantes e meias continuam tendo pesos MAIORES para aparecerem
 *     primeiro na lista (mas todos aparecem para o usuário escolher)
 *
 * @param candidates Lista de jogadores elegíveis (já filtrados por disponibilidade)
 */
export function preparePenaltyKick(
  candidates: TakerCandidate[],
  favoredPossession: Possession,
): PenaltyKickPreparation {
  if (candidates.length === 0) {
    throw new Error('preparePenaltyKick: nenhum candidato elegível')
  }

  // Pesos por posição para ordenar a lista (não para escolher — o usuário escolhe)
  const POSITION_WEIGHT: Record<string, number> = {
    FW: 3,
    ST: 3, CF: 3, RW: 2.5, LW: 2.5,
    MF: 2,
    AM: 2.5, CM: 2, DM: 1.5, RM: 2, LM: 2,
    DF: 1,
    CB: 0.8, LB: 1, RB: 1, LD: 1, LE: 1,
    GK: 0.1,
  }

  // Ordena por peso (atacantes/meias primeiro) — mas mantém TODOS visíveis
  const sorted = [...candidates].sort((a, b) => {
    const wa = (POSITION_WEIGHT[a.position] ?? 1) * (1 + (a.overall ?? 70) / 200)
    const wb = (POSITION_WEIGHT[b.position] ?? 1) * (1 + (b.overall ?? 70) / 200)
    return wb - wa
  })

  // Cada cobrador recebe um marcador de bônus aleatório INDEPENDENTE
  // (positivo OU negativo — re-rolado a cada pênalti, sem vantagem fixa)
  const eligibleTakers: PenaltyTakerOption[] = sorted.map((c) => ({
    taker: {
      playerId: c.id,
      playerName: c.name,
      position: c.position,
    },
    bonusMarker: generateFreeKickMultiplier(),
  }))

  return {
    eligibleTakers,
    favoredPossession,
    nonce: generateNonce(),
    createdAt: Date.now(),
  }
}

/**
 * Serializa a preparação de pênalti para persistir no
 * `pendingPenaltyEventJson` da Match.
 */
export function serializePendingPenaltyKick(prep: PenaltyKickPreparation, penaltyEvent: PenaltyEvent): string {
  // Reaproveita o formato do PendingFreeKickState para compatibilidade
  // com o endpoint /api/match/free-kick-resolve, mas sem `assignment`
  // (o assignment será criado quando o usuário escolher o cobrador).
  const state = {
    penaltyEvent,
    penaltyKickPrep: prep,
    favoredPossession: prep.favoredPossession,
    createdAt: prep.createdAt,
    isPenaltyKick: true,
  }
  return JSON.stringify(state)
}

// =====================================================================
// MARCADOR DE BÔNUS POR JOGADA (per-play random bonus)
// ---------------------------------------------------------------------
// Requisito do usuário: "tudo o que tiver marcador de pontos bônus por
// jogada deve mudar de forma aleatória sempre. Não mantenha uma vantagem
// fixa por jogador. Cada um deve ter pontos bônus aleatórios que mudam
// conforme a partida."
//
// Esta função gera um bônus aleatório (positivo OU negativo) que é
// aplicado NO TOPO do skillBonus base da ação. É re-rolado a cada jogada.
//
// Distribuição (mais conservadora que a de pênalti/falta, para não
// desequilibrar o jogo normal):
//   - 60% neutro (0)
//   - 25% bônus (+1 a +3)
//   - 15% penalidade (-1 a -2)
// =====================================================================

const PLAY_BONUS_WEIGHTS: Array<{ value: number; weight: number }> = [
  { value: -2, weight: 5 },   // 5%  — penalidade média
  { value: -1, weight: 10 },  // 10% — penalidade leve
  { value:  0, weight: 60 },  // 60% — neutro (a maioria das jogadas)
  { value:  1, weight: 15 },  // 15% — bônus leve
  { value:  2, weight: 7 },   // 7%  — bônus médio
  { value:  3, weight: 3 },   // 3%  — bônus forte (raro)
]

export interface PlayBonusMarker {
  /** Valor do bônus (positivo, negativo ou zero) */
  value: number
  /** Tipo do bônus para coloração na UI */
  kind: MultiplierKind
  /** Rótulo curto para exibição ("Bônus: +2", "Penalidade: -1", "Neutro") */
  label: string
}

/**
 * Gera um marcador de bônus aleatório para uma jogada normal.
 *
 * Diferente do `generateFreeKickMultiplier` (que afeta 3 targets diferentes),
 * este bônus é sempre aplicado ao `DICE_BONUS` (somado ao skillBonus).
 * É mais conservador (60% neutro) para não desequilibrar o jogo normal.
 *
 * Deve ser chamado NO SERVIDOR (em /api/match/action) para evitar
 * manipulação pelo cliente. O cliente apenas exibe o resultado.
 *
 * @param forcedValue Se informado, usa este valor (para testes)
 */
export function rollPlayBonusMarker(forcedValue?: number): PlayBonusMarker {
  const value = forcedValue ?? weightedPick(PLAY_BONUS_WEIGHTS)

  let kind: MultiplierKind
  if (value > 0) kind = 'BONUS'
  else if (value < 0) kind = 'PENALTY'
  else kind = 'NEUTRAL'

  const sign = value > 0 ? '+' : ''
  const label =
    kind === 'BONUS'
      ? `Bônus: ${sign}${value}`
      : kind === 'PENALTY'
      ? `Penalidade: ${value}`
      : 'Neutro'

  return { value, kind, label }
}
