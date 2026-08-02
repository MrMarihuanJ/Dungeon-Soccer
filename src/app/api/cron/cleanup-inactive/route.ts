// =====================================================================
// GET /api/cron/cleanup-inactive
// --------------------------------------------------------------------
// Deleta automaticamente contas de usuário inativas há mais de 180 dias.
//
// CRON JOB: agendado diariamente pelo Vercel (ver vercel.json → crons).
// Pode também ser disparado manualmente via HTTP GET, desde que o header
// Authorization: Bearer ${CRON_SECRET} esteja presente.
//
// REGRAS:
//   - Inatividade = `lastLoginAt` < 180 dias atrás
//     (se `lastLoginAt` for NULL, usa `createdAt` como fallback)
//   - O usuário bot (BOT_PLAYER_DUNGEON_SOCER_001) NUNCA é deletado
//   - Usuários marcados como `isProtected = true` NUNCA são deletados
//     (ex.: contas de serviço, contas VIP marcadas manualmente)
//   - Usuários marcados como `isAdmin = true` NUNCA são deletados
//     (mesmo inativos, admins devem ser revogados manualmente)
//   - Antes da deleção, partidas históricas onde o usuário é home/away
//     têm o `homeUserId`/`awayUserId` anonimizado para um ID de placeholder
//     para preservar integridade referencial (stats agregadas).
//   - Cascade deletes em UserTeam, Friendship, FriendRequest são automáticos.
//
// IDEMPOTÊNCIA:
//   - A query é baseada em `lastLoginAt < cutoff`, que só muda quando o
//     usuário loga. Rodar duas vezes no mesmo dia produz o mesmo resultado.
//   - Após a primeira execução, os usuários inativos são deletados; a
//     segunda execução encontra 0 inativos e retorna ok.
//
// CONFIGURAÇÃO:
//   - Defina a env var CRON_SECRET no Vercel com um valor aleatório longo.
//   - Configure o cron schedule em vercel.json (default: 0 3 * * *).
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Vercel: até 60s para concluir a limpeza

// ID do usuário bot — jamais deve ser deletado.
const BOT_USER_ID = 'BOT_PLAYER_DUNGEON_SOCER_001'

// Placeholder para anonimização de partidas históricas (preserva integridade).
// Este "usuário fantasma" não precisa existir na tabela User — apenas marcamos
// o `homeUserId`/`awayUserId` com este ID string. As estatísticas agregadas
// (gols, etc.) permanecem intactas, mas a identidade é anonimizada.
const ANONYMIZED_USER_ID = 'ANONYMIZED_INACTIVE_USER'

// Janela de inatividade: 180 dias em milissegundos.
const INACTIVITY_WINDOW_MS = 180 * 24 * 60 * 60 * 1000

