// =====================================================================
// API: /api/players/search — V2 FAIL-PROOF SYSTEM
// --------------------------------------------------------------------
// Busca jogadores EM TEMPO REAL com sistema à prova de falhas:
//
// FONTES (paralelo, com timeouts agresivos):
//   1. Local DB (Prisma) — instantâneo (~200ms), stats completos
//   2. TheSportsDB — rápido (~1s), dados limitados, fotos thumbnails
//   3. ZAI Web Search COMBINADO — cobertura mundial (~3-5s):
//      - Transfermarkt → fotos reais, posições corretas, ampla cobertura
//      - Sofascore → fotos, ratings, posições corretas
//      - SoFIFA → ratings FIFA, fotos, posições corretas
//      - ogol.com.br → cobertura brasileira + mundial
//      - Football-Database → posições, stats
//   4. API-Football (opcional, se API_FOOTBALL_KEY configurada)
//      → fotos reais, posições 100% corretas, ampla cobertura
//
// MELHORIAS vs versão anterior:
//   - ZAI SDK singleton (não re-inicializa em cada request)
//   - Cache in-memory (5min TTL, evita buscas repetidas)
//   - Busca web COMBINADA (1 chamada ZAI cobre múltiplos sites)
//   - Timeouts agresivos (corta fontes lentas)
//   - Foto URLs construídas de Transfermarkt + Sofascore
//   - Dedup + merge com prioridade inteligente
//
// Query params:
//   q     -> termo de busca (mínimo 2 caracteres)
//   limit -> máximo de resultados (default 15, máx 30)
//   pos   -> filtra por posição (GK, DF, MF, FW)
//   mode  -> DREAM_TEAM | WORLD_CUP
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// -------- Tipos unificados --------
interface UnifiedPlayer {
  id: string
  name: string
  fullName: string
  team: string
  position: 'GK' | 'DF' | 'MF' | 'FW'
  photoUrl: string
  nationality?: string | null
  shirtNumber?: number | null
  source: 'api_football' | 'transfermarkt' | 'sofascore' | 'sofifa' | 'ogol' | 'thesportsdb' | 'local' | 'web'
  overall?: number
  age?: number
  pace?: number
  shooting?: number
  passing?: number
  dribbling?: number
  defending?: number
  physical?: number
  leagueTier?: string
  isRetired?: boolean
  isInactive?: boolean
  sofifaUrl?: string
  sofascoreUrl?: string
  transfermarktUrl?: string
  ogolUrl?: string
}

// -------- ZAI SDK Singleton --------
let zaiInstance: any = null
let zaiInitPromise: Promise<any> | null = null

async function getZaiInstance(): Promise<any> {
  if (zaiInstance) return zaiInstance
  if (zaiInitPromise) return zaiInitPromise

  zaiInitPromise = (async () => {
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default
      zaiInstance = new ZAI({})
      return zaiInstance
    } catch (err) {
      console.error('[search] ZAI SDK init error:', err)
      zaiInitPromise = null
      return null
    }
  })()

  return zaiInitPromise
}

// -------- In-memory Cache --------
const searchCache = new Map<string, { players: UnifiedPlayer[]; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCached(key: string): UnifiedPlayer[] | null {
  const entry = searchCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    searchCache.delete(key)
    return null
  }
  return entry.players
}

function setCache(key: string, players: UnifiedPlayer[]): void {
  // Limit cache size to 200 entries
  if (searchCache.size > 200) {
    const oldest = [...searchCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0]
    if (oldest) searchCache.delete(oldest[0])
  }
  searchCache.set(key, { players, timestamp: Date.now() })
}

