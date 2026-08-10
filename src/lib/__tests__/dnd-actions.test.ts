// Testes unitários para dnd-actions
// --------------------------------------------------------------------
// Cobre especialmente:
//   - C5: FREE_KICK não aparece em sampleMixedActions (jogada normal)
//   - sampleFreeKickActions retorna apenas FREE_KICK
//   - sampleActions por categoria

import { describe, it, expect } from 'vitest'
import {
  sampleMixedActions,
  sampleFreeKickActions,
  sampleActions,
  getActionsByCategory,
  ALL_ACTIONS,
  CATEGORY_META,
} from '../dnd-actions'

describe('dnd-actions', () => {
  describe('sampleMixedActions (FIX C5)', () => {
    it('NUNCA inclui ações FREE_KICK em jogadas normais', () => {
      // Roda 1000 amostras para garantir que estatisticamente
      // nenhuma ação FREE_KICK apareça
      for (let i = 0; i < 1000; i++) {
        const actions = sampleMixedActions(5)
        actions.forEach((a) => {
          expect(a.category).not.toBe('FREE_KICK')
        })
      }
    })

    it('NUNCA inclui KICKOFF em jogadas normais', () => {
      for (let i = 0; i < 100; i++) {
        const actions = sampleMixedActions(5)
        actions.forEach((a) => {
          expect(a.category).not.toBe('KICKOFF')
        })
      }
    })

    it('exclui DEFEND quando excludeDefend=true', () => {
      for (let i = 0; i < 100; i++) {
        const actions = sampleMixedActions(5, true)
        actions.forEach((a) => {
          expect(a.category).not.toBe('DEFEND')
        })
      }
    })

    it('inclui DEFEND quando excludeDefend=false (padrão)', () => {
      let foundDefend = false
      for (let i = 0; i < 200; i++) {
        const actions = sampleMixedActions(5, false)
        if (actions.some((a) => a.category === 'DEFEND')) {
          foundDefend = true
          break
        }
      }
      expect(foundDefend).toBe(true)
    })

    it('retorna o número solicitado de ações', () => {
      const actions = sampleMixedActions(5)
      expect(actions).toHaveLength(5)
    })

    it('retorna ações diferentes a cada chamada (aleatoriedade)', () => {
      const samples = new Set<string>()
      for (let i = 0; i < 10; i++) {
        const actions = sampleMixedActions(5)
        actions.forEach((a) => samples.add(a.id))
      }
      // Deve ter mais de 5 ações únicas nas 10 amostras
      expect(samples.size).toBeGreaterThan(5)
    })
  })

  describe('sampleFreeKickActions', () => {
    it('retorna apenas ações FREE_KICK', () => {
      for (let i = 0; i < 100; i++) {
        const actions = sampleFreeKickActions(3)
        actions.forEach((a) => {
          expect(a.category).toBe('FREE_KICK')
        })
      }
    })

    it('retorna o número solicitado', () => {
      const actions = sampleFreeKickActions(3)
      expect(actions).toHaveLength(3)
    })
  })

  describe('sampleActions', () => {
    it('filtra por categoria corretamente', () => {
      const actions = sampleActions('SHOOT', 5)
      expect(actions).toHaveLength(5)
      actions.forEach((a) => {
        expect(a.category).toBe('SHOOT')
      })
    })
    it('retorna no máximo o tamanho do pool', () => {
      const pool = getActionsByCategory('KICKOFF')
      const actions = sampleActions('KICKOFF', 999)
      expect(actions.length).toBeLessThanOrEqual(pool.length)
    })
  })

  describe('ALL_ACTIONS', () => {
    it('tem ações em todas as categorias', () => {
      const categories = new Set(ALL_ACTIONS.map((a) => a.category))
      expect(categories.has('KICKOFF')).toBe(true)
      expect(categories.has('PASS')).toBe(true)
      expect(categories.has('DRIBBLE')).toBe(true)
      expect(categories.has('SHOOT')).toBe(true)
      expect(categories.has('DEFEND')).toBe(true)
      expect(categories.has('SPECIAL')).toBe(true)
      expect(categories.has('FREE_KICK')).toBe(true)
    })
    it('todas as ações têm id único', () => {
      const ids = ALL_ACTIONS.map((a) => a.id)
      const unique = new Set(ids)
      expect(unique.size).toBe(ids.length)
    })
    it('todas as ações têm DC > 0', () => {
      ALL_ACTIONS.forEach((a) => {
        expect(a.dc).toBeGreaterThan(0)
      })
    })
    it('todas as ações têm progress entre 0 e 100', () => {
      ALL_ACTIONS.forEach((a) => {
        expect(a.progress).toBeGreaterThanOrEqual(0)
        expect(a.progress).toBeLessThanOrEqual(100)
      })
    })
  })

  describe('CATEGORY_META', () => {
    it('tem metadata para todas as categorias', () => {
      const categories = ['KICKOFF', 'PASS', 'DRIBBLE', 'SHOOT', 'DEFEND', 'SPECIAL', 'FREE_KICK']
      categories.forEach((c) => {
        const meta = CATEGORY_META[c as keyof typeof CATEGORY_META]
        expect(meta).toBeTruthy()
        expect(meta.label).toBeTruthy()
        expect(meta.color).toBeTruthy()
        expect(meta.emoji).toBeTruthy()
      })
    })
  })
})
