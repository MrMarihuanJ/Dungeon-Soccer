// =====================================================================
// API: /api/players/search
// --------------------------------------------------------------------
// Busca jogadores EM TEMPO REAL em fontes externas mundiais:
//   1. TheSportsDB (cobertura mundial, fotos, time atual)
//   2. Transfermarkt + Sofascore (via web search z-ai-web-dev-sdk)
//   3. Banco interno Prisma (último fallback para seed local)
//
// A busca web funciona com config do SDK obtido de:
//   - Arquivo .z-ai-config (local)
//   - Variáveis de ambiente ZAI_BASE_URL + ZAI_API_KEY + ZAI_TOKEN (Vercel)
//
// Query params:
//   q     -> termo de busca (mínimo 2 caracteres)
//   limit -> máximo de resultados (default 15, máx 30)
//   pos   -> filtra por posição (GK, DF, LD, LE, MF, FW) - opcional
//   mode  -> DREAM_TEAM | WORLD_CUP
//
// Retorna array unificado de jogadores com:
//   { id, name, fullName, team, position, photoUrl, nationality, shirtNumber?, source }
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'

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
  source: 'thesportsdb' | 'transfermarkt' | 'sofascore' | 'local'
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
  // Links externos para detalhes
  transfermarktUrl?: string | null
  sofascoreUrl?: string | null
  ogolUrl?: string | null
}

// -------- SDK helper (funciona local e no Vercel) --------
// On Vercel serverless, the .z-ai-config file might not be accessible.
// We read config from env vars as fallback, and also try explicit new ZAI(config).
async function createZAI(): Promise<any> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default

    // Try default create() first (reads .z-ai-config file) — works locally
    try {
      const zai = await ZAI.create()
      console.log('[ZAI] SDK initialized via .z-ai-config')
      return zai
    } catch {
      // .z-ai-config not found — try environment variables
    }

    // Fallback: use environment variables (set on Vercel dashboard)
    // IMPORTANT: ZAI.create() does NOT accept parameters — use new ZAI(config) instead
    const baseUrl = process.env.ZAI_BASE_URL
    const apiKey = process.env.ZAI_API_KEY
    const token = process.env.ZAI_TOKEN
    const chatId = process.env.ZAI_CHAT_ID
    const userId = process.env.ZAI_USER_ID

    if (baseUrl && apiKey && token) {
      try {
        const config = {
          baseUrl,
          apiKey,
          token,
          chatId: chatId || '',
          userId: userId || '',
        }
        const zai = new ZAI(config)
        console.log('[ZAI] SDK initialized via environment variables (new ZAI)')
        return zai
      } catch (err) {
        console.warn('[ZAI] new ZAI(env vars) falhou:', err instanceof Error ? err.message : err)
      }
    }

    // Last resort: try reading .z-ai-config from various paths
    const fs = await import('fs')
    const path = await import('path')
    const configPaths = [
      path.join(process.cwd(), '.z-ai-config'),
      path.join(process.cwd(), '..', '.z-ai-config'),
      '/etc/.z-ai-config',
    ]
    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          const configContent = fs.readFileSync(configPath, 'utf8')
          const config = JSON.parse(configContent)
          const zai = new ZAI(config)
          console.log(`[ZAI] SDK initialized via config file: ${configPath}`)
          return zai
        }
      } catch {
        // Continue trying other paths
      }
    }

    console.warn('[ZAI] SDK não disponível — busca web desabilitada. Configure .z-ai-config ou env vars ZAI_BASE_URL/ZAI_API_KEY/ZAI_TOKEN.')
    return null
  } catch (err) {
    console.warn('[ZAI] SDK import falhou — busca web desabilitada. Erro:', err instanceof Error ? err.message : err)
    return null
  }
}

// -------- TheSportsDB --------
const SPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || '3'