// -------- Helpers --------
function fallbackPhoto(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0d8a3f&color=fff&size=200&bold=true`
}

function normalizePosition(raw: string | null | undefined): 'GK' | 'DF' | 'MF' | 'FW' {
  if (!raw) return 'FW'
  const p = raw.toLowerCase().trim()
  // English positions
  if (p.includes('goalkeeper') || p.includes('goleiro') || p === 'gk' || p.includes('guarda-netes') || p.includes('keeper')) return 'GK'
  if (p.includes('defender') || p.includes('back') || p.includes('centre-back') || p.includes('center-back') ||
      p.includes('zagueiro') || p.includes('lateral') || p.includes('full-back') || p.includes('centre half') ||
      p.includes('left-back') || p.includes('right-back') || p.includes('cb') || p.includes('lb') || p.includes('rb') ||
      p.includes('sweeper') || p.includes('libero')) return 'DF'
  if (p.includes('midfield') || p.includes('volante') || p.includes('meia') || p.includes('attacking mid') ||
      p.includes('defensive mid') || p.includes('central mid') || p.includes('midfielder') || p.includes('cm') ||
      p.includes('dm') || p.includes('am') || p.includes('cam') || p.includes('cdm') || p.includes('box-to-box')) return 'MF'
  if (p.includes('forward') || p.includes('striker') || p.includes('winger') || p.includes('atacante') ||
      p.includes('ponta') || p.includes('centre-forward') || p.includes('inside forward') || p.includes('cf') ||
      p.includes('ss') || p.includes('lw') || p.includes('rw') || p.includes('st')) return 'FW'
  // Default: forward (most common search)
  return 'FW'
}

// =====================================================================
// Fonte 1: Local DB (Prisma) — INSTANTÂNEO
// --------------------------------------------------------------------
// A fonte mais rápida e com dados mais completos (stats, overall, etc).
// Limitação: apenas jogadores que foram seedados.
// =====================================================================
async function searchLocal(query: string, limit: number, pos?: string | null, mode?: string | null): Promise<UnifiedPlayer[]> {
  try {
    const where: any = {
      AND: [
        { OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { fullName: { contains: query, mode: 'insensitive' } },
          { team: { contains: query, mode: 'insensitive' } },
        ] },
        ...(pos ? [{ position: pos }] : []),
        ...(mode === 'WORLD_CUP' ? [{ isRetired: false }, { isInactive: false }] : []),
      ],
    }
    const players = await db.player.findMany({
      where,
      take: limit,
      orderBy: [{ overall: 'desc' }, { name: 'asc' }],
      select: {
        id: true, name: true, fullName: true, team: true, position: true,
        photoUrl: true, nationality: true, shirtNumber: true,
        overall: true, age: true, pace: true, shooting: true, passing: true,
        dribbling: true, defending: true, physical: true, leagueTier: true,
        isRetired: true, isInactive: true,
      },
    })
    return players.map((p: any) => ({
      ...p,
      position: p.position as 'GK' | 'DF' | 'MF' | 'FW',
      source: 'local' as const,
    }))
  } catch (err) {
    console.error('[search] erro local DB:', err)
    return []
  }
}

// =====================================================================
// Fonte 2: TheSportsDB — RÁPIDO (~1s)
// --------------------------------------------------------------------
// Mantido como fallback rápido. Dados limitados mas thumbnails disponíveis.
// =====================================================================
const SPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || '3'

async function searchTheSportsDB(query: string, limit: number): Promise<UnifiedPlayer[]> {
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/searchplayers.php?p=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3000), // Aggressive 3s timeout
    })
    if (!res.ok) return []
    const data = await res.json()
    const players: any[] = data.player || []
    return players.slice(0, Math.min(limit, 8)).map((p: any) => {
      const name: string = p.strPlayer || p.strDisplayName || 'Desconhecido'
      const photo: string = p.strThumb || p.strCutout || fallbackPhoto(name)
      return {
        id: `sdb_${p.idPlayer}`,
        name,
        fullName: p.strPlayer || name,
        team: p.strTeam || 'Sem clube',
        position: normalizePosition(p.strPosition),
        photoUrl: photo,
        nationality: p.strNationality || null,
        shirtNumber: null,
        source: 'thesportsdb' as const,
        isRetired: p.strStatus === 'Retired' || p.strRetired === 'yes',
      }
    })
  } catch (err) {
    console.error('[search] erro TheSportsDB:', err)
    return []
  }
}

// =====================================================================
// Fonte 3: ZAI Web Search COMBINADO — COBERTURA MUNDIAL
// --------------------------------------------------------------------
// Uma única busca web que cobre MULTIPLOS sites de futebol:
//   - Transfermarkt: fotos, posições, times, cobertura mundial
//   - Sofascore: fotos, ratings, posições corretas
//   - SoFIFA: ratings FIFA, posições, fotos
//   - ogol.com.br: cobertura brasileira
//   - Football-Database: posições, stats
//
// Os resultados são classificados pela URL do site e dados são
// extraídos do snippet/título para cada fonte específica.
// =====================================================================
async function searchZaiWebCombined(query: string, limit: number): Promise<UnifiedPlayer[]> {
  const zai = await getZaiInstance()
  if (!zai) return []

  try {
    // Single comprehensive search targeting multiple football sites
    const searchQuery = `${query} footballer soccer player profile position team`
    const results = await zai.functions.invoke('web_search', {
      query: searchQuery,
      num: 20,
    })

    const combined: UnifiedPlayer[] = []
    const seenNames = new Set<string>()

    for (const r of (results as any[])) {
      if (!r.url && !r.name) continue

      const url = r.url || ''
      const snippet = r.snippet || ''

      // Skip non-football URLs (Wikipedia excluded per user request)
      if (url.includes('wikipedia.org') || url.includes('wikidata')) continue

      // Parse result based on URL domain
      let player: UnifiedPlayer | null = null

      // ---- Transfermarkt ----
      if (url.includes('transfermarkt.com')) {
        player = parseTransfermarktResult(r, seenNames)
      }
      // ---- Sofascore ----
      else if (url.includes('sofascore.com')) {
        player = parseSofascoreResult(r, seenNames)
      }
      // ---- SoFIFA ----
      else if (url.includes('sofifa.com')) {
        player = parseSoFIFAResult(r, seenNames)
      }
      // ---- ogol.com.br ----
      else if (url.includes('ogol.com.br')) {
        player = parseOgolResult(r, seenNames)
      }
      // ---- Football-Database ----
      else if (url.includes('football-database.eu') || url.includes('footballdatabase')) {
        player = parseFootballDatabaseResult(r, seenNames)
      }
      // ---- ESPN / FIFA / other football sites ----
      else if (url.includes('espn.com') || url.includes('fifa.com') || url.includes('soccerway.com') ||
               url.includes('worldfootball.net') || url.includes('zerozero.pt')) {
        player = parseGenericFootballResult(r, seenNames)
      }
      // ---- Skip irrelevant URLs ----
      else if (!url.includes('football') && !url.includes('soccer') && !url.includes('futbol') &&
               !url.includes('player') && !url.includes('jogador')) {
        continue
      }
      // ---- Generic fallback for unknown football URLs ----
      else {
        player = parseGenericFootballResult(r, seenNames)
      }

      if (player) {
        combined.push(player)
        if (combined.length >= limit) break
      }
    }

    return combined
  } catch (err) {
    console.error('[search] erro ZAI web combined:', err)
    return []
  }
}

// ---- Parse helpers for each source ----

function parseTransfermarktResult(r: any, seenNames: Set<string>): UnifiedPlayer | null {
  const url = r.url || ''
  const urlMatch = url.match(/transfermarkt\.com\/([^/]+)\/profil\/player\/(\d+)/)
  if (!urlMatch) return null

  const playerId = urlMatch[2]
  let name = (r.name || '').replace(/ - Transfermarkt/i, '').replace(/Profile/i, '').replace(/\|.*$/i, '').trim()

  // Clean up name from URL slug (more reliable than title)
  const slugName = urlMatch[1].replace(/-/g, ' ')
  // Use the longer/more complete name
  if (!name || name.length < 2) name = slugName
  else if (slugName.length > name.length) name = slugName

  const key = name.toLowerCase().trim()
  if (seenNames.has(key)) return null
  seenNames.add(key)

  // Extract data from snippet
  const snippet = r.snippet || ''
  let position = 'FW' as 'GK' | 'DF' | 'MF' | 'FW'
  let team = 'Sem clube'
  let nationality = null

  const posMatch = snippet.match(/Position:\s*([A-Za-z\s-]+)/i)
  if (posMatch) position = normalizePosition(posMatch[1])

  const teamMatch = snippet.match(/Club:\s*([^,\d]+)/i) || snippet.match(/Current club:\s*([^,\d]+)/i)
  if (teamMatch) team = teamMatch[1].trim()

  const natMatch = snippet.match(/Nationality:\s*([A-Za-z\s]+)/i) || snippet.match(/Country:\s*([A-Za-z\s]+)/i)
  if (natMatch) nationality = natMatch[1].trim()

  // Construct real photo URL from Transfermarkt
  const photoUrl = `https://img.transfermarkt.com/portrait/header/${playerId}.jpg`

  return {
    id: `tm_${playerId}`,
    name,
    fullName: name,
    team,
    position,
    photoUrl,
    nationality,
    shirtNumber: null,
    source: 'transfermarkt',
    transfermarktUrl: url,
  }
}

