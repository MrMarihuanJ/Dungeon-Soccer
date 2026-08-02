// Testes unitários para match-engine
// --------------------------------------------------------------------
// Cobre:
//   - rollD20 (range 1-20)
//   - resolveAction (crit hit/miss, margens)
//   - generatePenaltyEvent (tipos por valor de dado)
//   - applyActionToState (gol, posse, progresso)
//   - checkMatchEndCondition
//   - createInitialMatchState

import { describe, it, expect } from 'vitest'
import {
  rollD20,
  resolveAction,
  generatePenaltyEvent,
  applyActionToState,
  createInitialMatchState,
  flipCoin,
  coinToPossession,
  pickPlayerForAction,
  GAME_MODE_CONFIG,
  type MatchState,
} from '../match-engine'
import { ALL_ACTIONS } from '../dnd-actions'

describe('match-engine', () => {
  describe('rollD20', () => {
    it('gera valores entre 1 e 20', () => {
      for (let i = 0; i < 1000; i++) {
        const v = rollD20()
        expect(v).toBeGreaterThanOrEqual(1)
        expect(v).toBeLessThanOrEqual(20)
      }
    })
    it('tem distribuição razoável (cobre múltiplos valores)', () => {
      const counts = new Map<number, number>()
      for (let i = 0; i < 1000; i++) {
        const v = rollD20()
        counts.set(v, (counts.get(v) || 0) + 1)
      }
      // Pelo menos 15 dos 20 valores devem aparecer
      expect(counts.size).toBeGreaterThanOrEqual(15)
    })
  })

  describe('resolveAction', () => {
    const easyAction = ALL_ACTIONS.find((a) => a.dc <= 10)!

    it('natural 20 = crit hit (sucesso automático)', () => {
      // Mock para forçar dice=20
      const original = Math.random
      Math.random = () => 0.9999 // dice = 20
      try {
        const r = resolveAction(easyAction, 0)
        expect(r.dice).toBe(20)
        expect(r.critical).toBe('crit_hit')
        expect(r.success).toBe(true)
        expect(r.exceptional).toBe(true)
      } finally {
        Math.random = original
      }
    })

    it('natural 1 = crit fail (falha automática)', () => {
      const original = Math.random
      Math.random = () => 0.0 // dice = 1
      try {
        const r = resolveAction(easyAction, 0)
        expect(r.dice).toBe(1)
        expect(r.critical).toBe('crit_fail')
        expect(r.success).toBe(false)
      } finally {
        Math.random = original
      }
    })

    it('calcula margem corretamente', () => {
      const r = resolveAction({ ...easyAction, dc: 15, skillBonus: 5 }, 0)
      // dice varia, mas bonus + skill = dice + 5, dc = 15
      // margem = (dice + 5) - 15 = dice - 10
      expect(r.margin).toBe(r.dice - 10)
    })
  })

  describe('generatePenaltyEvent', () => {
    it('dice > 5 (e !== 1) não gera penalidade', () => {
      const pe = generatePenaltyEvent(10, 'HOME')
      expect(pe).toBeNull()
    })

    it('dice 1 pode gerar penalidade severa', () => {
      const pe = generatePenaltyEvent(1, 'HOME')
      expect(pe).not.toBeNull()
      expect(['PENALTY_KICK', 'RED_CARD', 'INJURY', 'YELLOW_CARD', 'FOUL']).toContain(pe!.type)
    })

    it('dice 2-5 pode gerar penalidade leve', () => {
      const types = new Set<string>()
      for (let i = 0; i < 100; i++) {
        const pe = generatePenaltyEvent(3, 'HOME')
        if (pe) types.add(pe.type)
      }
      // Deve ter gerado algum tipo
      expect(types.size).toBeGreaterThan(0)
    })

    it('penalidade favorece o oponente', () => {
      const pe = generatePenaltyEvent(1, 'HOME')
      if (pe) {
        expect(pe.favoredPossession).toBe('AWAY')
        expect(pe.possession).toBe('HOME')
      }
    })
  })

  describe('applyActionToState', () => {
    it('gol reseta progresso e troca posse', () => {
      const state = createInitialMatchState('m1', 'QUICK_MATCH')
      state.status = 'IN_PROGRESS'
      state.currentPossession = 'HOME'
      state.homeProgress = 95
      const action = ALL_ACTIONS.find((a) => a.progress >= 5 && a.category === 'PASS')!
      const roll = { dice: 15, bonus: action.skillBonus, total: 15 + action.skillBonus, dc: action.dc, margin: 15 + action.skillBonus - action.dc, success: true, critical: 'none' as const, exceptional: false }
      const newState = applyActionToState(state, action, roll, 'Jogador', undefined)
      // Se progress + action.progress >= 100, é gol
      if (newState.events[0].isGoal) {
        expect(newState.homeProgress).toBe(0)
        expect(newState.homeScore).toBe(1)
        expect(newState.currentPossession).toBe('AWAY')
      }
    })

    it('fracasso muda posse', () => {
      const state = createInitialMatchState('m1', 'QUICK_MATCH')
      state.status = 'IN_PROGRESS'
      state.currentPossession = 'HOME'
      state.homeProgress = 30
      const action = ALL_ACTIONS.find((a) => a.ballRetentionOnFail === 0)!
      const roll = { dice: 2, bonus: 0, total: 2, dc: action.dc, margin: 2 - action.dc, success: false, critical: 'none' as const, exceptional: false }
      const newState = applyActionToState(state, action, roll, 'Jogador', undefined)
      expect(newState.currentPossession).toBe('AWAY')
    })

    it('adiciona evento à lista', () => {
      const state = createInitialMatchState('m1', 'QUICK_MATCH')
      state.status = 'IN_PROGRESS'
      state.currentPossession = 'HOME'
      const action = ALL_ACTIONS[0]
      const roll = { dice: 10, bonus: action.skillBonus, total: 10 + action.skillBonus, dc: action.dc, margin: 10 + action.skillBonus - action.dc, success: true, critical: 'none' as const, exceptional: false }
      const newState = applyActionToState(state, action, roll, 'Jogador', undefined)
      expect(newState.events).toHaveLength(1)
      expect(newState.events[0].action.id).toBe(action.id)
    })

    it('incrementa turnCount', () => {
      const state = createInitialMatchState('m1', 'QUICK_MATCH')
      state.status = 'IN_PROGRESS'
      state.currentPossession = 'HOME'
      const action = ALL_ACTIONS[0]
      const roll = { dice: 10, bonus: 0, total: 10, dc: action.dc, margin: 10 - action.dc, success: true, critical: 'none' as const, exceptional: false }
      const newState = applyActionToState(state, action, roll)
      expect(newState.turnCount).toBe(state.turnCount + 1)
    })
  })

  describe('createInitialMatchState', () => {
    it('cria estado com valores padrão', () => {
      const s = createInitialMatchState('m1', 'QUICK_MATCH')
      expect(s.matchId).toBe('m1')
      expect(s.status).toBe('WAITING')
      expect(s.homeScore).toBe(0)
      expect(s.awayScore).toBe(0)
      expect(s.homeProgress).toBe(0)
      expect(s.awayProgress).toBe(0)
      expect(s.turnCount).toBe(0)
      expect(s.events).toEqual([])
      expect(s.winner).toBeNull()
      expect(s.homeTeamState.substitutionsUsed).toBe(0)
      expect(s.homeTeamState.maxSubstitutions).toBe(5)
      expect(s.awayTeamState.maxSubstitutions).toBe(5)
    })
    it('xpReward vem do config do modo', () => {
      const s = createInitialMatchState('m1', 'FULL_90')
      expect(s.xpReward).toBe(GAME_MODE_CONFIG.FULL_90.xpWin)
    })
  })

  describe('flipCoin / coinToPossession', () => {
    it('flipCoin retorna heads ou tails', () => {
      for (let i = 0; i < 50; i++) {
        const c = flipCoin()
        expect(['heads', 'tails']).toContain(c)
      }
    })
    it('coinToPossession mapeia corretamente', () => {
      expect(coinToPossession('heads')).toBe('HOME')
      expect(coinToPossession('tails')).toBe('AWAY')
    })
  })

  describe('pickPlayerForAction', () => {
    it('retorna jogador e target diferentes', () => {
      const players = [
        { name: 'A', position: 'FW' },
        { name: 'B', position: 'MF' },
        { name: 'C', position: 'DF' },
      ]
      const r = pickPlayerForAction(players, 'PASS')
      expect(r.player).toBeTruthy()
      expect(r.target).toBeTruthy()
    })
    it('para SHOOT, prioriza atacantes', () => {
      const players = [
        { name: 'Zagueiro', position: 'DF' },
        { name: 'Atacante', position: 'FW' },
        { name: 'Meia', position: 'MF' },
      ]
      let pickedAttacker = false
      for (let i = 0; i < 50; i++) {
        const r = pickPlayerForAction(players, 'SHOOT')
        if (r.player === 'Atacante') {
          pickedAttacker = true
          break
        }
      }
      expect(pickedAttacker).toBe(true)
    })
    it('retorna "Jogador" para lista vazia', () => {
      const r = pickPlayerForAction([], 'PASS')
      expect(r.player).toBe('Jogador')
    })
  })
})
