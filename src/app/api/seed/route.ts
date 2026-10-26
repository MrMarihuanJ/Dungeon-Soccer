// =====================================================================
// API: /api/seed
// Sincroniza o banco de dados com o catálogo curado de jogadores.
// NÃO DESTRUTIVO: apenas insere jogadores que ainda não existem (por
// nome). Registros existentes (inclusive criados/editados via admin)
// são preservados.
// =====================================================================

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'
import { PLAYERS_SEED } from '@/lib/football/players-data'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // Garante que a tabela Player existe com todas as colunas.
    try {
      await ensureDbSync()
    } catch (syncErr) {
      console.error('[api/seed] DB sync falhou (não fatal):', syncErr)
    }

    // Nomes já existentes — usamos `name` como chave de sincronização.
    const existing = await db.player.findMany({ select: { name: true } })
    const existingNames = new Set(existing.map((p) => p.name))

    const missing = PLAYERS_SEED.filter((p) => !existingNames.has(p.name))

    if (missing.length === 0) {
      return NextResponse.json({
        ok: true,
        message: `Banco já está sincronizado com o catálogo. ${existing.length} jogador(es) no banco.`,
        total: existing.length,
        inserted: 0,
      })
    }

    // Insere apenas os faltantes (sem skipDuplicates — o argumento não é
    // suportado no SQLite e a filtragem acima já evita duplicatas).
    await db.player.createMany({
      data: missing.map((p) => ({
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
      })),
    })

    const total = await db.player.count()
    return NextResponse.json({
      ok: true,
      message: `Seed concluído: ${missing.length} novo(s) jogador(es). Total agora: ${total}.`,
      total,
      inserted: missing.length,
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
