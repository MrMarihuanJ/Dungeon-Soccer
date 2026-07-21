// POST /api/user/friends/reject - recusa convite
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const requestId = String(body.requestId ?? '')
  if (!requestId) return NextResponse.json({ ok: false, error: 'requestId obrigatório.' }, { status: 400 })

  const request = await db.friendRequest.findUnique({ where: { id: requestId } })
  if (!request || request.toUserId !== session.userId) {
    return NextResponse.json({ ok: false, error: 'Convite não encontrado.' }, { status: 404 })
  }

  await db.friendRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } })
  return NextResponse.json({ ok: true })
}
