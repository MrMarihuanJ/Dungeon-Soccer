// =====================================================================
// POST /api/match/create - cria nova partida com convite shareable
// --------------------------------------------------------------------
// Body: { gameMode?: 'QUICK_MATCH' | 'TIMED_10' | 'FULL_90' }
// O criador (home) cria a partida em status WAITING.
// O oponente entra via link de convite (inviteCode).
// Não exige amizade — qualquer jogador com o link pode entrar.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'
import { GAME_MODE_CONFIG, type GameMode } from '@/lib/match-engine'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

const VALID_GAME_MODES: GameMode[] = ['QUICK_MATCH', 'TIMED_10', 'FULL_90']

// Gera código de convite único (6 caracteres, fácil de compartilhar)
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem I, O, 0, 1 para evitar confusão
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autenticado. Faça login novamente.' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  // Validar gameMode
  const gameMode: GameMode = VALID_GAME_MODES.includes(body.gameMode) ? body.gameMode : 'QUICK_MATCH'
  const modeConfig = GAME_MODE_CONFIG[gameMode]

  // Garante que as tabelas existem antes de qualquer operação
  await ensureDbSync()

  // Gera inviteCode único
  let inviteCode = generateInviteCode()
  // Verifica se o código já existe (muito raro, mas seguro)
  for (let attempts = 0; attempts < 10; attempts++) {
    try {
      const existing = await db.match.findFirst({ where: { inviteCode } })
      if (!existing) break
      inviteCode = generateInviteCode()
    } catch {
      // Se a coluna inviteCode ainda não existe, break — será criada pelo db-sync
      break
    }
  }

  // Cria a partida em status WAITING — oponente ainda não definido
  // awayUserId é null até que alguém entre via invite
  const matchData = {
    homeUserId: session.userId,
    // awayUserId omitted — will be null until opponent joins via invite
    status: 'WAITING' as const,
    mode: 'DREAM_TEAM' as const,
    gameMode,
    inviteCode,
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
        inviteCode: match.inviteCode,
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
          ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "inviteCode" TEXT;
          CREATE UNIQUE INDEX IF NOT EXISTS "Match_inviteCode_key" ON "Match"("inviteCode");
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
            inviteCode: match.inviteCode,
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
