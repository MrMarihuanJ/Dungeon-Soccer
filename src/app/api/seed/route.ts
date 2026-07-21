// =====================================================================
// API: /api/seed
// Popula o banco de dados na primeira execução (deploy na Vercel).
// Idempotente: se já existem jogadores, não duplica.
// =====================================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { PLAYERS_SEED } from '@/lib/football/players-data'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const existing = await db.player.count()
    if (existing > 0) {
      return NextResponse.json({
        ok: true,
        message: `Banco já possui ${existing} jogadores. Seed ignorado.`,
        total: existing,
      })
    }

    const batch = PLAYERS_SEED.map((p) =>
      db.player.create({
        data: {
          name: p.name,
          fullName: p.fullName,
          position: p.position,
          team: p.team,
          photoUrl: p.photoUrl,
          nationality: p.nationality,
          shirtNumber: p.shirtNumber ?? null,
          overall: p.overall,
          age: p.age,
          pace: p.pace ?? 70,
          shooting: p.shooting ?? 70,
          passing: p.passing ?? 70,
          dribbling: p.dribbling ?? 70,
          defending: p.defending ?? 70,
          physical: p.physical ?? 70,
          leagueTier: p.leagueTier ?? 'OTHER',
          isRetired: p.isRetired ?? false,
          isInactive: p.isInactive ?? false,
        },
      }),
    )

    await db.$transaction(batch)

    const total = await db.player.count()
    return NextResponse.json({
      ok: true,
      message: `Seed concluído com ${total} jogadores.`,
      total,
    })
  } catch (err) {
    console.error('[API/seed] erro:', err)
    return NextResponse.json(
      { ok: false, error: 'Falha ao semear o banco.', detail: String(err) },
      { status: 500 },
    )
  }
}

export async function GET() {
  try {
    const total = await db.player.count()
    const retired = await db.player.count({ where: { isRetired: true } })
    return NextResponse.json({ ok: true, total, retired })
  } catch (err) {
    console.error('[API/seed GET] erro:', err)
    return NextResponse.json({ ok: false, total: 0, error: String(err) }, { status: 500 })
  }
}
