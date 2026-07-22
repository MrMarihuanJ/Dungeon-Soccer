// =====================================================================
// API: /api/players/ogol
// --------------------------------------------------------------------
// Busca o perfil de um jogador no site ogol.com.br usando web search.
// Retorna URL do perfil no ogol.com.br e estatísticas básicas.
//
// Query params:
//   name  -> nome do jogador (obrigatório)
//   team  -> time atual (opcional, ajuda na precisão)
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface OgolProfile {
  name: string
  profileUrl: string | null
  snippet: string | null
  searchResults: {
    name: string
    url: string
    snippet: string
  }[]
}

async function searchOgolProfile(playerName: string, team?: string | null): Promise<OgolProfile> {
  try {
    // Dynamic import to avoid issues if SDK is not available
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const query = team
      ? `site:ogol.com.br ${playerName} ${team}`
      : `site:ogol.com.br ${playerName}`

    const results = await zai.functions.invoke('web_search', {
      query,
      num: 5,
    })

    // Filter results from ogol.com.br
    const ogolResults = (results as any[])
      .filter((r: any) =>
        r.url && (
          r.url.includes('ogol.com.br/jogador') ||
          r.url.includes('ogol.com.br/player')
        )
      )
      .map((r: any) => ({
        name: r.name || '',
        url: r.url,
        snippet: r.snippet || '',
      }))

    const bestMatch = ogolResults[0] || null

    return {
      name: playerName,
      profileUrl: bestMatch?.url || null,
      snippet: bestMatch?.snippet || null,
      searchResults: ogolResults,
    }
  } catch (err) {
    console.error('[ogol] search error:', err)
    return {
      name: playerName,
      profileUrl: null,
      snippet: null,
      searchResults: [],
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
        error: 'Nome do jogador é obrigatório (mínimo 2 caracteres).',
      }, { status: 400 })
    }

    const profile = await searchOgolProfile(name, team)

    return NextResponse.json({
      ok: true,
      profile,
    })
  } catch (err) {
    console.error('[API/players/ogol] erro:', err)
    return NextResponse.json(
      { ok: false, error: 'Erro ao buscar perfil no ogol.com.br.' },
      { status: 500 },
    )
  }
}
