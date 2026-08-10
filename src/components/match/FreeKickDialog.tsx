'use client'

// =====================================================================
// FreeKickDialog - Diálogo de cobrança de falta / pênalti
// --------------------------------------------------------------------
// Fluxo:
//   1. Servidor já sorteou o multiplicador e o cobrador inicial — o
//      diálogo recebe essas informações via prop `pendingFreeKick`.
//   2. Exibe o multiplicador (bônus ou penalidade).
//   3. Para PÊNALTI (Passo 6): o usuário pode escolher um cobrador
//      elegível da própria equipe. A lista de elegíveis vem via prop
//      `eligibleTakers`. A seleção é enviada ao servidor via
//      `onSelectTaker(playerId)`, que chama /api/match/penalty-taker-select.
//      Para FALTA comum: o cobrador sorteado é mantido (sem escolha).
//   4. Oferece 3 jogadas de FREE_KICK (ou SHOOT, em caso de pênalti)
//      aleatórias.
//   5. Ao escolher, chama /api/match/free-kick-resolve (que rola o d20
//      no servidor e aplica o multiplicador).
//
// Passo 4: Para pênaltis, o rótulo da jogada é "Chute na marca do
// pênalti" em vez de "Chute ao Gol".
//
// Passo 9: A aleatoriedade (multiplicador) é gerada no servidor. O
// cliente apenas exibe o que foi sorteado.
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
import { Target, Shield, Zap, Sparkles, AlertTriangle, Loader2, UserCheck, Check } from 'lucide-react'
import {
  sampleFreeKickActions,
  sampleShootActions,
  CATEGORY_META,
  getCategoryLabelForContext,
  PENALTY_KICK_LABEL,
  type FootballAction,
} from '@/lib/dnd-actions'
import type { FreeKickMultiplier, FreeKickTaker } from '@/lib/free-kick-system'

export interface EligibleTaker {
  id: string
  name: string
  position: string
  overall?: number
}

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
  /** Lista de jogadores elegíveis para cobrar pênalti (Passo 6) */
  eligibleTakers?: EligibleTaker[]
  /** Callback quando o usuário seleciona um cobrador de pênalti */
  onSelectTaker?: (playerId: string) => Promise<void>
  /** Indica se a seleção de cobrador está em andamento */
  selectingTaker?: boolean
}

