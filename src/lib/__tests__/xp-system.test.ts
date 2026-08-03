// Testes unitários para o sistema de XP
// --------------------------------------------------------------------
// Cobre:
//   - Cálculo de nível a partir do XP
//   - Cálculo de XP por partida (vitória, derrota, empate, bônus)
//   - Idempotência: source keys únicos
//   - Verificação de level-up
//   - Recompensas por nível

import { describe, it, expect } from 'vitest'
import {
  xpRequiredForLevel,
  getLevelFromXp,
  calculateMatchXp,
  matchXpSource,
  achievementXpSource,
  checkLevelUp,
  getRewardsForLevel,
  getAllEarnedRewards,
  getXpMultiplierForLevel,
  computeTeamMatchStats,
  MAX_LEVEL,
} from '../xp-system'

describe('xp-system', () => {
  describe('xpRequiredForLevel', () => {
    it('nível 1 requer 0 XP', () => {
      expect(xpRequiredForLevel(1)).toBe(0)
    })
    it('nível 2 requer 100 XP', () => {
      expect(xpRequiredForLevel(2)).toBe(100)
    })
    it('nível 5 requer 1000 XP', () => {
      expect(xpRequiredForLevel(5)).toBe(1000)
    })
    it('nível 10 requer 4500 XP', () => {
      expect(xpRequiredForLevel(10)).toBe(4500)
    })
    it('curva é monotonicamente crescente', () => {
      let prev = 0
      for (let lv = 1; lv <= 20; lv++) {
        const req = xpRequiredForLevel(lv)
        expect(req).toBeGreaterThanOrEqual(prev)
        prev = req
      }
    })
  })

  describe('getLevelFromXp', () => {
    it('0 XP = nível 1', () => {
      expect(getLevelFromXp(0).level).toBe(1)
    })
    it('100 XP = nível 2', () => {
      expect(getLevelFromXp(100).level).toBe(2)
    })
    it('999 XP = nível 4 (próximo do 5)', () => {
      expect(getLevelFromXp(999).level).toBe(4)
    })
    it('1000 XP = nível 5', () => {
      expect(getLevelFromXp(1000).level).toBe(5)
    })
    it('calcula progresso dentro do nível', () => {
      const r = getLevelFromXp(150) // nível 2, progresso 50/200
      expect(r.level).toBe(2)
      expect(r.currentLevelXp).toBe(100)
      expect(r.nextLevelXp).toBe(300)
      expect(r.progressPct).toBe(25) // (150-100)/(300-100) = 25%
    })
    it('respeita nível máximo', () => {
      const r = getLevelFromXp(999999999)
      expect(r.level).toBe(MAX_LEVEL)
      expect(r.isMaxLevel).toBe(true)
      expect(r.progressPct).toBe(100)
    })
  })

  describe('calculateMatchXp', () => {
    it('vitória em QUICK_MATCH dá 30 XP base', () => {
      const r = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 1,
      })
      expect(r.baseXp).toBe(30)
      expect(r.totalXp).toBeGreaterThanOrEqual(30)
    })
    it('derrota dá menos XP que vitória', () => {
      const win = calculateMatchXp({ gameMode: 'QUICK_MATCH', result: 'WIN', userLevel: 1 })
      const loss = calculateMatchXp({ gameMode: 'QUICK_MATCH', result: 'LOSS', userLevel: 1 })
      expect(win.totalXp).toBeGreaterThan(loss.totalXp)
    })
    it('empate dá valor intermediário', () => {
      const win = calculateMatchXp({ gameMode: 'QUICK_MATCH', result: 'WIN', userLevel: 1 })
      const draw = calculateMatchXp({ gameMode: 'QUICK_MATCH', result: 'DRAW', userLevel: 1 })
      const loss = calculateMatchXp({ gameMode: 'QUICK_MATCH', result: 'LOSS', userLevel: 1 })
      expect(win.totalXp).toBeGreaterThan(draw.totalXp)
      expect(draw.totalXp).toBeGreaterThan(loss.totalXp)
    })
    it('bônus de dificuldade quando adversário é mais forte', () => {
      const r = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 1,
        ownRating: 70,
        opponentRating: 85,
      })
      expect(r.difficultyBonus).toBeGreaterThan(0)
      expect(r.totalXp).toBeGreaterThan(30)
    })
    it('sem bônus de dificuldade quando próprio rating é maior', () => {
      const r = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 1,
        ownRating: 90,
        opponentRating: 70,
      })
      expect(r.difficultyBonus).toBe(0)
    })
    it('bônus de desempenho para vitória dominante (≥3 gols)', () => {
      const r = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 1,
        goalDifference: 3,
      })
      expect(r.performanceBonus).toBe(10)
    })
    it('sem bônus de desempenho para vitória apertada', () => {
      const r = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 1,
        goalDifference: 1,
      })
      expect(r.performanceBonus).toBe(0)
    })
    it('bônus de eventos especiais', () => {
      const r = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 1,
        specialEvents: 3,
      })
      expect(r.specialBonus).toBe(15) // 3 * 5
    })
    it('multiplicador de nível 3+ concede bônus', () => {
      const r = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 5,
      })
      expect(r.levelMultiplier).toBe(0.05)
      expect(r.totalXp).toBeGreaterThan(30)
    })
    it('multiplicador de nível 25+ concede 10%', () => {
      const r = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 25,
      })
      expect(r.levelMultiplier).toBe(0.10)
    })
    it('cap em 100 XP por partida', () => {
      const r = calculateMatchXp({
        gameMode: 'FULL_90',
        result: 'WIN',
        userLevel: 30,
        goalDifference: 5,
        ownRating: 50,
        opponentRating: 90,
        specialEvents: 10,
      })
      expect(r.totalXp).toBeLessThanOrEqual(100)
      expect(r.capped).toBe(true)
    })
    it('breakdown contém itens para cada componente', () => {
      const r = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 5,
        goalDifference: 4,
        specialEvents: 2,
        ownRating: 70,
        opponentRating: 80,
      })
      expect(r.breakdown.length).toBeGreaterThan(2)
      expect(r.breakdown.every((b) => b.label && typeof b.amount === 'number')).toBe(true)
    })
  })

  describe('matchXpSource / achievementXpSource', () => {
    it('gera source único por matchId + result', () => {
      expect(matchXpSource('m1', 'WIN')).toBe('match:m1:win')
      expect(matchXpSource('m1', 'LOSS')).toBe('match:m1:loss')
      expect(matchXpSource('m1', 'DRAW')).toBe('match:m1:draw')
    })
    it('gera source único por achievement slug', () => {
      expect(achievementXpSource('first-goal')).toBe('achievement:first-goal')
    })
    it('sources diferentes para mesma partida + resultados diferentes (idempotência)', () => {
      const s1 = matchXpSource('m1', 'WIN')
      const s2 = matchXpSource('m1', 'LOSS')
      expect(s1).not.toBe(s2)
    })
  })

  describe('checkLevelUp', () => {
    it('detecta level up simples', () => {
      const r = checkLevelUp(50, 150) // 50: nivel 1; 150: nivel 2
      expect(r.leveledUp).toBe(true)
      expect(r.oldLevel).toBe(1)
      expect(r.newLevel).toBe(2)
    })
    it('detecta múltiplos levels up', () => {
      const r = checkLevelUp(50, 1100) // pula para nível 5
      expect(r.leveledUp).toBe(true)
      expect(r.newLevel - r.oldLevel).toBeGreaterThan(1)
    })
    it('não level up se XP não mudou de nível', () => {
      const r = checkLevelUp(120, 150) // ambos nível 2
      expect(r.leveledUp).toBe(false)
    })
    it('coleta recompensas dos níveis atravessados', () => {
      const r = checkLevelUp(50, 1100) // passa por 2, 3, 4, 5
      expect(r.newRewards.length).toBeGreaterThan(0)
      // Nível 5 tem recompensa
      expect(r.newRewards.some((rw) => rw.level === 5)).toBe(true)
    })
  })

  describe('recompensas', () => {
    it('getRewardsForLevel retorna recompensa específica do nível', () => {
      const r5 = getRewardsForLevel(5)
      expect(r5.length).toBeGreaterThan(0)
      expect(r5[0].level).toBe(5)
      expect(r5[0].label).toBeTruthy()
    })
    it('nível sem recompensa retorna array vazio', () => {
      const r4 = getRewardsForLevel(4)
      expect(r4).toEqual([])
    })
    it('getAllEarnedRewards retorna todas até o nível atual', () => {
      const rewards = getAllEarnedRewards(10)
      expect(rewards.length).toBeGreaterThan(0)
      expect(rewards.every((r) => r.level <= 10)).toBe(true)
    })
  })

  describe('getXpMultiplierForLevel', () => {
    it('nível 1-2: 0%', () => {
      expect(getXpMultiplierForLevel(1)).toBe(0)
      expect(getXpMultiplierForLevel(2)).toBe(0)
    })
    it('nível 3-24: 5%', () => {
      expect(getXpMultiplierForLevel(3)).toBe(0.05)
      expect(getXpMultiplierForLevel(15)).toBe(0.05)
      expect(getXpMultiplierForLevel(24)).toBe(0.05)
    })
    it('nível 25+: 10%', () => {
      expect(getXpMultiplierForLevel(25)).toBe(0.10)
      expect(getXpMultiplierForLevel(40)).toBe(0.10)
    })
  })

  // ====================================================================
  // NOVOS TESTES v3.2: Estatísticas de partida e bônus por stats
  // ====================================================================
  describe('computeTeamMatchStats', () => {
    it('retorna zeros para array vazio', () => {
      const stats = computeTeamMatchStats([], 'HOME')
      expect(stats.goals).toBe(0)
      expect(stats.foulsCommitted).toBe(0)
      expect(stats.ballSteals).toBe(0)
    })

    it('conta gols marcados pelo time HOME', () => {
      const events = [
        { possession: 'HOME', isGoal: true, roll: { success: true } },
        { possession: 'HOME', isGoal: true, roll: { success: true } },
        { possession: 'AWAY', isGoal: true, roll: { success: true } },
      ]
      const homeStats = computeTeamMatchStats(events, 'HOME')
      const awayStats = computeTeamMatchStats(events, 'AWAY')
      expect(homeStats.goals).toBe(2)
      expect(awayStats.goals).toBe(1)
    })

    it('conta faltas cometidas (FOUL + PENALTY_KICK)', () => {
      const events = [
        { possession: 'HOME', penaltyEvent: { type: 'FOUL', possession: 'HOME', favoredPossession: 'AWAY' } },
        { possession: 'HOME', penaltyEvent: { type: 'PENALTY_KICK', possession: 'HOME', favoredPossession: 'AWAY' } },
        { possession: 'AWAY', penaltyEvent: { type: 'FOUL', possession: 'AWAY', favoredPossession: 'HOME' } },
      ]
      const homeStats = computeTeamMatchStats(events, 'HOME')
      expect(homeStats.foulsCommitted).toBe(2)
      expect(homeStats.foulsSuffered).toBe(1)
    })

    it('conta cartões amarelos e vermelhos', () => {
      const events = [
        { possession: 'HOME', penaltyEvent: { type: 'YELLOW_CARD', possession: 'HOME', favoredPossession: 'AWAY' } },
        { possession: 'HOME', penaltyEvent: { type: 'RED_CARD', possession: 'HOME', favoredPossession: 'AWAY' } },
      ]
      const homeStats = computeTeamMatchStats(events, 'HOME')
      expect(homeStats.yellowCards).toBe(1)
      expect(homeStats.redCards).toBe(1)
    })

    it('conta impedimentos', () => {
      const events = [
        { possession: 'HOME', penaltyEvent: { type: 'OFFSIDE', possession: 'HOME', favoredPossession: 'AWAY' } },
        { possession: 'HOME', penaltyEvent: { type: 'OFFSIDE', possession: 'HOME', favoredPossession: 'AWAY' } },
      ]
      const homeStats = computeTeamMatchStats(events, 'HOME')
      expect(homeStats.offsides).toBe(2)
    })

    it('conta roubadas de bola e defesas do goleiro', () => {
      const events = [
        { defensivePlay: { possession: 'HOME', ballStolen: true } },
        { defensivePlay: { possession: 'HOME', success: true, isGoalkeeper: true } },
        { defensivePlay: { possession: 'AWAY', ballStolen: true } },
      ]
      const homeStats = computeTeamMatchStats(events, 'HOME')
      expect(homeStats.ballSteals).toBe(1)
      expect(homeStats.goalkeeperSaves).toBe(1)
    })
  })

  describe('calculateMatchXp com stats', () => {
    it('concede bônus por gols marcados', () => {
      const withoutStats = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 1,
        cap: 100,
      })
      const withStats = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 1,
        cap: 100,
        stats: {
          goals: 3,
          yellowCards: 0, redCards: 0,
          foulsCommitted: 0, foulsSuffered: 0,
          offsides: 0, ballSteals: 0,
          goalkeeperSaves: 0,
          totalPlays: 0, successfulPlays: 0, specialEvents: 0,
        },
      })
      // 3 gols * 3 = 9 XP extra
      expect(withStats.totalXp).toBe(withoutStats.totalXp + 9)
    })

    it('aplica penalidade por cartões', () => {
      const withoutStats = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 1,
        cap: 100,
      })
      const withCards = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 1,
        cap: 100,
        stats: {
          goals: 0,
          yellowCards: 2, redCards: 1,
          foulsCommitted: 3, foulsSuffered: 0,
          offsides: 1, ballSteals: 0,
          goalkeeperSaves: 0,
          totalPlays: 0, successfulPlays: 0, specialEvents: 0,
        },
      })
      // -2 (amarelos) -3 (vermelho) -1 (impedimento) = -6
      expect(withCards.totalXp).toBe(Math.max(0, withoutStats.totalXp - 6))
    })

    it('nunca retorna XP negativo', () => {
      const result = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'LOSS',
        userLevel: 1,
        cap: 100,
        stats: {
          goals: 0,
          yellowCards: 10, redCards: 10,
          foulsCommitted: 20, foulsSuffered: 0,
          offsides: 10, ballSteals: 0,
          goalkeeperSaves: 0,
          totalPlays: 0, successfulPlays: 0, specialEvents: 0,
        },
      })
      expect(result.totalXp).toBeGreaterThanOrEqual(0)
    })

    it('inclui bônus de roubo de bola e defesa do goleiro', () => {
      const withoutStats = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 1,
        cap: 100,
      })
      const withDefensiveStats = calculateMatchXp({
        gameMode: 'QUICK_MATCH',
        result: 'WIN',
        userLevel: 1,
        cap: 100,
        stats: {
          goals: 0,
          yellowCards: 0, redCards: 0,
          foulsCommitted: 0, foulsSuffered: 0,
          offsides: 0,
          ballSteals: 2, goalkeeperSaves: 2,
          totalPlays: 0, successfulPlays: 0, specialEvents: 0,
        },
      })
      // 2 roubos * 2 = 4 + 2 defesas * 3 = 6 = 10 XP extra
      expect(withDefensiveStats.totalXp).toBe(withoutStats.totalXp + 10)
    })
  })
})
