'use client'

// =====================================================================
// FreeKickDialog - Diálogo de cobrança de falta
// --------------------------------------------------------------------
// 1. Jogador favorecido escolhe quem vai bater a falta (seleção
//    de jogador em campo). Cada jogador tem um multiplicador aleatório
//    (positivo ou negativo) que influencia o bônus no dado e/ou
//    a chance de gol.
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
import { Target, Shield, Zap, ChevronRight, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { sampleFreeKickActions, CATEGORY_META, type FootballAction } from '@/lib/dnd-actions'
import { type FreeKickMultiplier, generateFreeKickMultipliers } from '@/lib/match-engine'
import type { SelectedPlayer } from '@/lib/football/store'

type FKPhase = 'SELECT_PLAYER' | 'SELECT_PLAY'

interface Props {
  open: boolean
  onClose: () => void
  onPlayFreeKick: (kickerId: string, action: FootballAction, multiplier: FreeKickMultiplier) => void
  fieldPlayers: SelectedPlayer[]  // jogadores em campo do time favorecido
  possession: 'HOME' | 'AWAY'
}

export function FreeKickDialog({
  open,
  onClose,
  onPlayFreeKick,
  fieldPlayers,
  possession,
}: Props) {
  const [phase, setPhase] = useState<FKPhase>('SELECT_PLAYER')
  const [selectedKicker, setSelectedKicker] = useState<SelectedPlayer | null>(null)
  const [selectedMultiplier, setSelectedMultiplier] = useState<FreeKickMultiplier | null>(null)
  const [freeKickActions, setFreeKickActions] = useState<FootballAction[]>([])
  const [multipliers, setMultipliers] = useState<FreeKickMultiplier[]>([])

  // Reset when dialog opens — generate new random multipliers each time
  useEffect(() => {
    if (open) {
      setPhase('SELECT_PLAYER')
      setSelectedKicker(null)
      setSelectedMultiplier(null)
      setFreeKickActions(sampleFreeKickActions(3))
      // Gerar multiplicadores aleatórios para todos os jogadores em campo
      const generated = generateFreeKickMultipliers(
        fieldPlayers.map(p => ({
          id: p.id,
          name: p.name,
          position: p.position,
          overall: p.overall,
        }))
      )
      setMultipliers(generated)
    }
  }, [open, fieldPlayers])

  const handleSelectKicker = (player: SelectedPlayer, multiplier: FreeKickMultiplier) => {
    setSelectedKicker(player)
    setSelectedMultiplier(multiplier)
    setPhase('SELECT_PLAY')
  }

  const handleSelectPlay = (action: FootballAction) => {
    if (selectedKicker && selectedMultiplier) {
      onPlayFreeKick(selectedKicker.id, action, selectedMultiplier)
    }
  }

  // Helper para encontrar o multiplicador de um jogador
  const getMultiplierForPlayer = (playerId: string): FreeKickMultiplier | undefined => {
    return multipliers.find(m => m.playerId === playerId)
  }

  // Helper para cor do badge de multiplicador
  const getMultiplierBadgeColor = (m: FreeKickMultiplier) => {
    const totalEffect = m.diceBonus + m.goalChanceBonus * 10 // rough normalized comparison
    if (totalEffect > 2) return 'bg-emerald-600 text-white'  // Bônus forte
    if (totalEffect > 0) return 'bg-teal-600 text-white'     // Bônus moderado
    if (totalEffect === 0) return 'bg-gray-600 text-gray-300' // Neutro
    if (totalEffect > -2) return 'bg-orange-600 text-white'   // Malus moderado
    return 'bg-red-600 text-white'                             // Malus forte
  }

  // Helper para ícone do multiplicador
  const getMultiplierIcon = (m: FreeKickMultiplier) => {
    if (m.diceBonus > 0 || m.goalChanceBonus > 0) return <ArrowUp className="h-3 w-3" />
    if (m.diceBonus < 0 || m.goalChanceBonus < 0) return <ArrowDown className="h-3 w-3" />
    return <Minus className="h-3 w-3" />
  }

  const meta = CATEGORY_META['FREE_KICK']

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
              ? 'Escolha quem vai bater a falta entre seus jogadores em campo. Cada jogador tem um multiplicador de bônus/malus!'
              : `${selectedKicker?.name} vai bater! Multiplicador: ${selectedMultiplier?.description}. Escolha a jogada.`}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* Phase 1: Select kicker — mostra multiplicadores */}
          {phase === 'SELECT_PLAYER' && (
            <motion.div
              key="select-player"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3"
            >
              {/* Info sobre multiplicadores */}
              <div className="rounded-lg border border-teal-800/30 bg-teal-950/20 p-3 text-xs text-teal-300">
                <p className="font-semibold mb-1">🎲 Sistema de Multiplicadores</p>
                <p className="text-teal-400/80">
                  Cada jogador recebe um multiplicador aleatório que influencia o bônus no lançamento do dado
                  e/ou a chance de gol. Jogadores com <span className="text-emerald-400 font-bold">bônus positivo</span> têm
                  maior chance de marcar; jogadores com <span className="text-red-400 font-bold">multiplicador negativo</span> têm
                  suas chances reduzidas. Escolha estrategicamente!
                </p>
              </div>

              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Quem bate a falta? (veja os multiplicadores abaixo)
              </p>
              <div className="max-h-[320px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}>
                <ul className="space-y-2">
                  {fieldPlayers.map((player) => {
                    const multiplier = getMultiplierForPlayer(player.id)
                    if (!multiplier) return null

                    return (
                      <motion.li
                        key={player.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectKicker(player, multiplier)}
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
                            {/* ===== Exibição do multiplicador ===== */}
                            <div className="mt-1 flex items-center gap-1.5">
                              <Badge className={`text-[10px] px-1.5 py-0.5 ${getMultiplierBadgeColor(multiplier)}`}>
                                {getMultiplierIcon(multiplier)}
                                {multiplier.diceBonus !== 0 && (
                                  <span className="ml-0.5">
                                    Dado {multiplier.diceBonus > 0 ? '+' : ''}{multiplier.diceBonus}
                                  </span>
                                )}
                                {multiplier.goalChanceBonus !== 0 && (
                                  <span className="ml-0.5">
                                    Gol {multiplier.goalChanceBonus > 0 ? '+' : ''}{Math.round(multiplier.goalChanceBonus * 100)}%
                                  </span>
                                )}
                                {multiplier.diceBonus === 0 && multiplier.goalChanceBonus === 0 && (
                                  <span className="ml-0.5">Neutro</span>
                                )}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-0.5">{multiplier.description}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-teal-400" />
                        </button>
                      </motion.li>
                    )
                  })}
                </ul>
              </div>
            </motion.div>
          )}

          {/* Phase 2: Select play — mostra multiplicador do batedor escolhido */}
          {phase === 'SELECT_PLAY' && selectedKicker && selectedMultiplier && (
            <motion.div
              key="select-play"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-3"
            >
              {/* Selected kicker com multiplicador */}
              <div className="flex items-center gap-3 rounded-lg border border-teal-600/30 bg-teal-900/20 p-3">
                <Avatar className="h-8 w-8 border border-teal-500">
                  <AvatarFallback className="bg-teal-700 text-[10px] font-bold text-white">
                    {selectedKicker.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-bold text-teal-300">{selectedKicker.name}</p>
                  <p className="text-[10px] text-teal-400/70">Batedor da falta</p>
                  {/* ===== Multiplicador detalhado ===== */}
                  <div className="mt-1 flex items-center gap-2">
                    <Badge className={`text-xs px-2 py-1 ${getMultiplierBadgeColor(selectedMultiplier)}`}>
                      {getMultiplierIcon(selectedMultiplier)}
                      {selectedMultiplier.diceBonus !== 0 && (
                        <span className="ml-1 font-semibold">
                          Bônus no dado: {selectedMultiplier.diceBonus > 0 ? '+' : ''}{selectedMultiplier.diceBonus}
                        </span>
                      )}
                      {selectedMultiplier.goalChanceBonus !== 0 && (
                        <span className="ml-1 font-semibold">
                          Chance de gol: {selectedMultiplier.goalChanceBonus > 0 ? '+' : ''}{Math.round(selectedMultiplier.goalChanceBonus * 100)}%
                        </span>
                      )}
                      {selectedMultiplier.diceBonus === 0 && selectedMultiplier.goalChanceBonus === 0 && (
                        <span className="ml-1">Sem bônus/malus</span>
                      )}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-amber-300/80 mt-1 italic">
                    {selectedMultiplier.description}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setPhase('SELECT_PLAYER'); setSelectedKicker(null); setSelectedMultiplier(null); }}
                  className="ml-auto text-xs text-gray-400 hover:text-white"
                >
                  Trocar
                </Button>
              </div>

              {/* Info box explicando como o multiplicador funciona */}
              <div className="rounded-lg border border-amber-800/30 bg-amber-950/20 p-2 text-xs text-amber-300">
                <p className="font-semibold">💡 Como o multiplicador funciona:</p>
                <p className="text-amber-400/80 mt-1">
                  {selectedMultiplier.diceBonus !== 0 && (
                    <>O valor <strong>{selectedMultiplier.diceBonus > 0 ? '+' : ''}{selectedMultiplier.diceBonus}</strong> será adicionado ao lançamento do d20 (dice + skillBonus + {selectedMultiplier.diceBonus > 0 ? '+' : ''}{selectedMultiplier.diceBonus}). </>
                  )}
                  {selectedMultiplier.goalChanceBonus !== 0 && (
                    <>A chance de gol das jogadas será ajustada por <strong>{selectedMultiplier.goalChanceBonus > 0 ? '+' : ''}{Math.round(selectedMultiplier.goalChanceBonus * 100)}%</strong>. </>
                  )}
                  {selectedMultiplier.diceBonus === 0 && selectedMultiplier.goalChanceBonus === 0 && (
                    <>Este batedor não recebe nenhum bônus ou malus adicional — a jogada será resolvida normalmente. </>
                  )}
                  Exemplo: se o dado rolado for 12 com skillBonus +2, o total será 12 + 2 + ({selectedMultiplier.diceBonus}) = {12 + 2 + selectedMultiplier.diceBonus}.
                </p>
              </div>

              {/* Free kick plays */}
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Escolha a jogada de falta:
              </p>
              <div className="space-y-2">
                {freeKickActions.map((action, idx) => {
                  // Calcular chance de gol efetiva com multiplicador
                  const effectiveGoalChance = Math.max(0, Math.min(1, action.goalChance + (selectedMultiplier.goalChanceBonus ?? 0)))

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
                          {/* Mostrar chance de gol original vs efetiva */}
                          {action.goalChance > 0 && (
                            <span className="flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 font-bold text-yellow-200">
                              <Target className="h-3 w-3" />
                              {selectedMultiplier.goalChanceBonus !== 0 ? (
                                <>
                                  {Math.round(action.goalChance * 100)}% → <strong className={effectiveGoalChance > action.goalChance ? 'text-emerald-300' : effectiveGoalChance < action.goalChance ? 'text-red-300' : 'text-yellow-200'}>
                                    {Math.round(effectiveGoalChance * 100)}%
                                  </strong>
                                </>
                              ) : (
                                <>{Math.round(action.goalChance * 100)}%</>
                              )}
                            </span>
                          )}
                          {/* Mostrar bônus no dado se aplicável */}
                          {selectedMultiplier.diceBonus !== 0 && (
                            <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-bold ${
                              selectedMultiplier.diceBonus > 0 ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'
                            }`}>
                              🎲 Dado {selectedMultiplier.diceBonus > 0 ? '+' : ''}{selectedMultiplier.diceBonus}
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
