// =====================================================================
// API: /api/players/search
// --------------------------------------------------------------------
// Busca jogadores EM TEMPO REAL em fontes externas mundiais:
//   1. TheSportsDB (cobertura mundial, fotos, time atual)
//   2. Wikipedia (fallback para nomes menos famosos)
//   3. Banco interno Prisma (último fallback para seed local)
//
// Query params:
//   q     -> termo de busca (mínimo 2 caracteres)
//   limit -> máximo de resultados (default 15, máx 30)
//   pos   -> filtra por posição (GK, DF, MF, FW) - opcional
//
// Retorna array unificado de jogadores com:
//   { id, name, fullName, team, position, photoUrl, nationality, shirtNumber?, source }
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
  source: 'thesportsdb' | 'wikipedia' | 'local'
}

// -------- TheSportsDB --------
// API gratuita: a chave pública de teste é "3" (até 100 req/min em horários de pico).
// Para produção, o usuário pode cadastrar em thesportsdb.com e obter chave própria.
const SPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || '3'

// Normaliza string de posição do TheSportsDB para nosso código
function normalizePosition(raw: string | null | undefined): 'GK' | 'DF' | 'MF' | 'FW' {
  if (!raw) return 'FW'
  const p = raw.toLowerCase()
  if (p.includes('goalkeeper') || p.includes('goleiro') || p === 'gk') return 'GK'
  if (
    p.includes('defender') ||
    p.includes('back') ||
    p.includes('centre-back') ||
    p.includes('center-back') ||
    p.includes('zagueiro') ||
    p.includes('lateral')
  ) return 'DF'
  if (
    p.includes('midfield') ||
    p.includes('volante') ||
    p.includes('meia') ||
    p.includes('winger') === false && p.includes('wing') ||
    p.includes('attacking mid') ||
    p.includes('defensive mid')
  ) return 'MF'
  if (
    p.includes('forward') ||
    p.includes('striker') ||
    p.includes('winger') ||
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
      // Cache curto (1 min) para buscas repetidas
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

// -------- Wikipedia (fallback) --------
// Busca pessoas no Wikipedia (em inglês e português) que possam ser jogadores.
async function searchWikipedia(query: string, limit: number): Promise<UnifiedPlayer[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query + ' footballer',
    )}&format=json&srlimit=${limit}&origin=*`
    const res = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json()
    const items: any[] = data?.query?.search || []
    return items.map((item) => {
      const title: string = item.title
      // Tenta extrair o "time atual" do snippet (texto entre aspas ou após "played for")
      const teamMatch = (item.snippet || '').match(/>([^<]{3,40})<\/a>/g)
      const team = teamMatch?.[0]?.replace(/<[^>]+>/g, '').replace(/>/g, '') || 'Carreira em clubes'
      return {
        id: `wiki_${item.pageid}`,
        name: title,
        fullName: title,
        team,
        position: 'FW' as const,
        photoUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title)}?width=200`,
        nationality: null,
        shirtNumber: null,
        source: 'wikipedia' as const,
      }
    })
  } catch (err) {
    console.error('[search] erro Wikipedia:', err)
    return []
  }
}

// -------- Banco interno (último fallback) --------
async function searchLocal(query: string, limit: number, pos?: string | null): Promise<UnifiedPlayer[]> {
  try {
    const where = {
      AND: [
        { OR: [{ name: { contains: query } }, { fullName: { contains: query } }] },
        ...(pos ? [{ position: pos }] : []),
      ],
    }
    const players = await db.player.findMany({
      where,
      take: limit,
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        fullName: true,
        team: true,
        position: true,
        photoUrl: true,
        nationality: true,
        shirtNumber: true,
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

// -------- Endpoint --------
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') ?? '').trim().toLowerCase()
    const limit = Math.min(Number(searchParams.get('limit') ?? 15), 30)
    const pos = searchParams.get('pos') // GK | DF | MF | FW

    if (!q || q.length < 2) {
      return NextResponse.json({
        players: [],
        message: 'Digite ao menos 2 caracteres.',
        sources: [],
      })
    }

    // 1. Busca paralela em TheSportsDB + Wikipedia + Local
    const [sdbResults, wikiResults, localResults] = await Promise.all([
      searchTheSportsDB(q, limit),
      searchWikipedia(q, Math.min(limit, 5)),
      searchLocal(q, limit, pos),
    ])

    // 2. Combina resultados, remove duplicados por nome
    const seen = new Set<string>()
    const all: UnifiedPlayer[] = []
    for (const p of [...sdbResults, ...localResults, ...wikiResults]) {
      const key = p.name.toLowerCase().trim()
      if (seen.has(key)) continue
      seen.add(key)
      all.push(p)
    }

    // 3. Aplica filtro de posição (se vier)
    const filtered = pos ? all.filter((p) => p.position === pos) : all

    // 4. Limita e retorna
    const final = filtered.slice(0, limit)

    return NextResponse.json({
      players: final,
      total: final.length,
      query: q,
      sources: {
        thesportsdb: sdbResults.length,
        wikipedia: wikiResults.length,
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
