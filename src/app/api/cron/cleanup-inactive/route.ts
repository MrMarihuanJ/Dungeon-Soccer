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
//   - Usuários admin (authenticated via /api/auth/login, não /api/user/login)
//     não têm `lastLoginAt` atualizado por esta rota — mas se ficarem inativos
//     por 180 dias também serão deletados, o que é o comportamento esperado
//     para contas fantasmas.
//   - Cascade deletes em UserTeam, Friendship, FriendRequest, Match (home/away)
//     são automáticos pelo Prisma (onDelete: Cascade no schema).
//
// CONFIGURAÇÃO:
//   - Defina a env var CRON_SECRET no Vercel com um valor aleatório longo.
//   - Configure o cron schedule em vercel.json.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60  // Vercel: até 60s para concluir a limpeza

// ID do usuário bot — jamais deve ser deletado.
const BOT_USER_ID = 'BOT_PLAYER_DUNGEON_SOCER_001'

// Janela de inatividade: 180 dias em milissegundos.
const INACTIVITY_WINDOW_MS = 180 * 24 * 60 * 60 * 1000

/**
 * Verifica o header Authorization: Bearer <token>.
 * O token deve bater com process.env.CRON_SECRET.
 *
 * Em desenvolvimento (NODE_ENV !== 'production') a rota também aceita
 * ser chamada sem token para facilitar testes manuais — em produção o
 * token é OBRIGATÓRIO.
 */
function isAuthorized(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/cleanup-inactive] CRON_SECRET não configurado em produção.')
    return false
  }
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  // Constant-time comparison
  if (token.length !== secret.length) return false
  try {
    // Buffer.from + timingSafeEqual — evita timing attack
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
      { ok: false, error: 'Não autorizado. Configure CRON_SECRET.' },
      { status: 401 },
    )
  }

  const cutoffDate = new Date(Date.now() - INACTIVITY_WINDOW_MS)
  console.log(`[cron/cleanup-inactive] Cutoff: ${cutoffDate.toISOString()}`)

  try {
    // Busca usuários inativos:
    //   - lastLoginAt < cutoff (já logou mas parou há >180 dias)
    //   - OU (lastLoginAt IS NULL AND createdAt < cutoff) — conta criada há
    //     >180 dias mas nunca logou desde então
    // Exclui o bot.
    const inactiveUsers = await db.user.findMany({
      where: {
        id: { not: BOT_USER_ID },
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
      },
    })

    if (inactiveUsers.length === 0) {
      return NextResponse.json({
        ok: true,
        deletedCount: 0,
        message: 'Nenhuma conta inativa encontrada.',
        cutoff: cutoffDate.toISOString(),
      })
    }

    console.log(`[cron/cleanup-inactive] ${inactiveUsers.length} conta(s) a deletar.`)

    // Deleta em lotes para evitar transação longa. Cascade deleta:
    //   - UserTeam
    //   - Friendship (ambos lados)
    //   - FriendRequest (ambos lados)
    //   - Match (home ou away)
    const ids = inactiveUsers.map(u => u.id)
    const deleteResult = await db.user.deleteMany({
      where: { id: { in: ids } },
    })

    console.log(`[cron/cleanup-inactive] ${deleteResult.count} conta(s) deletada(s).`)

    return NextResponse.json({
      ok: true,
      deletedCount: deleteResult.count,
      cutoff: cutoffDate.toISOString(),
      // Não expõe emails/usernames no corpo por privacidade, mas registra no log.
      sample: inactiveUsers.slice(0, 5).map(u => ({
        id: u.id,
        username: u.username,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
    })
  } catch (err: any) {
    console.error('[cron/cleanup-inactive] erro:', err)
    return NextResponse.json(
      {
        ok: false,
        error: 'Erro interno ao limpar contas inativas.',
        details: process.env.NODE_ENV !== 'production' ? String(err?.message || err) : undefined,
      },
      { status: 500 },
    )
  }
}
