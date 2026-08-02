'use client'

// =====================================================================
// FreeKickDialog - Diálogo de cobrança de falta
// --------------------------------------------------------------------
// Fluxo:
//   1. Servidor já sorteou o multiplicador e o cobrador — o diálogo
//      recebe essas informações via prop `pendingFreeKick` (vindo de
//      /api/match/state).
//   2. Exibe o multiplicador (bônus ou penalidade) e o cobrador designado.
//   3. Oferece 3 jogadas de FREE_KICK aleatórias.
//   4. Ao escolher, chama /api/match/free-kick-resolve (que rola o d20
//      no servidor e aplica o multiplicador).
//
// NOTA: O multiplicador e o cobrador são gerados NO SERVIDOR para evitar
// manipulação pelo cliente. O cliente apenas exibe o que foi sorteado.
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
import { Target, Shield, Zap, Sparkles, AlertTriangle, Loader2 } from 'lucide-react'
import { sampleFreeKickActions, CATEGORY_META, type FootballAction } from '@/lib/dnd-actions'
import type { FreeKickMultiplier, FreeKickTaker } from '@/lib/free-kick-system'

export interface PendingFreeKickInfo {
  multiplier: FreeKickMultiplier
  taker: FreeKickTaker
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
  /** Callback quando o jogador escolhe a jogada de cobrança */
  onResolve: (actionId: string) => Promise<void>
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
  const [freeKickActions, setFreeKickActions] = useState<FootballAction[]>([])
  const [selectedAction, setSelectedAction] = useState<string | null>(null)

  // Sorteia 3 jogadas de cobrança quando o diálogo abre
  useEffect(() => {
    if (open && pendingFreeKick) {
      setFreeKickActions(sampleFreeKickActions(3))
      setSelectedAction(null)
    }
  }, [open, pendingFreeKick?.nonce])

  const handleSelectPlay = async (action: FootballAction) => {
    if (resolving || selectedAction) return
    setSelectedAction(action.id)
    try {
      await onResolve(action.id)
    } catch (err) {
      console.error('[FreeKickDialog] resolve failed:', err)
      setSelectedAction(null) // permite retry
    }
  }

  const meta = CATEGORY_META['FREE_KICK']
  if (!pendingFreeKick) return null

  const { multiplier, taker } = pendingFreeKick
  const isBonus = multiplier.kind === 'BONUS'
  const isPenalty = multiplier.kind === 'PENALTY'
  const isPenaltyKick = pendingFreeKick.penaltyType === 'PENALTY_KICK'

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !resolving) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-teal-400">
            <Target className="h-5 w-5" />
            {isPenaltyKick ? 'Pênalti!' : 'Cobrança de Falta'}
          </DialogTitle>
          <DialogDescription>
            {pendingFreeKick.description}
          </DialogDescription>
        </DialogHeader>

        {/* ===== Multiplicador (bônus ou penalidade) ===== */}
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
                {multiplier.label}
              </p>
              <p className="text-xs text-muted-foreground">{multiplier.description}</p>
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
              {multiplier.target === 'DICE_BONUS'
                ? 'no dado'
                : multiplier.target === 'SUCCESS_CHANCE'
                ? 'no sucesso'
                : 'no gol'}
            </Badge>
          </div>
        </motion.div>

        {/* ===== Cobrador designado ===== */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-3 rounded-lg border border-teal-600/30 bg-teal-900/20 p-3"
        >
          <Avatar className="h-10 w-10 border border-teal-500">
            <AvatarFallback className="bg-teal-700 text-xs font-bold text-white">
              {taker.playerName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-sm font-bold text-teal-300">{taker.playerName}</p>
            <p className="text-[10px] text-teal-400/70">
              {taker.position} · Cobrador designado
            </p>
          </div>
          <Badge variant="secondary" className="bg-teal-700/30 text-teal-300">
            Sorteado
          </Badge>
        </motion.div>

        {/* ===== Jogadas de cobrança ===== */}
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Escolha a jogada de cobrança:
        </p>
        <div className="space-y-2">
          {freeKickActions.map((action, idx) => {
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

        <p className="text-[10px] text-muted-foreground/70 text-center">
          🎲 O dado é rolado no servidor para evitar manipulação.
        </p>
      </DialogContent>
    </Dialog>
  )
}