function parseSofascoreResult(r: any, seenNames: Set<string>): UnifiedPlayer | null {
  const url = r.url || ''
  // Sofascore URLs: /player/{name}-{playerId} or /football/player/{name}/{playerId}
  const urlMatch = url.match(/sofascore\.com\/(?:football\/)?player\/([^/]+)\/(\d+)/)
  if (!urlMatch) return null

  const playerId = urlMatch[2]
  let name = (r.name || '').replace(/ - Sofascore/i, '').replace(/\|.*$/i, '').trim()
  const slugName = urlMatch[1].replace(/-/g, ' ')
  if (!name || name.length < 2) name = slugName
  else if (slugName.length > name.length) name = slugName

  const key = name.toLowerCase().trim()
  if (seenNames.has(key)) return null
  seenNames.add(key)

  const snippet = r.snippet || ''
  let position = 'FW' as 'GK' | 'DF' | 'MF' | 'FW'
  let team = 'Sem clube'
  let overall: number | undefined = undefined

  // Sofascore snippets often contain ratings and positions
  const ratingMatch = snippet.match(/rating:\s*(\d+\.?\d*)/i) || snippet.match(/(\d+\.?\d*)\s*rating/i)
  if (ratingMatch) overall = Math.round(Number(ratingMatch[1]) * 10)

  if (snippet.match(/goalkeeper|goleiro|gk/i)) position = 'GK'
  else if (snippet.match(/defender|defesa|zagueiro|lateral|back/i)) position = 'DF'
  else if (snippet.match(/midfielder|meia|volante|midfield/i)) position = 'MF'
  else if (snippet.match(/forward|striker|atacante|winger/i)) position = 'FW'

  const teamMatch = snippet.match(/(?:plays for|at)\s*([A-Z][A-Za-z\s]+(?:FC|SC|Club|United|City))/i) ||
                    snippet.match(/current club:\s*([A-Za-z\s]+)/i)
  if (teamMatch) team = teamMatch[1].trim()

  // Sofascore photo URL pattern
  const photoUrl = `https://img.sofascore.com/images/player/image_${playerId}.png`

  return {
    id: `sc_${playerId}`,
    name,
    fullName: name,
    team,
    position,
    photoUrl,
    nationality: null,
    shirtNumber: null,
    source: 'sofascore',
    overall,
    sofascoreUrl: url,
  }
}

