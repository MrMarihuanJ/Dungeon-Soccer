'use client'

// =====================================================================
// FreeKickDialog - Diálogo de cobrança de falta e pênalti
// --------------------------------------------------------------------
// Fluxo para FALTA NORMAL:
//   1. Servidor já sorteou o multiplicador e o cobrador — o diálogo
//      recebe essas informações via prop `pendingFreeKick`.
//   2. Exibe o multiplicador (bônus ou penalidade) e o cobrador designado.
//   3. Oferece 3 jogadas de FREE_KICK aleatórias.
//   4. Ao escolher, chama /api/match/free-kick-resolve (sem takerId).
//
// Fluxo para PÊNALTI:
//   1. Servidor retorna a lista de cobradores elegíveis, cada um com um
//      MARCADOR DE BÔNUS ALEATÓRIO (positivo OU negativo, re-rolado a
//      cada pênalti — sem vantagem fixa por jogador).
//   2. Usuário ESCOLHE o cobrador (clica no card do jogador desejado).
//   3. Após escolher, exibe as jogadas de pênalti (samplePenaltyKickActions).
//   4. Ao escolher a jogada, chama /api/match/free-kick-resolve passando
//      o takerId selecionado.
//
// NOTA: Todos os multiplicadores, marcadores e cobradores são gerados NO
// SERVIDOR para evitar manipulação pelo cliente. O cliente apenas exibe.
// =====================================================================

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Target, Shield, Zap, Sparkles, AlertTriangle, Loader2, ArrowRight, Users } from 'lucide-react'
import {
  sampleFreeKickActions,
  samplePenaltyKickActions,
  CATEGORY_META,
  type FootballAction,
} from '@/lib/dnd-actions'
import type { FreeKickMultiplier, FreeKickTaker, PenaltyTakerOption } from '@/lib/free-kick-system'

export interface PendingFreeKickInfo {
  // Flag que diferencia pênalti (escolha do cobrador) de falta normal
  isPenaltyKick?: boolean
  // Presente apenas em FALTA NORMAL: cobrador sorteado + multiplicador
  multiplier?: FreeKickMultiplier
  taker?: FreeKickTaker
  // Presente apenas em PÊNALTI: lista de elegíveis com marcadores de bônus
  eligibleTakers?: PenaltyTakerOption[]
  // Comum
  nonce: string
  favoredPossession: 'HOME' | 'AWAY'
  penaltyType: string
  description: string
}

interface Props {
  open: boolean
  onClose: () => void
  /** Estado pendente vindo do servidor (via /api/match/state) */
  pendingFreeKick: PendingFreeKickInfo | null
  /** Callback quando o jogador escolhe a jogada de cobrança.
   *  Para pênaltis, recebe também o takerId escolhido pelo usuário. */
  onResolve: (actionId: string, takerId?: string) => Promise<void>
  /** Indica se a resolução está em andamento (loading) */
  resolving?: boolean
}

