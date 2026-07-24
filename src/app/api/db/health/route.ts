// GET /api/db/health - verifica se as tabelas e colunas necessárias existem
// Retorna diagnóstico detalhado para ajudar a identificar problemas no banco
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  const results: Record<string, { ok: boolean; error?: string }> = {}

  // 1. Teste: consegue conectar e consultar a tabela User?
  try {
    await db.user.findFirst({ take: 1 })
    results['User'] = { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    results['User'] = { ok: false, error: msg.slice(0, 200) }
  }

  // 2. Teste: tabela Friendship?
  try {
    await db.friendship.findFirst({ take: 1 })
    results['Friendship'] = { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    results['Friendship'] = { ok: false, error: msg.slice(0, 200) }
  }

  // 3. Teste: tabela FriendRequest?
  try {
    await db.friendRequest.findFirst({ take: 1 })
    results['FriendRequest'] = { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    results['FriendRequest'] = { ok: false, error: msg.slice(0, 200) }
  }

  // 4. Teste: tabela Match? (a mais crítica)
  try {
    await db.match.findFirst({ take: 1 })
    results['Match'] = { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    results['Match'] = { ok: false, error: msg.slice(0, 200) }
  }

  // 5. Teste: tabela UserTeam?
  try {
    await db.userTeam.findFirst({ take: 1 })
    results['UserTeam'] = { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    results['UserTeam'] = { ok: false, error: msg.slice(0, 200) }
  }

  // 6. Teste: consegue criar uma Match (dry-run com rollback)?
  try {
    // Tenta criar e deletar imediatamente para testar se todas as colunas existem
    const testMatch = await db.match.create({
      data: {
        homeUserId: 'test-nonexistent-user',
        awayUserId: 'test-nonexistent-user-2',
        status: 'COIN_FLIP',
        mode: 'DREAM_TEAM',
        homeScore: 0,
        awayScore: 0,
        turnCount: 0,
        homeProgress: 0,
        awayProgress: 0,
        eventsJson: '[]',
        homeTeamStateJson: '{}',
        awayTeamStateJson: '{}',
      },
    })
    // Se chegou aqui, a FK não está sendo enforceada (tudo bem, significa que as colunas existem)
    // Limpa o registro de teste
    try {
      await db.match.delete({ where: { id: testMatch.id } })
    } catch {
      // Não importa se não conseguir deletar
    }
    results['Match_Create'] = { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Se o erro é de FK, significa que a tabela existe com FKs mas os usuários de teste não existem
    // Isso é na verdade BOM - significa que a tabela está completa
    if (msg.includes('foreign key') || msg.includes('P2003') || msg.includes('constraint')) {
      results['Match_Create'] = { ok: true, error: 'FK constraint enforced (tabela OK, FK impede insert de teste)' }
    } else {
      results['Match_Create'] = { ok: false, error: msg.slice(0, 300) }
    }
  }

  const allOk = Object.values(results).every((r) => r.ok)

  return NextResponse.json({
    ok: allOk,
    timestamp: new Date().toISOString(),
    tables: results,
    hint: !allOk
      ? 'Execute o SQL de setup completo (sql-setup-complete.sql) no Neon Console para criar as tabelas/colunas faltantes.'
      : 'Todas as tabelas estão acessíveis.',
  })
}
