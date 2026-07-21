// GET /api/match/list - lista partidas do usuário (ativas e recentes)
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const matches = await db.match.findMany({
    where: {
      OR: [{ homeUserId: session.userId }, { awayUserId: session.userId }],
    },
    include: {
      homeUser: { select: { id: true, username: true, displayName: true } },
      awayUser: { select: { id: true, username: true, displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json({ ok: true, matches })
}
