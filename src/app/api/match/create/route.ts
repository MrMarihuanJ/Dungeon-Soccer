// =====================================================================
// POST /api/match/create - cria nova partida
// --------------------------------------------------------------------
// Body: { gameMode?: 'QUICK_MATCH' | 'TIMED_10' | 'FULL_90', offline?: boolean }
//
// OFFLINE MODE: Cria partida contra bot. awayUserId é um usuário bot
// pré-existente, e o status começa em COIN_FLIP (sem espera).
// O bot joga automaticamente no turno do oponente.
//
// ONLINE MODE (default): O criador (home) cria a partida em status WAITING.
// O oponente entra via link de convite (inviteCode).
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
  const isOffline = Boolean(body.offline) // Offline = vs bot

  // Garante que as tabelas existem antes de qualquer operação
  try {
    await ensureDbSync()
  } catch (err: any) {
    console.error('[match/create] DB sync failed:', err?.message?.slice(0, 200))
    // Don't abort — the tables might already exist, just try the operation
  }

  // ===== OFFLINE MODE: Create match vs bot =====
  if (isOffline) {
    // Ensure the bot user exists
    const BOT_USER_ID = 'BOT_PLAYER_DUNGEON_SOCER_001'
    const BOT_USERNAME = 'Bot Dungeon Soccer'
    try {
      await db.user.upsert({
        where: { id: BOT_USER_ID },
        update: {},
        create: {
          id: BOT_USER_ID,
          email: `bot@dungeon-soccer.local`,
          username: BOT_USERNAME,
          passwordHash: '$2b$10$BOT_PLACEHOLDER_HASH_NOT_FOR_LOGIN',
          displayName: 'Bot',
          wins: 0,
          losses: 0,
          draws: 0,
          xp: 0,
        },
      })
    } catch {
      // Bot user may already exist — ignore
    }

    try {
      const match = await db.match.create({
        data: {
          homeUserId: session.userId,
          awayUserId: BOT_USER_ID,
          status: 'COIN_FLIP',
          mode: 'DREAM_TEAM',
          gameMode,
          inviteCode: generateInviteCode(),
          isOffline: true,
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
        },
      })

      return NextResponse.json({
        ok: true,
        match: {
          id: match.id,
          status: match.status,
          homeUserId: match.homeUserId,
          awayUserId: match.awayUserId,
          awayUser: { id: BOT_USER_ID, username: BOT_USERNAME, displayName: 'Bot', xp: 0, wins: 0, losses: 0, draws: 0 },
          gameMode: match.gameMode,
          inviteCode: match.inviteCode,
          isOffline: match.isOffline,
          xpReward: match.xpReward,
        },
      })
    } catch (err: any) {
      console.error('[match/create] offline create error:', err)
      const message = err instanceof Error ? err.message : String(err)
      const prismaCode = err?.code || ''
      const meta = err?.meta ? JSON.stringify(err.meta) : ''

      // If the Match table might not have the inviteCode column yet, try adding it
      if (message.includes('inviteCode') || message.includes('does not exist') || message.includes('column')) {
        try {
          await db.$executeRawUnsafe(`ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "inviteCode" TEXT`)
          await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Match_inviteCode_key" ON "Match"("inviteCode")`)
          // Retry create
          const match = await db.match.create({
            data: {
              homeUserId: session.userId,
              awayUserId: BOT_USER_ID,
              status: 'COIN_FLIP',
              mode: 'DREAM_TEAM',
              gameMode,
              inviteCode: generateInviteCode(),
              isOffline: true,
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
            },
          })

          return NextResponse.json({
            ok: true,
            match: {
              id: match.id,
              status: match.status,
              homeUserId: match.homeUserId,
              awayUserId: match.awayUserId,
              awayUser: { id: BOT_USER_ID, username: BOT_USERNAME, displayName: 'Bot', xp: 0, wins: 0, losses: 0, draws: 0 },
              gameMode: match.gameMode,
              inviteCode: match.inviteCode,
              isOffline: match.isOffline,
              xpReward: match.xpReward,
            },
          })
        } catch (retryErr: any) {
          console.error('[match/create] offline retry also failed:', retryErr)
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
          return NextResponse.json({
            ok: false,
            error: 'Não foi possível criar a partida offline. Verifique o banco Neon.',
            detail: retryMsg.slice(0, 400),
          }, { status: 500 })
        }
      }

      return NextResponse.json({
        ok: false,
        error: 'Erro interno ao criar partida offline.',
        detail: `${prismaCode ? `[${prismaCode}] ` : ''}${message.slice(0, 300)}${meta ? ` | meta: ${meta.slice(0, 200)}` : ''}`,
      }, { status: 500 })
    }
  }

  // ===== ONLINE MODE: Create match with invite =====
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
    isOffline: false,
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
    console.error('[match/create] online create error:', err)

    const message = err instanceof Error ? err.message : String(err)
    const prismaCode = err?.code || ''
    const meta = err?.meta ? JSON.stringify(err.meta) : ''

    // Erro de tabela/coluna inexistente — tenta sync uma vez mais
    if (message.includes('does not exist') || message.includes('column') || message.includes('relation')) {
      console.log('[match/create] Retrying db sync after error...')
      try {
        // FIX: Neon PostgreSQL doesn't allow multiple statements in prepared statements.
        // Split into two separate calls.
        await db.$executeRawUnsafe(`ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "inviteCode" TEXT`)
        await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Match_inviteCode_key" ON "Match"("inviteCode")`)
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
