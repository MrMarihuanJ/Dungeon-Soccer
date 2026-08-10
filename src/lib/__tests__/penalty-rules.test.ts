// Testes unitários para as regras de pênalti (Passos 4-12)
// --------------------------------------------------------------------
// Cobre:
//   - Passo 4: Rótulo "Chute na marca do pênalti" para pênaltis
//   - Passo 5: Pênalti só ocorre quando falta dentro da área
//   - Passo 6: Seleção de cobrador elegível (validação)
//   - Passo 7-8: Bônus aleatórios verdadeiros (não fixos)
//   - Passo 9: Aleatoriedade no servidor (multiplier gerado no backend)
//   - Passo 10-11: Lesão remove jogador definitivamente
//   - Passo 12: Backend rejeita pênalti inválido

import { describe, it, expect } from 'vitest'
import {
  generatePenaltyEvent,
  applyActionToState,
  createInitialMatchState,
  type MatchState,
} from '../match-engine'
import { ALL_ACTIONS, getCategoryLabelForContext, PENALTY_KICK_LABEL, sampleShootActions } from '../dnd-actions'
import {
  generateFreeKickMultiplier,
  assignFreeKick,
  isEligibleTaker,
  setTakerByUser,
  serializePendingFreeKick,
  deserializePendingFreeKick,
  type TakerCandidate,
  type FreeKickTaker,
  type PendingFreeKickState,
} from '../free-kick-system'
import {
  createInitialTeamState,
  performSubstitution,
  markPlayerInjured,
  markPlayerUnavailable,
  applyRedCard,
  getPlayerStatus,
  getActivePlayerIds,
  getAvailableReserveIds,
  type ExtendedTeamMatchState,
} from '../player-match-state'

// =====================================================================
// Passo 4: "Chute na marca do pênalti" como descrição
// =====================================================================
describe('Passo 4: Rótulo de pênalti', () => {
  it('getCategoryLabelForContext retorna "Chute na marca do pênalti" para pênalti', () => {
    expect(getCategoryLabelForContext('SHOOT', true)).toBe(PENALTY_KICK_LABEL)
    expect(getCategoryLabelForContext('FREE_KICK', true)).toBe(PENALTY_KICK_LABEL)
  })

  it('getCategoryLabelForContext retorna rótulo normal quando não é pênalti', () => {
    expect(getCategoryLabelForContext('SHOOT', false)).toBe('Chute ao Gol')
    expect(getCategoryLabelForContext('FREE_KICK', false)).toBe('Cobrança de Falta')
  })

  it('PENALTY_KICK_LABEL contém "marca do pênalti"', () => {
    expect(PENALTY_KICK_LABEL.toLowerCase()).toContain('marca do pênalti')
  })

  it('sampleShootActions retorna ações de chute (para pênalti)', () => {
    const actions = sampleShootActions(3)
    expect(actions.length).toBeGreaterThan(0)
    actions.forEach((a) => {
      expect(a.category).toBe('SHOOT')
    })
  })

  it('descrições de PENALTY_KICK mencionam "marca do pênalti"', () => {
    // Gera vários pênaltis e verifica que as descrições contêm o texto esperado
    for (let i = 0; i < 20; i++) {
      const pe = generatePenaltyEvent(1, 'HOME', [], true)
      if (pe && pe.type === 'PENALTY_KICK') {
        expect(pe.description.toLowerCase()).toContain('pênalti')
        // Pelo menos uma das descrições deve mencionar "marca do pênalti"
        // (todas as 4 variantes contêm este texto)
        expect(pe.description.toLowerCase()).toContain('marca do pênalti')
        return
      }
    }
    // Se chegou aqui, não gerou pênalti em 20 tentativas — falha
    expect(true).toBe(false)
  })
})

