// =====================================================================
// POST /api/match/create - cria nova partida contra amigo
// --------------------------------------------------------------------
// Body: { opponentId: string, gameMode?: 'QUICK_MATCH' | 'TIMED_10' | 'FULL_90' }
// Auto-sync: garante que a tabela Match existe antes de criar.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'
import { GAME_MODE_CONFIG, type GameMode } from '@/lib/match-engine'

export const dynamic = 'force-dynamic'

const VALID_GAME_MODES: GameMode[] = ['QUICK_MATCH', 'TIMED_10', 'FULL_90']

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autenticado. Faça login novamente.' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 })
  }

  const opponentId = String(body.opponentId ?? '')
  if (!opponentId) {
    return NextResponse.json({ ok: false, error: 'opponentId obrigatório.' }, { status: 400 })
  }

  // Validar gameMode
  const gameMode: GameMode = VALID_GAME_MODES.includes(body.gameMode) ? body.gameMode : 'QUICK_MATCH'
  const modeConfig = GAME_MODE_CONFIG[gameMode]

  // Não pode jogar contra si mesmo
  if (opponentId === session.userId) {
    return NextResponse.json({ ok: false, error: 'Você não pode jogar contra si mesmo.' }, { status: 400 })
  }

  // Garante que as tabelas existem antes de qualquer operação
  await ensureDbSync()

  // Verifica se são amigos
  try {
    const friendship = await db.friendship.findFirst({
      where: {
        OR: [
          { userAId: session.userId, userBId: opponentId },
          { userAId: opponentId, userBId: session.userId },
        ],
      },
    })
    if (!friendship) {
      return NextResponse.json({ ok: false, error: 'Você só pode jogar com amigos.' }, { status: 403 })
    }
  } catch (err: any) {
    console.error('[match/create] friendship check error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('does not exist') || msg.includes('relation')) {
      return NextResponse.json({
        ok: false,
        error: 'Tabelas do banco ainda não foram criadas. Aguarde alguns segundos e tente novamente.',
        detail: msg.slice(0, 300),
      }, { status: 500 })
    }
    return NextResponse.json({
      ok: false,
      error: 'Erro ao verificar amizade.',
      detail: msg.slice(0, 300),
    }, { status: 500 })
  }

  // Cria a partida com gameMode e xpReward
  const matchData = {
    homeUserId: session.userId,
    awayUserId: opponentId,
    status: 'COIN_FLIP' as const,
    mode: 'DREAM_TEAM' as const,
    gameMode,
    homeScore: 0,
    awayScore: 0,
    turnCount: 0,
    homeProgress: 0,
    awayProgress: 0,
    eventsJson: '[]',
    homeTeamStateJson: '{}',
    awayTeamStateJson: '{}',
    xpReward: modeConfig.xpWin,
    totalPausedMs: 0,
    halftimeTaken: false,
  }

  try {
    const match = await db.match.create({ data: matchData })

    return NextResponse.json({
      ok: true,
      match: {
        id: match.id,
        status: match.status,
        homeUserId: match.homeUserId,
        awayUserId: match.awayUserId,
        gameMode: match.gameMode,
        xpReward: match.xpReward,
      },
    })
  } catch (err: any) {
    console.error('[match/create] create error:', err)

    const message = err instanceof Error ? err.message : String(err)
    const prismaCode = err?.code || ''
    const meta = err?.meta ? JSON.stringify(err.meta) : ''

    // Erro de tabela/coluna inexistente — tenta sync uma vez mais
    if (message.includes('does not exist') || message.includes('column') || message.includes('relation')) {
      console.log('[match/create] Retrying db sync after error...')
      try {
        await db.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "Match" (
            "id" TEXT NOT NULL,
            "status" TEXT NOT NULL DEFAULT 'COIN_FLIP',
            "mode" TEXT NOT NULL DEFAULT 'DREAM_TEAM',
            "gameMode" TEXT NOT NULL DEFAULT 'QUICK_MATCH',
            "coinResult" TEXT,
            "startingUserId" TEXT,
            "homeUserId" TEXT NOT NULL,
            "awayUserId" TEXT NOT NULL,
            "currentPossession" TEXT,
            "homeScore" INTEGER NOT NULL DEFAULT 0,
            "awayScore" INTEGER NOT NULL DEFAULT 0,
            "winner" TEXT,
            "turnCount" INTEGER NOT NULL DEFAULT 0,
            "homeProgress" INTEGER NOT NULL DEFAULT 0,
            "awayProgress" INTEGER NOT NULL DEFAULT 0,
            "eventsJson" TEXT NOT NULL DEFAULT '[]',
            "homeTeamStateJson" TEXT NOT NULL DEFAULT '{}',
            "awayTeamStateJson" TEXT NOT NULL DEFAULT '{}',
            "homeTeamRating" INTEGER,
            "awayTeamRating" INTEGER,
            "matchStartedAt" TIMESTAMP(3),
            "pausedAt" TIMESTAMP(3),
            "totalPausedMs" INTEGER NOT NULL DEFAULT 0,
            "halftimeTaken" BOOLEAN NOT NULL DEFAULT false,
            "secondHalfStartedAt" TIMESTAMP(3),
            "xpReward" INTEGER NOT NULL DEFAULT 0,
            "turnStartedAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
          );
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "gameMode" TEXT NOT NULL DEFAULT 'QUICK_MATCH';
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "matchStartedAt" TIMESTAMP(3);
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "totalPausedMs" INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "halftimeTaken" BOOLEAN NOT NULL DEFAULT false;
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "secondHalfStartedAt" TIMESTAMP(3);
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "xpReward" INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "turnStartedAt" TIMESTAMP(3);
          CREATE INDEX IF NOT EXISTS "Match_homeUserId_idx" ON "Match"("homeUserId");
          CREATE INDEX IF NOT EXISTS "Match_awayUserId_idx" ON "Match"("awayUserId");
        `)
        // Retry
        const match = await db.match.create({ data: matchData })
        return NextResponse.json({
          ok: true,
          match: {
            id: match.id,
            status: match.status,
            homeUserId: match.homeUserId,
            awayUserId: match.awayUserId,
            gameMode: match.gameMode,
            xpReward: match.xpReward,
          },
        })
      } catch (retryErr: any) {
        console.error('[match/create] retry also failed:', retryErr)
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
        return NextResponse.json({
          ok: false,
          error: 'Não foi possível criar a tabela Match. Verifique o banco Neon.',
          detail: retryMsg.slice(0, 400),
        }, { status: 500 })
      }
    }

    // Fallback com detalhes do erro real
    return NextResponse.json({
      ok: false,
      error: 'Erro interno ao criar partida.',
      detail: `${prismaCode ? `[${prismaCode}] ` : ''}${message.slice(0, 300)}${meta ? ` | meta: ${meta.slice(0, 200)}` : ''}`,
    }, { status: 500 })
  }
}
