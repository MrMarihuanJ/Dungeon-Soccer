'use client'

// =====================================================================
// SubstitutionModal - Modal de substituição (lesão ou voluntária)
// --------------------------------------------------------------------
// CORREÇÃO 5: Substituições durante o jogo
//
// Reescrito para corrigir 3 problemas:
//   1. Substituição voluntária não tinha UI para escolher quem SAI.
//      Antes: o modal só mostrava reservas para ENTRAR e passava
//      `outPlayerId = ''` para o callback, fazendo nada acontecer.
//   2. A interface não exibia claramente a posição do jogador que sai
//      e do que entra, como exigido pelo usuário.
//   3. A contagem de substituições não era persistida (corrigido no
//      MatchArena.handleSubstitution, que agora chama a API).
//
// Fluxo (voluntária):
//   Fase SELECT_OUT  -> escolher titular que sai
//   Fase SELECT_IN   -> escolher reserva que entra
//
// Fluxo (lesão / forçada):
//   O titular lesionado já é passado como `injuredPlayer`.
//   Fase direta SELECT_IN -> escolher reserva que entra no lugar dele.
//
// Limite de 5 (ou 6 se o usuário for nível 3+):
//   - Quando atingido, o modal mostra aviso e opção "continuar sem sub".
//   - Se for lesão + limite atingido, o time joga com 1 a menos.
// =====================================================================

import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  ArrowRight, Heart, AlertTriangle, UserMinus, Users,
  ArrowDownToLine, ArrowUpFromLine, Shirt,
} from 'lucide-react'
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