function parseSoFIFAResult(r: any, seenNames: Set<string>): UnifiedPlayer | null {
  const url = r.url || ''
  // SoFIFA URLs: /player/{playerId} or /players/{slug}
  const urlMatch = url.match(/sofifa\.com\/player\/(\d+)/)
  if (!urlMatch) return null

  const playerId = urlMatch[1]
  let name = (r.name || '').replace(/ - SoFIFA/i, '').replace(/\|.*$/i, '').trim()
  if (!name || name.length < 2) return null

  const key = name.toLowerCase().trim()
  if (seenNames.has(key)) return null
  seenNames.add(key)

  const snippet = r.snippet || ''
  let position = 'FW' as 'GK' | 'DF' | 'MF' | 'FW'
  let overall: number | undefined = undefined

  // SoFIFA snippets often contain OVR ratings
  const ovrMatch = snippet.match(/OVR:\s*(\d+)/i) || snippet.match(/overall:\s*(\d+)/i) ||
                   snippet.match(/(\d{2,3})\s*OVR/i)
  if (ovrMatch) overall = Number(ovrMatch[1])
  if (overall && overall > 100) overall = Math.round(overall / 10)

  if (snippet.match(/goalkeeper|gk/i)) position = 'GK'
  else if (snippet.match(/defender|cb|lb|rb|back/i)) position = 'DF'
  else if (snippet.match(/midfielder|cm|cdm|cam|dm|am|midfield/i)) position = 'MF'
  else if (snippet.match(/forward|striker|st|lw|rw|cf|winger/i)) position = 'FW'

  // SoFIFA photo URL
  const photoUrl = `https://cdn.sofifa.com/players/${playerId}/240_240.png`

  return {
    id: `sf_${playerId}`,
    name,
    fullName: name,
    team: 'Sem clube',
    position,
    photoUrl,
    nationality: null,
    shirtNumber: null,
    source: 'sofifa',
    overall,
    sofifaUrl: url,
  }
}

