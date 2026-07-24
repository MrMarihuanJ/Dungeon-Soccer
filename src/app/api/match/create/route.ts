// =====================================================================
// POST /api/match/create - cria nova partida contra amigo
// --------------------------------------------------------------------
// Body: { opponentId: string }
//
// Possíveis causas de erro:
//   - Usuário não autenticado (cookie inválido/expirado)
//   - Tabela Match não existe no banco (precisa rodar SQL de setup)
//   - Colunas do Match faltando no banco (precisa de prisma db push)
//   - Não são amigos
//   - Erro interno do banco
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Não autenticado. Faça login novamente.' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 })
  }

  const opponentId = String(body.opponentId ?? '')
  if (!opponentId) {
    return NextResponse.json({ ok: false, error: 'opponentId obrigatório.' }, { status: 400 })
  }

  // Não pode jogar contra si mesmo
  if (opponentId === session.userId) {
    return NextResponse.json({ ok: false, error: 'Você não pode jogar contra si mesmo.' }, { status: 400 })
  }

  // Verifica se são amigos
  try {
    const friendship = await db.friendship.findFirst({
      where: {
        OR: [
          { userAId: session.userId, userBId: opponentId },
          { userAId: opponentId, userBId: session.userId },
        ],
      },
    })
    if (!friendship) {
      return NextResponse.json({ ok: false, error: 'Você só pode jogar com amigos.' }, { status: 403 })
    }
  } catch (err) {
    console.error('[match/create] friendship check error:', err)
    return NextResponse.json({ ok: false, error: 'Erro ao verificar amizade. Tente novamente.' }, { status: 500 })
  }

  // Cria a partida
  try {
    const match = await db.match.create({
      data: {
        homeUserId: session.userId,
        awayUserId: opponentId,
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

    return NextResponse.json({
      ok: true,
      match: {
        id: match.id,
        status: match.status,
        homeUserId: match.homeUserId,
        awayUserId: match.awayUserId,
      },
    })
  } catch (err) {
    console.error('[match/create] create error:', err)

    // P2025 = record not found (relation)
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') {
        return NextResponse.json({
          ok: false,
          error: 'Erro: colunas do banco desatualizadas. Execute o SQL de setup completo no Neon Console.',
        }, { status: 500 })
      }
      if (err.code === 'P2003') {
        return NextResponse.json({
          ok: false,
          error: 'Erro de chave estrangeira. Execute o SQL de setup completo no Neon Console para criar as constraints.',
        }, { status: 500 })
      }
    }

    // Generic error with message hint
    const message = err instanceof Error ? err.message : String(err)

    // Check for missing table (the table does not exist)
    if (message.includes('does not exist') && message.includes('Match')) {
      return NextResponse.json({
        ok: false,
        error: 'A tabela Match não existe no banco. Execute o SQL de setup completo (sql-setup-complete.sql) no Neon Console para criá-la.',
      }, { status: 500 })
    }

    // Check for missing column errors
    if (message.includes('does not exist') || message.includes('column')) {
      return NextResponse.json({
        ok: false,
        error: 'Banco de dados desatualizado. Execute o SQL de setup completo (sql-setup-complete.sql) no Neon Console.',
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: false,
      error: 'Erro interno ao criar partida. Tente novamente.',
    }, { status: 500 })
  }
}
