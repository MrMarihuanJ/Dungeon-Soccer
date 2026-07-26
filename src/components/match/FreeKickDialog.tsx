'use client'

// =====================================================================
// FreeKickDialog - Diálogo de cobrança de falta
// --------------------------------------------------------------------
// CORREÇÃO 3: Sistema de multiplicadores para cobrança de falta
// CORREÇÃO 2: Cobranças de falta só aparecem quando há infração real
//
// Fluxo:
//   1. (MatchArena decide abrir este diálogo APENAS quando há um
//      PenaltyEvent com requiresFreeKick=true ou type=PENALTY_KICK,
//      nunca em jogadas normais — ver MatchArena.handlePenaltyFlow)
//   2. SELECT_PLAYER — jogador favorecido escolhe quem vai bater
//      NESTE MOMENTO, um multiplicador aleatório é gerado por jogador
//      e exibido no card (bônus / penalidade / neutro).
//   3. SELECT_PLAY — jogador escolhe a jogada de falta
//      A chance de gol exibida JÁ inclui o multiplicador aplicado.
//   4. onPlayFreeKick(kickerId, action, multiplier) — repassa ao
//      MatchArena que aplica o multiplicador na hora de calcular o gol.
//
// Multiplicadores:
//   - 45% POSITIVO (bônus +5% a +30%)
//   - 40% NEGATIVO (penalidade -5% a -25%)
//   - 15% NEUTRO
//   - Anti-repetição: último batedor evitado; sinal alterna com peso.
// =====================================================================

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Target, Shield, Zap, ChevronRight, TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { sampleFreeKickActions, CATEGORY_META, type FootballAction } from '@/lib/dnd-actions'
import type { SelectedPlayer } from '@/lib/football/store'
import {
  generateFreeKickMultiplier,
  applyMultiplierToGoalChance,
  pickKickerAvoidingRepeat,
  type FreeKickMultiplier,
  type MultiplierHistory,
} from '@/lib/match-engine'

type FKPhase = 'SELECT_PLAYER' | 'SELECT_PLAY'

interface Props {
  open: boolean
  onClose: () => void
  // CORREÇÃO 3: adicionado parâmetro multiplier para que o MatchArena
  // saiba qual bônus/penalidade aplicar na cobrança.
  onPlayFreeKick: (kickerId: string, action: FootballAction, multiplier: FreeKickMultiplier) => void
  fieldPlayers: SelectedPlayer[]  // jogadores em campo do time favorecido
  possession: 'HOME' | 'AWAY'
  // Histórico para evitar repetições consecutivas (opcional)
  multiplierHistory?: MultiplierHistory | null
}

