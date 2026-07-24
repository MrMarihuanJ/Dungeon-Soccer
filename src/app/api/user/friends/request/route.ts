// POST /api/user/friends/request - envia convite de amizade
// Body: { identifier: string (username ou email) }
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
    console.error('[friends/request] DB sync failed:', err?.message?.slice(0, 200))
    // Don't abort — tables might already exist
  }

  const body = await req.json().catch(() => ({}))
  const identifier = String(body.identifier ?? '').trim()
  if (!identifier) {
    return NextResponse.json({ ok: false, error: 'Informe o usuário ou email.' }, { status: 400 })
  }

  // Encontra usuário alvo
  const target = await db.user.findFirst({
    where: {
      OR: [
        { username: identifier },
        { email: identifier.toLowerCase() },
      ],
    },
  })
  if (!target) {
    return NextResponse.json({ ok: false, error: 'Usuário não encontrado.' }, { status: 404 })
  }
  if (target.id === session.userId) {
    return NextResponse.json({ ok: false, error: 'Você não pode adicionar a si mesmo.' }, { status: 400 })
  }

  // Verifica se já são amigos
  const existingFriendship = await db.friendship.findFirst({
    where: {
      OR: [
        { userAId: session.userId, userBId: target.id },
        { userAId: target.id, userBId: session.userId },
      ],
    },
  })
  if (existingFriendship) {
    return NextResponse.json({ ok: false, error: 'Vocês já são amigos.' }, { status: 400 })
  }

  // Verifica se já existe convite pendente
  const existingReq = await db.friendRequest.findFirst({
    where: {
      OR: [
        { fromUserId: session.userId, toUserId: target.id, status: 'PENDING' },
        { fromUserId: target.id, toUserId: session.userId, status: 'PENDING' },
      ],
    },
  })
  if (existingReq) {
    return NextResponse.json({ ok: false, error: 'Já existe convite pendente entre vocês.' }, { status: 400 })
  }

  // Cria o convite
  const request = await db.friendRequest.create({
    data: { fromUserId: session.userId, toUserId: target.id },
  })

  return NextResponse.json({ ok: true, requestId: request.id, toUser: { id: target.id, username: target.username } })
}
