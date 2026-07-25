// =====================================================================
// Player Rating Library — Sistema de avaliação estilo FIFA (v2)
// --------------------------------------------------------------------
// Cada jogador tem:
//   - Overall (0-99): nota geral
//   - 6 atributos: PAC, SHO, PAS, DRI, DEF, PHY
//   - Idade
//   - League Tier: tier da liga onde joga (afeta multiplicador)
//   - isRetired / isInactive: flags para filtrar modos de jogo
//
// Multiplicador final (estilo FIFA chemistry):
//   effectiveOverall = overall * ageMultiplier * leagueMultiplier * skillMultiplier
//
// Team Rating v2 — agora inclui:
//   - Média dos 11 titulares (com multiplicadores)
//   - Bônus por Depth (reservas — 30% para top 5, +10% para reserva 6-7)
//   - Bônus por química (nacionalidade/time iguais — IMPLEMENTADO)
//   - Bônus por equilíbrio positional (presença em ATK/MID/DEF)
//   - Bônus por compatibilidade com formação (jogadores na posição ideal)
// =====================================================================

export interface PlayerStats {
  overall: number
  age: number
  pace: number
  shooting: number
  passing: number
  dribbling: number
  defending: number
  physical: number
  leagueTier: LeagueTier
  isRetired: boolean
  isInactive: boolean
}

export type LeagueTier = 'TOP5' | 'TOP10' | 'BR1' | 'TOP20' | 'OTHER'

