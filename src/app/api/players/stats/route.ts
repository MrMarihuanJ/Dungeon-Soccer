// =====================================================================
// API: /api/players/stats (OTIMIZADO)
// --------------------------------------------------------------------
// Busca estatísticas atualizadas de um jogador usando TheSportsDB
// como única fonte de dados externos.
//
// Otimizações:
//   - Cache de 180s + timeout de 6s (mais rápido)
//   - Resposta mais leve (sem campos de deprecated/migração)
//   - Dedup simples e direto
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
  const emptyResult: PlayerStats = {
    name: playerName, thesportsdbUrl: null, thesportsdbId: null, latestStats: null,
    team: null, position: null, nationality: null, photoUrl: null,
    born: null, height: null, weight: null, signature: null, sources: [],
  }

  try {
    const SPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || '3'
    const searchUrl = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/searchplayers.php?p=${encodeURIComponent(playerName)}`
    const searchRes = await fetch(searchUrl, {
      next: { revalidate: 180 }, // Cache 180s (stats mudam pouco)
      signal: AbortSignal.timeout(6000), // Timeout 6s (mais rápido)
    })

    if (!searchRes.ok) {
      console.warn('[stats] TheSportsDB retornou', searchRes.status)
      return emptyResult
    }

    const searchData = await searchRes.json()
    const players: any[] = searchData.player || []

    // Best match: prioriza team matching se team fornecido
    let bestMatch: any = null
    if (team && players.length > 1) {
      bestMatch = players.find((p: any) =>
        p.strTeam && p.strTeam.toLowerCase().includes(team.toLowerCase())
      )
    }
    if (!bestMatch && players.length > 0) bestMatch = players[0]
    if (!bestMatch) return emptyResult

    const p = bestMatch
    const idPlayer = p.idPlayer || ''
    const name = p.strPlayer || playerName
    const playerTeam = p.strTeam || null
    const position = p.strPosition || null
    const nationality = p.strNationality || null
    const photoUrl = p.strThumb || p.strCutout || null

    // Compile stats
    const statsParts: string[] = []
    if (playerTeam) statsParts.push(`Time: ${playerTeam}`)
    if (position) statsParts.push(`Posição: ${position}`)
    if (nationality) statsParts.push(`Nacionalidade: ${nationality}`)
    if (p.strBorn) statsParts.push(`Nascimento: ${p.strBorn}`)
    if (p.strHeight) statsParts.push(`Altura: ${p.strHeight}`)
    if (p.strWeight) statsParts.push(`Peso: ${p.strWeight}`)
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
      born: p.strBorn || null,
      height: p.strHeight || null,
      weight: p.strWeight || null,
      signature: p.strSign || null,
      sources: [{ name: 'TheSportsDB', data: statsParts.join(' | ') }],
    }
  } catch (err) {
    console.error('[stats] search error:', err)
    return emptyResult
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