// =====================================================================
// Passo 5: Pênalti só ocorre quando falta dentro da área
// =====================================================================
describe('Passo 5: Pênalti exige falta dentro da área', () => {
  it('generatePenaltyEvent com inPenaltyArea=false NUNCA retorna PENALTY_KICK', () => {
    // 1000 iterações para garantir
    for (let i = 0; i < 1000; i++) {
      const pe = generatePenaltyEvent(1, 'HOME', [], false) // dice=1, fora da área
      if (pe) {
        expect(pe.type).not.toBe('PENALTY_KICK')
      }
    }
    // Também para dice 2-5
    for (let dice = 2; dice <= 5; dice++) {
      for (let i = 0; i < 200; i++) {
        const pe = generatePenaltyEvent(dice, 'HOME', [], false)
        if (pe) {
          expect(pe.type).not.toBe('PENALTY_KICK')
        }
      }
    }
  })

  it('generatePenaltyEvent com inPenaltyArea=true PODE retornar PENALTY_KICK', () => {
    let foundPenalty = false
    for (let i = 0; i < 500; i++) {
      const pe = generatePenaltyEvent(1, 'HOME', [], true) // dice=1, na área
      if (pe && pe.type === 'PENALTY_KICK') {
        foundPenalty = true
        expect(pe.inPenaltyArea).toBe(true)
        break
      }
    }
    expect(foundPenalty).toBe(true)
  })

  it('quando inPenaltyArea=false e o sorteio seria pênalti, converte para FOUL', () => {
    // Forçando o cenário: inPenaltyArea=false deve gerar FOUL em vez de PENALTY_KICK
    // Verificamos que FOUL é gerado em algum momento com inPenaltyArea=false
    let foundFoul = false
    for (let i = 0; i < 500; i++) {
      const pe = generatePenaltyEvent(1, 'HOME', [], false)
      if (pe && pe.type === 'FOUL') {
        foundFoul = true
        expect(pe.requiresFreeKick).toBe(true)
        break
      }
    }
    expect(foundFoul).toBe(true)
  })

  it('applyActionToState não gera PENALTY_KICK quando progresso do oponente < 75', () => {
    const state = createInitialMatchState('m1', 'QUICK_MATCH')
    state.status = 'IN_PROGRESS'
    state.currentPossession = 'HOME'
    state.homeProgress = 30 // baixo — oponente (AWAY) está longe do gol
    state.awayProgress = 30 // baixo — não está na área

    // Tenta várias ações com dice baixo
    const action = ALL_ACTIONS.find((a) => a.dc > 15)!
    for (let i = 0; i < 50; i++) {
      const roll = { dice: 1, bonus: 0, total: 1, dc: action.dc, margin: 1 - action.dc, success: false, critical: 'crit_fail' as const, exceptional: false }
      const newState = applyActionToState(state, action, roll, 'Jogador', undefined)
      const lastEvent = newState.events[newState.events.length - 1]
      if (lastEvent?.penaltyEvent) {
        expect(lastEvent.penaltyEvent.type).not.toBe('PENALTY_KICK')
      }
    }
  })

  it('applyActionToState PODE gerar PENALTY_KICK quando progresso do oponente >= 75', () => {
    const state = createInitialMatchState('m1', 'QUICK_MATCH')
    state.status = 'IN_PROGRESS'
    state.currentPossession = 'HOME'
    state.homeProgress = 10
    state.awayProgress = 80 // alto — oponente está perto do gol de HOME (na área)

    const action = ALL_ACTIONS.find((a) => a.dc > 15)!
    let foundPenalty = false
    for (let i = 0; i < 200; i++) {
      const roll = { dice: 1, bonus: 0, total: 1, dc: action.dc, margin: 1 - action.dc, success: false, critical: 'crit_fail' as const, exceptional: false }
      const newState = applyActionToState(state, action, roll, 'Jogador', undefined)
      const lastEvent = newState.events[newState.events.length - 1]
      if (lastEvent?.penaltyEvent?.type === 'PENALTY_KICK') {
        foundPenalty = true
        expect(lastEvent.penaltyEvent.inPenaltyArea).toBe(true)
        break
      }
    }
    // Em 200 tentativas com dice=1 + inPenaltyArea=true, deveria ter encontrado
    expect(foundPenalty).toBe(true)
  })
})