// Tiers de ligas (multiplicador de condicionamento)
// TOP5: Premier League, La Liga, Serie A, Bundesliga, Ligue 1
// TOP10: Primeira Liga, Eredivisie, Liga Portugal, etc.
// BR1: Brasileirão Série A
// TOP20: Ligas secundárias europeias
// OTHER: Ligas menores (MLS, Saudi, etc.)
export const LEAGUE_TIERS: Record<LeagueTier, { label: string; multiplier: number; color: string }> = {
  TOP5:   { label: 'Top 5 Europa',    multiplier: 1.10, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  TOP10:  { label: 'Top 10 Europa',   multiplier: 1.05, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  BR1:    { label: 'Brasileirão',     multiplier: 1.00, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  TOP20:  { label: 'Europa Secundária', multiplier: 0.95, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  OTHER:  { label: 'Outras ligas',    multiplier: 0.90, color: 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300' },
}

// =====================================================================
// Multiplicador por idade (estilo FIFA — jogadores jovens sobem,
// veteranos descem; picos entre 24-29)
// =====================================================================
export function ageMultiplier(age: number): number {
  if (age < 18) return 0.85  // muito jovem, ainda em desenvolvimento
  if (age < 21) return 0.92  // jovem promessa
  if (age < 24) return 0.97  // em ascensão
  if (age <= 27) return 1.05 // auge (pico)
  if (age <= 30) return 1.02 // ainda em alto nível
  if (age <= 33) return 0.96 // experiente, mas caindo
  if (age <= 36) return 0.90 // veterano
  if (age <= 40) return 0.82 // em fim de carreira
  return 0.75                // lendário mas idoso
}

// =====================================================================
// Multiplicador por condicionamento (time atual)
// =====================================================================
export function leagueMultiplier(tier: LeagueTier): number {
  return LEAGUE_TIERS[tier]?.multiplier ?? 1.0
}

// =====================================================================
// Multiplicador por habilidade — bonifica jogadores de alto nível
// (overall >= 85 ganha +5%, >= 90 ganha +8%, >= 93 ganha +12%)
// =====================================================================
export function skillMultiplier(overall: number): number {
  if (overall >= 93) return 1.12  // lenda (Messi, CR7, Pelé)
  if (overall >= 90) return 1.08  // craque mundial
  if (overall >= 85) return 1.05  // estrela
  if (overall >= 80) return 1.02  // titular de alto nível
  if (overall >= 75) return 1.00  // profissional médio
  if (overall >= 70) return 0.96  // abaixo da média
  return 0.90                     // amador
}

// =====================================================================
// Overall efetivo com multiplicadores (estilo FIFA in-form)
// =====================================================================
export function effectiveOverall(stats: PlayerStats): number {
  const base = stats.overall
  const result =
    base *
    ageMultiplier(stats.age) *
    leagueMultiplier(stats.leagueTier) *
    skillMultiplier(base)
  return Math.round(Math.min(99, Math.max(40, result)))
}

// =====================================================================
// Categoria de overall para exibição visual
// =====================================================================
export type OverallTier = 'legend' | 'elite' | 'gold' | 'silver' | 'bronze'

export function getOverallTier(overall: number): OverallTier {
  if (overall >= 90) return 'legend'
  if (overall >= 84) return 'elite'
  if (overall >= 75) return 'gold'
  if (overall >= 68) return 'silver'
  return 'bronze'
}

export const TIER_STYLES: Record<OverallTier, { label: string; card: string; text: string; ring: string }> = {
  legend:  { label: 'Lenda',      card: 'bg-gradient-to-br from-yellow-400 to-amber-600',            text: 'text-amber-300',   ring: 'ring-yellow-400' },
  elite:   { label: 'Elite',      card: 'bg-gradient-to-br from-purple-500 to-purple-700',           text: 'text-purple-300',  ring: 'ring-purple-400' },
  gold:    { label: 'Ouro',       card: 'bg-gradient-to-br from-yellow-500 to-yellow-700',           text: 'text-yellow-300',  ring: 'ring-yellow-500' },
  silver:  { label: 'Prata',      card: 'bg-gradient-to-br from-gray-300 to-gray-500',               text: 'text-gray-300',    ring: 'ring-gray-400' },
  bronze:  { label: 'Bronze',     card: 'bg-gradient-to-br from-orange-400 to-orange-700',           text: 'text-orange-300',  ring: 'ring-orange-500' },
}

// =====================================================================
// Team Rating v2 (estilo FIFA Ultimate Team + química implementada)
// =====================================================================
export interface TeamRatingResult {
  startersAvg: number       // média dos 11 titulares (overall base)
  startersTotal: number     // soma dos overalls efetivos
  startersEffectiveAvg: number // média com multiplicadores aplicados
  reservesBonus: number     // bônus pelos reservas (até 7 reservas)
  chemistryBonus: number    // bônus por química (nacionalidade/times iguais)
  positionalBalanceBonus: number // bônus por equilíbrio entre ATK/MID/DEF
  formationBonus: number    // bônus por compatibilidade com a formação
  finalRating: number       // rating final arredondado
  attackRating: number      // média de ataque (FW)
  midfieldRating: number    // média de meio-campo (MF)
  defenseRating: number     // média de defesa (GK + DF + LD + LE)
  stars: number             // 0.5 a 5 estrelas
  chemistryDetails: ChemistryDetails
  balanceDetails: BalanceDetails
}

// =====================================================================
// Sistema de Química (IMPLEMENTADO — estilo FIFA chemistry)
// --------------------------------------------------------------------
// Critérios:
//   1. Nacionalidade: jogadores da mesma nacionalidade ganham +0.3 cada
//   2. Time atual: jogadores do mesmo time ganham +0.5 cada
//   3. Liga: jogadores da mesma liga (tier) ganham +0.2 cada
//   4. Posição compatível: jogadores na posição ideal da formação +0.1
//
// A química máxima é calculada como a soma de todas as conexões,
// normalizada por 11 jogadores, resultando em um bônus de 0 a +3.
// =====================================================================

export interface ChemistryDetails {
  nationalityLinks: number  // pares de jogadores com mesma nacionalidade
  teamLinks: number         // pares de jogadores do mesmo time
  leagueLinks: number       // pares de jogadores da mesma liga (tier)
  positionLinks: number     // jogadores na posição ideal
  totalLinks: number        // soma de todas as conexões
  maxPossible: number       // máximo de conexões possíveis (11 * 4)
  chemistryScore: number    // 0-100 (percentual de química atingido)
}

function calculateChemistry(
  starters: Array<{ position: string; nationality?: string | null; team: string; leagueTier?: string }>
): { chemistryBonus: number; details: ChemistryDetails } {
  if (starters.length === 0) {
    return { chemistryBonus: 0, details: { nationalityLinks: 0, teamLinks: 0, leagueLinks: 0, positionLinks: 0, totalLinks: 0, maxPossible: 0, chemistryScore: 0 } }
  }

  let nationalityLinks = 0
  let teamLinks = 0
  let leagueLinks = 0

  // Conta pares de jogadores com nacionalidade, time ou liga iguais
  for (let i = 0; i < starters.length; i++) {
    for (let j = i + 1; j < starters.length; j++) {
      // Nacionalidade
      if (starters[i].nationality && starters[j].nationality &&
          starters[i].nationality!.toLowerCase() === starters[j].nationality!.toLowerCase()) {
        nationalityLinks++
      }
      // Time
      if (starters[i].team && starters[j].team &&
          starters[i].team.toLowerCase() === starters[j].team.toLowerCase()) {
        teamLinks++
      }
      // Liga (tier)
      if (starters[i].leagueTier && starters[j].leagueTier &&
          starters[i].leagueTier === starters[j].leagueTier) {
        leagueLinks++
      }
    }
  }

  // Posição compatível: conta jogadores que estão na posição ideal
  // Para simplificação, consideramos que qualquer jogador na posição
  // correta do slot (DF/LD/LE são compatíveis, etc.) ganha +0.1
  const positionLinks = starters.length // Todos que estão em campo são "na posição"

  const totalLinks = nationalityLinks + teamLinks + leagueLinks + positionLinks

  // Normalização: máximo teórico é 55 pares * 3 atributos + 11 posições = 176
  // Mas realisticamente, uma química boa é ~30-50 links
  const maxPossible = 55 * 3 + starters.length // 176 para 11 jogadores
  const chemistryScore = Math.min(100, Math.round((totalLinks / maxPossible) * 100))

  // Bônus: chemistryScore de 0-100 mapeado para 0 a +3 pontos no rating
  const chemistryBonus = Math.round((chemistryScore / 100) * 3 * 10) / 10

  return {
    chemistryBonus,
    details: {
      nationalityLinks,
      teamLinks,
      leagueLinks,
      positionLinks,
      totalLinks,
      maxPossible,
      chemistryScore,
    },
  }
}

// =====================================================================
// Equilíbrio Positional — bônus por ter cobertura em cada área
// --------------------------------------------------------------------
// Critérios:
//   - Time com 11 titulares: mínimo de 2 em DEF, 2 em MID, 2 em ATK
//   - Bônus progressivo: ter mais jogadores em cada área aumenta o bônus
//   - Penalidade: áreas sem jogadores reduzem o rating
// =====================================================================

export interface BalanceDetails {
  attCount: number   // jogadores em FW
  midCount: number   // jogadores em MF
  defCount: number   // jogadores em GK + DF + LD + LE
  isBalanced: boolean // se tem pelo menos 2 em cada área
  balanceScore: number // 0-100
}

function calculatePositionalBalance(
  starters: Array<{ position: string }>
): { positionalBalanceBonus: number; details: BalanceDetails } {
  if (starters.length === 0) {
    return { positionalBalanceBonus: 0, details: { attCount: 0, midCount: 0, defCount: 0, isBalanced: false, balanceScore: 0 } }
  }

  const attCount = starters.filter(p => p.position === 'FW').length
  const midCount = starters.filter(p => p.position === 'MF').length
  const defCount = starters.filter(p =>
    p.position === 'GK' || p.position === 'DF' || p.position === 'LD' || p.position === 'LE'
  ).length

  const isBalanced = attCount >= 2 && midCount >= 2 && defCount >= 3

  // Cálculo do score de equilíbrio (0-100)
  // Distribuição ideal: 4 DEF, 3 MID, 3 ATK (padrão 4-3-3)
  // Penalidade por desequilíbrio
  let balanceScore = 50 // Base

  // Bônus por ter todas as áreas cobertas
  if (defCount >= 3) balanceScore += 15
  if (midCount >= 2) balanceScore += 15
  if (attCount >= 2) balanceScore += 15

  // Bônus adicional por distribuição próxima do ideal
  if (defCount >= 3 && defCount <= 6) balanceScore += 5
  if (midCount >= 2 && midCount <= 5) balanceScore += 5
  if (attCount >= 2 && attCount <= 4) balanceScore += 5

  // Penalidade por áreas vazias
  if (defCount < 3) balanceScore -= 10 * (3 - defCount)
  if (midCount < 2) balanceScore -= 10 * (2 - midCount)
  if (attCount < 2) balanceScore -= 10 * (2 - attCount)

  balanceScore = Math.max(0, Math.min(100, balanceScore))

  // Bônus: score 0-100 mapeado para 0 a +2 pontos
  const positionalBalanceBonus = Math.round((balanceScore / 100) * 2 * 10) / 10

  return {
    positionalBalanceBonus,
    details: {
      attCount,
      midCount,
      defCount,
      isBalanced,
      balanceScore,
    },
  }
}

// =====================================================================
// Bônus de Formação — compatibilidade dos jogadores com o esquema tático
// --------------------------------------------------------------------
// Jogadores que combinam com a posição do slot na formação ganham bônus.
// Exemplo: um ST no slot "st" = compatibilidade total (+0.3)
//           um MF no slot "st" = compatibilidade parcial (-0.1)
// =====================================================================
function calculateFormationBonus(
  starters: Array<{ position: string }>,
  formationPositions: Array<{ role: string }>
): number {
  if (starters.length === 0 || formationPositions.length === 0) return 0

  const ROLE_TO_POS: Record<string, string> = {
    GK: 'GK', LB: 'LE', CB: 'DF', RB: 'LD', LWB: 'LE', RWB: 'LD',
    DM: 'MF', CM: 'MF', AM: 'MF', LM: 'MF', RM: 'MF',
    LW: 'FW', RW: 'FW', SS: 'FW', ST: 'FW',
  }

  const POSITION_GROUPS: Record<string, string> = {
    GK: 'GK', DF: 'DEF', LD: 'DEF', LE: 'DEF', MF: 'MID', FW: 'ATT',
  }

  let bonus = 0
  const filled = Math.min(starters.length, formationPositions.length)

  for (let i = 0; i < filled; i++) {
    const playerPos = starters[i].position
    const slotRole = formationPositions[i].role
    const slotPos = ROLE_TO_POS[slotRole] || 'FW'

    // Compatibilidade total: posição do jogador = posição do slot
    if (playerPos === slotPos) {
      bonus += 0.3
    }
    // Compatibilidade parcial: mesmo grupo (DEF/LD/LE, etc.)
    else if (POSITION_GROUPS[playerPos] === POSITION_GROUPS[slotPos]) {
      bonus += 0.15
    }
    // Incompatibilidade: posição diferente do grupo
    else {
      bonus -= 0.1
    }
  }

  // Normalizar por 11 jogadores (bônus máximo ~3.3, mínimo ~-1.1)
  // Limitar a -1 a +3
  return Math.max(-1, Math.min(3, Math.round(bonus * 10) / 10))
}

// Helper: calcular overall por área do campo
function positionalRating(players: Array<{ overall: number; effectiveOverall: number; position: string }>, area: 'ATT' | 'MID' | 'DEF') {
  const filtered = players.filter((p) => {
    if (area === 'ATT') return p.position === 'FW'
    if (area === 'MID') return p.position === 'MF'
    return p.position === 'GK' || p.position === 'DF' || p.position === 'LD' || p.position === 'LE'
  })
  if (filtered.length === 0) return 0
  const sum = filtered.reduce((acc, p) => acc + p.effectiveOverall, 0)
  return Math.round(sum / filtered.length)
}

export function calculateTeamRating(
  starters: Array<{ overall: number; age: number; leagueTier: LeagueTier; position: string; nationality?: string | null; team: string; isRetired?: boolean; isInactive?: boolean; benchPosition?: string }>,
  reserves: Array<{ overall: number; age: number; leagueTier: LeagueTier; position: string; isRetired?: boolean; isInactive?: boolean }> = [],
  formationPositions?: Array<{ role: string }>,
): TeamRatingResult {
  // Calcula overall efetivo de cada titular
  // Se o titular tem benchPosition (veio do banco), usa essa posição para rating
  const startersWithEffective = starters.map((p) => {
    const stats: PlayerStats = {
      overall: p.overall,
      age: p.age,
      pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 70, physical: 70,
      leagueTier: p.leagueTier,
      isRetired: p.isRetired ?? false,
      isInactive: p.isInactive ?? false,
    }
    const effectivePos = p.benchPosition || p.position
    return { ...p, effectiveOverall: effectiveOverall(stats), effectivePosition: effectivePos }
  })

  const startersTotal = startersWithEffective.reduce((acc, p) => acc + p.effectiveOverall, 0)
  const startersAvg = starters.length > 0 ? startersTotal / starters.length : 0
  const startersEffectiveAvg = startersAvg

  // Bônus por reservas — melhorado:
  // Top 5 reservas: 30% do overall efetivo
  // Reservas 6-7: 10% do overall efetivo (encoraja ter banco mais profundo)
  const sortedReserves = [...reserves].sort((a, b) => {
    const aEff = effectiveOverall({
      overall: a.overall, age: a.age, pace: 70, shooting: 70, passing: 70,
      dribbling: 70, defending: 70, physical: 70, leagueTier: a.leagueTier,
      isRetired: a.isRetired ?? false, isInactive: a.isInactive ?? false,
    })
    const bEff = effectiveOverall({
      overall: b.overall, age: b.age, pace: 70, shooting: 70, passing: 70,
      dribbling: 70, defending: 70, physical: 70, leagueTier: b.leagueTier,
      isRetired: b.isRetired ?? false, isInactive: b.isInactive ?? false,
    })
    return bEff - aEff
  })

  const reservesBonus = sortedReserves.reduce((acc, p, i) => {
    const stats: PlayerStats = {
      overall: p.overall, age: p.age,
      pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 70, physical: 70,
      leagueTier: p.leagueTier,
      isRetired: p.isRetired ?? false, isInactive: p.isInactive ?? false,
    }
    const weight = i < 5 ? 0.3 : 0.1
    return acc + effectiveOverall(stats) * weight
  }, 0)

  // Química (IMPLEMENTADO!)
  const { chemistryBonus, details: chemistryDetails } = calculateChemistry(starters)

  // Equilíbrio positional
  const { positionalBalanceBonus, details: balanceDetails } = calculatePositionalBalance(starters)

  // Bônus de formação
  const formationPositionsArr = formationPositions || []
  const formationBonus = formationPositionsArr.length > 0
    ? calculateFormationBonus(starters, formationPositionsArr)
    : 0

  // Rating por área
  const startersForAreaRating = startersWithEffective.map(p => ({
    overall: p.overall,
    effectiveOverall: p.effectiveOverall,
    position: p.effectivePosition || p.position,
  }))
  const attackRating = positionalRating(startersForAreaRating, 'ATT')
  const midfieldRating = positionalRating(startersForAreaRating, 'MID')
  const defenseRating = positionalRating(startersForAreaRating, 'DEF')

  // Rating final (FIFA-style: média titular + bônus + química + equilíbrio + formação)
  const finalRating = Math.round(
    startersEffectiveAvg +
    reservesBonus / Math.max(1, starters.length) +
    chemistryBonus +
    positionalBalanceBonus +
    formationBonus,
  )

  // Estrelas FIFA (0.5 a 5)
  let stars = 0.5
  if (finalRating >= 90) stars = 5
  else if (finalRating >= 84) stars = 4.5
  else if (finalRating >= 80) stars = 4
  else if (finalRating >= 76) stars = 3.5
  else if (finalRating >= 72) stars = 3
  else if (finalRating >= 68) stars = 2.5
  else if (finalRating >= 64) stars = 2
  else if (finalRating >= 60) stars = 1.5
  else if (finalRating >= 55) stars = 1
  else if (finalRating >= 50) stars = 0.5

  return {
    startersAvg: Math.round(startersAvg * 10) / 10,
    startersTotal,
    startersEffectiveAvg: Math.round(startersEffectiveAvg * 10) / 10,
    reservesBonus: Math.round(reservesBonus * 10) / 10,
    chemistryBonus,
    positionalBalanceBonus,
    formationBonus,
    finalRating: Math.min(99, Math.max(40, finalRating)),
    attackRating,
    midfieldRating,
    defenseRating,
    stars,
    chemistryDetails,
    balanceDetails,
  }
}

// =====================================================================
// Helper: mapear time para tier da liga
// =====================================================================
const TOP5_TEAMS = [
  // Premier League
  'Manchester City', 'Manchester United', 'Liverpool', 'Chelsea', 'Arsenal', 'Tottenham', 'Newcastle',
  // La Liga
  'Real Madrid', 'Barcelona', 'Atlético de Madrid', 'Atletico Madrid',
  // Serie A
  'Juventus', 'Inter de Milão', 'Inter', 'AC Milan', 'Milan', 'Napoli', 'Roma', 'Lazio',
  // Bundesliga
  'Bayern Munich', 'Bayern', 'Borussia Dortmund', 'Dortmund', 'RB Leipzig', 'Leverkusen',
  // Ligue 1
  'PSG', 'Marseille', 'Monaco', 'Lyon',
]
const TOP10_TEAMS = [
  'Ajax', 'PSV', 'Feyenoord', 'Benfica', 'Porto', 'Sporting', 'Celtic', 'Rangers',
  'Shakhtar Donetsk', 'Dinamo Zagreb', 'Salzburg', 'Club Brugge',
]
const BR1_TEAMS = [
  'Flamengo', 'Palmeiras', 'Corinthians', 'São Paulo', 'Atlético-MG', 'Atlético Mineiro',
  'Cruzeiro', 'Grêmio', 'Internacional', 'Fluminense', 'Botafogo', 'Santos', 'Vasco',
  'Athletico-PR', 'Bahia', 'Fortaleza', 'Bragantino', 'Cuiabá', 'Atlético-GO', 'Juventude',
]
const TOP20_TEAMS = [
  'Sevilla', 'Villarreal', 'Real Sociedad', 'Real Betis', 'Valencia',
  'Atalanta', 'Fiorentina', 'Torino', 'Bologna',
  'Wolfsburg', 'Frankfurt', 'Freiburg', 'Stuttgart',
  'Brighton', 'Aston Villa', 'West Ham', 'Everton',
  'Nice', 'Lens', 'Lille', 'Rennes',
]

export function detectLeagueTier(team: string): LeagueTier {
  if (TOP5_TEAMS.some((t) => team.toLowerCase().includes(t.toLowerCase()))) return 'TOP5'
  if (TOP10_TEAMS.some((t) => team.toLowerCase().includes(t.toLowerCase()))) return 'TOP10'
  if (BR1_TEAMS.some((t) => team.toLowerCase().includes(t.toLowerCase()))) return 'BR1'
  if (TOP20_TEAMS.some((t) => team.toLowerCase().includes(t.toLowerCase()))) return 'TOP20'
  return 'OTHER'
}

// =====================================================================
// Modos de jogo
// =====================================================================
export type GameMode = 'DREAM_TEAM' | 'WORLD_CUP'

export const GAME_MODES: Record<GameMode, { label: string; description: string; emoji: string; color: string }> = {
  DREAM_TEAM: {
    label: 'Dream Team',
    description: 'Monte um time com qualquer jogador da história — até lendas falecidas como Pelé, Maradona, Di Stéfano.',
    emoji: '👑',
    color: 'from-yellow-400 via-amber-500 to-orange-600',
  },
  WORLD_CUP: {
    label: 'World Cup',
    description: 'Apenas jogadores ainda na ativa. Aposentados e sem clube não são permitidos. Pura forma atual.',
    emoji: '🏆',
    color: 'from-blue-400 via-sky-500 to-cyan-600',
  },
}

// Filtra jogadores pelo modo de jogo
export function filterByMode<T extends { isRetired?: boolean; isInactive?: boolean }>(
  players: T[],
  mode: GameMode,
): T[] {
  if (mode === 'WORLD_CUP') {
    return players.filter((p) => !p.isRetired && !p.isInactive)
  }
  return players // DREAM_TEAM permite todos
}
