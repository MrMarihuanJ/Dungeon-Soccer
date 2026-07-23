'use client'

// =====================================================================
// FreeKickDialog - Diálogo de cobrança de falta
// --------------------------------------------------------------------
// 1. Jogador favorecido escolhe quem vai bater a falta (seleção
//    de jogador em campo)
// 2. 3 opções de jogada para falta aparecem aleatoriamente
// 3. Jogador escolhe a jogada e o dado é rolado
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
import { Target, Shield, Zap, ChevronRight } from 'lucide-react'
import { sampleFreeKickActions, CATEGORY_META, type FootballAction } from '@/lib/dnd-actions'
import type { SelectedPlayer } from '@/lib/football/store'
import type { PlayerPenaltyMultiplier } from '@/lib/match-engine'

type FKPhase = 'SELECT_PLAYER' | 'SELECT_PLAY'

interface Props {
  open: boolean
  onClose: () => void
  onPlayFreeKick: (kickerId: string, action: FootballAction) => void
  fieldPlayers: SelectedPlayer[]  // jogadores em campo do time favorecido
  possession: 'HOME' | 'AWAY'
  isPenaltyKick?: boolean  // NEW: true when this is a penalty kick, not a regular free kick
  penaltyMultipliers?: PlayerPenaltyMultiplier[]  // NEW: player penalty multipliers
}

