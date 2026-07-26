// =====================================================================
// API: /api/players/stats (OTIMIZADO)
// Fonte única: TheSportsDB
// Cache 180s, timeout 6s
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

const emptyResult: PlayerStats = {
  name: '', thesportsdbUrl: null, thesportsdbId: null, latestStats: null,
  team: null, position: null, nationality: null, photoUrl: null,
  born: null, height: null, weight: null, signature: null, sources: [],
}

async function searchPlayerStatsTheSportsDB(playerName: string, team?: string | null): Promise<PlayerStats> {
  try {
    const SPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || '3'
    const searchUrl = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/searchplayers.php?p=${encodeURIComponent(playerName)}`
    const searchRes = await fetch(searchUrl, {
      next: { revalidate: 180 },
      signal: AbortSignal.timeout(6000),
    })

    if (!searchRes.ok) return { ...emptyResult, name: playerName }

    const searchData = await searchRes.json()
    const players: any[] = searchData.player || []

    let bestMatch: any = null
    if (team && players.length > 1) {
      bestMatch = players.find((p: any) =>
        p.strTeam && p.strTeam.toLowerCase().includes(team.toLowerCase())
      )
    }
    if (!bestMatch && players.length > 0) bestMatch = players[0]
    if (!bestMatch) return { ...emptyResult, name: playerName }

    const p = bestMatch
    const idPlayer = p.idPlayer || ''
    const name = p.strPlayer || playerName

    const statsParts: string[] = []
    if (p.strTeam) statsParts.push(`Time: ${p.strTeam}`)
    if (p.strPosition) statsParts.push(`Posição: ${p.strPosition}`)
    if (p.strNationality) statsParts.push(`Nacionalidade: ${p.strNationality}`)
    if (p.strBorn) statsParts.push(`Nascimento: ${p.strBorn}`)
    if (p.strHeight) statsParts.push(`Altura: ${p.strHeight}`)
    if (p.strWeight) statsParts.push(`Peso: ${p.strWeight}`)
    if (p.strDescriptionEN) statsParts.push(p.strDescriptionEN.slice(0, 200))

    const thesportsdbUrl = idPlayer
      ? `https://www.thesportsdb.com/player/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}-${idPlayer}`
      : null

    return {
      name,
      thesportsdbUrl,
      thesportsdbId: idPlayer || null,
      latestStats: statsParts.length > 0 ? statsParts.join(' · ') : null,
      team: p.strTeam || null,
      position: p.strPosition || null,
      nationality: p.strNationality || null,
      photoUrl: p.strThumb || p.strCutout || null,
      born: p.strBorn || null,
      height: p.strHeight || null,
      weight: p.strWeight || null,
      signature: p.strSign || null,
      sources: [{ name: 'TheSportsDB', data: statsParts.join(' | ') }],
    }
  } catch (err) {
    console.error('[stats] search error:', err)
    return { ...emptyResult, name: playerName }
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const name = (searchParams.get('name') ?? '').trim()
    const team = searchParams.get('team')?.trim() || null

    if (!name || name.length < 2) {
      return NextResponse.json({ ok: false, error: 'Nome do jogador é obrigatório.' }, { status: 400 })
    }

    const stats = await searchPlayerStatsTheSportsDB(name, team)
    return NextResponse.json({ ok: true, stats })
  } catch (err) {
    console.error('[API/players/stats] erro:', err)
    return NextResponse.json({ ok: false, error: 'Erro ao buscar estatísticas.' }, { status: 500 })
  }
}
