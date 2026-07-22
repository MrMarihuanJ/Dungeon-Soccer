// =====================================================================
// Player Rating Library — Sistema de avaliação estilo FIFA
// --------------------------------------------------------------------
// Cada jogador tem:
//   - Overall (0-99): nota geral
//   - 6 atributos: PAC, SHO, PAS, DRI, DEF, PHY
//   - Idade
//   - League Tier: tier da liga onde joga (afeta multiplicador)
//   - isRetired / isInactive: flags para filtrar modos de jogo
//
// Multiplicador final (estilo FIFA chemistry):
//   effectiveOverall = overall * ageMultiplier * leagueMultiplier * formMultiplier
//
// Team Rating (estádio FIFA):
//   - Média dos 11 titulares
//   - Bônus porDepth (reservas)
//   - Bônus por química (nacionalidade/times iguais - TODO)
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
// Team Rating (estilo FIFA Ultimate Team)
// =====================================================================
export interface TeamRatingResult {
  startersAvg: number       // média dos 11 titulares
  startersTotal: number     // soma dos overalls efetivos
  startersEffectiveAvg: number // média com multiplicadores aplicados
  reservesBonus: number     // bônus pelos reservas (até 5)
  chemistryBonus: number    // bônus por química (TODO)
  finalRating: number       // rating final arredondado
  attackRating: number      // média de ataque (FW + MF ofensivos)
  midfieldRating: number    // média de meio-campo
  defenseRating: number     // média de defesa (GK + DF)
  stars: number             // 0.5 a 5 estrelas
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
  starters: Array<{ overall: number; age: number; leagueTier: LeagueTier; position: string; isRetired?: boolean; isInactive?: boolean }>,
  reserves: Array<{ overall: number; age: number; leagueTier: LeagueTier; position: string; isRetired?: boolean; isInactive?: boolean }> = [],
): TeamRatingResult {
  // Calcula overall efetivo de cada titular
  const startersWithEffective = starters.map((p) => {
    const stats: PlayerStats = {
      overall: p.overall,
      age: p.age,
      pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 70, physical: 70,
      leagueTier: p.leagueTier,
      isRetired: p.isRetired ?? false,
      isInactive: p.isInactive ?? false,
    }
    return { ...p, effectiveOverall: effectiveOverall(stats) }
  })

  const startersTotal = startersWithEffective.reduce((acc, p) => acc + p.effectiveOverall, 0)
  const startersAvg = starters.length > 0 ? startersTotal / starters.length : 0
  const startersEffectiveAvg = startersAvg

  // Bônus por reservas (até 5 reservas contribuem com 30% do overall)
  const topReserves = reserves.slice(0, 5)
  const reservesBonus = topReserves.reduce((acc, p) => {
    const stats: PlayerStats = {
      overall: p.overall, age: p.age,
      pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 70, physical: 70,
      leagueTier: p.leagueTier,
      isRetired: p.isRetired ?? false, isInactive: p.isInactive ?? false,
    }
    return acc + effectiveOverall(stats) * 0.3
  }, 0)

  // Bônus por química (TODO: implementar quando há jogadores do mesmo time/nacionalidade)
  const chemistryBonus = 0

  // Rating final (FIFA-style: pesos para ataque/meio/defesa)
  const attackRating = positionalRating(startersWithEffective, 'ATT')
  const midfieldRating = positionalRating(startersWithEffective, 'MID')
  const defenseRating = positionalRating(startersWithEffective, 'DEF')
  const finalRating = Math.round(
    startersEffectiveAvg + reservesBonus / Math.max(1, starters.length) + chemistryBonus,
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
    finalRating: Math.min(99, Math.max(40, finalRating)),
    attackRating,
    midfieldRating,
    defenseRating,
    stars,
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