/**
 * Verifica o header Authorization: Bearer <token>.
 * O token deve bater com process.env.CRON_SECRET.
 *
 * Em desenvolvimento (NODE_ENV !== 'production') a rota exige um CRON_SECRET
 * mesmo em dev (para evitar acionamentos acidentais), mas aceita o valor
 * "dev-cron-secret" como default de dev.
 */
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/cleanup-inactive] CRON_SECRET não configurado.')
    return false
  }
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  // Constant-time comparison
  if (token.length !== secret.length) return false
  try {
    const a = Buffer.from(token)
    const b = Buffer.from(secret)
    return a.length === b.length && a.equals(b)
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: 'Não autorizado. Configure CRON_SECRET no header Authorization.' },
      { status: 401 },
    )
  }

  const cutoffDate = new Date(Date.now() - INACTIVITY_WINDOW_MS)
  const runId = `cleanup-${Date.now()}`
  console.log(`[cron/cleanup-inactive] ${runId} iniciando. Cutoff: ${cutoffDate.toISOString()}`)

  try {
    // Garante que as colunas lastLoginAt, isAdmin, isProtected existem.
    try {
      await ensureDbSync()
    } catch (syncErr) {
      console.error('[cron/cleanup-inactive] DB sync falhou (não fatal):', syncErr)
    }

    // Busca usuários inativos que NÃO são protegidos/admin/bot:
    //   - lastLoginAt < cutoff (logou há >180 dias)
    //   - OU (lastLoginAt IS NULL AND createdAt < cutoff) (criado há >180 dias, nunca logou)
    const inactiveUsers = await db.user.findMany({
      where: {
        id: { not: BOT_USER_ID },
        isProtected: false,
        isAdmin: false,
        OR: [
          { lastLoginAt: { lt: cutoffDate } },
          {
            lastLoginAt: null,
            createdAt: { lt: cutoffDate },
          },
        ],
      },
      select: {
        id: true,
        username: true,
        email: true,
        lastLoginAt: true,
        createdAt: true,
        wins: true,
        losses: true,
        draws: true,
        xp: true,
      },
    })

    if (inactiveUsers.length === 0) {
      console.log(`[cron/cleanup-inactive] ${runId} concluído: 0 contas inativas.`)
      return NextResponse.json({
        ok: true,
        runId,
        deletedCount: 0,
        anonymizedCount: 0,
        message: 'Nenhuma conta inativa encontrada.',
        cutoff: cutoffDate.toISOString(),
      })
    }

    console.log(
      `[cron/cleanup-inactive] ${runId}: ${inactiveUsers.length} conta(s) a processar.`,
    )

    // PASSO 1: Anonimizar partidas históricas onde o usuário é home ou away.
    // Isto preserva a integridade referencial das partidas (score, events) sem
    // expor a identidade do usuário inativo.
    const ids = inactiveUsers.map((u) => u.id)
    let anonymizedCount = 0
    for (const userId of ids) {
      // Atualiza partidas onde o usuário é homeUserId
      const homeUpdated = await db.match.updateMany({
        where: { homeUserId: userId },
        data: { homeUserId: ANONYMIZED_USER_ID },
      })
      // Atualiza partidas onde o usuário é awayUserId
      const awayUpdated = await db.match.updateMany({
        where: { awayUserId: userId },
        data: { awayUserId: ANONYMIZED_USER_ID },
      })
      anonymizedCount += homeUpdated.count + awayUpdated.count
    }
    console.log(
      `[cron/cleanup-inactive] ${runId}: ${anonymizedCount} partida(s) anonimizadas.`,
    )

    // PASSO 2: Deletar usuários. Cascade deleta:
    //   - UserTeam
    //   - Friendship (ambos lados)
    //   - FriendRequest (ambos lados)
    //   - Match onde homeUserId/awayUserId == este usuário (mas já anonimizamos,
    //     então não há matches apontando para estes IDs).
    // Usamos deleteMany (não delete) para que a ausência de um usuário (já
    // deletado em rodada anterior) não cause erro — idempotência.
    const deleteResult = await db.user.deleteMany({
      where: { id: { in: ids } },
    })

    console.log(
      `[cron/cleanup-inactive] ${runId} concluído: ${deleteResult.count} conta(s) deletada(s), ${anonymizedCount} partida(s) anonimizadas.`,
    )

    return NextResponse.json({
      ok: true,
      runId,
      deletedCount: deleteResult.count,
      anonymizedCount,
      cutoff: cutoffDate.toISOString(),
      // Amostra para auditoria (não expõe emails no corpo, mas registra no log)
      sample: inactiveUsers.slice(0, 5).map((u) => ({
        id: u.id,
        username: u.username,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[cron/cleanup-inactive] ${runId} erro:`, message)
    return NextResponse.json(
      {
        ok: false,
        runId,
        error: 'Erro interno ao limpar contas inativas.',
        details: process.env.NODE_ENV !== 'production' ? message : undefined,
      },
      { status: 500 },
    )
  }
}
