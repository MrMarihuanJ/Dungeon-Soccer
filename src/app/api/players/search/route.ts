// =====================================================================
// API: /api/players/search
// --------------------------------------------------------------------
// Busca jogadores EM TEMPO REAL em 4 fontes externas mundiais:
//   1. TheSportsDB (API direta — cobertura mundial, fotos, time atual)
//   2. Transfermarkt (via z-ai-web-dev-sdk web_search — mercado, posição)
//   3. Sofascore (via z-ai-web-dev-sdk web_search — ratings, stats)
//   4. oGol (via z-ai-web-dev-sdk web_search — stats brasileiros)
//   + Banco interno Prisma (último fallback para seed local)
//
// SDK z-ai-web-dev-sdk:
//   - zai.functions.invoke('web_search', { query, num }) → SearchFunctionResultItem[]
//   - Cada item: { url, name, snippet, host_name, rank, date, favicon }
//
// Query params:
//   q     -> termo de busca (mínimo 2 caracteres)
//   limit -> máximo de resultados (default 15, máx 30)
//   pos   -> filtra por posição (GK, DF, LD, LE, MF, FW) - opcional
//   mode  -> DREAM_TEAM | WORLD_CUP
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// -------- Tipos unificados --------
type PositionCode = 'GK' | 'DF' | 'LD' | 'LE' | 'MF' | 'FW'

interface UnifiedPlayer {
  id: string
  name: string
  fullName: string
  team: string
  position: PositionCode
  photoUrl: string
  nationality?: string | null
  shirtNumber?: number | null
  source: 'thesportsdb' | 'transfermarkt' | 'sofascore' | 'ogol' | 'local'
  overall?: number | null
  age?: number | null
  pace?: number
  shooting?: number
  passing?: number
  dribbling?: number
  defending?: number
  physical?: number
  leagueTier?: string
  isRetired?: boolean
  isInactive?: boolean
  // Links externos para detalhes
  transfermarktUrl?: string | null
  sofascoreUrl?: string | null
  ogolUrl?: string | null
}

// -------- SDK helper --------
let _zaiInstance: any = null
let _zaiInitPromise: Promise<any> | null = null

async function getZAI(): Promise<any> {
  if (_zaiInstance) return _zaiInstance
  if (_zaiInitPromise) return _zaiInitPromise

  _zaiInitPromise = (async () => {
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default
      const zai = await ZAI.create()
      console.log('[ZAI] SDK inicializado com sucesso')
      _zaiInstance = zai
      return zai
    } catch (err) {
      console.error('[ZAI] SDK falhou ao inicializar:', err instanceof Error ? err.message : err)
      _zaiInitPromise = null
      return null
    }
  })()

  return _zaiInitPromise
}

// -------- Helpers --------
const SPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || '3'

function normalizePosition(raw: string | null | undefined): PositionCode {
  if (!raw) return 'FW'
  const p = raw.toLowerCase().trim()
  if (p.includes('goalkeeper') || p.includes('goleiro') || p === 'gk') return 'GK'
  if (
    p.includes('right back') || p.includes('right-back') || p === 'rb' || p === 'rwb' ||
    p.includes('lateral direito') || p.includes('lateral-direito') ||
    (p.includes('right') && (p.includes('back') || p.includes('wing')))
  ) return 'LD'
  if (
    p.includes('left back') || p.includes('left-back') || p === 'lb' || p === 'lwb' ||
    p.includes('lateral esquerdo') || p.includes('lateral-esquerdo') ||
    (p.includes('left') && (p.includes('back') || p.includes('wing')))
  ) return 'LE'
  if (
    p.includes('centre-back') || p.includes('center-back') || p.includes('central defender') ||
    p === 'cb' || p.includes('zagueiro')
  ) return 'DF'
  if (p.includes('defender') && !p.includes('left') && !p.includes('right')) return 'DF'
  if (
    p.includes('midfield') || p.includes('volante') || p.includes('meia') ||
    p.includes('attacking mid') || p.includes('defensive mid') || p.includes('central mid') ||
    p.includes('médio') || p.includes('meia ofensivo') || p.includes('meia-atacante')
  ) return 'MF'
  if (
    p.includes('winger') || (p.includes('wing') && !p.includes('back')) ||
    p.includes('extremo') || p.includes('ponta')
  ) return 'FW'
  if (
    p.includes('forward') || p.includes('striker') || p.includes('atacante') ||
    p.includes('centroavante')
  ) return 'FW'
  return 'FW'
}