// =====================================================================
// Passo 6: Seleção de cobrador elegível
// =====================================================================
describe('Passo 6: Seleção de cobrador elegível', () => {
  const candidates: TakerCandidate[] = [
    { id: 'p1', name: 'Atacante 1', position: 'FW', overall: 85 },
    { id: 'p2', name: 'Meia 1', position: 'MF', overall: 80 },
    { id: 'p3', name: 'Zagueiro 1', position: 'DF', overall: 75 },
    { id: 'p4', name: 'Atacante 2', position: 'FW', overall: 82 },
  ]

  it('isEligibleTaker retorna true para jogador na lista de candidatos', () => {
    const ids = ['p1', 'p2', 'p3']
    expect(isEligibleTaker(ids, 'p1')).toBe(true)
    expect(isEligibleTaker(ids, 'p2')).toBe(true)
    expect(isEligibleTaker(ids, 'p3')).toBe(true)
  })

  it('isEligibleTaker retorna false para jogador NÃO na lista', () => {
    const ids = ['p1', 'p2']
    expect(isEligibleTaker(ids, 'p3')).toBe(false)
    expect(isEligibleTaker(ids, '')).toBe(false)
    expect(isEligibleTaker(ids, 'invalid')).toBe(false)
  })

  it('isEligibleTaker retorna false para lista vazia', () => {
    expect(isEligibleTaker([], 'p1')).toBe(false)
  })

  it('setTakerByUser substitui o cobrador preservando o multiplicador', () => {
    const assignment = assignFreeKick(candidates)
    const pending: PendingFreeKickState = {
      penaltyEvent: {
        type: 'PENALTY_KICK',
        possession: 'HOME',
        favoredPossession: 'AWAY',
        description: 'Pênalti',
        requiresSubstitution: false,
        requiresVAR: false,
        requiresFreeKick: false,
        inPenaltyArea: true,
      },
      assignment,
      favoredPossession: 'AWAY',
      createdAt: Date.now(),
    }

    const newTaker: FreeKickTaker = {
      playerId: 'p2',
      playerName: 'Meia 1',
      position: 'MF',
    }

    const updated = setTakerByUser(pending, newTaker)
    expect(updated.assignment.taker.playerId).toBe('p2')
    expect(updated.assignment.taker.playerName).toBe('Meia 1')
    expect(updated.assignment.multiplier).toBe(assignment.multiplier) // multiplicador preservado
    expect(updated.takerSelectedByUser).toBe(true)
  })

  it('setTakerByUser marca takerSelectedByUser=true para auditoria', () => {
    const assignment = assignFreeKick(candidates)
    const pending: PendingFreeKickState = {
      penaltyEvent: {
        type: 'PENALTY_KICK',
        possession: 'HOME',
        favoredPossession: 'AWAY',
        description: 'Pênalti',
        requiresSubstitution: false,
        requiresVAR: false,
        requiresFreeKick: false,
        inPenaltyArea: true,
      },
      assignment,
      favoredPossession: 'AWAY',
      createdAt: Date.now(),
    }
    expect(pending.takerSelectedByUser).toBeUndefined()
    const newTaker: FreeKickTaker = { playerId: 'p1', playerName: 'X', position: 'FW' }
    const updated = setTakerByUser(pending, newTaker)
    expect(updated.takerSelectedByUser).toBe(true)
  })

  it('serialização preserva takerSelectedByUser', () => {
    const assignment = assignFreeKick(candidates)
    const pending: PendingFreeKickState = {
      penaltyEvent: {
        type: 'PENALTY_KICK',
        possession: 'HOME',
        favoredPossession: 'AWAY',
        description: 'Pênalti',
        requiresSubstitution: false,
        requiresVAR: false,
        requiresFreeKick: false,
        inPenaltyArea: true,
      },
      assignment,
      favoredPossession: 'AWAY',
      createdAt: Date.now(),
      takerSelectedByUser: true,
    }
    const json = serializePendingFreeKick(pending)
    const restored = deserializePendingFreeKick(json)
    expect(restored).not.toBeNull()
    expect(restored!.takerSelectedByUser).toBe(true)
  })

  it('jogadores lesionados não são elegíveis', () => {
    const starterIds = ['s1', 's2', 's3', 's4', 's5']
    const reserveIds = ['r1', 'r2']
    let state = createInitialTeamState(starterIds, reserveIds)
    // Lesiona s1
    state = markPlayerInjured(state, 's1', 1)
    const activeIds = getActivePlayerIds(state, starterIds)
    expect(activeIds).not.toContain('s1')
    expect(isEligibleTaker(activeIds, 's1')).toBe(false)
  })

  it('jogadores substituídos não são elegíveis', () => {
    const starterIds = ['s1', 's2', 's3', 's4', 's5']
    const reserveIds = ['r1', 'r2']
    let state = createInitialTeamState(starterIds, reserveIds)
    // Substitui s1 por r1
    state = performSubstitution(state, 's1', 'r1', 1, false)
    const activeIds = getActivePlayerIds(state, [...starterIds, ...reserveIds])
    expect(activeIds).not.toContain('s1')
    expect(activeIds).toContain('r1') // r1 entrou
    expect(isEligibleTaker(activeIds, 's1')).toBe(false)
    expect(isEligibleTaker(activeIds, 'r1')).toBe(true)
  })

  it('jogadores expulsos não são elegíveis', () => {
    const starterIds = ['s1', 's2', 's3']
    const reserveIds = ['r1']
    let state = createInitialTeamState(starterIds, reserveIds)
    state = applyRedCard(state, 's2', 1)
    const activeIds = getActivePlayerIds(state, starterIds)
    expect(activeIds).not.toContain('s2')
    expect(isEligibleTaker(activeIds, 's2')).toBe(false)
  })

  it('reservas não podem ser cobradores (precisa estar em campo)', () => {
    const starterIds = ['s1', 's2']
    const reserveIds = ['r1', 'r2']
    const state = createInitialTeamState(starterIds, reserveIds)
    const activeIds = getActivePlayerIds(state, starterIds)
    // Reservas não estão em activeIds
    expect(activeIds).not.toContain('r1')
    expect(activeIds).not.toContain('r2')
    expect(isEligibleTaker(activeIds, 'r1')).toBe(false)
  })
})

