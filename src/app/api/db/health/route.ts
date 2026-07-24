// GET /api/db/health - verifica se as tabelas e colunas necessárias existem
// Retorna diagnóstico detalhado para ajudar a identificar problemas no banco
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const results: Record<string, { ok: boolean; error?: string; hint?: string }> = {}

  // 1. Teste: tabela User
  try {
    await db.user.findFirst({ take: 1 })
    results['User'] = { ok: true }
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    results['User'] = { ok: false, error: msg.slice(0, 300) }
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
    const hint = msg.includes('does not exist')
      ? 'A tabela Match não existe. Execute sql-setup-complete.sql no Neon Console.'
      : 'Erro ao acessar tabela Match. Verifique o banco.'
    results['Match_read'] = { ok: false, error: msg.slice(0, 300), hint }
  }

  // 5. Teste: tabela UserTeam
  try {
    await db.userTeam.findFirst({ take: 1 })
    results['UserTeam'] = { ok: true }
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    results['UserTeam'] = { ok: false, error: msg.slice(0, 300) }
  }

  // 6. Teste: consegue escrever na tabela Match? (testa se todas as colunas existem)
  // Usa SQL bruto para evitar problemas com FK constraint
  try {
    // Verifica se todas as colunas do modelo Match existem
    const columns = await db.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'Match'
      ORDER BY ordinal_position
    ` as Array<{ column_name: string; data_type: string; is_nullable: string }>
    const columnNames = columns.map((c: any) => c.column_name)
    const required = ['id', 'status', 'mode', 'homeUserId', 'awayUserId', 'homeScore', 'awayScore', 'turnCount', 'homeProgress', 'awayProgress', 'eventsJson', 'homeTeamStateJson', 'awayTeamStateJson', 'createdAt', 'updatedAt']
    const missing = required.filter((r) => !columnNames.includes(r))
    if (missing.length > 0) {
      results['Match_columns'] = {
        ok: false,
        error: `Colunas faltando: ${missing.join(', ')}`,
        hint: 'Execute sql-setup-complete.sql no Neon Console para adicionar as colunas.',
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

  const allOk = Object.values(results).every((r) => r.ok)

  return NextResponse.json({
    ok: allOk,
    timestamp: new Date().toISOString(),
    tables: results,
    fix: !allOk
      ? 'Execute o arquivo sql-setup-complete.sql no Neon Console (SQL Editor) para criar as tabelas/colunas faltantes.'
      : null,
  })
}