function fallbackPhoto(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0d8a3f&color=fff&size=200&bold=true`
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Robust web search with retry on rate limit (429)
async function webSearchWithRetry(zai: any, query: string, num: number, retries = 2): Promise<any[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const results = await zai.functions.invoke('web_search', { query, num })
      if (Array.isArray(results)) return results
      return []
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (msg.includes('429') || msg.includes('Too many requests')) {
        if (attempt < retries) {
          console.warn(`[webSearch] Rate limit, retrying in ${2 ** attempt}s... (attempt ${attempt + 1})`)
          await delay(2000 * (2 ** attempt))
          continue
        }
        console.error('[webSearch] Rate limit exceeded for:', query)
        return []
      }
      console.error('[webSearch] Error:', msg)
      return []
    }
  }
  return []
}

// Normalize name for deduplication (lowercase, remove accents, collapse spaces)
function normalizeNameForDedup(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/\s+/g, ' ')
    .trim()
}

// -------- TheSportsDB --------
async function searchTheSportsDB(query: string, limit: number): Promise<UnifiedPlayer[]> {
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/searchplayers.php?p=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      console.warn('[TheSportsDB] HTTP', res.status)
      return []
    }
    const data = await res.json()
    const players: any[] = data.player || []
    if (!players.length) {
      console.warn('[TheSportsDB] Nenhum resultado para', query)
      return []
    }
    return players.slice(0, limit).map((p) => {
      const name: string = p.strPlayer || p.strDisplayName || 'Desconhecido'
      const photo: string = p.strThumb || p.strCutout || fallbackPhoto(name)
      return {
        id: `sdb_${p.idPlayer}`,
        name,
        fullName: p.strPlayer || name,
        team: p.strTeam || 'Sem clube',
        position: normalizePosition(p.strPosition),
        photoUrl: photo.startsWith('http') ? photo : fallbackPhoto(name),
        nationality: p.strNationality || null,
        shirtNumber: undefined,
        source: 'thesportsdb' as const,
        age: undefined,
      }
    })
  } catch (err) {
    console.error('[TheSportsDB] erro:', err instanceof Error ? err.message : err)
    return []
  }
}

// -------- Transfermarkt --------
interface WebSearchItem {
  url: string
  name: string
  snippet: string
  host_name: string
  rank: number
  date: string
  favicon: string
}

async function searchTransfermarkt(query: string, limit: number): Promise<UnifiedPlayer[]> {
  const results: UnifiedPlayer[] = []
  try {
    const zai = await getZAI()
    if (!zai) return results

    const searchResults: WebSearchItem[] = await webSearchWithRetry(
      zai, `${query} jogador site:transfermarkt.com`, Math.min(limit, 8)
    )

    if (!searchResults.length) {
      console.warn('[Transfermarkt] Busca web retornou vazio para', query)
      return results
    }

    for (const r of searchResults) {
      const url = r.url || ''
      if (!url.includes('transfermarkt')) continue
      // Aceita URLs de perfil, stats, valor de mercado — páginas de jogador
      const isPlayerPage = url.match(/\/(?:profil|leistungsdaten|marktwertverlauf|nationalmannschaft|spieler)\//i)
      if (!isPlayerPage) continue

      // ---- Extrai nome ----
      const urlNameMatch = url.match(/transfermarkt\.[a-z.]+\/([^/]+)\/(?:profil|leistungsdaten|marktwertverlauf|nationalmannschaft)/i)
      const titleClean = (r.name || '').replace(/ - Transfermarkt.*$/i, '').trim()
      const cleanName = urlNameMatch
        ? urlNameMatch[1].replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
        : titleClean.replace(/^Player profile \d+ /i, '').replace(/^Stats \d+ /i, '').trim()

      if (!cleanName || cleanName.length < 2) continue

      const snippet = r.snippet || ''

      // ---- Extrai time (formato: "➤ Santos FC, since 2024") ----
      const teamArrowMatch = snippet.match(/➤\s*([A-ZÀ-ÿ][a-zà-ÿ\s.'()]+(?:FC|SC|AC|EC|CF|AS|SS|SA)?)/)
      const teamRaw = (teamArrowMatch?.[1] || '').trim()
      const team = teamRaw.replace(/,?\s*since\s+\d{4}$/i, '').trim() || 'Ver no Transfermarkt'

      // ---- Extrai posição ----
      const posMatch = snippet.match(/➤\s*(Attacking Midfield|Defensive Mid|Central Midfield|Midfield|Centre-Back|Center Back|Left Back|Right Back|Left Wing Back|Right Wing Back|Goalkeeper|Striker|Winger|Forward|Second Striker|Sweeper)/i)
      const position = posMatch?.[1] ? normalizePosition(posMatch[1]) : 'FW'

      // ---- Nacionalidade ----
      const natMatch = snippet.match(/(?:from|Citizenship:\s*)(Brazil|Portugal|Argentina|France|Spain|Germany|England|Italy|Uruguay|Colombia|Mexico|Netherlands|Belgium|Croatia|Chile|Peru|Ecuador|USA|Japan|South Korea|Nigeria|Senegal|Ghana|Cameroon|Morocco|Egypt|Turkey|Sweden|Denmark|Norway|Poland|Czech Republic|Serbia|Ukraine|Russia|China|Australia)/i)
      const nationality = natMatch?.[1] || null

      // ---- Idade ----
      const ageMatch = snippet.match(/(\d{1,2}),?\s*from/i)
      const age = ageMatch?.[1] ? parseInt(ageMatch[1]) : undefined

      results.push({
        id: `tm_${encodeURIComponent(url)}`,
        name: cleanName,
        fullName: cleanName,
        team,
        position,
        photoUrl: fallbackPhoto(cleanName),
        nationality,
        shirtNumber: undefined,
        source: 'transfermarkt' as const,
        transfermarktUrl: url,
        age,
      })
    }
  } catch (err) {
    console.error('[Transfermarkt] erro:', err instanceof Error ? err.message : err)
  }
  return results
}

// -------- Sofascore --------
async function searchSofascore(query: string, limit: number): Promise<UnifiedPlayer[]> {
  const results: UnifiedPlayer[] = []
  try {
    const zai = await getZAI()
    if (!zai) return results

    await delay(1500) // Evitar rate limit

    const searchResults: WebSearchItem[] = await webSearchWithRetry(
      zai, `${query} player sofascore.com`, Math.min(limit, 8)
    )

    if (!searchResults.length) {
      console.warn('[Sofascore] Busca web retornou vazio para', query)
      return results
    }

    for (const r of searchResults) {
      const url = r.url || ''
      if (!url.includes('sofascore.com')) continue

      // Aceita apenas páginas de jogador: /football/player/NOME/ID
      // Exclui: /player/compare (comparação), /news/, /player/NOME/temporada etc
      const isPlayerPage = url.match(/sofascore\.com\/football\/player\/[^/]+\/\d+$/i)
      if (!isPlayerPage) continue

      // ---- Extrai nome ----
      // Title formatos:
      //   "Neymar stats, ratings and goals - Sofascore" → "Neymar"
      //   "Vinícius Júnior stats and ratings - Sofascore" → "Vinícius Júnior"
      //   "Neymar Pajing stats and ratings - Sofascore" → "Neymar Pajing"
      //   "Sósia do Neymar stats and ratings | Sofascore" → "Sósia do Neymar"
      // Strategy: remove Sofascore suffixes first, then remove stats suffixes
      const rawTitle = (r.name || '')
      // Step 1: Remove " - Sofascore" or " | Sofascore"
      let cleanTitle = rawTitle
        .replace(/\s*[-|]\s*Sofascore\s*$/i, '')
        .trim()
      // Step 2: Remove stats suffixes like "stats, ratings and goals", "stats and ratings", etc.
      cleanTitle = cleanTitle
        .replace(/\s*stats(?:,?\s*ratings(?:\s+and\s+goals)?|\s+and\s+ratings|\s+and\s+comparison\s+tool)?\s*$/i, '')
        .replace(/\s*ratings\s+and\s+goals\s*$/i, '')
        .trim()

      // Also try extracting from URL slug: /football/player/neymar/124712 → "neymar"
      const urlSlugMatch = url.match(/\/football\/player\/([^/]+)\/\d+/i)
      const urlName = urlSlugMatch
        ? urlSlugMatch[1].replace(/-/g, ' ').trim()
        : ''

      // Prefer title name (more readable), fall back to URL name
      const name = cleanTitle.length >= 2 ? cleanTitle : urlName

      if (!name || name.length < 2) continue

      const snippet = r.snippet || ''
      // Get first sentence (most relevant info)
      const snippetFirst = snippet.split(/\.\s/)[0] || snippet.split(/\n/)[0] || snippet

      // ---- Extrai time (formato: "plays for Santos" or "plays for Real Madrid.") ----
      // Stop at period, comma, or newline
      const teamMatch = snippetFirst.match(/(?:plays for|at)\s+([A-ZÀ-ÿ][a-zà-ÿ\s.'()]+?)(?:\.|,|$)/i)
      const team = teamMatch?.[1]?.trim() || 'Ver no Sofascore'

      // ---- Extrai posição ----
      const posPatterns = [
        /(?:is a|Position:)\s*(?:\d+-year-old\s+)?(?:Brazilian|Portuguese|Argentine|French|Spanish|German|English|Italian)?\s*(goalkeeper|defender|midfielder|forward|striker|winger|left back|right back|centre-back)/i,
        /(?:position|posição)\s*:\s*(Goleiro|Zagueiro|Meia|Atacante|Lateral|Extremo|Volante|Defensor|Centroavante)/i,
      ]
      let rawPos = ''
      for (const pattern of posPatterns) {
        const m = snippetFirst.match(pattern)
        if (m?.[1]) { rawPos = m[1]; break }
      }
      const position = rawPos ? normalizePosition(rawPos) : 'FW'

      // ---- Nacionalidade ----
      const natMatch = snippetFirst.match(/(?:is a|from)\s*(?:\d+-year-old\s+)?(Brazilian|Portuguese|Argentine|French|Spanish|German|English|Italian|Uruguayan|Colombian|Mexican)/i)
      const natMap: Record<string, string> = {
        brazilian: 'Brazil', portuguese: 'Portugal', argentine: 'Argentina',
        french: 'France', spanish: 'Spain', german: 'Germany',
        english: 'England', italian: 'Italy', uruguayan: 'Uruguay',
        colombian: 'Colombia', mexican: 'Mexico',
      }
      const nationality = natMatch?.[1] ? natMap[natMatch[1].toLowerCase()] || natMatch[1] : null

      // ---- Idade ----
      const ageMatch = snippetFirst.match(/(?:is)\s*(\d{1,2})\s*years old/i)
      const age = ageMatch?.[1] ? parseInt(ageMatch[1]) : undefined

      // ---- Número da camisa ----
      const shirtMatch = snippet.match(/(?:jersey number|His jersey number)\s*(?:is\s*)?(\d{1,3})/i)
      const shirtNumber = shirtMatch?.[1] ? parseInt(shirtMatch[1]) : undefined

      results.push({
        id: `sc_${encodeURIComponent(url)}`,
        name,
        fullName: name,
        team,
        position,
        photoUrl: fallbackPhoto(name),
        nationality,
        shirtNumber,
        source: 'sofascore' as const,
        sofascoreUrl: url,
        age,
      })
    }
  } catch (err) {
    console.error('[Sofascore] erro:', err instanceof Error ? err.message : err)
  }
  return results
}

// -------- oGol --------
async function searchOGol(query: string, limit: number): Promise<UnifiedPlayer[]> {
  const results: UnifiedPlayer[] = []
  try {
    const zai = await getZAI()
    if (!zai) return results

    await delay(1500) // Evitar rate limit

    const searchResults: WebSearchItem[] = await webSearchWithRetry(
      zai, `${query} jogador ogol.com.br`, Math.min(limit, 8)
    )

    if (!searchResults.length) {
      console.warn('[oGol] Busca web retornou vazio para', query)
      return results
    }

    for (const r of searchResults) {
      const url = r.url || ''
      if (!url.includes('ogol.com.br')) continue

      // Aceita apenas páginas de jogador: /jogador/NOME/ID (sem sub-paths)
      // Exclui: /estatisticas/, /jogador/NOME/ID/equipes, /player_bio.php
      const isMainPlayerPage = url.match(/\/jogador\/[^/]+\/\d+$/i)
      if (!isMainPlayerPage) continue

      const snippet = r.snippet || ''
      // Get first line (most relevant info)
      const snippetFirst = snippet.split(/\n/)[0] || snippet

      // ---- Extrai nome ----
      // Title: "Neymar :: 2026 - Santos - Informações e Estatísticas do Jogador"
      // → shortName = "Neymar"
      // Snippet: "Neymar da Silva Santos Júnior :: 2026 é um jogador de Futebol..."
      // → fullName = "Neymar da Silva Santos Júnior"

      // From snippet - extract fullName before ::
      const fullNameMatch = snippetFirst.match(/^([A-ZÀ-ÿ][a-zà-ÿ\s.'()-]+(?:de\s+[A-ZÀ-ÿ][a-zà-ÿ\s.'()-]+)?)\s*::/i)
      const fullNameRaw = fullNameMatch?.[1]?.trim() || ''

      // From title - extract shortName before :: 
      const titleShort = (r.name || '').replace(/ :: .*$/i, '').replace(/ - .*$/i, '').trim()

      // fullName from snippet, shortName from title
      const fullName = fullNameRaw || titleShort
      const shortName = titleShort || fullNameRaw.split(' ').filter(w => w.length > 2).slice(0, 2).join(' ')

      if (!shortName || shortName.length < 2) continue

      // ---- Extrai time ----
      // Snippet: "Neymar da Silva Santos Júnior :: 2026 é um jogador de Futebol de 34 anos..."
      // ou snippet: "Joga como Atacante em Real Madrid, Espanha"
      const teamEmMatch = snippetFirst.match(/(?:joga|jogou)\s+como\s+\w+\s+em\s+([A-ZÀ-ÿ][a-zà-ÿ\s.'()]+?)(?:,|\.|$)/i)
      // Also try from title: "Neymar :: 2026 - Santos - ..."
      const titleTeamMatch = (r.name || '').match(/ :: \d+\/\d+\s*-\s*([A-ZÀ-ÿ][a-zà-ÿ\s.'()]+?)(?:\s*-\s*|$)/i)
      const team = (teamEmMatch?.[1]?.trim() || titleTeamMatch?.[1]?.trim() || 'Ver no oGol').replace(/\s+$/g, '')

      // ---- Extrai posição ----
      const posMatch = snippetFirst.match(/(?:joga|jogou)\s+como\s+(Atacante|Meia[- ]?Atacante|Meia|Goleiro|Zagueiro|Lateral|Extremo|Volante|Defensor|Centroavante|Ponta)/i)
      const rawPos = posMatch?.[1] || ''
      const position = rawPos ? normalizePosition(rawPos) : 'FW'

      // ---- Nacionalidade ----
      const natMatch = snippetFirst.match(/nascido\s+em\s+\d{4}-\d{2}-\d{2},?\s+em\s+[A-ZÀ-ÿ\s()-]+,?\s+(Brasil|Portugal|Argentina|França|Espanha|Alemanha|Itália|Uruguai|Colômbia)/i)
      const nationality = natMatch?.[1] || null

      // ---- Idade ----
      const ageMatch = snippetFirst.match(/(?:jogador de Futebol de)\s*(\d{1,2})\s*anos/i)
      const age = ageMatch?.[1] ? parseInt(ageMatch[1]) : undefined

      // ---- Extrai ID do oGol ----
      const ogolIdMatch = url.match(/\/jogador\/[^/]+\/(\d+)/)
      const ogolId = ogolIdMatch?.[1] || null

      results.push({
        id: ogolId ? `ogol_${ogolId}` : `ogol_${encodeURIComponent(url)}`,
        name: shortName,
        fullName: fullName !== shortName ? fullName : shortName,
        team,
        position,
        photoUrl: fallbackPhoto(shortName),
        nationality,
        shirtNumber: undefined,
        source: 'ogol' as const,
        ogolUrl: url,
        age,
      })
    }
  } catch (err) {
    console.error('[oGol] erro:', err instanceof Error ? err.message : err)
  }
  return results
}

// -------- Banco interno --------
async function searchLocal(query: string, limit: number, pos?: string | null, mode?: string | null): Promise<UnifiedPlayer[]> {
  try {
    const posFilter = pos
      ? (pos === 'DF' || pos === 'LD' || pos === 'LE')
        ? { position: { in: ['DF', 'LD', 'LE'] } }
        : { position: pos }
      : {}

    const where = {
      AND: [
        { OR: [
          { name: { contains: query, mode: 'insensitive' as const } },
          { fullName: { contains: query, mode: 'insensitive' as const } },
          { team: { contains: query, mode: 'insensitive' as const } },
        ] },
        ...(Object.keys(posFilter).length > 0 ? [posFilter] : []),
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
    return players.map((p) => ({
      ...p,
      photoUrl: p.photoUrl || fallbackPhoto(p.name),
      position: p.position as PositionCode,
      source: 'local' as const,
      ogolUrl: `https://www.ogol.com.br/search.php?search=${encodeURIComponent(p.name)}`,
    }))
  } catch (err) {
    console.error('[LocalDB] erro:', err instanceof Error ? err.message : err)
    return []
  }
}

