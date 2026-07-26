// =====================================================================
// API: /api/players/ogol
// --------------------------------------------------------------------
// [DEPRECATED] Esta rota foi migrada para TheSportsDB como fonte única.
// Agora redireciona internamente para a API de stats usando TheSportsDB.
//
// Query params:
//   name  -> nome do jogador (obrigatório)
//   team  -> time atual (opcional)
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const name = (searchParams.get('name') ?? '').trim()
  const team = searchParams.get('team')?.trim() || null

  if (!name || name.length < 2) {
    return NextResponse.json({
      ok: false,
      error: 'Nome do jogador é obrigatório (mínimo 2 caracteres).',
      deprecated: true,
      note: 'Esta fonte foi migrada para TheSportsDB. Use /api/players/stats para estatísticas.',
    }, { status: 400 })
  }

  // Redirect to TheSportsDB-based stats API
  try {
    const SPORTSDB_KEY = process.env.THESPORTSDB_API_KEY || '3'
    const searchUrl = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/searchplayers.php?p=${encodeURIComponent(name)}`
    const searchRes = await fetch(searchUrl, {
      next: { revalidate: 120 },
      signal: AbortSignal.timeout(8000),
    })

    if (!searchRes.ok) {
      return NextResponse.json({
        ok: false,
        error: 'Jogador não encontrado na TheSportsDB.',
        deprecated: true,
      })
    }

    const searchData = await searchRes.json()
    const players: any[] = searchData.player || []
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
      return NextResponse.json({
        ok: true,
        profile: {
          name,
          profileUrl: null,
          snippet: null,
          searchResults: [],
        },
        deprecated: true,
        note: 'Fonte migrada para TheSportsDB.',
      })
    }

    const p = bestMatch
    const idPlayer = p.idPlayer || ''
    const thesportsdbUrl = idPlayer
      ? `https://www.thesportsdb.com/player/${encodeURIComponent(p.strPlayer?.toLowerCase().replace(/\s+/g, '-') || name)}-${idPlayer}`
      : null

    return NextResponse.json({
      ok: true,
      profile: {
        name: p.strPlayer || name,
        profileUrl: thesportsdbUrl,
        snippet: `${p.strTeam || 'Sem clube'} · ${p.strPosition || ''} · ${p.strNationality || ''}`,
        searchResults: players.slice(0, 5).map((pl: any) => ({
          name: pl.strPlayer || '',
          url: `https://www.thesportsdb.com/player/${encodeURIComponent(pl.strPlayer?.toLowerCase().replace(/\s+/g, '-') || '')}-${pl.idPlayer || ''}`,
          snippet: `${pl.strTeam || 'Sem clube'} · ${pl.strPosition || ''}`,
        })),
      },
      deprecated: true,
      note: 'Fonte migrada para TheSportsDB. Use /api/players/stats para dados completos.',
    })
  } catch (err) {
    console.error('[API/players/ogol] erro (deprecated):', err)
    return NextResponse.json(
      { ok: false, error: 'Erro ao buscar jogador.', deprecated: true },
      { status: 500 },
    )
  }
}