export function FreeKickDialog({
  open,
  onClose,
  pendingFreeKick,
  onResolve,
  resolving = false,
}: Props) {
  const [playActions, setPlayActions] = useState<FootballAction[]>([])
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  // Para pênaltis: qual cobrador o usuário escolheu
  const [selectedTakerId, setSelectedTakerId] = useState<string | null>(null)

  // Sorteia jogadas quando o diálogo abre (ou quando muda de fase em pênalti)
  useEffect(() => {
    if (!open || !pendingFreeKick) return
    // Para pênalti: só sorteia as jogadas DEPOIS que o usuário escolheu o cobrador
    if (pendingFreeKick.isPenaltyKick) {
      if (selectedTakerId) {
        setPlayActions(samplePenaltyKickActions(3))
      } else {
        setPlayActions([]) // limpa enquanto não escolheu cobrador
      }
      setSelectedAction(null)
    } else {
      // Falta normal: sorteia direto
      setPlayActions(sampleFreeKickActions(3))
      setSelectedAction(null)
    }
  }, [open, pendingFreeKick?.nonce, pendingFreeKick?.isPenaltyKick, selectedTakerId])

  const handleSelectTaker = (takerId: string) => {
    if (resolving) return
    setSelectedTakerId(takerId)
  }

  const handleSelectPlay = async (action: FootballAction) => {
    if (resolving || selectedAction) return
    setSelectedAction(action.id)
    try {
      // Para pênaltis, passa o takerId escolhido; para faltas normais, undefined
      const takerId = pendingFreeKick?.isPenaltyKick ? selectedTakerId ?? undefined : undefined
      await onResolve(action.id, takerId)
    } catch (err) {
      console.error('[FreeKickDialog] resolve failed:', err)
      setSelectedAction(null) // permite retry
    }
  }

  if (!pendingFreeKick) return null

  const isPenaltyKick = pendingFreeKick.isPenaltyKick === true
  const meta = isPenaltyKick
    ? { label: 'Pênalti', color: 'from-amber-500 to-amber-700', emoji: '⚪' }
    : CATEGORY_META['FREE_KICK']

  // ===== Renderização do multiplicador/marcador =====
  // Para pênalti: o marcador é exibido DENTRO de cada card de cobrador (porque
  // cada um tem o seu próprio). Para falta normal: exibimos no topo.
  const showTopMultiplier = !isPenaltyKick && pendingFreeKick.multiplier
  const topMultiplier = pendingFreeKick.multiplier
  const topTaker = pendingFreeKick.taker

  const isBonus = topMultiplier?.kind === 'BONUS'
  const isPenalty = topMultiplier?.kind === 'PENALTY'

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !resolving) onClose() }}>
      <DialogContent className={isPenaltyKick ? 'max-w-2xl' : 'max-w-lg'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-teal-400">
            <Target className="h-5 w-5" />
            {isPenaltyKick ? 'Pênalti! Escolha o Cobrador' : 'Cobrança de Falta'}
          </DialogTitle>
          <DialogDescription>
            {pendingFreeKick.description || (isPenaltyKick
              ? 'Falta dentro da área! Escolha quem vai bater o pênalti.'
              : 'Escolha a jogada de cobrança.')}
          </DialogDescription>
        </DialogHeader>

        {/* ===== MODO PÊNALTI: Lista de cobradores elegíveis com marcadores ===== */}
        {isPenaltyKick && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>
                {selectedTakerId
                  ? 'Cobrador escolhido! Agora selecione a jogada de pênalti abaixo.'
                  : 'Cada cobrador recebeu um marcador de bônus aleatório (positivo ou negativo). Escolha sabiamente!'}
              </span>
            </div>

            {!selectedTakerId && pendingFreeKick.eligibleTakers && (
              <div
                className="max-h-[340px] overflow-y-auto pr-1 space-y-2"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}
              >
                {pendingFreeKick.eligibleTakers.map((opt, idx) => {
                  const m = opt.bonusMarker
                  const isMBonus = m.kind === 'BONUS'
                  const isMPenalty = m.kind === 'PENALTY'
                  return (
                    <motion.button
                      key={opt.taker.playerId}
                      type="button"
                      onClick={() => handleSelectTaker(opt.taker.playerId)}
                      disabled={resolving}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      whileHover={!resolving ? { scale: 1.02, y: -2 } : {}}
                      whileTap={!resolving ? { scale: 0.98 } : {}}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                        isMBonus
                          ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20'
                          : isMPenalty
                          ? 'border-red-500/40 bg-red-500/10 hover:bg-red-500/20'
                          : 'border-slate-500/40 bg-slate-500/10 hover:bg-slate-500/20'
                      }`}
                      aria-label={`Escolher ${opt.taker.playerName} como cobrador. Marcador: ${m.label}`}
                    >
                      <Avatar className="h-10 w-10 border border-teal-500">
                        <AvatarFallback className="bg-teal-700 text-xs font-bold text-white">
                          {opt.taker.playerName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-white">{opt.taker.playerName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {opt.taker.position} · Cobrador elegível
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          variant="outline"
                          className={
                            isMBonus
                              ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                              : isMPenalty
                              ? 'border-red-500/60 bg-red-500/15 text-red-300'
                              : 'border-slate-500/60 bg-slate-500/15 text-slate-300'
                          }
                        >
                          {isMBonus ? <Sparkles className="h-3 w-3 mr-1" /> : isMPenalty ? <AlertTriangle className="h-3 w-3 mr-1" /> : null}
                          {m.label}
                        </Badge>
                        <span className="text-[9px] text-muted-foreground">
                          {m.target === 'DICE_BONUS'
                            ? 'no dado'
                            : m.target === 'SUCCESS_CHANCE'
                            ? 'no sucesso'
                            : 'no gol'}
                        </span>
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            )}

            {/* Cobrador selecionado — confirmação visual */}
            {selectedTakerId && pendingFreeKick.eligibleTakers && (
              <Card className="border-amber-700/50 bg-amber-950/30">
                <CardContent className="flex items-center gap-3 p-3">
                  <Avatar className="h-10 w-10 border border-amber-500">
                    <AvatarFallback className="bg-amber-700 text-xs font-bold text-white">
                      {pendingFreeKick.eligibleTakers.find(t => t.taker.playerId === selectedTakerId)?.taker.playerName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-300">
                      {pendingFreeKick.eligibleTakers.find(t => t.taker.playerId === selectedTakerId)?.taker.playerName}
                    </p>
                    <p className="text-xs text-amber-400/70">
                      {pendingFreeKick.eligibleTakers.find(t => t.taker.playerId === selectedTakerId)?.taker.position} · Cobrador escolhido
                    </p>
                  </div>
                  <Badge variant="outline" className="border-amber-600 text-amber-300">
                    {pendingFreeKick.eligibleTakers.find(t => t.taker.playerId === selectedTakerId)?.bonusMarker.label}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSelectedTakerId(null); setSelectedAction(null) }}
                    className="text-xs text-gray-400 hover:text-white"
                    disabled={resolving}
                    aria-label="Trocar cobrador"
                  >
                    Trocar
                  </Button>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}

        {/* ===== MODO FALTA NORMAL: Multiplicador no topo (cobrador já sorteado) ===== */}
        {showTopMultiplier && topMultiplier && topTaker && (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`rounded-xl border p-4 ${
                isBonus
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : isPenalty
                  ? 'border-red-500/40 bg-red-500/10'
                  : 'border-slate-500/40 bg-slate-500/10'
              }`}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    isBonus
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : isPenalty
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-slate-500/20 text-slate-400'
                  }`}
                >
                  {isBonus ? (
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  ) : isPenalty ? (
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Target className="h-5 w-5" aria-hidden="true" />
                  )}
                </div>
                <div className="flex-1">
                  <p
                    className={`text-sm font-bold ${
                      isBonus
                        ? 'text-emerald-300'
                        : isPenalty
                        ? 'text-red-300'
                        : 'text-slate-300'
                    }`}
                  >
                    {topMultiplier.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{topMultiplier.description}</p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    isBonus
                      ? 'border-emerald-500/50 text-emerald-400'
                      : isPenalty
                      ? 'border-red-500/50 text-red-400'
                      : 'border-slate-500/50 text-slate-400'
                  }
                >
                  {topMultiplier.target === 'DICE_BONUS'
                    ? 'no dado'
                    : topMultiplier.target === 'SUCCESS_CHANCE'
                    ? 'no sucesso'
                    : 'no gol'}
                </Badge>
              </div>
            </motion.div>

            {/* ===== Cobrador designado (sorteado automaticamente para falta normal) ===== */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-3 rounded-lg border border-teal-600/30 bg-teal-900/20 p-3"
            >
              <Avatar className="h-10 w-10 border border-teal-500">
                <AvatarFallback className="bg-teal-700 text-xs font-bold text-white">
                  {topTaker.playerName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="text-sm font-bold text-teal-300">{topTaker.playerName}</p>
                <p className="text-[10px] text-teal-400/70">
                  {topTaker.position} · Cobrador designado
                </p>
              </div>
              <Badge variant="secondary" className="bg-teal-700/30 text-teal-300">
                Sorteado
              </Badge>
            </motion.div>
          </>
        )}

        {/* ===== Jogadas de cobrança (ambos os modos) ===== */}
        {playActions.length > 0 && (
          <>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {isPenaltyKick ? 'Escolha a jogada de pênalti:' : 'Escolha a jogada de cobrança:'}
            </p>
            <div className="space-y-2">
              {playActions.map((action, idx) => {
                const isSelected = selectedAction === action.id
                const isDisabled = resolving && !isSelected
                return (
                  <motion.button
                    key={action.id}
                    type="button"
                    onClick={() => handleSelectPlay(action)}
                    disabled={isDisabled}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={!isDisabled ? { scale: 1.02, y: -2 } : {}}
                    whileTap={!isDisabled ? { scale: 0.98 } : {}}
                    className={`flex w-full items-start gap-3 rounded-xl border border-white/10 bg-gradient-to-br ${meta.color} p-3 text-left shadow-lg transition-opacity ${
                      isDisabled ? 'opacity-50' : ''
                    }`}
                    aria-label={`Jogada: ${action.name}`}
                  >
                    <span className="text-2xl drop-shadow">{action.emoji}</span>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-white">{action.name}</h4>
                      <p className="text-xs text-white/80">{action.description}</p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-white/90">
                        <span className="flex items-center gap-1 rounded bg-black/30 px-1.5 py-0.5">
                          <Shield className="h-3 w-3" /> DC {action.dc}
                        </span>
                        <span className="flex items-center gap-1 rounded bg-black/30 px-1.5 py-0.5">
                          <Zap className="h-3 w-3" /> +{action.progress}%
                        </span>
                        {action.goalChance > 0 && (
                          <span className="flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 font-bold text-yellow-200">
                            <Target className="h-3 w-3" /> {Math.round(action.goalChance * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && resolving && (
                      <Loader2 className="h-4 w-4 animate-spin text-white" aria-hidden="true" />
                    )}
                  </motion.button>
                )
              })}
            </div>
          </>
        )}

        <p className="text-[10px] text-muted-foreground/70 text-center">
          🎲 O dado é rolado no servidor para evitar manipulação.
          {isPenaltyKick && ' Cada pênalti gera novos marcadores de bônus — não há vantagem fixa por jogador.'}
        </p>
      </DialogContent>
    </Dialog>
  )
}
