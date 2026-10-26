// GET /api/user/search?q=... - busca usuários por username (para adicionar amigos)
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { containsInsensitive } from '@/lib/db-filters'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ ok: true, users: [] })

  const users = await db.user.findMany({
    where: {
      AND: [
        { id: { not: session.userId } },
        {
          OR: [
            { username: containsInsensitive(q) },
            { email: containsInsensitive(q.toLowerCase()) },
            { displayName: containsInsensitive(q) },
          ],
        },
      ],
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      xp: true,
      wins: true,
      losses: true,
    },
    take: 10,
  })

  return NextResponse.json({ ok: true, users })
}
