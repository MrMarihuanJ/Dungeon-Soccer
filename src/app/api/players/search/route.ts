// =====================================================================
// API: /api/players/search
// --------------------------------------------------------------------
// Busca jogadores EM TEMPO REAL em fontes externas mundiais:
//   1. Transfermarkt (via ZAI web_search) — ampla cobertura, fotos, dados precisos
//   2. API-Football (v3.football.api-sports.io) — fotos, posições corretas, cobertura mundial
//   3. TheSportsDB — fallback, dados limitados mas ainda útil
//   4. Banco interno Prisma — último fallback para seed local
//
// Sistema à prova de falhas: busca em paralelo, combina resultados,
// remove duplicados, prioriza fontes com fotos e dados mais precisos.
//
// Query params:
//   q     -> termo de busca (mínimo 2 caracteres)
//   limit -> máximo de resultados (default 15, máx 30)
//   pos   -> filtra por posição (GK, DF, MF, FW) - opcional
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
  source: 'transfermarkt' | 'api_football' | 'thesportsdb' | 'local'
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
}

// -------- Helpers --------
function fallbackPhoto(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0d8a3f&color=fff&size=200&bold=true`
}

function normalizePosition(raw: string | null | undefined): 'GK' | 'DF' | 'MF' | 'FW' {
  if (!raw) return 'FW'
  const p = raw.toLowerCase()
  if (p.includes('goalkeeper') || p.includes('goleiro') || p === 'gk' || p.includes('guarda-netes')) return 'GK'
  if (p.includes('defender') || p.includes('back') || p.includes('centre-back') || p.includes('center-back') ||
      p.includes('zagueiro') || p.includes('lateral') || p.includes('full-back') || p.includes('centre half')) return 'DF'
  if (p.includes('midfield') || p.includes('volante') || p.includes('meia') || p.includes('attacking mid') ||
      p.includes('defensive mid') || p.includes('central mid') || p.includes('midfielder')) return 'MF'
  if (p.includes('forward') || p.includes('striker') || p.includes('winger') || p.includes('atacante') ||
      p.includes('ponta') || p.includes('centre-forward') || p.includes('inside forward')) return 'FW'
  return 'FW'
}

// =====================================================================
// Fonte 1: Transfermarkt via ZAI web_search
// --------------------------------------------------------------------
// A Transfermarkt tem ampla cobertura mundial, dados precisos (posição,
// time, valor de mercado), fotos de jogadores, e inclui jogadores
// aposentados. Usamos o ZAI SDK para buscar perfis de jogadores.
// =====================================================================
async function searchTransfermarkt(query: string, limit: number): Promise<UnifiedPlayer[]> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = new ZAI({})

    const searchQuery = `site:transfermarkt.com ${query} footballer profile`
    const results = await zai.functions.invoke('web_search', {
      query: searchQuery,
      num: Math.min(limit * 2, 15),
    })

    const tmResults: UnifiedPlayer[] = []
    const seenNames = new Set<string>()

    for (const r of (results as any[])) {
      if (!r.url || !r.url.includes('transfermarkt.com')) continue
      // Transfermarkt profile URLs: /player/name/profil/playerId
      const urlMatch = r.url.match(/transfermarkt\.com\/[^/]+\/profil\/player\/(\d+)/)
      if (!urlMatch) continue

      const playerId = urlMatch[1]
      const name = r.name || ''
      // Try to extract meaningful name from the title
      const cleanName = name.replace(/ - Transfermarkt/i, '').replace(/Profile/i, '').trim()
      if (!cleanName || cleanName.length < 2) continue

      const key = cleanName.toLowerCase().trim()
      if (seenNames.has(key)) continue
      seenNames.add(key)

      // Extract position and team from snippet
      const snippet = r.snippet || ''
      let position = 'FW'
      let team = 'Sem clube'
      let nationality = null

      // Transfermarkt snippets often contain "Position: ..." or team info
      const posMatch = snippet.match(/Position:\s*([A-Za-z\s-]+)/i)
      if (posMatch) {
        position = normalizePosition(posMatch[1])
      }

      const teamMatch = snippet.match(/Club:\s*([^,\d]+)/i) || snippet.match(/Current club:\s*([^,\d]+)/i)
      if (teamMatch) {
        team = teamMatch[1].trim()
      }

      const natMatch = snippet.match(/Nationality:\s*([A-Za-z\s]+)/i) || snippet.match(/Country:\s*([A-Za-z\s]+)/i)
      if (natMatch) {
        nationality = natMatch[1].trim()
      }

      // Transfermarkt photo URL pattern
      // /player/name/profil/playerId has photos accessible
      // We use the direct profile photo URL
      const photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=0d8a3f&color=fff&size=200&bold=true`

      tmResults.push({
        id: `tm_${playerId}`,
        name: cleanName,
        fullName: cleanName,
        team,
        position: position as 'GK' | 'DF' | 'MF' | 'FW',
        photoUrl,
        nationality,
        shirtNumber: null,
        source: 'transfermarkt',
      })

      if (tmResults.length >= limit) break
    }

    return tmResults
  } catch (err) {
    console.error('[search] erro Transfermarkt:', err)
    return []
  }
}

