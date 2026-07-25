// =====================================================================
// API: /api/players/stats
// --------------------------------------------------------------------
// Busca estatísticas atualizadas de um jogador usando TheSportsDB
// como única fonte de dados externos.
//
// Usa TheSportsDB para obter:
//   - Detalhes do jogador (time, posição, nacionalidade)
//   - Estatísticas de temporadas recentes
//   - Foto e informações biográficas
//
// Query params:
//   name  -> nome do jogador (obrigatório)
//   team  -> time atual (opcional, ajuda na precisão)
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface PlayerStats {
  name: string
  thesportsdbUrl: string | null
  thesportsdbId: string | null
  latestStats: string | null
  team: string | null
  position: string | null
  nationality: string | null
  photoUrl: string | null
  born: string | null
  height: string | null
  weight: string | null
  signature: string | null
  sources: { name: string; data: string }[]
}

async function searchPlayerStatsTheSportsDB(playerName: string, team?: string | null): Promise<PlayerStats> {
  try {
    const SPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || '3'

    // Search for the player first
    const searchUrl = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/searchplayers.php?p=${encodeURIComponent(playerName)}`
    const searchRes = await fetch(searchUrl, {
      next: { revalidate: 120 },
      signal: AbortSignal.timeout(8000),
    })

    if (!searchRes.ok) {
      console.warn('[stats] TheSportsDB search retornou', searchRes.status)
      return { name: playerName, thesportsdbUrl: null, thesportsdbId: null, latestStats: null, team: null, position: null, nationality: null, photoUrl: null, born: null, height: null, weight: null, signature: null, sources: [] }
    }

    const searchData = await searchRes.json()
    const players: any[] = searchData.player || []

    // Find best match — prefer players matching the team name if provided
    let bestMatch: any = null
    if (team && players.length > 1) {
      bestMatch = players.find((p: any) =>
        p.strTeam && p.strTeam.toLowerCase().includes(team.toLowerCase())
      )
    }
    if (!bestMatch && players.length > 0) {
      bestMatch = players[0]
    }

    if (!bestMatch) {
      return { name: playerName, thesportsdbUrl: null, thesportsdbId: null, latestStats: null, team: null, position: null, nationality: null, photoUrl: null, born: null, height: null, weight: null, signature: null, sources: [] }
    }

    // Build stats from TheSportsDB player data
    const p = bestMatch
    const idPlayer = p.idPlayer || ''
    const name = p.strPlayer || playerName
    const playerTeam = p.strTeam || null
    const position = p.strPosition || null
    const nationality = p.strNationality || null
    const photoUrl = p.strThumb || p.strCutout || null
    const born = p.strBorn || null
    const height = p.strHeight || null
    const weight = p.strWeight || null
    const signature = p.strSign || null

    // Compile stats snippets from TheSportsDB data fields
    const statsParts: string[] = []
    if (playerTeam) statsParts.push(`Time: ${playerTeam}`)
    if (position) statsParts.push(`Posição: ${position}`)
    if (nationality) statsParts.push(`Nacionalidade: ${nationality}`)
    if (born) statsParts.push(`Nascimento: ${born}`)
    if (height) statsParts.push(`Altura: ${height}`)
    if (weight) statsParts.push(`Peso: ${weight}`)
    if (p.strDescriptionEN) statsParts.push(p.strDescriptionEN.slice(0, 200))
    if (p.strDescriptionPT) statsParts.push(p.strDescriptionPT.slice(0, 200))

    const thesportsdbUrl = idPlayer
      ? `https://www.thesportsdb.com/player/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}-${idPlayer}`
      : null

    return {
      name,
      thesportsdbUrl,
      thesportsdbId: idPlayer || null,
      latestStats: statsParts.length > 0 ? statsParts.join(' · ') : null,
      team: playerTeam,
      position,
      nationality,
      photoUrl,
      born,
      height,
      weight,
      signature,
      sources: [{ name: 'TheSportsDB', data: statsParts.join(' | ') }],
    }
  } catch (err) {
    console.error('[stats] search error:', err)
    return {
      name: playerName,
      thesportsdbUrl: null,
      thesportsdbId: null,
      latestStats: null,
      team: null,
      position: null,
      nationality: null,
      photoUrl: null,
      born: null,
      height: null,
      weight: null,
      signature: null,
      sources: [],
    }
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
        error: 'Nome do jogador é obrigatório.',
      }, { status: 400 })
    }

    const stats = await searchPlayerStatsTheSportsDB(name, team)

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
