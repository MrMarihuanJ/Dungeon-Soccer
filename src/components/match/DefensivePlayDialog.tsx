'use client'

// =====================================================================
// DefensivePlayDialog - Diálogo de jogada defensiva
// --------------------------------------------------------------------
// CORREÇÃO 3: Em momentos aleatórios durante a vez do oponente,
//   o jogador pode ter a opção de lançar um dado para uma jogada
//   defensiva. Se bem-sucedida, o jogador recupera a posse de bola
//   e pode jogar novamente, interrompendo a vez do oponente.
//
// Fases:
//   1. SELECT_PLAYER — jogador escolhe qual de seus titulares
//      fará a jogada defensiva (cada posição tem skillBonus diferente)
//   2. DICE_RESULT — resultado do d20 + skillBonus vs DC 14
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
import { Shield, Swords, ArrowRight, ChevronLeft, Zap, Target, SkipForward } from 'lucide-react'
import type { SelectedPlayer } from '@/lib/football/store'
import type { DefensivePlayResult } from '@/lib/match-engine'
import { resolveDefensivePlay } from '@/lib/match-engine'

type DefPhase = 'SELECT_PLAYER' | 'DICE_RESULT'

// Mapeamento de posição para emoji, label e bônus esperado
const POSITION_DEF_META: Record<string, { emoji: string; label: string; bonusRange: string }> = {
  GK:  { emoji: '🧤', label: 'Goleiro',        bonusRange: '+4 a +6' },
  DF:  { emoji: '🛡️', label: 'Zagueiro',       bonusRange: '+4 a +6' },
  LD:  { emoji: '🛡️', label: 'Lateral Dir.',   bonusRange: '+4 a +6' },
  LE:  { emoji: '🛡️', label: 'Lateral Esq.',   bonusRange: '+4 a +6' },
  CB:  { emoji: '🛡️', label: 'Zagueiro Central', bonusRange: '+4 a +6' },
  DM:  { emoji: '🛡️', label: 'Volante',         bonusRange: '+4 a +6' },
  MF:  { emoji: '🎯', label: 'Meio-campo',     bonusRange: '+2 a +4' },
  AM:  { emoji: '🎯', label: 'Meio-atacante',  bonusRange: '+2 a +4' },
  FW:  { emoji: '⚡', label: 'Atacante',       bonusRange: '+1 a +3' },
  ST:  { emoji: '⚡', label: 'Centroavante',   bonusRange: '+1 a +3' },
  CF:  { emoji: '⚡', label: 'Centroavante',   bonusRange: '+1 a +3' },
  RW:  { emoji: '⚡', label: 'Ponta Direita',  bonusRange: '+1 a +3' },
  LW:  { emoji: '⚡', label: 'Ponta Esquerda', bonusRange: '+1 a +3' },
}

interface Props {
  open: boolean
  onClose: () => void
  onResult: (result: DefensivePlayResult) => void
  onSkip: () => void  // Jogador optou por não tentar a jogada defensiva
  starters: SelectedPlayer[]
  opponentProgress: number
}