function parseOgolResult(r: any, seenNames: Set<string>): UnifiedPlayer | null {
  const url = r.url || ''
  if (!url.includes('ogol.com.br/jogador') && !url.includes('ogol.com.br/player')) return null

  let name = (r.name || '').replace(/ - ogol/i, '').replace(/ - ZeroZero/i, '').replace(/\|.*$/i, '').trim()
  if (!name || name.length < 2) return null

  const key = name.toLowerCase().trim()
  if (seenNames.has(key)) return null
  seenNames.add(key)

  const snippet = r.snippet || ''
  let position = 'FW' as 'GK' | 'DF' | 'MF' | 'FW'
  let team = 'Sem clube'
  let nationality = null

  if (snippet.match(/goleiro|guarda-netes|goalkeeper/i)) position = 'GK'
  else if (snippet.match(/defesa|zagueiro|lateral|defender/i)) position = 'DF'
  else if (snippet.match(/meia|volante|medio|midfielder/i)) position = 'MF'
  else if (snippet.match(/atacante|avançado|forward|striker/i)) position = 'FW'

  const teamMatch = snippet.match(/(?:clube|club):\s*([A-Za-z\s]+)/i) ||
                    snippet.match(/(?:at|plays for)\s*([A-Za-z\s]+)/i)
  if (teamMatch) team = teamMatch[1].trim()

  const natMatch = snippet.match(/(?:nationalidade|país|nationality):\s*([A-Za-z\s]+)/i)
  if (natMatch) nationality = natMatch[1].trim()

  const photoUrl = fallbackPhoto(name)

  return {
    id: `og_${key.replace(/\s+/g, '_')}`,
    name,
    fullName: name,
    team,
    position,
    photoUrl,
    nationality,
    shirtNumber: null,
    source: 'ogol',
    ogolUrl: url,
  }
}

function parseFootballDatabaseResult(r: any, seenNames: Set<string>): UnifiedPlayer | null {
  let name = (r.name || '').replace(/\|.*$/i, '').replace(/ - Football Database/i, '').trim()
  if (!name || name.length < 2) return null

  const key = name.toLowerCase().trim()
  if (seenNames.has(key)) return null
  seenNames.add(key)

  const snippet = r.snippet || ''
  let position = 'FW' as 'GK' | 'DF' | 'MF' | 'FW'
  let team = 'Sem clube'

  if (snippet.match(/goalkeeper|gk/i)) position = 'GK'
  else if (snippet.match(/defender|back/i)) position = 'DF'
  else if (snippet.match(/midfielder|midfield/i)) position = 'MF'
  else if (snippet.match(/forward|striker|winger/i)) position = 'FW'

  const teamMatch = snippet.match(/(?:plays for|at|club):\s*([A-Za-z\s]+)/i)
  if (teamMatch) team = teamMatch[1].trim()

  return {
    id: `fdb_${key.replace(/\s+/g, '_')}`,
    name,
    fullName: name,
    team,
    position,
    photoUrl: fallbackPhoto(name),
    nationality: null,
    shirtNumber: null,
    source: 'web',
  }
}

function parseGenericFootballResult(r: any, seenNames: Set<string>): UnifiedPlayer | null {
  let name = (r.name || '').replace(/\|.*$/i, '').replace(/ - .*/i, '').trim()
  if (!name || name.length < 2) return null

  const key = name.toLowerCase().trim()
  if (seenNames.has(key)) return null
  seenNames.add(key)

  const snippet = r.snippet || ''
  let position = 'FW' as 'GK' | 'DF' | 'MF' | 'FW'
  let team = 'Sem clube'
  let nationality = null

  if (snippet.match(/goalkeeper|goleiro|gk/i)) position = 'GK'
  else if (snippet.match(/defender|defesa|zagueiro|lateral|back/i)) position = 'DF'
  else if (snippet.match(/midfielder|meia|volante|midfield/i)) position = 'MF'
  else if (snippet.match(/forward|striker|atacante|winger/i)) position = 'FW'

  const teamMatch = snippet.match(/(?:plays for|at|club|clube):\s*([A-Za-z\s]+)/i)
  if (teamMatch) team = teamMatch[1].trim()

  const natMatch = snippet.match(/(?:nationality|país|country):\s*([A-Za-z\s]+)/i)
  if (natMatch) nationality = natMatch[1].trim()

  return {
    id: `web_${key.replace(/\s+/g, '_')}`,
    name,
    fullName: name,
    team,
    position,
    photoUrl: fallbackPhoto(name),
    nationality,
    shirtNumber: null,
    source: 'web',
  }
}