// =====================================================================
// Passo 7-8: Bônus aleatórios verdadeiros
// =====================================================================
describe('Passo 7-8: Bônus aleatórios não fixos', () => {
  it('multiplicador varia entre chamadas (não é constante)', () => {
    const values = new Set<number>()
    for (let i = 0; i < 100; i++) {
      const m = generateFreeKickMultiplier()
      values.add(m.value)
    }
    // Deve ter gerado pelo menos 3 valores diferentes
    expect(values.size).toBeGreaterThan(3)
  })

  it('multiplicador pode ser positivo, negativo ou zero', () => {
    let hasPositive = false
    let hasNegative = false
    let hasZero = false
    for (let i = 0; i < 500; i++) {
      const m = generateFreeKickMultiplier()
      if (m.value > 0) hasPositive = true
      if (m.value < 0) hasNegative = true
      if (m.value === 0) hasZero = true
    }
    // Todos os três tipos devem aparecer em 500 iterações
    expect(hasPositive).toBe(true)
    expect(hasNegative).toBe(true)
    expect(hasZero).toBe(true)
  })

  it('target do multiplicador varia entre as três opções', () => {
    const targets = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const m = generateFreeKickMultiplier()
      targets.add(m.target)
    }
    // Pelo menos 2 dos 3 targets devem aparecer
    expect(targets.size).toBeGreaterThanOrEqual(2)
  })

  it('multiplicador para o mesmo jogador varia entre partidas/jogadas', () => {
    const candidates: TakerCandidate[] = [
      { id: 'p1', name: 'Jogador', position: 'FW', overall: 85 },
    ]
    // Gera 50 atribuições para o mesmo jogador
    const multipliers = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const a = assignFreeKick(candidates)
      multipliers.add(`${a.multiplier.value}:${a.multiplier.target}`)
    }
    // Deve ter variado (mais de 1 multiplicador diferente)
    expect(multipliers.size).toBeGreaterThan(1)
  })

  it('não existe valor fixo permanente (todos variam)', () => {
    // Verifica que NÃO há um único valor que aparece em 100% das chamadas
    const counts: Record<number, number> = {}
    const total = 500
    for (let i = 0; i < total; i++) {
      const m = generateFreeKickMultiplier()
      counts[m.value] = (counts[m.value] || 0) + 1
    }
    // Nenhum valor deve aparecer em mais de 50% das chamadas
    // (isto garante que não há um valor fixo dominante)
    for (const value in counts) {
      const pct = counts[value] / total
      expect(pct).toBeLessThan(0.5)
    }
  })
})