export function FreeKickDialog({
  open,
  onClose,
  onPlayFreeKick,
  fieldPlayers,
  possession,
  isPenaltyKick = false,
  penaltyMultipliers = [],
}: Props) {
  const [phase, setPhase] = useState<FKPhase>('SELECT_PLAYER')
  const [selectedKicker, setSelectedKicker] = useState<SelectedPlayer | null>(null)
  const [freeKickActions, setFreeKickActions] = useState<FootballAction[]>([])

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setPhase('SELECT_PLAYER')
      setSelectedKicker(null)
      setFreeKickActions(sampleFreeKickActions(3))
    }
  }, [open])

  const handleSelectKicker = (player: SelectedPlayer) => {
    setSelectedKicker(player)
    setPhase('SELECT_PLAY')
  }

  const handleSelectPlay = (action: FootballAction) => {
    if (selectedKicker) {
      onPlayFreeKick(selectedKicker.id, action)
    }
  }

  // Get multiplier for a player
  const getMultiplier = (playerId: string): number | null => {
    if (!isPenaltyKick) return null
    const m = penaltyMultipliers.find(pm => pm.playerId === playerId)
    return m ? m.multiplier : null
  }

  const meta = CATEGORY_META['FREE_KICK']

  // Color scheme: penalty kick uses red accent, regular free kick uses teal
  const accentColor = isPenaltyKick ? 'red' : 'teal'
  const borderColor = isPenaltyKick ? 'border-red-800/30' : 'border-teal-800/30'
  const hoverBorderColor = isPenaltyKick ? 'hover:border-red-500' : 'hover:border-teal-500'
  const hoverBgColor = isPenaltyKick ? 'hover:bg-red-900/20' : 'hover:bg-teal-900/20'
  const avatarBorderColor = isPenaltyKick ? 'border-red-600' : 'border-teal-600'
  const avatarBgColor = isPenaltyKick ? 'bg-red-700' : 'bg-teal-700'
  const selectedBorderColor = isPenaltyKick ? 'border-red-600/30' : 'border-teal-600/30'
  const selectedBgColor = isPenaltyKick ? 'bg-red-900/20' : 'bg-teal-900/20'
  const avatarSmallBorderColor = isPenaltyKick ? 'border-red-500' : 'border-teal-500'
  const avatarSmallBgColor = isPenaltyKick ? 'bg-red-700' : 'bg-teal-700'
  const nameColor = isPenaltyKick ? 'text-red-300' : 'text-teal-300'
  const kickerLabel = isPenaltyKick ? 'text-red-400/70' : 'text-teal-400/70'
  const titleColor = isPenaltyKick ? 'text-red-400' : 'text-teal-400'

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${titleColor}`}>
            {isPenaltyKick ? (
              <>
                <Shield className="h-5 w-5" />
                ⚽ PÊNALTI!
              </>
            ) : (
              <>
                <Target className="h-5 w-5" />
                Cobrança de Falta
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {phase === 'SELECT_PLAYER'
              ? isPenaltyKick
                ? 'Escolha quem vai bater o pênalti! O multiplicador de cada jogador afeta a chance de gol.'
                : 'Escolha quem vai bater a falta entre seus jogadores em campo.'
              : isPenaltyKick
                ? `${selectedKicker?.name} vai bater o pênalti! Escolha a jogada.`
                : `${selectedKicker?.name} vai bater! Escolha a jogada de falta.`}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* Phase 1: Select kicker */}
          {phase === 'SELECT_PLAYER' && (
            <motion.div
              key="select-player"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                {isPenaltyKick ? 'Quem bate o pênalti?' : 'Quem bate a falta?'}
              </p>
              <div className="max-h-[320px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}>
                <ul className="space-y-2">
                  {fieldPlayers.map((player) => {
                    const multiplier = getMultiplier(player.id)
                    return (
                      <motion.li
                        key={player.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectKicker(player)}
                          className={`flex w-full items-center gap-3 rounded-lg border ${borderColor} bg-gray-800/50 p-3 text-left transition-colors ${hoverBorderColor} ${hoverBgColor}`}
                        >
                          <Avatar className={`h-10 w-10 ${avatarBorderColor}`}>
                            <AvatarFallback className={`${avatarBgColor} text-xs font-bold text-white`}>
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
                          {/* Penalty multiplier badge */}
                          {isPenaltyKick && multiplier !== null && (
                            <Badge className={`bg-red-900/50 text-red-300 border border-red-700/50 text-xs`}>
                              <Shield className="h-3 w-3 mr-1" />
                              ×{multiplier.toFixed(1)}
                            </Badge>
                          )}
                          <ChevronRight className={`h-4 w-4 ${isPenaltyKick ? 'text-red-400' : 'text-teal-400'}`} />
                        </button>
                      </motion.li>
                    )
                  })}
                </ul>
              </div>
            </motion.div>
          )}

          {/* Phase 2: Select play */}
          {phase === 'SELECT_PLAY' && selectedKicker && (
            <motion.div
              key="select-play"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-3"
            >
              {/* Selected kicker */}
              <div className={`flex items-center gap-3 rounded-lg border ${selectedBorderColor} ${selectedBgColor} p-3`}>
                <Avatar className={`h-8 w-8 ${avatarSmallBorderColor}`}>
                  <AvatarFallback className={`${avatarSmallBgColor} text-[10px] font-bold text-white`}>
                    {selectedKicker.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className={`text-sm font-bold ${nameColor}`}>{selectedKicker.name}</p>
                  <p className={`text-[10px] ${kickerLabel}`}>
                    {isPenaltyKick ? 'Batedor do pênalti' : 'Batedor da falta'}
                  </p>
                </div>
                {isPenaltyKick && (
                  <Badge className={`bg-red-900/50 text-red-300 border border-red-700/50 text-xs ml-2`}>
                    <Shield className="h-3 w-3 mr-1" />
                    ×{getMultiplier(selectedKicker.id)?.toFixed(1) ?? '1.0'}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setPhase('SELECT_PLAYER'); setSelectedKicker(null); }}
                  className="ml-auto text-xs text-gray-400 hover:text-white"
                >
                  Trocar
                </Button>
              </div>

              {/* Free kick plays */}
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                {isPenaltyKick ? 'Escolha a jogada de pênalti:' : 'Escolha a jogada de falta:'}
              </p>
              <div className="space-y-2">
                {freeKickActions.map((action, idx) => {
                  // For penalty kicks, show effective goal chance with multiplier
                  const kickerMultiplier = getMultiplier(selectedKicker.id) ?? 1.0
                  const effectiveGoalChance = isPenaltyKick
                    ? Math.min(1.0, action.goalChance * kickerMultiplier)
                    : action.goalChance

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
                      className={`flex w-full items-start gap-3 rounded-xl border border-white/10 bg-gradient-to-br ${isPenaltyKick ? 'from-red-500 to-red-700' : meta.color} p-3 text-left shadow-lg`}
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
                          {effectiveGoalChance > 0 && (
                            <span className="flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 font-bold text-yellow-200">
                              <Target className="h-3 w-3" /> {Math.round(effectiveGoalChance * 100)}%
                              {isPenaltyKick && kickerMultiplier !== 1.0 && (
                                <span className="text-[8px] text-yellow-400/70 ml-0.5">(×{kickerMultiplier.toFixed(1)})</span>
                              )}
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
