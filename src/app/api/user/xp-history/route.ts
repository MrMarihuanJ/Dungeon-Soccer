// =====================================================================
// GET /api/user/xp-history — Retorna histórico de concessões de XP
// --------------------------------------------------------------------
// Query params:
//   - limit (default 50, max 200) — número máximo de registros
//   - offset (default 0) — paginação
//
// Resposta:
//   {
//     ok: true,
//     history: XpGrant[],
//     total: number,
//     summary: { totalXp, countByKind: { XP, LEVEL_UP, ACHIEVEMENT } }
//   }
//
// O histórico é ordenado por createdAt DESC (mais recente primeiro).
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'

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
    console.error('[user/xp-history] DB sync failed:', msg.slice(0, 200))
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10))

  const [history, total, summary] = await Promise.all([
    db.xpGrant.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.xpGrant.count({ where: { userId: session.userId } }),
    db.xpGrant.groupBy({
      by: ['kind'],
      where: { userId: session.userId },
      _sum: { amount: true },
      _count: true,
    }),
  ])

  // Calcula total de XP do histórico (apenas positivo)
  const totalXp = history.reduce((sum, h) => sum + (h.amount > 0 ? h.amount : 0), 0)
  const countByKind: Record<string, { count: number; total: number }> = {}
  for (const s of summary) {
    countByKind[s.kind] = {
      count: s._count,
      total: s._sum.amount ?? 0,
    }
  }

  return NextResponse.json({
    ok: true,
    history,
    total,
    summary: {
      totalXpInPage: totalXp,
      countByKind,
    },
  })
}
