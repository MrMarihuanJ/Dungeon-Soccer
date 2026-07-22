// =====================================================================
// POST /api/match/create - cria nova partida contra amigo
// --------------------------------------------------------------------
// Body: { opponentId: string }
// Auto-sync: garante que a tabela Match existe antes de criar.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'

export const dynamic = 'force-dynamic'

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
    // Se falhar aqui, pode ser que a tabela Friendship também não exista
    // Tenta sync de novo e retorna erro descritivo
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

  // Cria a partida
  try {
    const match = await db.match.create({
      data: {
        homeUserId: session.userId,
        awayUserId: opponentId,
        status: 'COIN_FLIP',
        mode: 'DREAM_TEAM',
        homeScore: 0,
        awayScore: 0,
        turnCount: 0,
        homeProgress: 0,
        awayProgress: 0,
        eventsJson: '[]',
        homeTeamStateJson: '{}',
        awayTeamStateJson: '{}',
      },
    })

    return NextResponse.json({
      ok: true,
      match: {
        id: match.id,
        status: match.status,
        homeUserId: match.homeUserId,
        awayUserId: match.awayUserId,
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
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
          );
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'COIN_FLIP';
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'DREAM_TEAM';
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "coinResult" TEXT;
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "startingUserId" TEXT;
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "currentPossession" TEXT;
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "homeScore" INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "awayScore" INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "winner" TEXT;
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "turnCount" INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "homeProgress" INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "awayProgress" INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "eventsJson" TEXT NOT NULL DEFAULT '[]';
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "homeTeamStateJson" TEXT NOT NULL DEFAULT '{}';
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "awayTeamStateJson" TEXT NOT NULL DEFAULT '{}';
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "homeTeamRating" INTEGER;
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "awayTeamRating" INTEGER;
          CREATE INDEX IF NOT EXISTS "Match_homeUserId_idx" ON "Match"("homeUserId");
          CREATE INDEX IF NOT EXISTS "Match_awayUserId_idx" ON "Match"("awayUserId");
        `)
        // Retry
        const match = await db.match.create({
          data: {
            homeUserId: session.userId,
            awayUserId: opponentId,
            status: 'COIN_FLIP',
            mode: 'DREAM_TEAM',
            homeScore: 0,
            awayScore: 0,
            turnCount: 0,
            homeProgress: 0,
            awayProgress: 0,
            eventsJson: '[]',
            homeTeamStateJson: '{}',
            awayTeamStateJson: '{}',
          },
        })
        return NextResponse.json({
          ok: true,
          match: {
            id: match.id,
            status: match.status,
            homeUserId: match.homeUserId,
            awayUserId: match.awayUserId,
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
