// =====================================================================
// POST /api/match/pause - pausa a partida
// --------------------------------------------------------------------
// Salva o timestamp de pausa e muda status para PAUSED.
// O timer de jogo congela enquanto pausado.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'
import { GAME_MODE_CONFIG, type GameMode } from '@/lib/match-engine'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  try {
    await ensureDbSync()
  } catch (err: any) {
    console.error('[match/pause] DB sync failed:', err?.message?.slice(0, 200))
    // Don't abort — tables might already exist
  }

  const body = await req.json().catch(() => ({}))
  const matchId = String(body.matchId ?? '')
  if (!matchId) {
    return NextResponse.json({ ok: false, error: 'matchId obrigatório.' }, { status: 400 })
  }

  const match = await db.match.findUnique({ where: { id: matchId } })
  if (!match) return NextResponse.json({ ok: false, error: 'Partida não encontrada.' }, { status: 404 })
  if (match.homeUserId !== session.userId && match.awayUserId !== session.userId) {
    return NextResponse.json({ ok: false, error: 'Sem acesso.' }, { status: 403 })
  }
  if (match.status !== 'IN_PROGRESS') {
    return NextResponse.json({ ok: false, error: 'Partida não está em andamento.' }, { status: 400 })
  }

  // Não pode pausar se já está pausado
  if (match.pausedAt) {
    return NextResponse.json({ ok: false, error: 'Partida já está pausada.' }, { status: 400 })
  }

  try {
    await db.match.update({
      where: { id: matchId },
      data: {
        status: 'PAUSED',
        pausedAt: new Date(),
      },
    })
  } catch (err) {
    console.error('[match/pause] update error:', err)
    return NextResponse.json({ ok: false, error: 'Erro ao pausar partida.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: 'Partida pausada.' })
}