const POS_LABEL: Record<string, string> = {
  GK: 'Goleiro',
  DF: 'Zagueiro',
  LD: 'Lateral Direito',
  LE: 'Lateral Esquerdo',
  MF: 'Meia',
  FW: 'Atacante',
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
  const [phase, setPhase] = useState<SubPhase>('SELECT_IN')
  const [selectedOut, setSelectedOut] = useState<SelectedPlayer | null>(null)

  const remaining = maxSubstitutions - substitutionsUsed
  const canSubstitute = remaining > 0
  const outPlayer = isForced ? injuredPlayer : selectedOut

  // Reservas disponíveis (não aposentados, não inativos)
  const availableReserves = useMemo(
    () => reserves.filter((r) => !r.isInactive && !r.isRetired),
    [reserves],
  )

  // Reset phase quando o modal abre
  useEffect(() => {
    if (open) {
      // Lesão: pular direto para SELECT_IN (outPlayer já é o injured)
      // Voluntária: começar em SELECT_OUT
      setPhase(isForced ? 'SELECT_IN' : 'SELECT_OUT')
      setSelectedOut(null)
    }
  }, [open, isForced])

  const handleSelectOut = (player: SelectedPlayer) => {
    setSelectedOut(player)
    setPhase('SELECT_IN')
  }

  const handleSelectIn = (reserve: SelectedPlayer) => {
    if (!outPlayer) {
      // safety net — não deveria acontecer
      return
    }
    onConfirm(outPlayer.id, reserve.id)
  }

  const handlePlayWithout = () => {
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
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
              ? `${outPlayer?.name ?? 'Jogador'} se lesionou e não pode continuar!`
              : phase === 'SELECT_OUT'
                ? 'Escolha qual titular vai SAIR de campo.'
                : 'Escolha qual reserva vai ENTRAR no lugar do titular.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ===== Stats de substituições ===== */}
          <div className="flex items-center justify-between rounded-lg bg-gray-800/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-gray-300">Substituições restantes:</span>
            </div>
            <Badge className={remaining > 0 ? 'bg-emerald-600' : 'bg-red-600'}>
              {remaining} / {maxSubstitutions}
            </Badge>
          </div>

          {/* ===== Indicador de progresso da substituição (voluntária) ===== */}
          {!isForced && (
            <div className="flex items-center justify-center gap-2 text-xs">
              <div className={`flex items-center gap-1 ${phase === 'SELECT_OUT' ? 'text-emerald-400 font-bold' : 'text-gray-500'}`}>
                <ArrowUpFromLine className="h-3 w-3" /> 1. Quem sai
              </div>
              <ArrowRight className="h-3 w-3 text-gray-600" />
              <div className={`flex items-center gap-1 ${phase === 'SELECT_IN' ? 'text-emerald-400 font-bold' : 'text-gray-500'}`}>
                <ArrowDownToLine className="h-3 w-3" /> 2. Quem entra
              </div>
            </div>
          )}

          {/* ===== Card do jogador que sai (lesão ou já selecionado) ===== */}
          {outPlayer && (
            <Card className={`border-red-800/50 ${isForced ? 'bg-red-950/30' : 'bg-gray-900/50'}`}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isForced ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
                  {isForced
                    ? <Heart className="h-5 w-5 text-red-400" />
                    : <ArrowUpFromLine className="h-5 w-5 text-amber-400" />}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-bold ${isForced ? 'text-red-300' : 'text-amber-300'}`}>
                    {outPlayer.name}
                  </p>
                  <p className={`text-xs ${isForced ? 'text-red-400/70' : 'text-amber-400/70'}`}>
                    {POS_LABEL[outPlayer.position] ?? outPlayer.position} · {outPlayer.team}
                    {outPlayer.overall ? ` · OVR ${outPlayer.overall}` : ''}
                  </p>
                </div>
                <Badge variant="outline" className={isForced ? 'border-red-700 text-red-400' : 'border-amber-700 text-amber-400'}>
                  SAI
                </Badge>
              </CardContent>
            </Card>
          )}

          {/* ===== Limite de substituições atingido ===== */}
          {!canSubstitute && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-red-800/50 bg-red-950/20 p-4 text-center">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="text-sm text-red-300">
                {isForced
                  ? `Todas as ${maxSubstitutions} substituições já foram usadas! O time continuará com um jogador a menos.`
                  : `Limite de ${maxSubstitutions} substituições atingido!`}
              </p>
              <Button
                onClick={handlePlayWithout}
                variant="outline"
                className="border-red-700 text-red-400 hover:bg-red-950"
              >
                Continuar sem substituição
              </Button>
            </div>
          )}

          {/* ===== FASE SELECT_OUT: Lista de titulares (voluntária) ===== */}
          {canSubstitute && !isForced && phase === 'SELECT_OUT' && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400 flex items-center gap-1">
                <ArrowUpFromLine className="h-3 w-3" /> Titulares em campo:
              </p>
              <div className="max-h-[280px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}>
                <ul className="space-y-2">
                  {starters.length === 0 && (
                    <li className="p-3 text-center text-xs text-gray-500">
                      Nenhum titular disponível.
                    </li>
                  )}
                  {starters.map((player) => (
                    <motion.li
                      key={player.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectOut(player)}
                        className="flex w-full items-center gap-3 rounded-lg border border-amber-800/30 bg-gray-800/50 p-3 text-left transition-colors hover:border-amber-500 hover:bg-amber-900/20"
                      >
                        <Avatar className="h-10 w-10 border border-amber-600">
                          <AvatarFallback className="bg-amber-700 text-xs font-bold text-white">
                            {player.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-white">{player.name}</p>
                          <p className="text-xs text-gray-400">
                            {POS_LABEL[player.position] ?? player.position} · {player.team}
                            {player.overall ? ` · OVR ${player.overall}` : ''}
                          </p>
                        </div>
                        <Badge variant="outline" className="border-amber-700 text-amber-400">
                          SAI
                        </Badge>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* ===== FASE SELECT_IN: Lista de reservas (lesão ou voluntária) ===== */}
          {canSubstitute && phase === 'SELECT_IN' && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400 flex items-center gap-1">
                <ArrowDownToLine className="h-3 w-3" /> Reservas disponíveis:
              </p>

              {availableReserves.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-amber-800/50 bg-amber-950/20 p-4 text-center">
                  <UserMinus className="h-8 w-8 text-amber-400" />
                  <p className="text-sm text-amber-300">
                    Não há reservas disponíveis! O time jogará com um a menos.
                  </p>
                  <Button
                    onClick={handlePlayWithout}
                    variant="outline"
                    className="border-amber-700 text-amber-400 hover:bg-amber-950"
                  >
                    Continuar
                  </Button>
                </div>
              ) : (
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
                          onClick={() => handleSelectIn(reserve)}
                          className="flex w-full items-center gap-3 rounded-lg border border-emerald-800/30 bg-gray-800/50 p-3 text-left transition-colors hover:border-emerald-600 hover:bg-emerald-900/20"
                        >
                          <Avatar className="h-10 w-10 border border-emerald-600">
                            <AvatarFallback className="bg-emerald-700 text-xs font-bold text-white">
                              {reserve.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-white">{reserve.name}</p>
                            <p className="text-xs text-gray-400">
                              {POS_LABEL[reserve.position] ?? reserve.position} · {reserve.team}
                              {reserve.overall ? ` · OVR ${reserve.overall}` : ''}
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
              )}
            </div>
          )}

          {/* ===== Botão voltar (voluntária, fase SELECT_IN) ===== */}
          {canSubstitute && !isForced && phase === 'SELECT_IN' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setPhase('SELECT_OUT'); setSelectedOut(null) }}
              className="w-full text-xs text-gray-400 hover:text-white"
            >
              ← Voltar e escolher outro titular
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
