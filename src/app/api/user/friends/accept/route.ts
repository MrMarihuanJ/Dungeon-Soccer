// POST /api/user/friends/accept - aceita convite
// Body: { requestId: string }
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  try {
    await ensureDbSync()
  } catch (err: any) {
    console.error('[friends/accept] DB sync failed:', err?.message?.slice(0, 200))
    // Don't abort — tables might already exist
  }

  const body = await req.json().catch(() => ({}))
  const requestId = String(body.requestId ?? '')
  if (!requestId) return NextResponse.json({ ok: false, error: 'requestId obrigatório.' }, { status: 400 })

  const request = await db.friendRequest.findUnique({ where: { id: requestId } })
  if (!request || request.toUserId !== session.userId) {
    return NextResponse.json({ ok: false, error: 'Convite não encontrado.' }, { status: 404 })
  }
  if (request.status !== 'PENDING') {
    return NextResponse.json({ ok: false, error: 'Convite já processado.' }, { status: 400 })
  }

  // Transação: aceita convite + cria amizade
  await db.$transaction([
    db.friendRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } }),
    db.friendship.create({
      data: {
        userAId: request.fromUserId,
        userBId: request.toUserId,
        status: 'ACCEPTED',
      },
    }),
  ])

  return NextResponse.json({ ok: true })
}
