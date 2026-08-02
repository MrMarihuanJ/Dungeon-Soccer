// =====================================================================
// API: /api/players/search
// --------------------------------------------------------------------
// Busca jogadores EM TEMPO REAL via TheSportsDB + banco local.
// Fonte externa única: TheSportsDB (cobertura mundial, fotos, time atual)
// Banco interno Prisma como fallback para seed local.
//
// Query params:
//   q     -> termo de busca (mínimo 2 caracteres)
//   limit -> máximo de resultados (default 12, máx 25)
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
  source: 'thesportsdb' | 'local'
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
  thesportsdbUrl?: string | null
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
      next: { revalidate: 120 },
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
        thesportsdbUrl: `https://www.thesportsdb.com/player/${p.idPlayer}` || null,
      }
    })
  } catch (err) {
    console.error('[search] erro TheSportsDB:', err)
    return []
  }
}

// -------- Banco interno --------
async function searchLocal(query: string, limit: number, pos?: string | null, mode?: string | null): Promise<UnifiedPlayer[]> {
  try {
    // Garante que a tabela Player tem as colunas de rating — DBs antigos
    // criados pelo db-sync anterior não as tinham, fazendo a busca falhar.
    try {
      await ensureDbSync()
    } catch {}

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
    }))
  } catch (err) {
    console.error('[search] erro local DB:', err)
    return []
  }
}

// -------- Endpoint --------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim().toLowerCase()
  const limit = Math.min(Number(searchParams.get('limit') ?? 12), 25)
  const pos = searchParams.get('pos') // GK | DF | LD | LE | MF | FW
  const mode = searchParams.get('mode') // DREAM_TEAM | WORLD_CUP

  if (!q || q.length < 2) {
    return NextResponse.json({
      players: [],
      message: 'Digite ao menos 2 caracteres.',
      sources: {},
    })
  }

  // Busca paralela: TheSportsDB + Local
  const [sdbResults, localResults] = await Promise.all([
    searchTheSportsDB(q, limit),
    searchLocal(q, limit, pos, mode),
  ])

  // WORLD_CUP: filtra resultados externos sem retro/retired
  const filteredSdb = mode === 'WORLD_CUP'
    ? sdbResults.filter((p) => !p.team.toLowerCase().includes('retro') && !p.team.toLowerCase().includes('retired'))
    : sdbResults

  // Combina, remove duplicados por nome (prioriza local que tem ratings)
  const seen = new Set<string>()
  const all: UnifiedPlayer[] = []
  for (const p of [...localResults, ...filteredSdb]) {
    const key = p.name.toLowerCase().trim()
    if (seen.has(key)) continue
    seen.add(key)
    all.push(p)
  }

  // Aplica filtro de posição (DF/LD/LE compatíveis)
  const filtered = pos
    ? all.filter((p) => {
        if (pos === 'DF' || pos === 'LD' || pos === 'LE') {
          return p.position === 'DF' || p.position === 'LD' || p.position === 'LE'
        }
        return p.position === pos
      })
    : all

  // Limita e retorna
  const final = filtered.slice(0, limit)

  return NextResponse.json({
    players: final,
    total: final.length,
    query: q,
    sources: {
      thesportsdb: sdbResults.length,
      local: localResults.length,
    },
  })
}
