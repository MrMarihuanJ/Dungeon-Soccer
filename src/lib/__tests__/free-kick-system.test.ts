// Testes unitários para o sistema de cobrança de falta
// --------------------------------------------------------------------
// Cobre:
//   - Geração de multiplicadores (distribuição, tipos, valores)
//   - Seleção de cobrador (anti-repetição, pesos por posição)
//   - Aplicação do multiplicador na rolagem (DC, bônus, chance de gol)
//   - Serialização / deserialização do estado pendente

import { describe, it, expect } from 'vitest'
import {
  generateFreeKickMultiplier,
  pickFreeKickTaker,
  assignFreeKick,
  applyFreeKickMultiplier,
  serializePendingFreeKick,
  deserializePendingFreeKick,
  preparePenaltyKick,
  rollPlayBonusMarker,
  type TakerCandidate,
} from '../free-kick-system'

describe('free-kick-system', () => {
  describe('generateFreeKickMultiplier', () => {
    it('gera multiplicador com kind correto baseado no valor', () => {
      for (let i = 0; i < 50; i++) {
        const m = generateFreeKickMultiplier()
        expect(m.kind).toBe(
          m.value > 0 ? 'BONUS' : m.value < 0 ? 'PENALTY' : 'NEUTRAL',
        )
        expect(m.label).toBeTruthy()
        expect(m.description).toBeTruthy()
      }
    })

    it('respeita forcedValue e forcedTarget (para testes determinísticos)', () => {
      const m = generateFreeKickMultiplier(3, 'GOAL_CHANCE')
      expect(m.value).toBe(3)
      expect(m.kind).toBe('BONUS')
      expect(m.target).toBe('GOAL_CHANCE')
    })

    it('gera valores dentro do range esperado [-4, +5]', () => {
      const values = new Set<number>()
      for (let i = 0; i < 1000; i++) {
        const m = generateFreeKickMultiplier()
        values.add(m.value)
        expect(m.value).toBeGreaterThanOrEqual(-4)
        expect(m.value).toBeLessThanOrEqual(5)
      }
      // Deve gerar uma boa variedade
      expect(values.size).toBeGreaterThan(5)
    })

    it('tem distribuição não-trivial (não só zero)', () => {
      let bonus = 0
      let penalty = 0
      let neutral = 0
      for (let i = 0; i < 500; i++) {
        const m = generateFreeKickMultiplier()
        if (m.kind === 'BONUS') bonus++
        else if (m.kind === 'PENALTY') penalty++
        else neutral++
      }
      // Pelo menos 30% de cada tipo (BONUS e PENALTY)
      expect(bonus).toBeGreaterThan(150)
      expect(penalty).toBeGreaterThan(100)
      expect(neutral).toBeGreaterThan(20)
    })

    it('target é um dos três válidos', () => {
      for (let i = 0; i < 50; i++) {
        const m = generateFreeKickMultiplier()
        expect(['DICE_BONUS', 'SUCCESS_CHANCE', 'GOAL_CHANCE']).toContain(m.target)
      }
    })
  })

  describe('pickFreeKickTaker', () => {
    const candidates: TakerCandidate[] = [
      { id: 'p1', name: 'Atacante 1', position: 'FW', overall: 85 },
      { id: 'p2', name: 'Meia 1', position: 'MF', overall: 80 },
      { id: 'p3', name: 'Zagueiro 1', position: 'DF', overall: 75 },
      { id: 'p4', name: 'Atacante 2', position: 'FW', overall: 82 },
    ]

    it('retorna um cobrador válido', () => {
      const t = pickFreeKickTaker(candidates)
      expect(t.playerId).toBeTruthy()
      expect(t.playerName).toBeTruthy()
      expect(t.position).toBeTruthy()
      expect(candidates.some((c) => c.id === t.playerId)).toBe(true)
    })

    it('lança erro se não houver candidatos', () => {
      expect(() => pickFreeKickTaker([])).toThrow()
    })

    it('não repete o último cobrador se houver ≥2 candidatos', () => {
      const lastIds = new Set<string>()
      let lastTakerId: string | undefined
      for (let i = 0; i < 20; i++) {
        const t = pickFreeKickTaker(candidates, lastTakerId)
        if (lastTakerId) {
          expect(t.playerId).not.toBe(lastTakerId)
        }
        lastIds.add(t.playerId)
        lastTakerId = t.playerId
      }
      // Deve ter variado (mais de 1 cobrador diferente em 20 chamadas)
      expect(lastIds.size).toBeGreaterThan(1)
    })

    it('favorece atacantes e meias (peso maior)', () => {
      const counts: Record<string, number> = { FW: 0, MF: 0, DF: 0 }
      for (let i = 0; i < 1000; i++) {
        const t = pickFreeKickTaker(candidates)
        const c = candidates.find((c) => c.id === t.playerId)!
        counts[c.position] = (counts[c.position] || 0) + 1
      }
      // FW e MF devem ter mais picks que DF
      expect(counts.FW + counts.MF).toBeGreaterThan(counts.DF * 3)
    })

    it('usa o último cobrador se for o único candidato', () => {
      const single: TakerCandidate[] = [{ id: 'only', name: 'Único', position: 'FW' }]
      const t = pickFreeKickTaker(single, 'only')
      expect(t.playerId).toBe('only')
    })
  })

  describe('assignFreeKick', () => {
    it('retorna multiplicador + cobrador + nonce', () => {
      const candidates: TakerCandidate[] = [
        { id: 'p1', name: 'Jogador', position: 'FW' },
      ]
      const a = assignFreeKick(candidates)
      expect(a.multiplier).toBeTruthy()
      expect(a.taker).toBeTruthy()
      expect(a.nonce).toBeTruthy()
      expect(a.nonce.length).toBeGreaterThan(8)
    })
  })

  describe('applyFreeKickMultiplier', () => {
    it('aplica bônus ao dado (DICE_BONUS)', () => {
      const m = generateFreeKickMultiplier(3, 'DICE_BONUS')
      const r = applyFreeKickMultiplier(10, 5, 15, 0.2, m)
      expect(r.adjustedBonus).toBe(8) // 5 + 3
      expect(r.adjustedDc).toBe(15)
      expect(r.total).toBe(18) // 10 + 8
    })

    it('aplica penalidade ao dado (DICE_BONUS negativo)', () => {
      const m = generateFreeKickMultiplier(-2, 'DICE_BONUS')
      const r = applyFreeKickMultiplier(10, 5, 15, 0.2, m)
      expect(r.adjustedBonus).toBe(3) // 5 - 2
      expect(r.total).toBe(13)
    })

    it('ajusta DC para SUCESSO (multiplicador positivo reduz DC)', () => {
      const m = generateFreeKickMultiplier(2, 'SUCCESS_CHANCE')
      const r = applyFreeKickMultiplier(10, 5, 15, 0.2, m)
      expect(r.adjustedDc).toBe(13) // 15 - 2
      expect(r.adjustedBonus).toBe(5)
    })

    it('ajusta chance de gol para GOAL_CHANCE', () => {
      const m = generateFreeKickMultiplier(3, 'GOAL_CHANCE')
      const r = applyFreeKickMultiplier(10, 5, 15, 0.2, m)
      expect(r.adjustedGoalChance).toBeCloseTo(0.5, 5) // 0.2 + 3*0.1
    })

    it('não permite chance de gol negativa', () => {
      const m = generateFreeKickMultiplier(-5, 'GOAL_CHANCE')
      const r = applyFreeKickMultiplier(10, 5, 15, 0.1, m)
      expect(r.adjustedGoalChance).toBe(0)
    })

    it('não permite chance de gol > 0.95', () => {
      const m = generateFreeKickMultiplier(10, 'GOAL_CHANCE') // valor extremo
      const r = applyFreeKickMultiplier(10, 5, 15, 0.5, m)
      expect(r.adjustedGoalChance).toBeLessThanOrEqual(0.95)
    })

    it('calcula margem corretamente', () => {
      const m = generateFreeKickMultiplier(0, 'DICE_BONUS') // neutro
      const r = applyFreeKickMultiplier(15, 3, 12, 0.2, m)
      expect(r.margin).toBe(6) // (15 + 3) - 12
    })
  })

  describe('serialização', () => {
    it('serializa e desserializa corretamente', () => {
      const candidates: TakerCandidate[] = [
        { id: 'p1', name: 'Jogador', position: 'FW' },
      ]
      const assignment = assignFreeKick(candidates)
      const pending = {
        penaltyEvent: {
          type: 'FOUL' as const,
          possession: 'HOME' as const,
          favoredPossession: 'AWAY' as const,
          description: 'Falta dura',
          requiresSubstitution: false,
          requiresVAR: false,
          requiresFreeKick: true,
        },
        assignment,
        favoredPossession: 'AWAY' as const,
        createdAt: Date.now(),
        previousTakerId: undefined,
      }
      const json = serializePendingFreeKick(pending)
      const restored = deserializePendingFreeKick(json)
      expect(restored).not.toBeNull()
      expect(restored!.assignment!.taker.playerId).toBe(assignment.taker.playerId)
      expect(restored!.assignment!.multiplier.value).toBe(assignment.multiplier.value)
      expect(restored!.penaltyEvent.type).toBe('FOUL')
    })

    it('retorna null para JSON inválido', () => {
      expect(deserializePendingFreeKick(null)).toBeNull()
      expect(deserializePendingFreeKick('')).toBeNull()
      expect(deserializePendingFreeKick('not-json')).toBeNull()
      expect(deserializePendingFreeKick('{}')).toBeNull() // sem campos esperados
    })
  })

  // ====================================================================
  // PÊNALTI — preparação com escolha do cobrador pelo usuário
  // ====================================================================
  describe('preparePenaltyKick', () => {
    const candidates: TakerCandidate[] = [
      { id: 'p1', name: 'Atacante 1', position: 'FW', overall: 85 },
      { id: 'p2', name: 'Meia 1', position: 'MF', overall: 80 },
      { id: 'p3', name: 'Zagueiro 1', position: 'DF', overall: 75 },
      { id: 'p4', name: 'Goleiro', position: 'GK', overall: 78 },
    ]

    it('retorna TODOS os candidatos como elegíveis (usuário escolhe)', () => {
      const prep = preparePenaltyKick(candidates, 'HOME')
      expect(prep.eligibleTakers).toHaveLength(4)
    })

    it('cada candidato recebe um marcador de bônus (kind BONUS/PENALTY/NEUTRAL)', () => {
      const prep = preparePenaltyKick(candidates, 'HOME')
      prep.eligibleTakers.forEach((opt) => {
        expect(['BONUS', 'PENALTY', 'NEUTRAL']).toContain(opt.bonusMarker.kind)
        expect(opt.bonusMarker.label).toBeTruthy()
        expect(opt.bonusMarker.description).toBeTruthy()
      })
    })

    it('marcadores são re-rolados a cada chamada (sem vantagem fixa por jogador)', () => {
      // Roda várias preparações e coleta os marcadores do primeiro candidato
      // (Atacante 1). Estatisticamente, deve haver variação — não é sempre
      // o mesmo valor.
      const values = new Set<number>()
      for (let i = 0; i < 50; i++) {
        const prep = preparePenaltyKick(candidates, 'HOME')
        values.add(prep.eligibleTakers[0].bonusMarker.value)
      }
      // Deve ter mais de 1 valor diferente (prova que é re-rolado)
      expect(values.size).toBeGreaterThan(1)
    })

    it('atacantes aparecem primeiro na lista (ordenação por peso)', () => {
      const prep = preparePenaltyKick(candidates, 'HOME')
      // O primeiro deve ser um atacante (FW) ou meia (MF), não zagueiro/goleiro
      expect(['FW', 'MF']).toContain(prep.eligibleTakers[0].taker.position)
    })

    it('lança erro se não houver candidatos', () => {
      expect(() => preparePenaltyKick([], 'HOME')).toThrow()
    })

    it('gera nonce único a cada chamada', () => {
      const prep1 = preparePenaltyKick(candidates, 'HOME')
      const prep2 = preparePenaltyKick(candidates, 'HOME')
      expect(prep1.nonce).not.toBe(prep2.nonce)
    })
  })

  // ====================================================================
  // MARCADOR DE BÔNUS POR JOGADA (per-play random bonus)
  // ====================================================================
  describe('rollPlayBonusMarker', () => {
    it('gera marcador com kind correto baseado no valor', () => {
      for (let i = 0; i < 100; i++) {
        const m = rollPlayBonusMarker()
        expect(m.kind).toBe(
          m.value > 0 ? 'BONUS' : m.value < 0 ? 'PENALTY' : 'NEUTRAL',
        )
        expect(m.label).toBeTruthy()
      }
    })

    it('gera valores dentro do range esperado [-2, +3]', () => {
      for (let i = 0; i < 500; i++) {
        const m = rollPlayBonusMarker()
        expect(m.value).toBeGreaterThanOrEqual(-2)
        expect(m.value).toBeLessThanOrEqual(3)
      }
    })

    it('tem distribuição majoritariamente neutra (~60%)', () => {
      let neutral = 0
      const total = 500
      for (let i = 0; i < total; i++) {
        if (rollPlayBonusMarker().kind === 'NEUTRAL') neutral++
      }
      // Pelo menos 50% neutro (margem para variância estatística)
      expect(neutral).toBeGreaterThan(total * 0.5)
    })

    it('respeita forcedValue (para testes determinísticos)', () => {
      expect(rollPlayBonusMarker(2).value).toBe(2)
      expect(rollPlayBonusMarker(2).kind).toBe('BONUS')
      expect(rollPlayBonusMarker(-1).value).toBe(-1)
      expect(rollPlayBonusMarker(-1).kind).toBe('PENALTY')
      expect(rollPlayBonusMarker(0).value).toBe(0)
      expect(rollPlayBonusMarker(0).kind).toBe('NEUTRAL')
    })

    it('gera pelo menos um BONUS e um PENALTY em 200 rolls (variedade)', () => {
      let bonus = 0, penalty = 0
      for (let i = 0; i < 200; i++) {
        const m = rollPlayBonusMarker()
        if (m.kind === 'BONUS') bonus++
        else if (m.kind === 'PENALTY') penalty++
      }
      expect(bonus).toBeGreaterThan(0)
      expect(penalty).toBeGreaterThan(0)
    })
  })
})
