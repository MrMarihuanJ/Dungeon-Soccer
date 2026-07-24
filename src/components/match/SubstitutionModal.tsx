'use client'

// =====================================================================
// SubstitutionModal - Modal de substituição (lesão ou voluntária)
// --------------------------------------------------------------------
// CORREÇÃO 1: Após todas as 5 substituições serem usadas, nenhuma
//   substituição adicional pode ocorrer, mesmo por lesão. O time
//   joga com um jogador a menos.
// CORREÇÃO 2: Interface explícita com duas fases:
//   Fase 1 — Selecionar a posição e o jogador titular que SAI
//   Fase 2 — Selecionar o reserva que ENTRA naquela posição
//   Para lesões (isForced=true), o jogador lesionado já está
//   pré-selecionado como "sai", pulando a fase 1.
// =====================================================================

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { ArrowRight, Heart, AlertTriangle, UserMinus, Users, Shield, ChevronLeft } from 'lucide-react'
import type { SelectedPlayer } from '@/lib/football/store'

type SubPhase = 'SELECT_OUT' | 'SELECT_IN'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (outPlayerId: string, inPlayerId: string) => void
  injuredPlayer: SelectedPlayer | null
  reserves: SelectedPlayer[]
  starters: SelectedPlayer[]
  substitutionsUsed: number
  maxSubstitutions: number
  isForced: boolean  // true = injury, false = voluntary
}

