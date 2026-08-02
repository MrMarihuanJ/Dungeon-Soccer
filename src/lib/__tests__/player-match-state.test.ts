// Testes unitários para a máquina de estados de jogador em partida
// --------------------------------------------------------------------
// Cobre:
//   - Transições permitidas (ACTIVE→RESERVE, ACTIVE→INJURED, etc)
//   - Transições proibidas (SENT_OFF→ACTIVE, SUBSTITUTED→ACTIVE)
//   - Limite de 5 substituições (táticas + lesão)
//   - Bloqueio pós-limite (lesão sem sub → UNAVAILABLE)
//   - Cartões vermelhos (remoção imediata)
//   - Consultas (getActivePlayerIds, getAvailableReserveIds)

import { describe, it, expect } from 'vitest'
import {
  createInitialTeamState,
  normalizeTeamState,
  performSubstitution,
  markPlayerInjured,
  markPlayerUnavailable,
  applyRedCard,
  applyYellowCard,
  getPlayerStatus,
  getActivePlayerIds,
  getAvailableReserveIds,
  getRemainingSubstitutions,
  isSubstitutionLimitReached,
  MAX_SUBSTITUTIONS,
  STATUS_META,
} from '../player-match-state'

describe('player-match-state', () => {
  const starterIds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11']
  const reserveIds = ['r1', 'r2', 'r3', 'r4', 'r5']

  describe('createInitialTeamState', () => {
    it('cria estado com todos os titulares ACTIVE e reservas RESERVE', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      expect(s.playerStates).toHaveLength(16) // 11 + 5
      starterIds.forEach((id) => {
        expect(getPlayerStatus(s, id)).toBe('ACTIVE')
      })
      reserveIds.forEach((id) => {
        expect(getPlayerStatus(s, id)).toBe('RESERVE')
      })
    })

    it('maxSubstitutions é 5', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      expect(s.maxSubstitutions).toBe(MAX_SUBSTITUTIONS)
      expect(s.maxSubstitutions).toBe(5)
    })

    it('substitutionsUsed começa em 0', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      expect(s.substitutionsUsed).toBe(0)
      expect(getRemainingSubstitutions(s)).toBe(5)
    })
  })

  describe('performSubstitution', () => {
    it('troca ACTIVE por RESERVE corretamente', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      const ns = performSubstitution(s, 's1', 'r1', 5, false)
      expect(getPlayerStatus(ns, 's1')).toBe('SUBSTITUTED')
      expect(getPlayerStatus(ns, 'r1')).toBe('ACTIVE')
      expect(ns.substitutionsUsed).toBe(1)
      expect(ns.substitutedOut).toContain('s1')
    })

    it('contabiliza no limite (substituição voluntária)', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      let ns = performSubstitution(s, 's1', 'r1', 1, false)
      ns = performSubstitution(ns, 's2', 'r2', 2, false)
      ns = performSubstitution(ns, 's3', 'r3', 3, false)
      ns = performSubstitution(ns, 's4', 'r4', 4, false)
      ns = performSubstitution(ns, 's5', 'r5', 5, false)
      expect(ns.substitutionsUsed).toBe(5)
      expect(isSubstitutionLimitReached(ns)).toBe(true)
    })

    it('substituição por lesão também conta no limite (REGRA CRÍTICA)', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      let ns = performSubstitution(s, 's1', 'r1', 1, true) // lesão
      expect(ns.substitutionsUsed).toBe(1)
      ns = performSubstitution(ns, 's2', 'r2', 2, true)
      ns = performSubstitution(ns, 's3', 'r3', 3, true)
      ns = performSubstitution(ns, 's4', 'r4', 4, true)
      ns = performSubstitution(ns, 's5', 'r5', 5, true)
      expect(ns.substitutionsUsed).toBe(5)
      expect(isSubstitutionLimitReached(ns)).toBe(true)
    })

    it('mistura táticas + lesão respeita limite total de 5', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      let ns = performSubstitution(s, 's1', 'r1', 1, false) // tática
      ns = performSubstitution(ns, 's2', 'r2', 2, true) // lesão
      ns = performSubstitution(ns, 's3', 'r3', 3, false) // tática
      ns = performSubstitution(ns, 's4', 'r4', 4, true) // lesão
      ns = performSubstitution(ns, 's5', 'r5', 5, false) // tática
      expect(ns.substitutionsUsed).toBe(5)
      expect(getRemainingSubstitutions(ns)).toBe(0)
    })

    it('bloqueia ao atingir limite (lança erro)', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      let ns = performSubstitution(s, 's1', 'r1', 1, false)
      ns = performSubstitution(ns, 's2', 'r2', 2, false)
      ns = performSubstitution(ns, 's3', 'r3', 3, false)
      ns = performSubstitution(ns, 's4', 'r4', 4, false)
      ns = performSubstitution(ns, 's5', 'r5', 5, false)
      expect(() => performSubstitution(ns, 's6', 'r1', 6, false)).toThrow()
    })

    it('rejeita substituir jogador já substituído', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      const ns = performSubstitution(s, 's1', 'r1', 1, false)
      expect(() => performSubstitution(ns, 's1', 'r2', 2, false)).toThrow()
    })

    it('rejeita substituir jogador expulso', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      const ns = applyRedCard(s, 's1', 1)
      expect(() => performSubstitution(ns, 's1', 'r1', 2, false)).toThrow()
    })

    it('rejeita entrar reserva já usado (substituído para fora)', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      // r1 entra no lugar de s1
      const ns1 = performSubstitution(s, 's1', 'r1', 1, false)
      // Agora r1 está ACTIVE; s1 está SUBSTITUTED.
      // Tentar substituir s2 por s1 (que já saiu) deve falhar.
      expect(() => performSubstitution(ns1, 's2', 's1', 2, false)).toThrow()
    })

    it('rejeita substituir por ele mesmo', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      expect(() => performSubstitution(s, 's1', 's1', 1, false)).toThrow()
    })

    it('limpa injuredPlayers ao substituir lesionado', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      const injured = markPlayerInjured(s, 's1', 1)
      expect(injured.injuredPlayers).toContain('s1')
      const subbed = performSubstitution(injured, 's1', 'r1', 2, true)
      expect(subbed.injuredPlayers).not.toContain('s1')
      expect(getPlayerStatus(subbed, 's1')).toBe('SUBSTITUTED')
    })
  })

  describe('markPlayerInjured', () => {
    it('marca ACTIVE como INJURED', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      const ns = markPlayerInjured(s, 's1', 1)
      expect(getPlayerStatus(ns, 's1')).toBe('INJURED')
      expect(ns.injuredPlayers).toContain('s1')
    })

    it('não marca jogador já expulso', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      const sent = applyRedCard(s, 's1', 1)
      const ns = markPlayerInjured(sent, 's1', 2)
      expect(getPlayerStatus(ns, 's1')).toBe('SENT_OFF') // não mudou
    })

    it('não marca jogador já substituído', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      const subbed = performSubstitution(s, 's1', 'r1', 1, false)
      const ns = markPlayerInjured(subbed, 's1', 2)
      expect(getPlayerStatus(ns, 's1')).toBe('SUBSTITUTED') // não mudou
    })
  })

  describe('markPlayerUnavailable', () => {
    it('converte INJURED em UNAVAILABLE', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      const injured = markPlayerInjured(s, 's1', 1)
      const unavailable = markPlayerUnavailable(injured, 's1')
      expect(getPlayerStatus(unavailable, 's1')).toBe('UNAVAILABLE')
      expect(unavailable.injuredPlayers).not.toContain('s1')
    })
  })

  describe('applyRedCard', () => {
    it('marca ACTIVE como SENT_OFF', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      const ns = applyRedCard(s, 's1', 1)
      expect(getPlayerStatus(ns, 's1')).toBe('SENT_OFF')
      expect(ns.sentOffPlayers).toContain('s1')
      expect(ns.redCards).toBe(1)
    })

    it('não expulsa jogador já expulso (idempotente em estado)', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      const sent = applyRedCard(s, 's1', 1)
      const ns = applyRedCard(sent, 's1', 2)
      expect(getPlayerStatus(ns, 's1')).toBe('SENT_OFF')
      // Não deve contar 2x
      expect(ns.redCards).toBe(1)
    })

    it('remove jogador de activeStarters', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      const ns = applyRedCard(s, 's1', 1)
      const active = getActivePlayerIds(ns, starterIds)
      expect(active).not.toContain('s1')
      expect(active.length).toBe(10)
    })
  })

  describe('applyYellowCard', () => {
    it('contabiliza amarelos sem mudar status', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      const ns = applyYellowCard(s, 's1')
      expect(getPlayerStatus(ns, 's1')).toBe('ACTIVE') // ainda ativo
      expect(ns.yellowCards).toBe(1)
    })
  })

  describe('queries', () => {
    it('getActivePlayerIds retorna apenas ativos', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      const ns = applyRedCard(s, 's1', 1)
      const ns2 = markPlayerInjured(ns, 's2', 2)
      const active = getActivePlayerIds(ns2, starterIds)
      expect(active).not.toContain('s1')
      expect(active).not.toContain('s2')
      expect(active.length).toBe(9)
    })

    it('getAvailableReserveIds retorna apenas RESERVE', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      const ns = performSubstitution(s, 's1', 'r1', 1, false) // r1 vira ACTIVE
      const available = getAvailableReserveIds(ns, reserveIds)
      expect(available).not.toContain('r1')
      expect(available.length).toBe(4)
    })

    it('getRemainingSubstitutions diminui conforme subs são feitas', () => {
      const s = createInitialTeamState(starterIds, reserveIds)
      expect(getRemainingSubstitutions(s)).toBe(5)
      const ns1 = performSubstitution(s, 's1', 'r1', 1, false)
      expect(getRemainingSubstitutions(ns1)).toBe(4)
      const ns2 = performSubstitution(ns1, 's2', 'r2', 2, true)
      expect(getRemainingSubstitutions(ns2)).toBe(3)
    })
  })

  describe('STATUS_META', () => {
    it('tem metadata visual para todos os statuses', () => {
      const statuses = ['ACTIVE', 'RESERVE', 'INJURED', 'SUBSTITUTED', 'SENT_OFF', 'UNAVAILABLE']
      statuses.forEach((st) => {
        const meta = STATUS_META[st as keyof typeof STATUS_META]
        expect(meta).toBeTruthy()
        expect(meta.label).toBeTruthy()
        expect(meta.emoji).toBeTruthy()
        expect(meta.color).toBeTruthy()
        expect(meta.description).toBeTruthy()
      })
    })
  })
})
