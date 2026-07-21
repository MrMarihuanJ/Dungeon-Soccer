// =====================================================================
// /api/admin/players - CRUD de jogadores (somente admin autenticado)
// --------------------------------------------------------------------
// GET    /api/admin/players         -> lista todos (com paginação)
// POST   /api/admin/players         -> cria novo jogador
// PUT    /api/admin/players?id=XXX  -> atualiza jogador
// DELETE /api/admin/players?id=XXX  -> remove jogador
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAdminFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Middleware de auth
async function requireAdmin(req: NextRequest) {
  const admin = getAdminFromRequest(req)
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Não autorizado. Faça login como admin.' },
      { status: 401 },
    )
  }
  return null
}

// ---- GET: listar jogadores ----
export async function GET(req: NextRequest) {
  const authError = await requireAdmin(req)
  if (authError) return authError

  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') ?? '').trim().toLowerCase()
    const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500)
    const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0)

    const where = q
      ? { OR: [{ name: { contains: q } }, { fullName: { contains: q } }, { team: { contains: q } }] }
      : {}

    const [players, total] = await Promise.all([
      db.player.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: [{ name: 'asc' }],
      }),
      db.player.count({ where }),
    ])

    return NextResponse.json({ ok: true, players, total, limit, offset })
  } catch (err) {
    console.error('[admin/players GET] erro:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// ---- POST: criar jogador ----
export async function POST(req: NextRequest) {
  const authError = await requireAdmin(req)
  if (authError) return authError

  try {
    const body = await req.json().catch(() => ({}))
    const { name, fullName, position, team, photoUrl, nationality, shirtNumber, value } = body

    if (!name || !fullName || !position || !team) {
      return NextResponse.json(
        { ok: false, error: 'Campos obrigatórios: name, fullName, position, team.' },
        { status: 400 },
      )
    }
    if (!['GK', 'DF', 'MF', 'FW'].includes(position)) {
      return NextResponse.json(
        { ok: false, error: 'Posição inválida. Use GK, DF, MF ou FW.' },
        { status: 400 },
      )
    }

    const player = await db.player.create({
      data: {
        name: String(name),
        fullName: String(fullName),
        position: String(position),
        team: String(team),
        photoUrl: String(photoUrl || ''),
        nationality: nationality ? String(nationality) : null,
        shirtNumber: shirtNumber ? Number(shirtNumber) : null,
        value: value ? Number(value) : null,
      },
    })

    return NextResponse.json({ ok: true, player }, { status: 201 })
  } catch (err) {
    console.error('[admin/players POST] erro:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// ---- PUT: atualizar jogador ----
export async function PUT(req: NextRequest) {
  const authError = await requireAdmin(req)
  if (authError) return authError

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ ok: false, error: 'id é obrigatório na query.' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const data: Record<string, unknown> = {}
    for (const k of ['name', 'fullName', 'position', 'team', 'photoUrl', 'nationality']) {
      if (body[k] !== undefined) data[k] = String(body[k])
    }
    if (body.shirtNumber !== undefined) data.shirtNumber = body.shirtNumber ? Number(body.shirtNumber) : null
    if (body.value !== undefined) data.value = body.value ? Number(body.value) : null

    if (data.position && !['GK', 'DF', 'MF', 'FW'].includes(String(data.position))) {
      return NextResponse.json(
        { ok: false, error: 'Posição inválida. Use GK, DF, MF ou FW.' },
        { status: 400 },
      )
    }

    const player = await db.player.update({ where: { id }, data })
    return NextResponse.json({ ok: true, player })
  } catch (err) {
    console.error('[admin/players PUT] erro:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// ---- DELETE: remover jogador ----
export async function DELETE(req: NextRequest) {
  const authError = await requireAdmin(req)
  if (authError) return authError

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ ok: false, error: 'id é obrigatório na query.' }, { status: 400 })
    }

    await db.player.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/players DELETE] erro:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
