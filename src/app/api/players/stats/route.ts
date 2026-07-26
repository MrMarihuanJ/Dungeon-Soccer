// =====================================================================
// API: /api/players/stats
// --------------------------------------------------------------------
// Busca estatísticas de um jogador via TheSportsDB.
// Fonte externa única: TheSportsDB (dados, foto, link do perfil)
//
// Query params:
//   name  -> nome do jogador (obrigatório)
//   team  -> time atual (opcional, ajuda na precisão)
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || '3'

interface PlayerStatsResult {
  name: string
  thesportsdbUrl: string | null
  team: string | null
  position: string | null
  nationality: string | null
  photoUrl: string | null
  born: string | null
  height: string | null
  weight: string | null
  sources: { name: string; url: string; snippet: string }[]
}

function fallbackPhoto(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0d8a3f&color=fff&size=200&bold=true`
}

async function searchPlayerStats(playerName: string, team?: string | null): Promise<PlayerStatsResult> {
  try {
    // Search TheSportsDB for the player
    const searchUrl = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/searchplayers.php?p=${encodeURIComponent(playerName)}`
    const res = await fetch(searchUrl, {
      next: { revalidate: 180 },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return { name: playerName, thesportsdbUrl: null, team: null, position: null, nationality: null, photoUrl: null, born: null, height: null, weight: null, sources: [] }

    const data = await res.json()
    const players: any[] = data.player || []

    // Try to find the best match (prefer matching team)
    let bestMatch: any = null
    if (team) {
      bestMatch = players.find((p: any) =>
        p.strTeam && p.strTeam.toLowerCase().includes(team.toLowerCase())
      )
    }
    if (!bestMatch && players.length > 0) {
      bestMatch = players[0]
    }

    if (!bestMatch) {
      return { name: playerName, thesportsdbUrl: null, team: null, position: null, nationality: null, photoUrl: null, born: null, height: null, weight: null, sources: [] }
    }

    return {
      name: bestMatch.strPlayer || playerName,
      thesportsdbUrl: `https://www.thesportsdb.com/player/${bestMatch.idPlayer}`,
      team: bestMatch.strTeam || null,
      position: bestMatch.strPosition || null,
      nationality: bestMatch.strNationality || null,
      photoUrl: bestMatch.strThumb || bestMatch.strCutout || fallbackPhoto(playerName),
      born: bestMatch.dateBorn || null,
      height: bestMatch.strHeight || null,
      weight: bestMatch.strWeight || null,
      sources: [{
        name: 'TheSportsDB',
        url: `https://www.thesportsdb.com/player/${bestMatch.idPlayer}`,
        snippet: bestMatch.strDescriptionEN?.slice(0, 200) || '',
      }],
    }
  } catch (err) {
    console.error('[stats] search error:', err)
    return { name: playerName, thesportsdbUrl: null, team: null, position: null, nationality: null, photoUrl: null, born: null, height: null, weight: null, sources: [] }
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const name = (searchParams.get('name') ?? '').trim()
    const team = searchParams.get('team')?.trim() || null

    if (!name || name.length < 2) {
      return NextResponse.json({
        ok: false,
        error: 'Nome do jogador é obrigatório (mínimo 2 caracteres).',
      }, { status: 400 })
    }

    const stats = await searchPlayerStats(name, team)

    return NextResponse.json({
      ok: true,
      stats,
    })
  } catch (err) {
    console.error('[API/players/stats] erro:', err)
    return NextResponse.json(
      { ok: false, error: 'Erro ao buscar estatísticas.' },
      { status: 500 },
    )
  }
}
