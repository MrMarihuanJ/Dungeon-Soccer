// =====================================================================
// API: /api/players/search
// --------------------------------------------------------------------
// Busca jogadores EM TEMPO REAL em fontes externas mundiais:
//   1. TheSportsDB (cobertura mundial, fotos, time atual)
//   2. Transfermarkt (mercado global, valores, posição detalhada)
//   3. Sofascore (estats, ratings, posição)
//   4. Banco interno Prisma (último fallback para seed local)
//
// Query params:
//   q     -> termo de busca (mínimo 2 caracteres)
//   limit -> máximo de resultados (default 15, máx 30)
//   pos   -> filtra por posição (GK, DF, LD, LE, MF, FW) - opcional
//
// Retorna array unificado de jogadores com:
//   { id, name, fullName, team, position, photoUrl, nationality, shirtNumber?, source }
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
  source: 'thesportsdb' | 'transfermarkt' | 'sofascore' | 'local'
  // Rating estilo FIFA (apenas para jogadores locais; externos terão default)
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

// -------- TheSportsDB --------
// API gratuita: a chave pública de teste é "3" (até 100 req/min em horários de pico).
// Para produção, o usuário pode cadastrar em thesportsdb.com e obter chave própria.
const SPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || '3'

// Normaliza string de posição do TheSportsDB para nosso código (incluindo LD/LE)
function normalizePosition(raw: string | null | undefined): PositionCode {
  if (!raw) return 'FW'
  const p = raw.toLowerCase()
  // Goleiro
  if (p.includes('goalkeeper') || p.includes('goleiro') || p === 'gk') return 'GK'
  // Lateral Direito (Right Back / Right Wing Back)
  if (
    p.includes('right back') ||
    p.includes('right-back') ||
    p === 'rb' ||
    p === 'rwb' ||
    p.includes('lateral direito') ||
    p.includes('lateral-direito') ||
    (p.includes('right') && p.includes('back')) ||
    (p.includes('right') && p.includes('wing'))
  ) return 'LD'
  // Lateral Esquerdo (Left Back / Left Wing Back)
  if (
    p.includes('left back') ||
    p.includes('left-back') ||
    p === 'lb' ||
    p === 'lwb' ||
    p.includes('lateral esquerdo') ||
    p.includes('lateral-esquerdo') ||
    (p.includes('left') && p.includes('back')) ||
    (p.includes('left') && p.includes('wing'))
  ) return 'LE'
  // Zagueiro (Centre Back - apenas centrais, não laterais)
  if (
    p.includes('centre-back') ||
    p.includes('center-back') ||
    p.includes('central defender') ||
    p === 'cb' ||
    p.includes('zagueiro')
  ) return 'DF'
  // Defender genérico (se não especificou lateral, assume zagueiro)
  if (p.includes('defender') && !p.includes('left') && !p.includes('right')) return 'DF'
  // Meia
  if (
    p.includes('midfield') ||
    p.includes('volante') ||
    p.includes('meia') ||
    p.includes('attacking mid') ||
    p.includes('defensive mid') ||
    p.includes('central mid')
  ) return 'MF'
  // Winger como atacante (não confundir com wing-back)
  if (
    p.includes('winger') ||
    p.includes('wing') && !p.includes('back')
  ) return 'FW'
  // Atacante
  if (
    p.includes('forward') ||
    p.includes('striker') ||
    p.includes('atacante') ||
    p.includes('ponta')
  ) return 'FW'
  return 'FW'
}

function fallbackPhoto(name: string): string {
  // UI Avatars com cor verde padrão
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

// -------- Transfermarkt (web search) --------
// Usa z-ai-web-dev-sdk para buscar perfis de jogadores no Transfermarkt.
// Retorna nome, time, posição (normalizada) e URL do perfil.
async function searchTransfermarkt(query: string, limit: number): Promise<UnifiedPlayer[]> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const results = await zai.functions.invoke('web_search', {
      query: `site:transfermarkt.com.br ${query} jogador`,
      num: Math.min(limit * 2, 10),
    })

    // Filtra resultados do Transfermarkt (perfil de jogador)
    const transfermarktResults = (results as any[])
      .filter((r: any) =>
        r.url && r.url.includes('transfermarkt.com') && r.url.includes('/profil/')
      )
      .slice(0, limit)
      .map((r: any) => {
        const name = r.name || ''
        // Tenta extrair time e posição do snippet
        const snippet = r.snippet || ''
        const teamMatch = snippet.match(/(?:joga|plays|at)\s+(?:em|no|for)\s+([A-ZÀ-ÿ][a-zà-ÿ\s]+(?:FC|SC|AC|EC)?)/i)
        const team = teamMatch?.[1]?.trim() || 'Ver no Transfermarkt'
        // Tenta detectar posição do snippet
        const posMatch = snippet.match(/(?:Posição|Position):\s*(Zagueiro|Lateral|Goleiro|Meia|Atacante|Defender|Midfielder|Forward|Goalkeeper|Left Back|Right Back|Centre-Back|Striker|Winger)/i)
        const rawPos = posMatch?.[1] || ''
        const position = normalizePosition(rawPos)
        return {
          id: `tm_${encodeURIComponent(r.url)}`,
          name: name.replace(/ - Transfermarkt.*$/i, '').trim(),
          fullName: name.replace(/ - Transfermarkt.*$/i, '').trim(),
          team,
          position,
          photoUrl: fallbackPhoto(name),
          nationality: null,
          shirtNumber: null,
          source: 'transfermarkt' as const,
        }
      })

    return transfermarktResults
  } catch (err) {
    console.error('[search] erro Transfermarkt:', err)
    return []
  }
}