export function FreeKickDialog({
  open,
  onClose,
  pendingFreeKick,
  onResolve,
  resolving = false,
  eligibleTakers = [],
  onSelectTaker,
  selectingTaker = false,
}: Props) {
  const [freeKickActions, setFreeKickActions] = useState<FootballAction[]>([])
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [selectedTakerId, setSelectedTakerId] = useState<string | null>(null)
  const [takerConfirmed, setTakerConfirmed] = useState<boolean>(false)

  // Sorteia jogadas de cobrança quando o diálogo abre
  useEffect(() => {
    if (open && pendingFreeKick) {
      // Para pênalti, oferecer também ações de SHOOT (chutes ao gol)
      // além de FREE_KICK, já que o pênalti é uma finalização direta.
      const isPenalty = pendingFreeKick.penaltyType === 'PENALTY_KICK'
      const actions = isPenalty
        ? [...sampleFreeKickActions(2), ...sampleShootActions(1)]
        : sampleFreeKickActions(3)
      setFreeKickActions(actions)
      setSelectedAction(null)
      // Reset taker selection state
      setSelectedTakerId(pendingFreeKick.taker.playerId)
      setTakerConfirmed(true) // cobrador inicial já está confirmado pelo servidor
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

  const handleSelectTaker = async (takerId: string) => {
    if (selectingTaker || !onSelectTaker) return
    setSelectedTakerId(takerId)
    try {
      await onSelectTaker(takerId)
      setTakerConfirmed(true)
    } catch (err) {
      console.error('[FreeKickDialog] taker select failed:', err)
      // Reverte para o cobrador anterior em caso de erro
      setSelectedTakerId(pendingFreeKick?.taker.playerId ?? null)
      setTakerConfirmed(true)
    }
  }

  const meta = CATEGORY_META['FREE_KICK']
  if (!pendingFreeKick) return null

  const { multiplier, taker } = pendingFreeKick
  const isBonus = multiplier.kind === 'BONUS'
  const isPenalty = multiplier.kind === 'PENALTY'
  const isPenaltyKick = pendingFreeKick.penaltyType === 'PENALTY_KICK'
  const dialogTitle = isPenaltyKick ? 'Pênalti!' : 'Cobrança de Falta'
  const categoryLabel = getCategoryLabelForContext('SHOOT', isPenaltyKick)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !resolving) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-teal-400">
            <Target className="h-5 w-5" />
            {dialogTitle}
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
          {isPenaltyKick && (
            <p className="mt-2 text-[11px] text-amber-300/80">
              Bônus aleatório gerado no servidor — varia a cada cobrança, não cria vantagem permanente.
            </p>
          )}
        </motion.div>

        {/* ===== Seleção de cobrador (apenas para pênalti) ===== */}
        {isPenaltyKick && eligibleTakers.length > 0 && onSelectTaker && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-lg border border-teal-600/30 bg-teal-900/10 p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-teal-400" aria-hidden="true" />
              <p className="text-xs font-medium uppercase tracking-wider text-teal-300">
                Escolha o cobrador do pênalti
              </p>
            </div>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Apenas jogadores ativos em campo podem cobrar. O bônus aleatório é preservado.
            </p>
            <div
              className="max-h-[200px] overflow-y-auto pr-1"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}
            >
              <ul className="space-y-1.5">
                {eligibleTakers.map((candidate) => {
                  const isSelected = selectedTakerId === candidate.id
                  const isCurrent = taker.playerId === candidate.id && takerConfirmed
                  return (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectTaker(candidate.id)}
                        disabled={selectingTaker}
                        className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors disabled:opacity-50 ${
                          isSelected
                            ? 'border-teal-500 bg-teal-900/30'
                            : 'border-slate-700/50 bg-slate-800/40 hover:border-teal-600 hover:bg-teal-900/20'
                        }`}
                        aria-label={`Selecionar ${candidate.name} como cobrador`}
                      >
                        <Avatar className="h-8 w-8 border border-teal-700">
                          <AvatarFallback className="bg-teal-800 text-[10px] font-bold text-white">
                            {candidate.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{candidate.name}</p>
                          <p className="text-[10px] text-slate-400">
                            {candidate.position}
                            {candidate.overall ? ` · OVR ${candidate.overall}` : ''}
                          </p>
                        </div>
                        {isSelected && (
                          <Badge variant="secondary" className="bg-teal-700/40 text-teal-200 text-[10px]">
                            {selectingTaker ? '...' : 'Selecionado'}
                          </Badge>
                        )}
                        {isCurrent && !isSelected && (
                          <Check className="h-4 w-4 text-teal-400" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            {selectingTaker && (
              <p className="mt-2 text-[10px] text-teal-400 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Atualizando cobrador...
              </p>
            )}
          </motion.div>
        )}

        {/* ===== Cobrador designado (display principal) ===== */}
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
              {taker.position} · {isPenaltyKick ? 'Cobrador do pênalti' : 'Cobrador designado'}
            </p>
          </div>
          <Badge variant="secondary" className="bg-teal-700/30 text-teal-300">
            {isPenaltyKick && eligibleTakers.length > 0 && onSelectTaker
              ? (takerConfirmed ? 'Confirmado' : 'Sorteado')
              : 'Sorteado'}
          </Badge>
        </motion.div>

        {/* ===== Jogadas de cobrança ===== */}
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {isPenaltyKick ? `${categoryLabel} — escolha a finalização:` : 'Escolha a jogada de cobrança:'}
        </p>
        <div className="space-y-2">
          {freeKickActions.map((action, idx) => {
            const isSelected = selectedAction === action.id
            const isDisabled = resolving && !isSelected
            return (
              <motion.button
                key={`${action.id}-${idx}`}
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
          {isPenaltyKick && ` ${PENALTY_KICK_LABEL}.`}
        </p>
      </DialogContent>
    </Dialog>
  )
}
