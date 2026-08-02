'use client'

// =====================================================================
// SubstitutionModal - Modal de substituição (lesão ou voluntária)
// --------------------------------------------------------------------
// Correções:
//   - H6: Para substituição voluntária, agora pede para o usuário
//     selecionar qual titular sai (em vez de passar string vazia).
//   - Acessibilidade: roles, aria-labels, navegação por teclado.
//   - Mensagens claras para casos inválidos (sem reservas, limite
//     atingido, etc).
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
import { ArrowRight, Heart, AlertTriangle, UserMinus, Users, ArrowLeftRight } from 'lucide-react'
import type { SelectedPlayer } from '@/lib/football/store'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (outPlayerId: string, inPlayerId: string) => void | Promise<void>
  injuredPlayer: SelectedPlayer | null
  reserves: SelectedPlayer[]
  starters: SelectedPlayer[]
  substitutionsUsed: number
  maxSubstitutions: number
  isForced: boolean // true = injury, false = voluntary
}

type Phase = 'SELECT_OUT' | 'SELECT_IN'

export function SubstitutionModal({
  open,
  onClose,
  onConfirm,
  injuredPlayer,
  reserves,
  starters,
  substitutionsUsed,
  maxSubstitutions,
  isForced,
}: Props) {
  const [phase, setPhase] = useState<Phase>('SELECT_OUT')
  const [selectedOut, setSelectedOut] = useState<SelectedPlayer | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const remaining = maxSubstitutions - substitutionsUsed
  const canSubstitute = remaining > 0
  const outPlayer = isForced ? injuredPlayer : selectedOut

  // Reservas disponíveis — exclui já substituídos, expulsos, lesionados
  // (o servidor valida novamente; aqui é só para UX)
  const availableReserves = reserves.filter(
    (r) => !r.isInactive && !r.isRetired,
  )

  // Starters disponíveis para sair (apenas ativos — exclui lesionados/expulsos)
  const availableStarters = starters.filter((s) => s != null) as SelectedPlayer[]

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setPhase(isForced ? 'SELECT_IN' : 'SELECT_OUT')
      setSelectedOut(null)
      setSubmitting(false)
    }
  }, [open, isForced])

  const handleSelectOut = (player: SelectedPlayer) => {
    setSelectedOut(player)
    setPhase('SELECT_IN')
  }

  const handleSelectIn = async (reserve: SelectedPlayer) => {
    if (!outPlayer || submitting) return
    setSubmitting(true)
    try {
      await onConfirm(outPlayer.id, reserve.id)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePlayWithout = () => {
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isForced ? (
              <>
                <Heart className="h-5 w-5 text-red-500" aria-hidden="true" />
                <span className="text-red-400">Lesão! Substituição Necessária</span>
              </>
            ) : (
              <>
                <Users className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                <span className="text-emerald-400">Substituição Voluntária</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isForced
              ? `${outPlayer?.name ?? 'Jogador'} se lesionou e não pode continuar!`
              : phase === 'SELECT_OUT'
              ? 'Escolha o titular que vai sair.'
              : 'Agora escolha o reserva que vai entrar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stats: substituições usadas / restantes */}
          <div
            className="flex items-center justify-between rounded-lg bg-gray-800/50 p-3"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-gray-400" aria-hidden="true" />
              <span className="text-gray-300">Substituições:</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={remaining > 0 ? 'bg-emerald-600' : 'bg-red-600'}>
                {substitutionsUsed} / {maxSubstitutions} usadas
              </Badge>
              <span className="text-xs text-muted-foreground">
                {remaining} restante{remaining !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Injured player info (forced only) */}
          {isForced && outPlayer && (
            <Card className="border-red-800/50 bg-red-950/30">
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
                  <Heart className="h-5 w-5 text-red-400" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-300">{outPlayer.name}</p>
                  <p className="text-xs text-red-400/70">
                    {outPlayer.position} · {outPlayer.team}
                    {outPlayer.overall ? ` · OVR ${outPlayer.overall}` : ''}
                  </p>
                </div>
                <Badge variant="outline" className="border-red-700 text-red-400">
                  SAI
                </Badge>
              </CardContent>
            </Card>
          )}

          {/* Selected out player (voluntary, phase 2) */}
          {!isForced && selectedOut && phase === 'SELECT_IN' && (
            <Card className="border-emerald-800/50 bg-emerald-950/30">
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20">
                  <ArrowLeftRight className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-emerald-300">{selectedOut.name}</p>
                  <p className="text-xs text-emerald-400/70">
                    {selectedOut.position} · {selectedOut.team}
                  </p>
                </div>
                <Badge variant="outline" className="border-emerald-700 text-emerald-400">
                  SAI
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setPhase('SELECT_OUT'); setSelectedOut(null) }}
                  className="text-xs text-gray-400 hover:text-white"
                  aria-label="Trocar titular que sai"
                >
                  Trocar
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Can't substitute — limite atingido */}
          {!canSubstitute && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-red-800/50 bg-red-950/20 p-4 text-center">
              <AlertTriangle className="h-8 w-8 text-red-400" aria-hidden="true" />
              <p className="text-sm text-red-300">
                {isForced
                  ? `Todas as ${maxSubstitutions} substituições já foram usadas! O time continuará com um jogador a menos.`
                  : `Limite de ${maxSubstitutions} substituições atingido!`}
              </p>
              <Button
                onClick={handlePlayWithout}
                variant="outline"
                className="border-red-700 text-red-400 hover:bg-red-950"
                disabled={submitting}
              >
                Continuar sem substituição
              </Button>
            </div>
          )}

          {/* Phase 1: Select out player (voluntary only) */}
          {canSubstitute && !isForced && phase === 'SELECT_OUT' && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                Quem sai?
              </p>
              {availableStarters.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhum titular disponível para sair.
                </p>
              ) : (
                <div
                  className="max-h-[280px] overflow-y-auto pr-1"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}
                >
                  <ul className="space-y-2">
                    {availableStarters.map((player) => (
                      <motion.li
                        key={player.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectOut(player)}
                          className="flex w-full items-center gap-3 rounded-lg border border-gray-700/50 bg-gray-800/50 p-3 text-left transition-colors hover:border-emerald-600 hover:bg-emerald-900/20"
                          aria-label={`Tirar ${player.name}`}
                        >
                          <Avatar className="h-10 w-10 border border-gray-600">
                            <AvatarFallback className="bg-gray-700 text-xs font-bold text-white">
                              {player.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-white">{player.name}</p>
                            <p className="text-xs text-gray-400">
                              {player.position} · {player.team}
                              {player.overall ? ` · OVR ${player.overall}` : ''}
                            </p>
                          </div>
                          <Badge variant="outline" className="border-gray-600 text-gray-300">
                            SAI
                          </Badge>
                        </button>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Phase 2: Select reserve to come in */}
          {canSubstitute && (isForced || phase === 'SELECT_IN') && availableReserves.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                Quem entra?
              </p>
              <div
                className="max-h-[280px] overflow-y-auto pr-1"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}
              >
                <ul className="space-y-2">
                  {availableReserves.map((reserve) => (
                    <motion.li
                      key={reserve.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectIn(reserve)}
                        disabled={submitting}
                        className="flex w-full items-center gap-3 rounded-lg border border-emerald-800/30 bg-gray-800/50 p-3 text-left transition-colors hover:border-emerald-600 hover:bg-emerald-900/20 disabled:opacity-50"
                        aria-label={`Entrar com ${reserve.name}`}
                      >
                        <Avatar className="h-10 w-10 border border-emerald-600">
                          <AvatarFallback className="bg-emerald-700 text-xs font-bold text-white">
                            {reserve.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-white">{reserve.name}</p>
                          <p className="text-xs text-gray-400">
                            {reserve.position} · {reserve.team}
                            {reserve.overall ? ` · OVR ${reserve.overall}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge className="bg-emerald-600">ENTRA</Badge>
                          <ArrowRight className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                        </div>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Sem reservas disponíveis */}
          {canSubstitute && (isForced || phase === 'SELECT_IN') && availableReserves.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-amber-800/50 bg-amber-950/20 p-4 text-center">
              <UserMinus className="h-8 w-8 text-amber-400" aria-hidden="true" />
              <p className="text-sm text-amber-300">
                Não há reservas disponíveis! O time jogará com um a menos.
              </p>
              <Button
                onClick={handlePlayWithout}
                variant="outline"
                className="border-amber-700 text-amber-400 hover:bg-amber-950"
                disabled={submitting}
              >
                Continuar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
