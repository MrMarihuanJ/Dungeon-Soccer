// =====================================================================
// POST /api/match/defensive-play - processa uma jogada defensiva
// --------------------------------------------------------------------
// Body:
//   { matchId, result: DefensivePlayResult }
//
// Este endpoint é chamado quando o DEFENSOR (time sem posse) executa
// uma jogada defensiva durante o turno do oponente. Ele persiste no
// banco os efeitos da jogada:
//
//   - Se result.ballStolen === true:
//       * currentPossession muda para o time do defensor
//       * turnStartedAt é atualizado (novo turno)
//
//   - Se result.success && result.progressReduction > 0:
//       * Reduz o progresso do time que estava com a posse
//
// Regras de validação:
//   - Só o defensor (time SEM posse) pode chamar este endpoint
//   - A partida deve estar IN_PROGRESS
//   - Para partidas offline, o home user pode chamar (em nome do bot,
//     mas na prática o bot não chama — só o usuário defensor chama)
//
// CORREÇÃO DO BUG: ao roubar a bola, currentPossession é setado para o
// time do DEFENSOR (não do oponente). Assim, a próxima jogada processada
// por applyActionToState capturará possession = defensor e creditará
// os pontos corretamente ao defensor.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/user-auth'
import { db } from '@/lib/db'
import { ensureDbSync } from '@/lib/db-sync'
import type { DefensivePlayResult } from '@/lib/match-engine'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = getUserFromRequest(req)
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const matchId = String(body.matchId ?? '')
  const result = body.result as DefensivePlayResult | undefined

  if (!matchId || !result) {
    return NextResponse.json({ ok: false, error: 'matchId e result obrigatórios.' }, { status: 400 })
  }

  try {
    await ensureDbSync()
  } catch (syncErr) {
    console.error('[match/defensive-play] DB sync falhou (não fatal):', syncErr)
  }

  const match = await db.match.findUnique({ where: { id: matchId } })
  if (!match) return NextResponse.json({ ok: false, error: 'Partida não encontrada.' }, { status: 404 })
  if (match.homeUserId !== session.userId && (match.awayUserId !== null && match.awayUserId !== session.userId)) {
    return NextResponse.json({ ok: false, error: 'Sem acesso.' }, { status: 403 })
  }
  if (match.status !== 'IN_PROGRESS') {
    return NextResponse.json({ ok: false, error: 'Partida não está em andamento.' }, { status: 400 })
  }

  // Determinar o lado do defensor (usuário que chamou)
  const isHome = match.homeUserId === session.userId
  const defenderSide: 'HOME' | 'AWAY' = isHome ? 'HOME' : 'AWAY'
  const attackerSide: 'HOME' | 'AWAY' = isHome ? 'AWAY' : 'HOME'

  // Validar: o usuário chamador NÃO deve ter a posse (é o defensor)
  // O DefensivePlayDialog só é exibido durante o OPPONENT_TURN do usuário,
  // então o usuário só chama este endpoint quando é o defensor.
  // Rejeitamos sempre se o usuário tiver a posse — isso previne bugs
  // onde o usuário acidentalmente rouba a bola de si mesmo.
  const currentPossession = (match.currentPossession as 'HOME' | 'AWAY') || 'HOME'
  if (currentPossession === defenderSide) {
    return NextResponse.json({
      ok: false,
      error: 'Você não pode defender quando tem a posse de bola.',
      currentPossession,
      defenderSide,
    }, { status: 400 })
  }

  // ===== Aplicar efeitos da jogada defensiva =====
  const updateData: any = {
    turnStartedAt: new Date(),
  }

  // 1. Se roubou a bola: posse muda para o defensor
  if (result.ballStolen) {
    updateData.currentPossession = defenderSide
  }

  // 2. Se teve redução de progresso: reduz do atacante
  if (result.success && result.progressReduction > 0) {
    if (attackerSide === 'HOME') {
      const currentHomeProgress = match.homeProgress ?? 0
      const reduction = Math.round(currentHomeProgress * (result.progressReduction / 100))
      updateData.homeProgress = Math.max(0, currentHomeProgress - reduction)
    } else {
      const currentAwayProgress = match.awayProgress ?? 0
      const reduction = Math.round(currentAwayProgress * (result.progressReduction / 100))
      updateData.awayProgress = Math.max(0, currentAwayProgress - reduction)
    }
  }

  // 3. Persistir mudanças no banco
  try {
    await db.match.update({ where: { id: matchId }, data: updateData })
  } catch (err) {
    console.error('[match/defensive-play] update error:', err)
    return NextResponse.json({ ok: false, error: 'Erro ao salvar jogada defensiva.' }, { status: 500 })
  }

  // 4. Retornar o novo estado
  return NextResponse.json({
    ok: true,
    result,
    newState: {
      currentPossession: updateData.currentPossession ?? currentPossession,
      homeProgress: updateData.homeProgress ?? match.homeProgress,
      awayProgress: updateData.awayProgress ?? match.awayProgress,
      ballStolen: result.ballStolen,
      progressReduction: result.progressReduction,
    },
  })
}