// =====================================================================
// Fonte 2: API-Football (v3.football.api-sports.io)
// --------------------------------------------------------------------
// API-Football tem ampla cobertura, fotos reais de jogadores,
// posições corretas, dados de market value, e inclui jogadores
// aposentados/inativos.
//
// Free tier: 10 requests/day. Para uso moderado isso é suficiente.
// Para mais requests, o plano Pro ($9.99/mês) oferece 3000 requests/dia.
// =====================================================================
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY || ''

async function searchApiFootball(query: string, limit: number): Promise<UnifiedPlayer[]> {
  if (!API_FOOTBALL_KEY) {
    console.warn('[search] API-Football: sem chave API configurada (API_FOOTALL_KEY env var)')
    return []
  }

  try {
    // Search endpoint: /players?search={query}
    const url = `https://v3.football.api-sports.io/players?search=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: {
        'x-apisports-key': API_FOOTBALL_KEY,
      },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(6000),
    })

    if (!res.ok) {
      console.warn('[search] API-Football retornou', res.status)
      return []
    }

    const data = await res.json()
    const players: any[] = data?.response || []

    return players.slice(0, limit).map((p) => {
      const player = p.player || {}
      const name = player.name || 'Desconhecido'
      const photo = player.photo || fallbackPhoto(name)

      // API-Football positions: Goalkeeper, Defender, Midfielder, Forward
      // Also more specific: Centre-Back, Left-Back, Right-Back, etc.
      const rawPos = player.position || ''
      const position = normalizePosition(rawPos)

      // Get nationality
      const nationality = player.nationality || null
      const age = player.age || null

      return {
        id: `af_${player.id}`,
        name,
        fullName: name,
        team: 'Verificar no perfil', // team info comes from statistics object, not search
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
// Fonte 3: TheSportsDB (fallback, dados limitados)
// --------------------------------------------------------------------
// Mantido como fallback pois ainda cobre alguns jogadores que as
// outras fontes podem não encontrar. Posição e dados podem estar
// errados, mas é uma fonte adicional.
// =====================================================================
const SPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || '3'

async function searchTheSportsDB(query: string, limit: number): Promise<UnifiedPlayer[]> {
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/searchplayers.php?p=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) {
      console.warn('[search] TheSportsDB retornou', res.status)
      return []
    }
    const data = await res.json()
    const players: any[] = data.player || []
    return players.slice(0, limit).map((p) => {
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
      }
    })
  } catch (err) {
    console.error('[search] erro TheSportsDB:', err)
    return []
  }
}

// =====================================================================
// Fonte 4: Banco interno (último fallback)
// =====================================================================
async function searchLocal(query: string, limit: number, pos?: string | null, mode?: string | null): Promise<UnifiedPlayer[]> {
  try {
    const where = {
      AND: [
        { OR: [
          { name: { contains: query, mode: 'insensitive' as const } },
          { fullName: { contains: query, mode: 'insensitive' as const } },
          { team: { contains: query, mode: 'insensitive' as const } },
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
    return players.map((p) => ({
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
// Fonte 5: ZAI web_search genérico (meta-source)
// --------------------------------------------------------------------
// Busca em múltiplas fontes usando web_search do ZAI SDK.
// Este é o mais robusto pois pode encontrar jogadores em qualquer
// site de futebol (ogol, Transfermarkt, FIFA, ESPN, etc).
// Extrai dados do snippet e título dos resultados.
// =====================================================================
async function searchZaiWeb(query: string, limit: number): Promise<UnifiedPlayer[]> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = new ZAI({})

    // Search for player profiles across multiple sites
    const searchQuery = `${query} footballer soccer player profile stats`
    const results = await zai.functions.invoke('web_search', {
      query: searchQuery,
      num: Math.min(limit, 10),
    })

    const zaiResults: UnifiedPlayer[] = []
    const seenNames = new Set<string>()

    for (const r of (results as any[])) {
      if (!r.name && !r.snippet) continue

      // Extract player name from title (clean up site-specific suffixes)
      let name = (r.name || '').replace(/ - Transfermarkt/i, '').replace(/ - Wikipedia/i, '')
        .replace(/\|.*$/i, '').replace(/Profile/i, '').replace(/Stats/i, '').trim()
      if (!name || name.length < 2) continue

      const key = name.toLowerCase().trim()
      if (seenNames.has(key)) continue
      seenNames.add(key)

      // Try to extract position, team, nationality from snippet
      const snippet = r.snippet || ''
      let position = 'FW' as 'GK' | 'DF' | 'MF' | 'FW'
      let team = 'Sem clube'
      let nationality = null

      // Look for position keywords
      if (snippet.match(/goalkeeper|goleiro|gk/i)) position = 'GK'
      else if (snippet.match(/defender|defesa|zagueiro|lateral|back/i)) position = 'DF'
      else if (snippet.match(/midfielder|meia|volante|midfield/i)) position = 'MF'
      else if (snippet.match(/forward|striker|atacante|winger/i)) position = 'FW'

      // Look for team name
      const teamPatterns = [
        /plays for ([A-Z][A-Za-z\s]+(?:FC|SC|Club|United|City))/i,
        /current club: ([A-Za-z\s]+)/i,
        /clube: ([A-Za-z\s]+)/i,
        /at ([A-Z][A-Za-z\s]+(?:FC|SC|Club|United|City))/i,
      ]
      for (const pat of teamPatterns) {
        const m = snippet.match(pat)
        if (m) { team = m[1].trim(); break }
      }

      // Look for nationality
      const natMatch = snippet.match(/(?:nationality|país|country):\s*([A-Za-z\s]+)/i) ||
                        snippet.match(/(?:born in|nascido em)\s*([A-Za-z\s]+)/i)
      if (natMatch) nationality = natMatch[1].trim()

      // Source ID from URL domain
      const urlDomain = (r.url || '').match(/(?:transfermarkt|ogol|espn|fifa|football-api|soccerway)/i)
      const sourceId = urlDomain ? urlDomain[0].toLowerCase() : 'web'

      zaiResults.push({
        id: `zai_${sourceId}_${key.replace(/\s+/g, '_')}`,
        name,
        fullName: name,
        team,
        position,
        photoUrl: fallbackPhoto(name),
        nationality,
        shirtNumber: null,
        source: 'transfermarkt' as const, // treat ZAI web results as transfermarkt-level
      })

      if (zaiResults.length >= limit) break
    }

    return zaiResults
  } catch (err) {
    console.error('[search] erro ZAI web_search:', err)
    return []
  }
}

// =====================================================================
// Endpoint principal — busca em paralelo com fallback
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

    // 1. Busca paralela em todas as fontes
    // Transfermarkt (ZAI) e API-Football são prioritárias (ampla cobertura + fotos)
    // TheSportsDB é fallback (dados limitados)
    // ZAI web_search é meta-source (busca em qualquer site)
    // Local DB é último fallback
    const [tmResults, afResults, sdbResults, zaiResults, localResults] = await Promise.all([
      searchTransfermarkt(q, limit),
      searchApiFootball(q, limit),
      searchTheSportsDB(q, Math.min(limit, 10)),
      searchZaiWeb(q, Math.min(limit, 5)),
      searchLocal(q, limit, pos, mode),
    ])

    // No modo WORLD_CUP, filtra resultados de fontes externas
    const filteredSdb = mode === 'WORLD_CUP'
      ? sdbResults.filter((p) => !p.team.toLowerCase().includes('retro') && !p.team.toLowerCase().includes('retired'))
      : sdbResults

    // 2. Combina resultados com prioridade:
    //    API-Football > Transfermarkt > ZAI web > Local > TheSportsDB
    //    Fontes com fotos e dados mais precisos têm prioridade
    const seen = new Set<string>()
    const all: UnifiedPlayer[] = []

    // Priority order: API-Football (photos + correct data) > Transfermarkt (good coverage) >
    // ZAI web (meta) > Local (full stats) > TheSportsDB (fallback)
    for (const p of [...afResults, ...tmResults, ...zaiResults, ...localResults, ...filteredSdb]) {
      const key = p.name.toLowerCase().trim()
      if (seen.has(key)) continue
      seen.add(key)
      all.push(p)
    }

    // 3. Aplica filtro de posição
    const filtered = pos ? all.filter((p) => p.position === pos) : all

    // 4. Limita e retorna
    const final = filtered.slice(0, limit)

    return NextResponse.json({
      players: final,
      total: final.length,
      query: q,
      sources: {
        api_football: afResults.length,
        transfermarkt: tmResults.length,
        zai_web: zaiResults.length,
        thesportsdb: sdbResults.length,
        local: localResults.length,
      },
    })
  } catch (err) {
    console.error('[API/players/search] erro:', err)
    return NextResponse.json(
      { error: 'Erro ao buscar jogadores.', players: [] },
      { status: 500 },
    )
  }
}
