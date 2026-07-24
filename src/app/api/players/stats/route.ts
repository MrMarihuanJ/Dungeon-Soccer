// =====================================================================
// API: /api/players/stats
// --------------------------------------------------------------------
// Busca estatísticas atualizadas de um jogador usando web search.
// Agrega dados de múltiplas fontes (ogol.com.br, Transfermarkt, etc.)
//
// Query params:
//   name  -> nome do jogador (obrigatório)
//   team  -> time atual (opcional)
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface PlayerStats {
  name: string
  ogolUrl: string | null
  transfermarktUrl: string | null
  latestStats: string | null
  sources: { name: string; url: string; snippet: string }[]
}

async function searchPlayerStats(playerName: string, team?: string | null): Promise<PlayerStats> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default

    // Initialize SDK — try .z-ai-config first, then env vars
    let zai: any = null
    try {
      zai = await ZAI.create()
    } catch {
      // Fallback: use environment variables with new ZAI(config)
      const baseUrl = process.env.ZAI_BASE_URL
      const apiKey = process.env.ZAI_API_KEY
      const token = process.env.ZAI_TOKEN
      const chatId = process.env.ZAI_CHAT_ID
      const userId = process.env.ZAI_USER_ID
      if (baseUrl && apiKey && token) {
        try {
          zai = new ZAI({ baseUrl, apiKey, token, chatId: chatId || '', userId: userId || '' })
        } catch { /* skip */ }
      }
    }

    if (!zai) {
      return { name: playerName, ogolUrl: null, transfermarktUrl: null, latestStats: null, sources: [] }
    }

    // Search for player stats from multiple sources
    const query = team
      ? `${playerName} ${team} estatísticas gols jogos temporada 2025 2026`
      : `${playerName} estatísticas gols jogos temporada 2025 2026`

    const results = await zai.functions.invoke('web_search', {
      query,
      num: 8,
    })

    const allResults = (results as any[]).map((r: any) => ({
      name: r.name || '',
      url: r.url || '',
      snippet: r.snippet || '',
    }))

    // Find ogol.com.br link
    const ogolResult = allResults.find(r =>
      r.url.includes('ogol.com.br')
    )

    // Find Transfermarkt link
    const transfermarktResult = allResults.find(r =>
      r.url.includes('transfermarkt')
    )

    // Compile latest stats from snippets
    const statsSnippets = allResults
      .filter(r => r.snippet && r.snippet.length > 30)
      .slice(0, 3)
      .map(r => r.snippet)

    return {
      name: playerName,
      ogolUrl: ogolResult?.url || null,
      transfermarktUrl: transfermarktResult?.url || null,
      latestStats: statsSnippets.join(' | ') || null,
      sources: allResults.slice(0, 5),
    }
  } catch (err) {
    console.error('[stats] search error:', err)
    return {
      name: playerName,
      ogolUrl: null,
      transfermarktUrl: null,
      latestStats: null,
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
