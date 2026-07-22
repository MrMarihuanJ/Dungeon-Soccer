// GET /api/user/friends/list - lista amigos aceitos
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  // Garante que as tabelas existem
  await ensureDbSync()

  try {
    const [asA, asB] = await Promise.all([
      db.friendship.findMany({
        where: { userAId: session.userId, status: 'ACCEPTED' },
        include: { userB: { select: { id: true, username: true, displayName: true, wins: true, losses: true, draws: true, xp: true } } },
      }),
      db.friendship.findMany({
        where: { userBId: session.userId, status: 'ACCEPTED' },
        include: { userA: { select: { id: true, username: true, displayName: true, wins: true, losses: true, draws: true, xp: true } } },
      }),
    ])

    const friends = [
      ...asA.map((f) => ({ ...f.userB, friendshipId: f.id })),
      ...asB.map((f) => ({ ...f.userA, friendshipId: f.id })),
    ]

    return NextResponse.json({ ok: true, friends })
  } catch (err: any) {
    console.error('[friends/list] error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      ok: false,
      error: 'Erro ao carregar amigos.',
      detail: msg.slice(0, 300),
    }, { status: 500 })
  }
}