export function DefensivePlayDialog({
  open,
  onClose,
  onResult,
  onSkip,
  starters,
  opponentProgress,
}: Props) {
  const [phase, setPhase] = useState<DefPhase>('SELECT_PLAYER')
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayer | null>(null)
  const [defResult, setDefResult] = useState<DefensivePlayResult | null>(null)
  const [rolling, setRolling] = useState(false)
  const [displayFace, setDisplayFace] = useState(1)

  // Titulares disponíveis (filtrar nulls)
  const availableStarters = useMemo(() =>
    starters.filter((s) => s !== null),
    [starters]
  )

  // Faces do d20 para animação
  const RANDOM_FACES = [3, 17, 8, 14, 5, 19, 11, 2, 16, 7, 12, 18, 4, 9, 13, 6, 20, 1, 15, 10]

  const handleSelectPlayer = (player: SelectedPlayer) => {
    setSelectedPlayer(player)
    setPhase('DICE_RESULT')
    setRolling(true)
    setDisplayFace(1)

    // Animação do dado: rolar faces aleatórias por 1.8s
    let i = 0
    const interval = setInterval(() => {
      setDisplayFace(RANDOM_FACES[i % RANDOM_FACES.length])
      i++
    }, 80)

    // Após 1.8s, resolver jogada defensiva e mostrar resultado
    setTimeout(() => {
      clearInterval(interval)
      const result = resolveDefensivePlay(player.position, player.name)
      setDefResult(result)
      setDisplayFace(result.dice)
      setRolling(false)
    }, 1800)
  }

  const handleConfirmResult = () => {
    if (defResult) {
      onResult(defResult)
    }
  }

  const handleSkip = () => {
    onSkip()
  }

  const getPosLabel = (pos: string) => POSITION_DEF_META[pos]?.label ?? pos
  const getPosEmoji = (pos: string) => POSITION_DEF_META[pos]?.emoji ?? '⚽'
  const getPosBonusRange = (pos: string) => POSITION_DEF_META[pos]?.bonusRange ?? '+2'

  // Cor do resultado do dado
  const getResultColor = (result: DefensivePlayResult) => {
    if (result.critical === 'crit_hit') return 'text-yellow-400'
    if (result.critical === 'crit_fail') return 'text-red-400'
    if (result.success) return 'text-emerald-400'
    return 'text-red-400'
  }

  const getResultBg = (result: DefensivePlayResult) => {
    if (result.critical === 'crit_hit') return 'from-yellow-300 via-amber-400 to-orange-500'
    if (result.critical === 'crit_fail') return 'from-red-400 via-rose-500 to-red-700'
    if (result.success) return 'from-emerald-400 via-emerald-500 to-emerald-700'
    return 'from-red-400 via-rose-500 to-red-700'
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sky-400">
            <Shield className="h-5 w-5" />
            Jogada Defensiva
          </DialogTitle>
          <DialogDescription>
            {phase === 'SELECT_PLAYER'
              ? 'O oponente está jogando, mas você tem a chance de interceptar! Selecione um jogador para tentar a jogada defensiva.'
              : rolling
                ? 'Rolando o d20...'
                : defResult?.success
                  ? 'Jogada defensiva bem-sucedida! Você recuperou a posse!'
                  : 'Jogada defensiva falhou. A vez do oponente continua.'}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {/* ===== FASE 1: Selecionar jogador ===== */}
          {phase === 'SELECT_PLAYER' && (
            <motion.div
              key="select-player"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3"
            >
              {/* Info sobre jogada defensiva */}
              <div className="rounded-lg border border-sky-800/30 bg-sky-950/20 p-3 text-xs text-sky-300">
                <p className="font-semibold mb-1">🛡️ Sistema de Jogada Defensiva</p>
                <p className="text-sky-400/80">
                  Lance um d20 + skillBonus vs DC 14. Se bem-sucedido, você <strong className="text-emerald-400">recupera a posse de bola</strong> e
                  interrompe a vez do oponente! Defensores têm bônus maior (+4 a +6), atacantes menor (+1 a +3).
                </p>
                <p className="text-sky-400/60 mt-1">
                  Progresso do oponente: <strong className="text-amber-400">{opponentProgress}%</strong> — {opponentProgress >= 60 ? 'Perto do gol, chance defensiva aumentada!' : 'Chance base de interceptação.'}
                </p>
              </div>

              {/* Botão para pular (não tentar) */}
              <Button
                variant="outline"
                onClick={handleSkip}
                className="w-full border-gray-700 text-gray-400 hover:bg-gray-900 hover:text-gray-300 flex items-center gap-2"
              >
                <SkipForward className="h-4 w-4" />
                Não tentar — deixar oponente continuar
              </Button>

              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Selecione o jogador para a jogada defensiva:
              </p>
              <div className="max-h-[320px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}>
                <ul className="space-y-2">
                  {availableStarters.map((player) => {
                    const meta = POSITION_DEF_META[player.position] ?? { emoji: '⚽', label: player.position, bonusRange: '+2' }
                    return (
                      <motion.li
                        key={player.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectPlayer(player)}
                          className="flex w-full items-center gap-3 rounded-lg border border-sky-800/30 bg-gray-800/50 p-3 text-left transition-colors hover:border-sky-500 hover:bg-sky-900/20"
                        >
                          <Avatar className="h-10 w-10 border border-sky-600">
                            <AvatarFallback className="bg-sky-700 text-xs font-bold text-white">
                              {player.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-white">{player.name}</p>
                            <p className="text-xs text-gray-400 flex items-center gap-1">
                              <span>{meta.emoji}</span>
                              <span>{meta.label}</span>
                              <span>· {player.team}</span>
                              {player.overall ? <span>· OVR {player.overall}</span> : null}
                            </p>
                            {/* Mostrar bônus esperado baseado na posição */}
                            <Badge className="text-[10px] px-1.5 py-0.5 bg-sky-600 text-white mt-1">
                              🛡️ Bônus: {meta.bonusRange}
                            </Badge>
                          </div>
                          <Shield className="h-4 w-4 text-sky-400" />
                        </button>
                      </motion.li>
                    )
                  })}
                </ul>
              </div>
            </motion.div>
          )}

          {/* ===== FASE 2: Resultado do dado ===== */}
          {phase === 'DICE_RESULT' && (
            <motion.div
              key="dice-result"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              {/* Selected player info */}
              {selectedPlayer && (
                <Card className="border-sky-800/50 bg-sky-950/30">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/20">
                      <Shield className="h-5 w-5 text-sky-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-sky-300">{selectedPlayer.name}</p>
                      <p className="text-xs text-sky-400/70">
                        {getPosEmoji(selectedPlayer.position)} {getPosLabel(selectedPlayer.position)}
                        {selectedPlayer.overall ? ` · OVR ${selectedPlayer.overall}` : ''}
                      </p>
                    </div>
                    <Badge className="bg-sky-600">DEFENSOR</Badge>
                  </CardContent>
                </Card>
              )}

              {/* Dice animation/result */}
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  animate={
                    rolling
                      ? {
                          rotateX: [0, 360, 720, 1080, 1440],
                          rotateY: [0, 360, 720, 360, 0],
                          scale: [1, 1.2, 1.1, 1.15, 1],
                        }
                      : defResult?.critical === 'crit_hit'
                        ? { scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }
                        : defResult?.critical === 'crit_fail'
                          ? { x: [0, -10, 10, -10, 0], rotate: [0, -5, 5, 0] }
                          : { scale: 1, rotate: 0 }
                  }
                  transition={rolling ? { duration: 1.8, ease: 'easeOut' } : { duration: 0.5 }}
                  className={`relative flex h-28 w-28 items-center justify-center rounded-2xl bg-gradient-to-br shadow-2xl ${
                    defResult
                      ? getResultBg(defResult)
                      : 'from-sky-400 via-sky-500 to-sky-700'
                  }`}
                >
                  <span className="relative text-5xl font-black text-white drop-shadow-lg">
                    {displayFace}
                  </span>
                  <div className="absolute bottom-0 right-0 h-8 w-8 rounded-bl-2xl rounded-tr-2xl bg-black/20" />
                </motion.div>

                {/* Resultado textual */}
                {!rolling && defResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="flex flex-col items-center gap-2"
                  >
                    <div className={`text-lg font-bold ${getResultColor(defResult)}`}>
                      {defResult.critical === 'crit_hit'
                        ? '🎲 CRITICAL HIT! Interceptação espetacular!'
                        : defResult.critical === 'crit_fail'
                          ? '💀 CRITICAL FAIL! Falha automática!'
                          : defResult.success
                            ? '✅ Jogada defensiva bem-sucedida!'
                            : '❌ Jogada defensiva falhou.'}
                    </div>
                    <div className="text-sm text-gray-400">
                      🎲 d20: <strong className="text-white">{defResult.dice}</strong> + skillBonus{' '}
                      <strong className="text-sky-400">{defResult.bonus}</strong> ={' '}
                      <strong className="text-white">{defResult.total}</strong> vs DC{' '}
                      <strong className="text-amber-400">{defResult.dc}</strong>
                    </div>
                    <div className="mt-2 rounded-lg bg-gray-800/80 p-3 text-center text-sm">
                      <p className={defResult.success ? 'text-emerald-400' : 'text-red-400'}>
                        {defResult.narrative}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Botões de ação */}
              {!rolling && defResult && (
                <div className="flex gap-3">
                  <Button
                    onClick={handleConfirmResult}
                    className={`flex-1 ${
                      defResult.success
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-gray-700 hover:bg-gray-800 text-gray-300'
                    }`}
                  >
                    {defResult.success ? (
                      <><Swords className="h-4 w-4 mr-2" /> Continuar — minha vez!</>
                    ) : (
                      <><SkipForward className="h-4 w-4 mr-2" /> Continuar — vez do oponente</>
                    )}
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