// =====================================================================
// Fonte 4: API-Football (opcional, requer API_FOOTBALL_KEY)
// --------------------------------------------------------------------
// A melhor fonte quando disponível: fotos reais, posições 100% corretas,
// cobertura mundial ampla. Free tier: ~100 requests/day.
// =====================================================================
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || ''

async function searchApiFootball(query: string, limit: number): Promise<UnifiedPlayer[]> {
  if (!API_FOOTBALL_KEY) return []

  try {
    const url = `https://v3.football.api-sports.io/players?search=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: { 'x-apisports-key': API_FOOTBALL_KEY },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const data = await res.json()
    const players: any[] = data?.response || []

    return players.slice(0, limit).map((p: any) => {
      const player = p.player || {}
      const name = player.name || 'Desconhecido'
      const photo = player.photo || fallbackPhoto(name)
      const position = normalizePosition(player.position)
      const nationality = player.nationality || null
      const age = player.age || null

      // Get team from first statistics entry
      let team = 'Verificar no perfil'
      const stats = p.statistics?.[0]
      if (stats?.team?.name) team = stats.team.name

      return {
        id: `af_${player.id}`,
        name,
        fullName: name,
        team,
        position,
        photoUrl: photo.startsWith('http') ? photo : `https://media.api-sports.io/football/players/${player.id}.png`,
        nationality,
        shirtNumber: null,
        source: 'api_football',
        age: age ? Number(age) : undefined,
      }
    })
  } catch (err) {
    console.error('[search] erro API-Football:', err)
    return []
  }
}

// =====================================================================
// Endpoint principal — busca em paralelo com fallback progressivo
// =====================================================================
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') ?? '').trim().toLowerCase()
    const limit = Math.min(Number(searchParams.get('limit') ?? 15), 30)
    const pos = searchParams.get('pos')
    const mode = searchParams.get('mode')

    if (!q || q.length < 2) {
      return NextResponse.json({
        players: [],
        message: 'Digite ao menos 2 caracteres.',
        sources: {},
      })
    }

    // Check cache first
    const cacheKey = `${q}_${limit}_${pos || 'all'}_${mode || 'dt'}`
    const cached = getCached(cacheKey)
    if (cached) {
      return NextResponse.json({
        players: cached,
        total: cached.length,
        query: q,
        cached: true,
        sources: { cached: cached.length },
      })
    }

    // Parallel search with aggressive timeouts
    const [localResults, sdbResults, zaiResults, afResults] = await Promise.all([
      searchLocal(q, limit, pos, mode),
      searchTheSportsDB(q, Math.min(limit, 8)),
      searchZaiWebCombined(q, limit).catch(() => [] as UnifiedPlayer[]),
      searchApiFootball(q, limit).catch(() => [] as UnifiedPlayer[]),
    ])

    // WORLD_CUP mode: filter out retired/inactive from external sources
    const filteredSdb = mode === 'WORLD_CUP'
      ? sdbResults.filter((p) => !p.isRetired && !p.isInactive && !p.team.toLowerCase().includes('retro'))
      : sdbResults

    const filteredZai = mode === 'WORLD_CUP'
      ? zaiResults.filter((p) => !p.isRetired && !p.isInactive)
      : zaiResults

    // Merge with priority:
    // API-Football > Transfermarkt > Sofascore > SoFIFA > Local > ogol > TheSportsDB > Web
    const seen = new Set<string>()
    const all: UnifiedPlayer[] = []

    const prioritySources = [
      afResults,
      filteredZai, // Contains transfermarkt, sofascore, sofifa, ogol results
      localResults,
      filteredSdb,
    ]

    for (const sourceResults of prioritySources) {
      for (const p of sourceResults) {
        const key = p.name.toLowerCase().trim()
        if (seen.has(key)) continue
        seen.add(key)
        all.push(p)
      }
    }

    // Apply position filter
    const filtered = pos ? all.filter((p) => p.position === pos) : all

    // Limit and return
    const final = filtered.slice(0, limit)

    // Cache the result
    setCache(cacheKey, final)

    // Count sources
    const sourceCounts: Record<string, number> = {}
    for (const p of final) {
      sourceCounts[p.source] = (sourceCounts[p.source] || 0) + 1
    }

    return NextResponse.json({
      players: final,
      total: final.length,
      query: q,
      cached: false,
      sources: sourceCounts,
    })
  } catch (err) {
    console.error('[API/players/search] erro:', err)
    return NextResponse.json(
      { error: 'Erro ao buscar jogadores.', players: [] },
      { status: 500 },
    )
  }
}
