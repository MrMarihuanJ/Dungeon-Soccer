// =====================================================================
// POST /api/match/resume - retoma a partida pausada
// --------------------------------------------------------------------
// Calcula o tempo pausado, adiciona ao totalPausedMs, limpa pausedAt.
// Para FULL_90 no intervalo, marca halftimeTaken e secondHalfStartedAt.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'
import { GAME_MODE_CONFIG, isHalftimeReached, type GameMode } from '@/lib/match-engine'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  await ensureDbSync()

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

  // Pode retomar de PAUSED ou HALFTIME
  if (match.status !== 'PAUSED' && match.status !== 'HALFTIME') {
    return NextResponse.json({ ok: false, error: 'Partida não está pausada.' }, { status: 400 })
  }

  const gameMode = (match.gameMode || 'QUICK_MATCH') as GameMode
  const now = new Date()

  const updateData: any = {
    status: 'IN_PROGRESS',
    turnStartedAt: now,
  }

  if (match.status === 'PAUSED' && match.pausedAt) {
    // Calcula tempo de pausa e adiciona ao total
    const pausedDuration = now.getTime() - new Date(match.pausedAt).getTime()
    updateData.pausedAt = null
    updateData.totalPausedMs = (match.totalPausedMs || 0) + pausedDuration
  }

  if (match.status === 'HALFTIME') {
    // Retomando do intervalo (FULL_90)
    updateData.halftimeTaken = true
    updateData.secondHalfStartedAt = now
    updateData.pausedAt = null
    // Adicionar o tempo de intervalo ao totalPausedMs
    if (match.pausedAt) {
      const halftimeDuration = now.getTime() - new Date(match.pausedAt).getTime()
      updateData.totalPausedMs = (match.totalPausedMs || 0) + halftimeDuration
    }
  }

  try {
    await db.match.update({
      where: { id: matchId },
      data: updateData,
    })
  } catch (err) {
    console.error('[match/resume] update error:', err)
    return NextResponse.json({ ok: false, error: 'Erro ao retomar partida.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: 'Partida retomada.' })
}
