// =====================================================================
// GET /api/user/profile — Retorna XP, nível, recompensas e estatísticas
// --------------------------------------------------------------------
// Resumo:
//   - XP total e nível atual
//   - Progresso para o próximo nível (currentLevelXp, nextLevelXp, progressPct)
//   - Recompensas já conquistadas (getAllEarnedRewards)
//   - Próximas recompensas (próximos 3 níveis)
//   - Estatísticas do usuário (W/L/D, total de partidas)
//   - Multiplicador de XP ativo (levelMultiplier)
//
// Resposta:
//   {
//     ok: true,
//     profile: {
//       userId, username, displayName,
//       xp, level, currentLevelXp, nextLevelXp, progressPct, isMaxLevel,
//       levelMultiplier,
//       wins, losses, draws, totalMatches, winRate,
//       earnedRewards: LevelReward[],
//       upcomingRewards: LevelReward[],
//     }
//   }
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'
import {
  getLevelFromXp,
  getAllEarnedRewards,
  LEVEL_REWARDS,
  getXpMultiplierForLevel,
  type LevelReward,
} from '@/lib/xp-system'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    await ensureDbSync()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[user/profile] DB sync failed:', msg.slice(0, 200))
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, username: true, displayName: true, email: true,
      xp: true, wins: true, losses: true, draws: true,
      createdAt: true, lastLoginAt: true,
    },
  })

  if (!user) {
    return NextResponse.json({ ok: false, error: 'Usuário não encontrado.' }, { status: 404 })
  }

  const levelInfo = getLevelFromXp(user.xp)
  const earnedRewards = getAllEarnedRewards(levelInfo.level)
  const upcomingRewards: LevelReward[] = LEVEL_REWARDS
    .filter((r) => r.level > levelInfo.level)
    .slice(0, 3)
  const levelMultiplier = getXpMultiplierForLevel(levelInfo.level)
  const totalMatches = user.wins + user.losses + user.draws
  const winRate = totalMatches > 0 ? (user.wins / totalMatches) * 100 : 0

  return NextResponse.json({
    ok: true,
    profile: {
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      xp: user.xp,
      level: levelInfo.level,
      currentLevelXp: levelInfo.currentLevelXp,
      nextLevelXp: levelInfo.nextLevelXp,
      progressPct: levelInfo.progressPct,
      isMaxLevel: levelInfo.isMaxLevel,
      levelMultiplier,
      wins: user.wins,
      losses: user.losses,
      draws: user.draws,
      totalMatches,
      winRate: Math.round(winRate * 10) / 10,
      earnedRewards,
      upcomingRewards,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
  })
}