// =====================================================================
// Passo 9: Aleatoriedade gerada no servidor
// =====================================================================
describe('Passo 9: Aleatoriedade no servidor', () => {
  it('assignFreeKick gera multiplier E taker (não depende do cliente)', () => {
    const candidates: TakerCandidate[] = [
      { id: 'p1', name: 'A', position: 'FW' },
      { id: 'p2', name: 'B', position: 'MF' },
    ]
    const a = assignFreeKick(candidates)
    expect(a.multiplier).toBeDefined()
    expect(a.taker).toBeDefined()
    expect(a.nonce).toBeDefined()
    // O multiplier é gerado internamente (não é passado pelo caller)
    expect(typeof a.multiplier.value).toBe('number')
    expect(['DICE_BONUS', 'SUCCESS_CHANCE', 'GOAL_CHANCE']).toContain(a.multiplier.target)
  })

  it('serializePendingFreeKick preserva o multiplier para persistência', () => {
    const candidates: TakerCandidate[] = [
      { id: 'p1', name: 'A', position: 'FW' },
    ]
    const assignment = assignFreeKick(candidates)
    const pending: PendingFreeKickState = {
      penaltyEvent: {
        type: 'PENALTY_KICK',
        possession: 'HOME',
        favoredPossession: 'AWAY',
        description: 'Pênalti',
        requiresSubstitution: false,
        requiresVAR: false,
        requiresFreeKick: false,
        inPenaltyArea: true,
      },
      assignment,
      favoredPossession: 'AWAY',
      createdAt: Date.now(),
    }
    const json = serializePendingFreeKick(pending)
    const restored = deserializePendingFreeKick(json)
    expect(restored).not.toBeNull()
    expect(restored!.assignment.multiplier.value).toBe(assignment.multiplier.value)
    expect(restored!.assignment.multiplier.target).toBe(assignment.multiplier.target)
  })

  it('após persistência, o multiplier não muda (consistência)', () => {
    const candidates: TakerCandidate[] = [
      { id: 'p1', name: 'A', position: 'FW' },
    ]
    const assignment = assignFreeKick(candidates)
    const pending: PendingFreeKickState = {
      penaltyEvent: {
        type: 'FOUL',
        possession: 'HOME',
        favoredPossession: 'AWAY',
        description: 'Falta',
        requiresSubstitution: false,
        requiresVAR: false,
        requiresFreeKick: true,
      },
      assignment,
      favoredPossession: 'AWAY',
      createdAt: Date.now(),
    }
    // Serializa e desserializa múltiplas vezes — valor não deve mudar
    const json1 = serializePendingFreeKick(pending)
    const restored1 = deserializePendingFreeKick(json1)!
    const json2 = serializePendingFreeKick(restored1)
    const restored2 = deserializePendingFreeKick(json2)!
    expect(restored1.assignment.multiplier.value).toBe(restored2.assignment.multiplier.value)
    expect(restored1.assignment.taker.playerId).toBe(restored2.assignment.taker.playerId)
  })
})

