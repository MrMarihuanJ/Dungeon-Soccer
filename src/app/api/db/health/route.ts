// GET /api/db/health - verifica se as tabelas e colunas necessárias existem
// Retorna diagnóstico detalhado para ajudar a identificar problemas no banco.
//
// IMPORTANTE: Este endpoint também detecta mismatch entre o Prisma Client
// gerado (sqlite vs postgresql) e o DATABASE_URL em runtime — que era a
// causa raiz real dos 4 erros de produção (login, team save, match create,
// admin players) mesmo após o hotfix v2.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'

export const dynamic = 'force-dynamic'

export async function GET() {
  const results: Record<string, { ok: boolean; error?: string; hint?: string }> = {}

  // 0. Diagnóstico: scheme da DATABASE_URL + provider esperado
  const dbUrl = process.env.DATABASE_URL || ''
  const detectedScheme = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')
    ? 'postgresql'
    : dbUrl.startsWith('file:') || dbUrl.startsWith('sqlite:') || dbUrl === ''
    ? 'sqlite'
    : 'unknown'

  let providerHint: string | null = null
  if (detectedScheme === 'unknown') {
    providerHint =
      'DATABASE_URL tem scheme desconhecido. Use "postgresql://..." (prod) ou "file:..." (dev).'
  }

  // Roda ensureDbSync primeiro (apenas Postgres) — caso a tabela ainda
  // não exista, tenta criá-la antes de falhar.
  try {
    await ensureDbSync()
  } catch (err: any) {
    // Não aborta — ainda tentamos os testes abaixo para diagnosticar.
    results['db_sync'] = {
      ok: false,
      error: (err?.message || String(err)).slice(0, 300),
      hint: 'db-sync falhou. Em SQLite (dev), rode `bun run db:push`. Em Postgres (prod), verifique permissões do Neon.',
    }
  }

  // 1. Teste: tabela User (detecta mismatch de provider aqui!)
  try {
    await db.user.findFirst({ take: 1 })
    results['User'] = { ok: true }
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    let hint: string | undefined
    if (msg.includes('provider') && msg.includes('sqlite') && detectedScheme === 'postgresql') {
      hint =
        'PROVIDER MISMATCH: o Prisma Client gerado é para SQLite mas DATABASE_URL é PostgreSQL. ' +
        'O script scripts/swap-prisma-provider.js deveria ter reescrito o schema antes do `prisma generate`. ' +
        'Verifique se o `postinstall` rodou durante o build da Vercel.'
    } else if (msg.includes('provider') && msg.includes('postgresql') && detectedScheme === 'sqlite') {
      hint =
        'PROVIDER MISMATCH: o Prisma Client gerado é para PostgreSQL mas DATABASE_URL é SQLite. ' +
        'Provavelmente o schema foi editado manualmente para "postgresql" — rode `node scripts/swap-prisma-provider.js` para corrigir.'
    } else if (msg.includes('does not exist')) {
      hint = 'Coluna ou tabela não existe. db-sync deveria ter criado — verifique os logs do servidor.'
    }
    results['User'] = { ok: false, error: msg.slice(0, 300), hint }
  }

  // 2. Teste: tabela Friendship
  try {
    await db.friendship.findFirst({ take: 1 })
    results['Friendship'] = { ok: true }
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    results['Friendship'] = { ok: false, error: msg.slice(0, 300) }
  }

  // 3. Teste: tabela FriendRequest
  try {
    await db.friendRequest.findFirst({ take: 1 })
    results['FriendRequest'] = { ok: true }
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    results['FriendRequest'] = { ok: false, error: msg.slice(0, 300) }
  }

  // 4. Teste: tabela Match (a mais crítica para o botão "Desafiar")
  try {
    await db.match.findFirst({ take: 1 })
    results['Match_read'] = { ok: true }
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    results['Match_read'] = { ok: false, error: msg.slice(0, 300) }
  }

  // 5. Teste: tabela UserTeam
  try {
    await db.userTeam.findFirst({ take: 1 })
    results['UserTeam'] = { ok: true }
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    results['UserTeam'] = { ok: false, error: msg.slice(0, 300) }
  }

  // 6. Teste: tabela Player (admin/players)
  try {
    const playerCount = await db.player.count()
    results['Player'] = {
      ok: true,
      hint:
        playerCount === 0
          ? 'Tabela existe mas está VAZIA. Rode `bun run db:seed` ou POST /api/seed para popular.'
          : undefined,
    }
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    results['Player'] = { ok: false, error: msg.slice(0, 300) }
  }

  // 7. Teste: colunas do Match (apenas em Postgres — SQLite não tem information_schema)
  if (detectedScheme === 'postgresql') {
    try {
      const columns = await db.$queryRaw`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'Match'
        ORDER BY ordinal_position
      ` as Array<{ column_name: string; data_type: string; is_nullable: string }>
      const columnNames = columns.map((c: any) => c.column_name)
      const required = [
        'id', 'status', 'mode', 'homeUserId', 'awayUserId',
        'homeScore', 'awayScore', 'turnCount', 'homeProgress', 'awayProgress',
        'eventsJson', 'homeTeamStateJson', 'awayTeamStateJson',
        'xpGranted', 'version', 'pendingPenaltyEventJson',
        'varDecisionsJson', 'homeTeamJson', 'awayTeamJson',
        'createdAt', 'updatedAt',
      ]
      const missing = required.filter((r) => !columnNames.includes(r))
      if (missing.length > 0) {
        results['Match_columns'] = {
          ok: false,
          error: `Colunas faltando: ${missing.join(', ')}`,
          hint: 'db-sync deveria ter adicionado. Verifique logs de cold start da Vercel.',
        }
      } else {
        results['Match_columns'] = { ok: true }
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err)
      results['Match_columns'] = {
        ok: false,
        error: msg.slice(0, 300),
        hint: 'Não foi possível verificar as colunas. A tabela pode não existir.',
      }
    }
  }

  const allOk = Object.values(results).every((r) => r.ok)

  return NextResponse.json({
    ok: allOk,
    timestamp: new Date().toISOString(),
    databaseUrlScheme: detectedScheme,
    providerHint,
    tables: results,
    fix: !allOk
      ? 'Verifique o campo `tables` para identificar quais tabelas/colunas falharam. ' +
        'Os campos `hint` contêm instruções específicas para cada erro.'
      : null,
  })
}
