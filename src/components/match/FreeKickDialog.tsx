'use client'

// =====================================================================
// FreeKickDialog - Diálogo de cobrança de falta
// --------------------------------------------------------------------
// 1. Jogador favorecido escolhe quem vai bater a falta (seleção
//    de jogador em campo). Cada jogador tem um multiplicador
//    aleatório (positivo ou negativo) que afeta o bônus do dado
//    ou a chance de gol.
// 2. 3 opções de jogada para falta aparecem aleatoriamente
// 3. Jogador escolhe a jogada e o dado é rolado (com multiplicador)
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { Target, Shield, Zap, ChevronRight, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { sampleFreeKickActions, CATEGORY_META, type FootballAction } from '@/lib/dnd-actions'
import type { SelectedPlayer } from '@/lib/football/store'
import type { FreeKickMultiplierInfo } from '@/lib/match-engine'

type FKPhase = 'SELECT_PLAYER' | 'SELECT_PLAY'

interface Props {
  open: boolean
  onClose: () => void
  onPlayFreeKick: (kickerId: string, action: FootballAction, multiplier: FreeKickMultiplierInfo | null) => void
  fieldPlayers: SelectedPlayer[]  // jogadores em campo do time favorecido
  possession: 'HOME' | 'AWAY'
  multipliers: FreeKickMultiplierInfo[]  // multiplicadores aleatórios para cada jogador
}

export function FreeKickDialog({
  open,
  onClose,
  onPlayFreeKick,
  fieldPlayers,
  possession,
  multipliers,
}: Props) {
  const [phase, setPhase] = useState<FKPhase>('SELECT_PLAYER')
  const [selectedKicker, setSelectedKicker] = useState<SelectedPlayer | null>(null)
  const [selectedMultiplier, setSelectedMultiplier] = useState<FreeKickMultiplierInfo | null>(null)
  const [freeKickActions, setFreeKickActions] = useState<FootballAction[]>([])

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setPhase('SELECT_PLAYER')
      setSelectedKicker(null)
      setSelectedMultiplier(null)
      setFreeKickActions(sampleFreeKickActions(3))
    }
  }, [open])

  // Find the multiplier for a specific player
  const getMultiplierForPlayer = (playerId: string): FreeKickMultiplierInfo | null => {
    return multipliers.find(m => m.playerId === playerId) || null
  }

  const handleSelectKicker = (player: SelectedPlayer) => {
    setSelectedKicker(player)
    setSelectedMultiplier(getMultiplierForPlayer(player.id))
    setPhase('SELECT_PLAY')
  }

  const handleSelectPlay = (action: FootballAction) => {
    if (selectedKicker) {
      onPlayFreeKick(selectedKicker.id, action, selectedMultiplier)
    }
  }

  const meta = CATEGORY_META['FREE_KICK']

  // Helper to render multiplier badge
  const renderMultiplierBadge = (m: FreeKickMultiplierInfo | null) => {
    if (!m) return null
    const isPositive = m.multiplier > 0
    const isDiceBonus = m.type === 'dice_bonus'

    if (isDiceBonus) {
      const val = Math.round(m.multiplier)
      return (
        <Badge className={`text-[10px] font-bold ${isPositive ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {isPositive ? <ArrowUp className="h-3 w-3 inline" /> : <ArrowDown className="h-3 w-3 inline" />}
          {isPositive ? `+${val}` : `${val}`} dado
        </Badge>
      )
    } else {
      const pct = Math.round(Math.abs(m.multiplier) * 100)
      return (
        <Badge className={`text-[10px] font-bold ${isPositive ? 'bg-amber-600 text-white' : 'bg-red-600 text-white'}`}>
          {isPositive ? <ArrowUp className="h-3 w-3 inline" /> : <ArrowDown className="h-3 w-3 inline" />}
          {isPositive ? `+${pct}%` : `-${pct}%`} gol
        </Badge>
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-teal-400">
            <Target className="h-5 w-5" />
            Cobrança de Falta
          </DialogTitle>
          <DialogDescription>
            {phase === 'SELECT_PLAYER'
              ? 'Escolha quem vai bater a falta. Cada jogador tem um multiplicador aleatório que afeta o resultado!'
              : `${selectedKicker?.name} vai bater! Escolha a jogada de falta.`}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* Phase 1: Select kicker with multiplier info */}
          {phase === 'SELECT_PLAYER' && (
            <motion.div
              key="select-player"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Quem bate a falta? (multiplicadores aleatórios)
              </p>
              <ScrollArea className="max-h-[320px]">
                <ul className="space-y-2">
                  {fieldPlayers.map((player) => {
                    const mult = getMultiplierForPlayer(player.id)
                    return (
                      <motion.li
                        key={player.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectKicker(player)}
                          className="flex w-full items-center gap-3 rounded-lg border border-teal-800/30 bg-gray-800/50 p-3 text-left transition-colors hover:border-teal-500 hover:bg-teal-900/20"
                        >
                          <Avatar className="h-10 w-10 border border-teal-600">
                            <AvatarFallback className="bg-teal-700 text-xs font-bold text-white">
                              {player.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-white">{player.name}</p>
                            <p className="text-xs text-gray-400">
                              {player.position} · {player.team}
                              {player.overall ? ` · OVR ${player.overall}` : ''}
                            </p>
                            {/* Multiplier info */}
                            {mult && (
                              <p className="mt-1 text-xs text-gray-300">
                                {mult.description}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {renderMultiplierBadge(mult)}
                            <ChevronRight className="h-4 w-4 text-teal-400" />
                          </div>
                        </button>
                      </motion.li>
                    )
                  })}
                </ul>
              </ScrollArea>
            </motion.div>
          )}

          {/* Phase 2: Select play */}
          {phase === 'SELECT_PLAY' && selectedKicker && (
            <motion.div
              key="select-play"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-3"
            >
              {/* Selected kicker with multiplier */}
              <div className="flex items-center gap-3 rounded-lg border border-teal-600/30 bg-teal-900/20 p-3">
                <Avatar className="h-8 w-8 border border-teal-500">
                  <AvatarFallback className="bg-teal-700 text-[10px] font-bold text-white">
                    {selectedKicker.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-bold text-teal-300">{selectedKicker.name}</p>
                  <p className="text-[10px] text-teal-400/70">Batedor da falta</p>
                </div>
                {selectedMultiplier && (
                  <div className="flex flex-col items-end gap-1">
                    {renderMultiplierBadge(selectedMultiplier)}
                    <p className="text-[10px] text-gray-300">{selectedMultiplier.description}</p>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setPhase('SELECT_PLAYER'); setSelectedKicker(null); setSelectedMultiplier(null); }}
                  className="ml-auto text-xs text-gray-400 hover:text-white"
                >
                  Trocar
                </Button>
              </div>

              {/* Free kick plays */}
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Escolha a jogada de falta:
              </p>
              <div className="space-y-2">
                {freeKickActions.map((action, idx) => {
                  // Calculate effective goal chance with multiplier
                  let effectiveGoalChance = action.goalChance
                  if (selectedMultiplier && selectedMultiplier.type === 'goal_chance_bonus') {
                    effectiveGoalChance = Math.max(0, Math.min(1, effectiveGoalChance + selectedMultiplier.multiplier))
                  }
                  // Calculate effective skill bonus with multiplier
                  let effectiveSkillBonus = action.skillBonus
                  if (selectedMultiplier && selectedMultiplier.type === 'dice_bonus') {
                    effectiveSkillBonus = effectiveSkillBonus + Math.round(selectedMultiplier.multiplier)
                  }

                  return (
                    <motion.button
                      key={action.id}
                      type="button"
                      onClick={() => handleSelectPlay(action)}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      className={`flex w-full items-start gap-3 rounded-xl border border-white/10 bg-gradient-to-br ${meta.color} p-3 text-left shadow-lg`}
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
                          {/* Show effective skill bonus if different */}
                          {effectiveSkillBonus !== action.skillBonus && (
                            <span className="flex items-center gap-1 rounded bg-black/30 px-1.5 py-0.5 font-bold text-emerald-200">
                              <Shield className="h-3 w-3" /> Bônus: +{effectiveSkillBonus}
                            </span>
                          )}
                          {/* Show effective goal chance */}
                          {action.goalChance > 0 && (
                            <span className="flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 font-bold text-yellow-200">
                              <Target className="h-3 w-3" /> {Math.round(effectiveGoalChance * 100)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