// =====================================================================
// Passo 10-11: Lesão + substituição remove jogador definitivamente
// =====================================================================
describe('Passo 10-11: Lesão remove jogador definitivamente', () => {
  const starterIds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11']
  const reserveIds = ['r1', 'r2', 'r3', 'r4', 'r5']

  it('jogador lesionado fica INJURED (não ACTIVE)', () => {
    const state = createInitialTeamState(starterIds, reserveIds)
    const injured = markPlayerInjured(state, 's1', 1)
    expect(getPlayerStatus(injured, 's1')).toBe('INJURED')
  })

  it('jogador lesionado não aparece em getActivePlayerIds', () => {
    const state = createInitialTeamState(starterIds, reserveIds)
    const injured = markPlayerInjured(state, 's1', 1)
    const active = getActivePlayerIds(injured, starterIds)
    expect(active).not.toContain('s1')
    expect(active.length).toBe(10)
  })

  it('jogador lesionado substituído fica SUBSTITUTED (não volta)', () => {
    const state = createInitialTeamState(starterIds, reserveIds)
    const injured = markPlayerInjured(state, 's1', 1)
    const subbed = performSubstitution(injured, 's1', 'r1', 2, true) // isForced=true
    expect(getPlayerStatus(subbed, 's1')).toBe('SUBSTITUTED')
    // Mesmo após tentar lesionar de novo, status não muda
    const reInjured = markPlayerInjured(subbed, 's1', 3)
    expect(getPlayerStatus(reInjured, 's1')).toBe('SUBSTITUTED')
  })

  it('jogador lesionado não aparece em getAvailableReserveIds (após entrar em campo)', () => {
    const state = createInitialTeamState(starterIds, reserveIds)
    // r1 entra no lugar de s1 (r1 vira ACTIVE)
    const subbed = performSubstitution(state, 's1', 'r1', 1, false)
    // Agora r1 está ACTIVE em campo — pode ser lesionado
    const injured = markPlayerInjured(subbed, 'r1', 2)
    expect(getPlayerStatus(injured, 'r1')).toBe('INJURED')
    // r1 não está mais disponível como reserva
    const available = getAvailableReserveIds(injured, reserveIds)
    expect(available).not.toContain('r1')
  })

  it('jogador com UNAVAILABLE não volta para ACTIVE', () => {
    const state = createInitialTeamState(starterIds, reserveIds)
    const injured = markPlayerInjured(state, 's1', 1)
    const unavailable = markPlayerUnavailable(injured, 's1')
    expect(getPlayerStatus(unavailable, 's1')).toBe('UNAVAILABLE')
    // Tentar marcar como lesionado de novo não muda status
    const reInjured = markPlayerInjured(unavailable, 's1', 2)
    expect(getPlayerStatus(reInjured, 's1')).toBe('UNAVAILABLE')
  })

  it('após substituição por lesão, o reserva entra e o lesionado sai definitivamente', () => {
    const state = createInitialTeamState(starterIds, reserveIds)
    const injured = markPlayerInjured(state, 's1', 1)
    const subbed = performSubstitution(injured, 's1', 'r1', 2, true)

    // s1 está SUBSTITUTED (saiu definitivamente)
    expect(getPlayerStatus(subbed, 's1')).toBe('SUBSTITUTED')
    // r1 está ACTIVE (entrou)
    expect(getPlayerStatus(subbed, 'r1')).toBe('ACTIVE')

    // s1 não pode voltar a jogar
    const active = getActivePlayerIds(subbed, [...starterIds, ...reserveIds])
    expect(active).not.toContain('s1')
    expect(active).toContain('r1')
  })

  it('lesão + limite esgotado = UNAVAILABLE, time joga com um a menos', () => {
    let state = createInitialTeamState(starterIds, reserveIds)
    // Usa todas as 5 substituições
    state = performSubstitution(state, 's1', 'r1', 1, false)
    state = performSubstitution(state, 's2', 'r2', 2, false)
    state = performSubstitution(state, 's3', 'r3', 3, false)
    state = performSubstitution(state, 's4', 'r4', 4, false)
    state = performSubstitution(state, 's5', 'r5', 5, false)
    expect(state.substitutionsUsed).toBe(5)

    // Agora lesionou s6 — sem reservas disponíveis
    const injured = markPlayerInjured(state, 's6', 6)
    const unavailable = markPlayerUnavailable(injured, 's6')
    expect(getPlayerStatus(unavailable, 's6')).toBe('UNAVAILABLE')

    // s6 não está mais em campo
    const active = getActivePlayerIds(unavailable, starterIds)
    expect(active).not.toContain('s6')
    // starterIds tem 11 jogadores. s1-s5 estão SUBSTITUTED, s6 está UNAVAILABLE.
    // Logo, apenas s7-s11 (5 jogadores) estão ativos em campo entre os titulares.
    // O time também tem r1-r5 (entraram como substitutos) ativos, mas esses
    // não estão em starterIds — estão em reserveIds.
    expect(active.length).toBe(5) // s7, s8, s9, s10, s11
    // Mas contando todos os ativos (starters + reserves em campo):
    const allActive = getActivePlayerIds(unavailable, [...starterIds, ...reserveIds])
    // s7-s11 (5) + r1-r5 (5) = 10 jogadores em campo
    expect(allActive.length).toBe(10)
  })
})