function normalizePosition(raw: string | null | undefined): PositionCode {
  if (!raw) return 'FW'
  const p = raw.toLowerCase()
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
    p.includes('médio') || p.includes('meia ofensivo')
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

async function searchTheSportsDB(query: string, limit: number): Promise<UnifiedPlayer[]> {
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/searchplayers.php?p=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
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

// -------- Web Search (Transfermarkt + Sofascore) --------
// Usa z-ai-web-dev-sdk para buscar jogadores na web.
// Faz duas buscas paralelas: uma direcionada ao Transfermarkt e outra ao Sofascore
// para maximizar a cobertura de resultados.
async function searchWebSources(query: string, limit: number): Promise<{
  transfermarkt: UnifiedPlayer[]
  sofascore: UnifiedPlayer[]
}> {
  const tmResults: UnifiedPlayer[] = []
  const scResults: UnifiedPlayer[] = []

  try {
    const zai = await createZAI()
    if (!zai) return { transfermarkt: tmResults, sofascore: scResults }

    // Busca PARALELA: Transfermarkt + Sofascore (domain-specific queries)
    const [tmSearchResults, scSearchResults] = await Promise.all([
      zai.functions.invoke('web_search', {
        query: `${query} jogador transfermarkt.com`,
        num: Math.min(limit, 8),
      }).catch(() => []),
      zai.functions.invoke('web_search', {
        query: `${query} jogador sofascore.com player`,
        num: Math.min(limit, 8),
      }).catch(() => []),
    ])

    // ---- Processa resultados Transfermarkt ----
    const tmRaw = (tmSearchResults as any[]) || []
    for (const r of tmRaw) {
      const url = r.url || ''
      if (!url.includes('transfermarkt')) continue

      // Extrai nome do jogador da URL (formato: /nome-jogador/profil/spieler/ID)
      const urlNameMatch = url.match(/transfermarkt\.[a-z]+\/([^/]+)\/(?:profil|leistungsdaten|marktwertverlauf|nationalmannschaft)/)
      const rawName = (r.name || '').replace(/ - Transfermarkt.*$/i, '').replace(/ \| Transfermarkt.*$/i, '').trim()
      const cleanName = urlNameMatch ? urlNameMatch[1].replace(/-/g, ' ') : rawName

      const snippet = r.snippet || ''
      // Extrai time — Transfermarkt snippets usam "➤" como separador
      const teamMatch = snippet.match(/➤\s*([A-ZÀ-ÿ][a-zà-ÿ\s.'()-]+(?:FC|SC|AC|EC)?(?:\s+\d{4})?)/)
      const teamGeneric = snippet.match(/(?:at|joga em|plays for)\s+([A-ZÀ-ÿ][a-zà-ÿ\s.'-]+)/i)
      const team = (teamMatch?.[1] || teamGeneric?.[1] || 'Ver no Transfermarkt').trim()

      // Posição do snippet
      const posMatch = snippet.match(/(?:Posição|Position|posição):\s*(Zagueiro|Lateral|Goleiro|Meia|Atacante|Médio Ofensivo|Médio Defensivo|Extremo|Defender|Midfielder|Forward|Goalkeeper|Left Back|Right Back|Centre-Back|Striker|Winger|Attacking Mid|Defensive Mid|Centre Mid)/i)
      const position = posMatch?.[1] ? normalizePosition(posMatch[1]) : 'FW'

      // Nacionalidade
      const natMatch = snippet.match(/(?:nacionalidade|Nacionalität|Citizenship|nacional):\s*([A-ZÀ-ÿ][a-zà-ÿ]+)/i)
      const nationality = natMatch?.[1] || null

      tmResults.push({
        id: `tm_${encodeURIComponent(url)}`,
        name: cleanName,
        fullName: cleanName,
        team,
        position,
        photoUrl: fallbackPhoto(cleanName),
        nationality,
        shirtNumber: null,
        source: 'transfermarkt' as const,
        transfermarktUrl: url,
      })
    }

    // ---- Processa resultados Sofascore ----
    const scRaw = (scSearchResults as any[]) || []
    for (const r of scRaw) {
      const url = r.url || ''
      if (!url.includes('sofascore')) continue
      // Prioriza URLs de perfil de jogador (/player/ ou /football/player/)
      const isPlayerPage = url.includes('/player/') || url.includes('/football/player/')
      if (!isPlayerPage) continue // Ignora páginas de notícias/tags

      const name = (r.name || '').replace(/ - Sofascore.*$/i, '').replace(/ \| Sofascore.*$/i, '').replace(/stats.*$/i, '').trim()
      const snippet = r.snippet || ''

      // Sofascore snippet: "Endrick is 20 years old (Jul 21, 2006), 173 cm tall and plays for Real Madrid."
      const teamMatch = snippet.match(/(?:plays for|joga|at)\s+([A-ZÀ-ÿ][a-zà-ÿ\s.'()-]+)/i)
      const team = teamMatch?.[1]?.trim() || 'Ver no Sofascore'

      // Position from snippet
      const posMatch = snippet.match(/(?:is a|position|posição|Position:)\s*(\d+-year-old\s+)?(Brazilian|Portuguese|Argentine|French|Spanish|German|English|Italian)?\s*(goalkeeper|defender|midfielder|forward|striker|winger|left back|right back|centre-back|Goleiro|Zagueiro|Meia|Atacante|Lateral)/i)
      const rawPos = posMatch?.[3] || ''
      const position = rawPos ? normalizePosition(rawPos) : 'FW'

      // Nacionalidade
      const natMatch = snippet.match(/(?:is a|nacionalidade)\s*(\d+-year-old\s+)?(Brazilian|Portuguese|Argentine|French|Spanish|German|English|Italian|Brasil|Portugal|Argentina)/i)
      const nationality = natMatch?.[2] || null

      scResults.push({
        id: `sc_${encodeURIComponent(url)}`,
        name,
        fullName: name,
        team,
        position,
        photoUrl: fallbackPhoto(name),
        nationality,
        shirtNumber: null,
        source: 'sofascore' as const,
        sofascoreUrl: url,
      })
    }
  } catch (err) {
    console.error('[search] erro web sources:', err)
  }

  return { transfermarkt: tmResults, sofascore: scResults }
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
    console.error('[search] erro local DB:', err)
    return []
  }
}

// -------- Endpoint --------
export async function GET(req: NextRequest) {
  try {
    // Garante que o banco está disponível antes de buscar local
    try {
      await ensureDbSync()
    } catch (err: any) {
      console.error('[search] DB sync failed:', err?.message?.slice(0, 200))
      // Don't abort — local search will just return empty if tables don't exist
    }

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

    // 1. Busca paralela: TheSportsDB + Web (Transfermarkt/Sofascore) + Local
    const [sdbResults, webResults, localResults] = await Promise.all([
      searchTheSportsDB(q, limit),
      searchWebSources(q, Math.min(limit, 5)),
      searchLocal(q, limit, pos, mode),
    ])
    const { transfermarkt: tmResults, sofascore: scResults } = webResults

    // WORLD_CUP: filtra resultados externos sem retro/retired
    const filteredSdb = mode === 'WORLD_CUP'
      ? sdbResults.filter((p) => !p.team.toLowerCase().includes('retro') && !p.team.toLowerCase().includes('retired'))
      : sdbResults

    // 2. Combina, remove duplicados por nome
    const seen = new Set<string>()
    const all: UnifiedPlayer[] = []
    for (const p of [...filteredSdb, ...localResults, ...tmResults, ...scResults]) {
      const key = p.name.toLowerCase().trim()
      if (seen.has(key)) continue
      seen.add(key)
      all.push(p)
    }

    // 3. Para resultados da TheSportsDB/local que NÃO têm link web,
    // adiciona links Transfermarkt + Sofascore + ogol automaticamente
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