// Mapeamento de posição para emoji e nome legível
const POSITION_META: Record<string, { emoji: string; label: string }> = {
  GK:  { emoji: '🧤', label: 'Goleiro' },
  DF:  { emoji: '🛡️', label: 'Zagueiro' },
  LD:  { emoji: '🛡️', label: 'Lateral Direito' },
  LE:  { emoji: '🛡️', label: 'Lateral Esquerdo' },
  MF:  { emoji: '🎯', label: 'Meio-campo' },
  FW:  { emoji: '⚡', label: 'Atacante' },
  ST:  { emoji: '⚡', label: 'Centroavante' },
  CF:  { emoji: '⚡', label: 'Centroavante' },
  RW:  { emoji: '⚡', label: 'Ponta Direita' },
  LW:  { emoji: '⚡', label: 'Ponta Esquerda' },
  AM:  { emoji: '🎯', label: 'Meio-atacante' },
  DM:  { emoji: '🛡️', label: 'Volante' },
  CB:  { emoji: '🛡️', label: 'Zagueiro Central' },
}

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
  // ===== CORREÇÃO 1: Nenhuma substituição após limite atingido =====
  // remaining = 0 significa que todas as 5 substituições foram usadas.
  // Mesmo lesões não podem ser substituídas após o limite.
  const remaining = maxSubstitutions - substitutionsUsed
  const canSubstitute = remaining > 0

  // ===== CORREÇÃO 2: Interface explícita de substituição =====
  // Fase 1: SELECT_OUT — jogador escolhe quem sai (titular)
  // Fase 2: SELECT_IN — jogador escolhe quem entra (reserva)
  const [phase, setPhase] = useState<SubPhase>('SELECT_OUT')
  const [selectedOutPlayer, setSelectedOutPlayer] = useState<SelectedPlayer | null>(null)

  // Reservas disponíveis: filtrar inactive/retired, e também já substituídos
  const availableReserves = useMemo(() =>
    reserves.filter((r) => !r.isInactive && !r.isRetired),
    [reserves]
  )

  // Titulares disponíveis para sair (não lesionados, não expulsos)
  const availableStarters = useMemo(() =>
    starters.filter((s) => s !== null),
    [starters]
  )

  // Para lesões, o jogador lesionado já é pré-selecionado como "sai"
  // então a fase inicial é SELECT_IN diretamente
  const effectivePhase = useMemo(() => {
    if (isForced && injuredPlayer) {
      // Se for lesão e já temos o jogador lesionado, vamos direto para fase 2
      if (!selectedOutPlayer) {
        setSelectedOutPlayer(injuredPlayer)
      }
      return 'SELECT_IN'
    }
    return phase
  }, [isForced, injuredPlayer, phase, selectedOutPlayer])

  // Reseta estado quando modal abre/fecha
  const resetState = () => {
    setPhase('SELECT_OUT')
    setSelectedOutPlayer(null)
  }

  // Fechar modal e resetar
  const handleClose = () => {
    resetState()
    onClose()
  }

  // Confirmar substituição
  const handleConfirm = (reserve: SelectedPlayer) => {
    if (selectedOutPlayer) {
      onConfirm(selectedOutPlayer.id, reserve.id)
      resetState()
    }
  }

  // Jogar sem substituição (lesão sem reserva disponível ou limite atingido)
  const handlePlayWithout = () => {
    resetState()
    onClose()
  }

  // Posição legível
  const getPosLabel = (pos: string) => POSITION_META[pos]?.label ?? pos
  const getPosEmoji = (pos: string) => POSITION_META[pos]?.emoji ?? '⚽'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isForced ? (
              <>
                <Heart className="h-5 w-5 text-red-500" />
                <span className="text-red-400">Lesão! Substituição Necessária</span>
              </>
            ) : (
              <>
                <Users className="h-5 w-5 text-emerald-400" />
                <span className="text-emerald-400">Substituição Voluntária</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isForced
              ? `${injuredPlayer?.name ?? 'Jogador'} se lesionou e não pode continuar!`
              : 'Selecione o titular que sai e o reserva que entra.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ===== Estatísticas de substituição ===== */}
          <div className="flex items-center justify-between rounded-lg bg-gray-800/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-gray-300">Substituições restantes:</span>
            </div>
            <Badge className={remaining > 0 ? 'bg-emerald-600' : 'bg-red-600'}>
              {remaining} / {maxSubstitutions}
            </Badge>
          </div>

          {/* ===== CORREÇÃO 1: Bloqueio completo após limite atingido ===== */}
          {!canSubstitute && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-red-800/50 bg-red-950/20 p-4 text-center">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="text-sm font-semibold text-red-300">
                {isForced
                  ? 'Todas as 5 substituições já foram usadas! O time continuará com um jogador a menos nesta partida.'
                  : 'Limite de 5 substituições atingido! Nenhuma substituição adicional é permitida.'}
              </p>
              <p className="text-xs text-red-400/70 mt-1">
                {isForced && 'O jogador lesionado sai do campo, mas nenhum reserva pode entrar.'}
              </p>
              <Button onClick={handlePlayWithout} variant="outline" className="border-red-700 text-red-400 hover:bg-red-950">
                Continuar sem substituição
              </Button>
            </div>
          )}

          {/* ===== Interface de substituição (apenas se canSubstitute) ===== */}
          {canSubstitute && (
            <AnimatePresence mode="wait">
              {/* ===== FASE 1: Selecionar titular que SAI ===== */}
              {effectivePhase === 'SELECT_OUT' && (
                <motion.div
                  key="select-out"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-3"
                >
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                    Passo 1 — Selecione a posição e o titular que <strong className="text-red-400">SAI</strong>:
                  </p>
                  <div className="max-h-[320px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}>
                    <ul className="space-y-2">
                      {availableStarters.map((starter) => (
                        <motion.li
                          key={starter.id}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOutPlayer(starter)
                              setPhase('SELECT_IN')
                            }}
                            className="flex w-full items-center gap-3 rounded-lg border border-red-800/30 bg-gray-800/50 p-3 text-left transition-colors hover:border-red-500 hover:bg-red-900/20"
                          >
                            <Avatar className="h-10 w-10 border border-red-600">
                              <AvatarFallback className="bg-red-700 text-xs font-bold text-white">
                                {starter.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <p className="text-sm font-bold text-white">{starter.name}</p>
                              <p className="text-xs text-gray-400 flex items-center gap-1">
                                <span>{getPosEmoji(starter.position)}</span>
                                <span>{getPosLabel(starter.position)}</span>
                                <span>· {starter.team}</span>
                                {starter.overall ? <span>· OVR {starter.overall}</span> : null}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="border-red-700 text-red-400">SAI</Badge>
                            </div>
                          </button>
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              )}

              {/* ===== FASE 2: Selecionar reserva que ENTRA ===== */}
              {effectivePhase === 'SELECT_IN' && selectedOutPlayer && (
                <motion.div
                  key="select-in"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-3"
                >
                  {/* Jogador que sai — card de referência */}
                  <Card className="border-red-800/50 bg-red-950/30">
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
                        {isForced ? <Heart className="h-5 w-5 text-red-400" /> : <Shield className="h-5 w-5 text-red-400" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-red-300">{selectedOutPlayer.name}</p>
                        <p className="text-xs text-red-400/70 flex items-center gap-1">
                          <span>{getPosEmoji(selectedOutPlayer.position)}</span>
                          <span>{getPosLabel(selectedOutPlayer.position)}</span>
                          <span>· {selectedOutPlayer.team}</span>
                          {selectedOutPlayer.overall ? <span>· OVR {selectedOutPlayer.overall}</span> : null}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-red-700 text-red-400">SAI</Badge>
                    </CardContent>
                  </Card>

                  {/* Botão para voltar à fase 1 (se não for lesão) */}
                  {!isForced && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setPhase('SELECT_OUT'); setSelectedOutPlayer(null); }}
                      className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                    >
                      <ChevronLeft className="h-3 w-3" />
                      Trocar titular que sai
                    </Button>
                  )}

                  {/* Lista de reservas disponíveis para entrar */}
                  {availableReserves.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                        Passo 2 — Selecione o reserva que <strong className="text-emerald-400">ENTRA</strong> na posição de {getPosLabel(selectedOutPlayer.position)}:
                      </p>
                      <div className="max-h-[280px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}>
                        <ul className="space-y-2">
                          {availableReserves.map((reserve) => (
                            <motion.li
                              key={reserve.id}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <button
                                type="button"
                                onClick={() => handleConfirm(reserve)}
                                className="flex w-full items-center gap-3 rounded-lg border border-emerald-800/30 bg-gray-800/50 p-3 text-left transition-colors hover:border-emerald-600 hover:bg-emerald-900/20"
                              >
                                <Avatar className="h-10 w-10 border border-emerald-600">
                                  <AvatarFallback className="bg-emerald-700 text-xs font-bold text-white">
                                    {reserve.name.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                  <p className="text-sm font-bold text-white">{reserve.name}</p>
                                  <p className="text-xs text-gray-400 flex items-center gap-1">
                                    <span>{getPosEmoji(reserve.position)}</span>
                                    <span>{getPosLabel(reserve.position)}</span>
                                    <span>· {reserve.team}</span>
                                    {reserve.overall ? <span>· OVR {reserve.overall}</span> : null}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Badge className="bg-emerald-600">ENTRA</Badge>
                                  <ArrowRight className="h-4 w-4 text-emerald-400" />
                                </div>
                              </button>
                            </motion.li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-amber-800/50 bg-amber-950/20 p-4 text-center">
                      <UserMinus className="h-8 w-8 text-amber-400" />
                      <p className="text-sm text-amber-300">
                        Não há reservas disponíveis! O time jogará com um a menos.
                      </p>
                      <Button onClick={handlePlayWithout} variant="outline" className="border-amber-700 text-amber-400 hover:bg-amber-950">
                        Continuar sem substituição
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