export function FreeKickDialog({
  open,
  onClose,
  onPlayFreeKick,
  fieldPlayers,
  possession,
  multiplierHistory,
}: Props) {
  const [phase, setPhase] = useState<FKPhase>('SELECT_PLAYER')
  const [selectedKicker, setSelectedKicker] = useState<SelectedPlayer | null>(null)
  const [freeKickActions, setFreeKickActions] = useState<FootballAction[]>([])
  // ===== Multiplicador por jogador (gerado quando o diálogo abre) =====
  const [multiplierByPlayer, setMultiplierByPlayer] = useState<Record<string, FreeKickMultiplier>>({})

  // Reset quando o diálogo abre
  useEffect(() => {
    if (open) {
      setPhase('SELECT_PLAYER')
      setSelectedKicker(null)
      setFreeKickActions(sampleFreeKickActions(3))

      // ===== CORREÇÃO 3: gerar um multiplicador por jogador disponível =====
      // Isso permite que o usuário veja o bônus/penalidade de cada batedor
      // ANTES de escolher, criando decisão estratégica.
      const mults: Record<string, FreeKickMultiplier> = {}
      let lastSign = multiplierHistory?.lastSign ?? null

      fieldPlayers.forEach((p) => {
        // Histórico local para anti-repetição dentro desta cobrança
        const localHistory: MultiplierHistory = {
          lastKickerId: multiplierHistory?.lastKickerId ?? null,
          lastSign,
          turnCount: (multiplierHistory?.turnCount ?? 0) + 1,
        }
        const m = generateFreeKickMultiplier(localHistory)
        mults[p.id] = m
        // Atualiza lastSign para o próximo jogador (alternância reforçada)
        lastSign = m.sign
      })
      setMultiplierByPlayer(mults)
    }
  }, [open, fieldPlayers, multiplierHistory])

  const handleSelectKicker = (player: SelectedPlayer) => {
    setSelectedKicker(player)
    setPhase('SELECT_PLAY')
  }

  const handleSelectPlay = (action: FootballAction) => {
    if (selectedKicker) {
      const mult = multiplierByPlayer[selectedKicker.id]
      onPlayFreeKick(selectedKicker.id, action, mult)
    }
  }

  const meta = CATEGORY_META['FREE_KICK']

  // ===== Helper: cor e ícone do multiplicador =====
  const getMultVisual = (m: FreeKickMultiplier) => {
    if (m.sign === 'POSITIVE') {
      return {
        bg: 'bg-emerald-600',
        text: 'text-emerald-300',
        Icon: TrendingUp,
      }
    }
    if (m.sign === 'NEGATIVE') {
      return {
        bg: 'bg-red-600',
        text: 'text-red-300',
        Icon: TrendingDown,
      }
    }
    return {
      bg: 'bg-gray-600',
      text: 'text-gray-300',
      Icon: Minus,
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
              ? 'Escolha quem vai bater a falta. Cada batedor tem um modificador aleatório exibido ao lado.'
              : `${selectedKicker?.name} vai bater! Veja o modificador aplicado e escolha a jogada.`}
          </DialogDescription>
        </DialogHeader>

        {/* ===== Banner explicativo sobre multiplicadores ===== */}
        <div className="rounded-lg border border-teal-800/30 bg-teal-950/20 p-2 text-[11px] text-teal-300">
          <p className="flex items-center gap-1 font-semibold">
            <Zap className="h-3 w-3" /> Multiplicador da cobrança
          </p>
          <p className="text-teal-400/80 mt-0.5">
            A cada cobrança, cada batedor recebe um modificador aleatório que
            afeta a chance de gol. <span className="text-emerald-400">Verde = bônus</span>,{' '}
            <span className="text-red-400">vermelho = penalidade</span>,{' '}
            <span className="text-gray-400">cinza = neutro</span>.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {/* ===== FASE 1: Selecionar batedor ===== */}
          {phase === 'SELECT_PLAYER' && (
            <motion.div
              key="select-player"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Quem bate a falta?
              </p>
              <div className="max-h-[320px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}>
                <ul className="space-y-2">
                  {fieldPlayers.length === 0 && (
                    <li className="p-3 text-center text-xs text-gray-500">
                      Nenhum jogador disponível em campo.
                    </li>
                  )}
                  {fieldPlayers.map((player) => {
                    const mult = multiplierByPlayer[player.id]
                    if (!mult) return null
                    const vis = getMultVisual(mult)
                    const VisIcon = vis.Icon
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
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white">{player.name}</p>
                            <p className="text-xs text-gray-400">
                              {player.position} · {player.team}
                              {player.overall ? ` · OVR ${player.overall}` : ''}
                            </p>
                            {/* ===== Mensagem clara de bônus/penalidade ===== */}
                            <div className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${vis.bg} text-white`}>
                              <VisIcon className="h-3 w-3" />
                              {mult.label}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-teal-400 shrink-0" />
                        </button>
                      </motion.li>
                    )
                  })}
                </ul>
              </div>
            </motion.div>
          )}

          {/* ===== FASE 2: Selecionar jogada ===== */}
          {phase === 'SELECT_PLAY' && selectedKicker && (
            <motion.div
              key="select-play"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-3"
            >
              {/* ===== Batedor selecionado + multiplicador em destaque ===== */}
              {(() => {
                const mult = multiplierByPlayer[selectedKicker.id]
                if (!mult) return null
                const vis = getMultVisual(mult)
                const VisIcon = vis.Icon
                return (
                  <div className={`flex items-center gap-3 rounded-lg border p-3 ${
                    mult.sign === 'POSITIVE' ? 'border-emerald-600/40 bg-emerald-900/20' :
                    mult.sign === 'NEGATIVE' ? 'border-red-600/40 bg-red-900/20' :
                    'border-gray-600/40 bg-gray-900/20'
                  }`}>
                    <Avatar className={`h-8 w-8 border ${
                      mult.sign === 'POSITIVE' ? 'border-emerald-500' :
                      mult.sign === 'NEGATIVE' ? 'border-red-500' :
                      'border-gray-500'
                    }`}>
                      <AvatarFallback className={`text-[10px] font-bold text-white ${
                        mult.sign === 'POSITIVE' ? 'bg-emerald-700' :
                        mult.sign === 'NEGATIVE' ? 'bg-red-700' :
                        'bg-gray-700'
                      }`}>
                        {selectedKicker.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">{selectedKicker.name}</p>
                      <p className="text-[10px] text-gray-400">Batedor da falta</p>
                    </div>
                    <div className={`flex flex-col items-end`}>
                      <div className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${vis.bg} text-white`}>
                        <VisIcon className="h-3 w-3" />
                        {mult.label}
                      </div>
                      <p className={`mt-0.5 text-[10px] ${vis.text}`}>{mult.description}</p>
                    </div>
                  </div>
                )
              })()}

              {/* Botão trocar batedor */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setPhase('SELECT_PLAYER'); setSelectedKicker(null) }}
                className="ml-auto text-xs text-gray-400 hover:text-white"
              >
                ← Trocar batedor
              </Button>

              {/* Jogadas de falta */}
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Escolha a jogada de falta:
              </p>
              <div className="space-y-2">
                {freeKickActions.map((action, idx) => {
                  // ===== Aplica multiplicador para mostrar chance ajustada =====
                  const mult = multiplierByPlayer[selectedKicker.id]
                  const baseChance = action.goalChance
                  const adjustedChance = mult
                    ? applyMultiplierToGoalChance(baseChance, mult)
                    : baseChance
                  const chanceChanged = Math.abs(adjustedChance - baseChance) > 0.005

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
                          {action.goalChance > 0 && (
                            <span className={`flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 font-bold ${
                              chanceChanged && adjustedChance > baseChance ? 'text-emerald-200' :
                              chanceChanged && adjustedChance < baseChance ? 'text-red-200' :
                              'text-yellow-200'
                            }`}>
                              <Target className="h-3 w-3" />
                              {chanceChanged ? (
                                <>
                                  <span className="line-through opacity-60">{Math.round(baseChance * 100)}%</span>
                                  → {Math.round(adjustedChance * 100)}%
                                </>
                              ) : (
                                <>{Math.round(adjustedChance * 100)}%</>
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