// -------- Sofascore (web search) --------
// Usa z-ai-web-dev-sdk para buscar perfis de jogadores no Sofascore.
// Retorna nome, time, posição (normalizada) e URL do perfil.
async function searchSofascore(query: string, limit: number): Promise<UnifiedPlayer[]> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const results = await zai.functions.invoke('web_search', {
      query: `site:sofascore.com ${query} player`,
      num: Math.min(limit * 2, 10),
    })

    // Filtra resultados do Sofascore (perfil de jogador)
    const sofascoreResults = (results as any[])
      .filter((r: any) =>
        r.url && r.url.includes('sofascore.com') && r.url.includes('/player/')
      )
      .slice(0, limit)
      .map((r: any) => {
        const name = r.name || ''
        const snippet = r.snippet || ''
        // Tenta extrair time do snippet
        const teamMatch = snippet.match(/(?:team|clube|time):\s*([A-ZÀ-ÿ][a-zà-ÿ\s]+)/i)
        const team = teamMatch?.[1]?.trim() || 'Ver no Sofascore'
        // Tenta detectar posição do snippet
        const posMatch = snippet.match(/(?:position|posição):\s*(G|D|M|F|GK|DF|MF|FW|Goalkeeper|Defender|Midfielder|Forward|Left Back|Right Back|Centre-Back)/i)
        const rawPos = posMatch?.[1] || ''
        const position = normalizePosition(rawPos)
        return {
          id: `sc_${encodeURIComponent(r.url)}`,
          name: name.replace(/ - Sofascore.*$/i, '').trim(),
          fullName: name.replace(/ - Sofascore.*$/i, '').trim(),
          team,
          position,
          photoUrl: fallbackPhoto(name),
          nationality: null,
          shirtNumber: null,
          source: 'sofascore' as const,
        }
      })

    return sofascoreResults
  } catch (err) {
    console.error('[search] erro Sofascore:', err)
    return []
  }
}

// -------- Banco interno (último fallback) --------
async function searchLocal(query: string, limit: number, pos?: string | null, mode?: string | null): Promise<UnifiedPlayer[]> {
  try {
    // Para filtro de posição, LD/LE devem também incluir DF (compatibilidade defensiva)
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
        // Filtro por modo de jogo
        ...(mode === 'WORLD_CUP' ? [{ isRetired: false }, { isInactive: false }] : []),
      ],
    }
    const players = await db.player.findMany({
      where,
      take: limit,
      orderBy: [{ overall: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        fullName: true,
        team: true,
        position: true,
        photoUrl: true,
        nationality: true,
        shirtNumber: true,
        overall: true,
        age: true,
        pace: true,
        shooting: true,
        passing: true,
        dribbling: true,
        defending: true,
        physical: true,
        leagueTier: true,
        isRetired: true,
        isInactive: true,
      },
    })
    return players.map((p) => ({
      ...p,
      photoUrl: p.photoUrl || fallbackPhoto(p.name),
      position: p.position as PositionCode,
      source: 'local' as const,
    }))
  } catch (err) {
    console.error('[search] erro local DB:', err)
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
        sources: [],
      })
    }

    // 1. Busca paralela em TheSportsDB + Transfermarkt + Sofascore + Local
    const [sdbResults, tmResults, scResults, localResults] = await Promise.all([
      searchTheSportsDB(q, limit),
      searchTransfermarkt(q, Math.min(limit, 5)),
      searchSofascore(q, Math.min(limit, 5)),
      searchLocal(q, limit, pos, mode),
    ])

    // No modo WORLD_CUP, filtra resultados externos (sem isRetired detectável)
    const filteredSdb = mode === 'WORLD_CUP'
      ? sdbResults.filter((p) => !p.team.toLowerCase().includes('retro') && !p.team.toLowerCase().includes('retired'))
      : sdbResults

    // 2. Combina resultados, remove duplicados por nome
    const seen = new Set<string>()
    const all: UnifiedPlayer[] = []
    for (const p of [...filteredSdb, ...localResults, ...tmResults, ...scResults]) {
      const key = p.name.toLowerCase().trim()
      if (seen.has(key)) continue
      seen.add(key)
      all.push(p)
    }

    // 3. Aplica filtro de posição (se vier)
    // LD/LE/DF são compatíveis como "defensor" para slots de defensor
    const filtered = pos
      ? all.filter((p) => {
          if (pos === 'DF' || pos === 'LD' || pos === 'LE') {
            return p.position === 'DF' || p.position === 'LD' || p.position === 'LE'
          }
          return p.position === pos
        })
      : all

    // 4. Limita e retorna
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
