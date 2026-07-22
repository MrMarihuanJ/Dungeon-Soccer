// GET /api/user/friends/requests - lista convites pendentes recebidos
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  await ensureDbSync()

  const requests = await db.friendRequest.findMany({
    where: { toUserId: session.userId, status: 'PENDING' },
    include: {
      fromUser: {
        select: { id: true, username: true, displayName: true, xp: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ ok: true, requests })
}
