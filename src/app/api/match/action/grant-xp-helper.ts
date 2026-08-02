// =====================================================================
// grantMatchXp — Helper de concessão de XP idempotente
// --------------------------------------------------------------------
// Extraído de /api/match/action para reuso em /api/match/free-kick-resolve.
// Esta função é atômica e idempotente: a transação db.$transaction
// garante que apenas uma das chamadas concorrentes consiga conceder XP
// para uma mesma partida.
// =====================================================================

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { GameMode } from '@/lib/match-engine'
import { calculateMatchXp, matchXpSource, getLevelFromXp } from '@/lib/xp-system'

export async function grantMatchXp(input: {
  matchId: string
  homeUserId: string
  awayUserId: string
  winner: string | null
  gameMode: GameMode
  isOffline: boolean
}): Promise<{ granted: boolean; homeXp?: number; awayXp?: number }> {
  const { matchId, homeUserId, awayUserId, winner, gameMode, isOffline } = input

  const homeResult: 'WIN' | 'LOSS' | 'DRAW' =
    winner === 'HOME' ? 'WIN' : winner === 'AWAY' ? 'LOSS' : 'DRAW'
  const awayResult: 'WIN' | 'LOSS' | 'DRAW' =
    winner === 'AWAY' ? 'WIN' : winner === 'HOME' ? 'LOSS' : 'DRAW'

  const [homeUser, awayUser] = await Promise.all([
    db.user.findUnique({ where: { id: homeUserId }, select: { xp: true } }),
    db.user.findUnique({ where: { id: awayUserId }, select: { xp: true } }),
  ])

  if (!homeUser) {
    console.error('[grantMatchXp] home user not found:', homeUserId)
    return { granted: false }
  }
  if (!awayUser && !isOffline) {
    console.error('[grantMatchXp] away user not found:', awayUserId)
    return { granted: false }
  }

  const homeLevel = getLevelFromXp(homeUser.xp).level
  const awayLevel = awayUser ? getLevelFromXp(awayUser.xp).level : 1

  const homeXpBreakdown = calculateMatchXp({
    gameMode,
    result: homeResult,
    userLevel: homeLevel,
    cap: 100,
  })
  const awayXpBreakdown = calculateMatchXp({
    gameMode,
    result: awayResult,
    userLevel: awayLevel,
    cap: 100,
  })

  try {
    await db.$transaction(async (tx) => {
      // Tenta marcar xpGranted = true. Se já era true, count=0 → aborta.
      const markResult = await tx.match.updateMany({
        where: { id: matchId, xpGranted: false },
        data: { xpGranted: true },
      })
      if (markResult.count === 0) {
        throw new Error('XP_ALREADY_GRANTED')
      }

      const homeInc: { wins?: number; losses?: number; draws?: number; xp?: number } = {}
      if (homeResult === 'WIN') homeInc.wins = 1
      else if (homeResult === 'LOSS') homeInc.losses = 1
      else homeInc.draws = 1
      homeInc.xp = homeXpBreakdown.totalXp

      await tx.user.update({ where: { id: homeUserId }, data: homeInc })

      try {
        await tx.xpGrant.create({
          data: {
            userId: homeUserId,
            source: matchXpSource(matchId, homeResult),
            amount: homeXpBreakdown.totalXp,
            kind: 'XP',
            note: `${gameMode} — ${homeResult} (match ${matchId.slice(-8)})`,
          },
        })
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          // Já existe — OK, é idempotente
        } else {
          throw e
        }
      }

      if (awayUser && !isOffline) {
        const awayInc: { wins?: number; losses?: number; draws?: number; xp?: number } = {}
        if (awayResult === 'WIN') awayInc.wins = 1
        else if (awayResult === 'LOSS') awayInc.losses = 1
        else awayInc.draws = 1
        awayInc.xp = awayXpBreakdown.totalXp

        await tx.user.update({ where: { id: awayUserId }, data: awayInc })

        try {
          await tx.xpGrant.create({
            data: {
              userId: awayUserId,
              source: matchXpSource(matchId, awayResult),
              amount: awayXpBreakdown.totalXp,
              kind: 'XP',
              note: `${gameMode} — ${awayResult} (match ${matchId.slice(-8)})`,
            },
          })
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            // Já existe — OK
          } else {
            throw e
          }
        }
      }
    })
    return { granted: true, homeXp: homeXpBreakdown.totalXp, awayXp: awayXpBreakdown.totalXp }
  } catch (err) {
    if (err instanceof Error && err.message === 'XP_ALREADY_GRANTED') {
      return { granted: false }
    }
    console.error('[grantMatchXp] transaction failed:', err)
    return { granted: false }
  }
}
