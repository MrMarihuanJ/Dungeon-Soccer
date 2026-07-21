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
//   8. Repete até um limite de turnos (ex: 20) → quem tem mais gols vence
// =====================================================================

import type { FootballAction } from './dnd-actions'

export type Possession = 'HOME' | 'AWAY'
export type CoinResult = 'heads' | 'tails'

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
}

export interface MatchState {
  matchId: string
  status: 'COIN_FLIP' | 'IN_PROGRESS' | 'FINISHED'
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
// Cria estado inicial da partida
// =====================================================================
export function createInitialMatchState(matchId: string, maxTurns = 24): MatchState {
  return {
    matchId,
    status: 'COIN_FLIP',
    coinResult: null,
    startingSide: null,
    currentPossession: null,
    homeScore: 0,
    awayScore: 0,
    homeProgress: 0,
    awayProgress: 0,
    turnCount: 0,
    maxTurns,
    events: [],
    winner: null,
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
// Processa uma jogada e atualiza o estado
// =====================================================================
export function applyActionToState(
  state: MatchState,
  action: FootballAction,
  roll: DiceRollResult,
): MatchState {
  const newState: MatchState = {
    ...state,
    events: [...state.events],
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
  }

  newState.turnCount += 1

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

  newState.events.push(event)

  // Verifica fim de partida
  if (newState.turnCount >= newState.maxTurns) {
    newState.status = 'FINISHED'
    if (newState.homeScore > newState.awayScore) newState.winner = 'HOME'
    else if (newState.awayScore > newState.homeScore) newState.winner = 'AWAY'
    else newState.winner = 'DRAW'
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