// -------- Endpoint --------
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') ?? '').trim().toLowerCase()
    const limit = Math.min(Number(searchParams.get('limit') ?? 15), 30)
    const pos = searchParams.get('pos') // GK | DF | LD | LE | MF | FW
    const mode = searchParams.get('mode') // DREAM_TEAM | WORLD_CUP

    if (!q || q.length < 2) {
      return NextResponse.json({
        players: [],
        message: 'Digite ao menos 2 caracteres.',
        sources: {},
      })
    }

    console.log(`[search] Buscando "${q}" — pos=${pos}, mode=${mode}`)

    // 1. Busca: TheSportsDB + Local (paralelo, não usam z-ai)
    //    + Web sources (sequencial com delay para evitar rate limit 429)
    const [sdbResults, localResults] = await Promise.all([
      searchTheSportsDB(q, limit),
      searchLocal(q, limit, pos, mode),
    ])

    const tmResults = await searchTransfermarkt(q, Math.min(limit, 8))
    const scResults = await searchSofascore(q, Math.min(limit, 8))
    const ogolResults = await searchOGol(q, Math.min(limit, 8))

    console.log(`[search] Resultados: TheSportsDB=${sdbResults.length}, Transfermarkt=${tmResults.length}, Sofascore=${scResults.length}, oGol=${ogolResults.length}, Local=${localResults.length}`)

    // WORLD_CUP: filtra resultados externos sem retro/retired
    const filteredSdb = mode === 'WORLD_CUP'
      ? sdbResults.filter((p) => !p.team.toLowerCase().includes('retro') && !p.team.toLowerCase().includes('retired'))
      : sdbResults

    // 2. Combina, remove duplicados por nome normalizado
    const seen = new Set<string>()
    const all: UnifiedPlayer[] = []

    // Prioridade: Local (dados mais ricos) > TheSportsDB (tem fotos) > oGol (dados BR) > Transfermarkt > Sofascore
    for (const p of [...localResults, ...filteredSdb, ...ogolResults, ...tmResults, ...scResults]) {
      const key = normalizeNameForDedup(p.name)
      if (seen.has(key)) continue
      seen.add(key)
      all.push(p)
    }

    // 3. Adiciona links de busca automática para todas fontes
    for (const p of all) {
      if (!p.transfermarktUrl) {
        p.transfermarktUrl = `https://www.transfermarkt.com.br/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(p.name)}`
      }
      if (!p.sofascoreUrl) {
        p.sofascoreUrl = `https://www.sofascore.com/search?q=${encodeURIComponent(p.name)}`
      }
      if (!p.ogolUrl) {
        p.ogolUrl = `https://www.ogol.com.br/search.php?search=${encodeURIComponent(p.name)}`
      }
    }

    // 4. Aplica filtro de posição (DF/LD/LE compatíveis)
    const filtered = pos
      ? all.filter((p) => {
          if (pos === 'DF' || pos === 'LD' || pos === 'LE') {
            return p.position === 'DF' || p.position === 'LD' || p.position === 'LE'
          }
          return p.position === pos
        })
      : all

    // 5. Limita e retorna
    const final = filtered.slice(0, limit)

    return NextResponse.json({
      players: final,
      total: final.length,
      query: q,
      sources: {
        thesportsdb: sdbResults.length,
        transfermarkt: tmResults.length,
        sofascore: scResults.length,
        ogol: ogolResults.length,
        local: localResults.length,
      },
    })
  } catch (err) {
    console.error('[API/players/search] erro:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Erro ao buscar jogadores.', players: [] },
      { status: 500 },
    )
  }
}