// =====================================================================
// Passo 12: Backend rejeita pênalti inválido (validação indireta)
// =====================================================================
describe('Passo 12: Proteção contra pênalti inválido', () => {
  it('PenaltyEvent de PENALTY_KICK sempre tem inPenaltyArea=true quando gerado pela engine', () => {
    // Gera vários pênaltis com inPenaltyArea=true e verifica o campo
    for (let i = 0; i < 100; i++) {
      const pe = generatePenaltyEvent(1, 'HOME', [], true)
      if (pe && pe.type === 'PENALTY_KICK') {
        expect(pe.inPenaltyArea).toBe(true)
      }
    }
  })

  it('PenaltyEvent sem inPenaltyArea=true não deve ser PENALTY_KICK', () => {
    // Verifica que a engine nunca produz PENALTY_KICK sem inPenaltyArea=true
    for (let i = 0; i < 500; i++) {
      const pe = generatePenaltyEvent(1, 'HOME', [], false)
      if (pe) {
        if (pe.type === 'PENALTY_KICK') {
          // Se por bug aparecer um PENALTY_KICK, deve ter inPenaltyArea=true
          expect(pe.inPenaltyArea).toBe(true)
        }
      }
    }
  })

  it('isEligibleTaker rejeita jogador não ativo (defesa em profundidade)', () => {
    // Mesmo que o cliente envie um playerId inválido, isEligibleTaker
    // valida contra a lista de candidatos ativos
    const activeIds = ['p1', 'p2', 'p3']
    expect(isEligibleTaker(activeIds, 'p1')).toBe(true)
    expect(isEligibleTaker(activeIds, 'p4')).toBe(false) // não está na lista
    expect(isEligibleTaker(activeIds, '')).toBe(false) // vazio
    expect(isEligibleTaker(activeIds, 'p1 ')).toBe(false) // com espaço
  })

  it('setTakerByUser não altera o multiplier (anti-vantagem)', () => {
    // Mesmo após o usuário escolher o cobrador, o multiplier permanece o mesmo
    // (não pode ser manipulado para dar vantagem)
    const candidates: TakerCandidate[] = [
      { id: 'p1', name: 'A', position: 'FW' },
      { id: 'p2', name: 'B', position: 'MF' },
    ]
    const assignment = assignFreeKick(candidates)
    const originalMultiplier = assignment.multiplier

    const pending: PendingFreeKickState = {
      penaltyEvent: {
        type: 'PENALTY_KICK',
        possession: 'HOME',
        favoredPossession: 'AWAY',
        description: 'Pênalti',
        requiresSubstitution: false,
        requiresVAR: false,
        requiresFreeKick: false,
        inPenaltyArea: true,
      },
      assignment,
      favoredPossession: 'AWAY',
      createdAt: Date.now(),
    }

    // Usuário escolhe outro cobrador
    const newTaker: FreeKickTaker = { playerId: 'p2', playerName: 'B', position: 'MF' }
    const updated = setTakerByUser(pending, newTaker)

    // Multiplier NÃO mudou
    expect(updated.assignment.multiplier.value).toBe(originalMultiplier.value)
    expect(updated.assignment.multiplier.target).toBe(originalMultiplier.target)
    expect(updated.assignment.multiplier.label).toBe(originalMultiplier.label)

    // Taker mudou
    expect(updated.assignment.taker.playerId).toBe('p2')
  })
})
