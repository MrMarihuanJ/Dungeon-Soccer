// =====================================================================
// POST /api/match/join - oponente entra na partida via inviteCode
// --------------------------------------------------------------------
// Body: { inviteCode: string }
// O oponente aceita o convite, sua awayUserId é registrada,
// e o status muda de WAITING para COIN_FLIP.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'

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

  const inviteCode = String(body.inviteCode ?? '').toUpperCase().trim()
  if (!inviteCode || inviteCode.length < 4) {
    return NextResponse.json({ ok: false, error: 'inviteCode obrigatório (mínimo 4 caracteres).' }, { status: 400 })
  }

  await ensureDbSync()

  // Busca a partida pelo inviteCode
  let match: any
  try {
    match = await db.match.findFirst({
      where: { inviteCode },
      include: {
        homeUser: { select: { id: true, username: true, displayName: true, xp: true } },
      },
    })
  } catch (err: any) {
    // Se a coluna inviteCode ainda não existe, tenta criar
    if (err?.message?.includes('inviteCode') || err?.message?.includes('does not exist')) {
      // FIX: Neon PostgreSQL doesn't allow multiple statements in prepared statements.
      // Split into two separate calls.
      await db.$executeRawUnsafe(`ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "inviteCode" TEXT`)
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Match_inviteCode_key" ON "Match"("inviteCode")`)
      match = await db.match.findFirst({
        where: { inviteCode },
        include: {
          homeUser: { select: { id: true, username: true, displayName: true, xp: true } },
        },
      })
    } else {
      console.error('[match/join] find error:', err)
      return NextResponse.json({ ok: false, error: 'Erro ao buscar partida.' }, { status: 500 })
    }
  }

  if (!match) {
    return NextResponse.json({ ok: false, error: 'Convite não encontrado. Verifique o código.' }, { status: 404 })
  }

  // Validações
  if (match.status !== 'WAITING') {
    return NextResponse.json({
      ok: false,
      error: match.status === 'COIN_FLIP' || match.status === 'IN_PROGRESS'
        ? 'Esta partida já começou. O outro jogador já entrou.'
        : match.status === 'FINISHED'
        ? 'Esta partida já terminou.'
        : 'Esta partida não está disponível para entrada.',
    }, { status: 400 })
  }

  // Não pode entrar na própria partida
  if (match.homeUserId === session.userId) {
    return NextResponse.json({ ok: false, error: 'Você não pode entrar na partida que você criou. Espere o outro jogador.' }, { status: 400 })
  }

  // Verifica se já tem oponente (awayUserId is not null)
  if (match.awayUserId !== null && match.awayUserId !== session.userId) {
    return NextResponse.json({ ok: false, error: 'Outro jogador já entrou nesta partida.' }, { status: 400 })
  }

  // Atualiza: registra o oponente e muda status para COIN_FLIP
  try {
    const updatedMatch = await db.match.update({
      where: { id: match.id },
      data: {
        awayUserId: session.userId,
        status: 'COIN_FLIP',
      },
      include: {
        homeUser: { select: { id: true, username: true, displayName: true, wins: true, losses: true, draws: true, xp: true } },
        awayUser: { select: { id: true, username: true, displayName: true, wins: true, losses: true, draws: true, xp: true } },
      },
    })

    return NextResponse.json({
      ok: true,
      match: {
        id: updatedMatch.id,
        status: updatedMatch.status,
        homeUserId: updatedMatch.homeUserId,
        awayUserId: updatedMatch.awayUserId,
        gameMode: updatedMatch.gameMode,
        inviteCode: updatedMatch.inviteCode,
        homeUser: updatedMatch.homeUser,
        awayUser: updatedMatch.awayUser,
      },
    })
  } catch (err: any) {
    console.error('[match/join] update error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: 'Erro ao entrar na partida.', detail: msg.slice(0, 300) }, { status: 500 })
  }
}
