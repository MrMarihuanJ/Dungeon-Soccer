'use client'

// =====================================================================
// DefensivePlayDialog - Diálogo de jogada defensiva (roubada de bola)
// --------------------------------------------------------------------
// CORREÇÃO PRINCIPAL DO BUG:
//   Antes: o time COM posse jogava DEFEND, e o engine invertia a posse
//   para o OONENTE — fazendo com que TODOS os pontos ganhos na jogada
//   seguinte fossem creditados ao time errado.
//
//   Agora: durante o turno do oponente, o DEFENSOR (time sem posse)
//   recebe aleatoriamente a oferta de 3 opções defensivas. Se acertar
//   uma opção que rouba bola (Carrinho Agressivo ou Interceptação),
//   a posse é transferida explicitamente para o defensor — então a
//   próxima jogada creditará os pontos ao defensor corretamente.
//
// 3 Fases:
//   1. SELECT_OPTION — jogador escolhe 1 das 3 opções defensivas
//      (Carrinho Agressivo DC16 rouba+reduz20%, Interceptação DC14 rouba,
//       Marcação Pressiva DC12 reduz10% sem roubo)
//   2. SELECT_PLAYER — escolhe qual titular executará (cada posição
//      tem bônus diferente por opção)
//   3. DICE_RESULT — animação do d20 + bônus vs DC da opção
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
import { Shield, Swords, ArrowRight, ChevronLeft, SkipForward, AlertTriangle } from 'lucide-react'
import type { SelectedPlayer } from '@/lib/football/store'
import type { DefensivePlayResult, DefensiveOption } from '@/lib/match-engine'
import {
  resolveDefensivePlay, sampleDefensiveOptions,
} from '@/lib/match-engine'

type DefPhase = 'SELECT_OPTION' | 'SELECT_PLAYER' | 'DICE_RESULT'

// Mapeamento de posição para emoji e label (display)
const POSITION_DEF_META: Record<string, { emoji: string; label: string }> = {
  GK:  { emoji: '🧤', label: 'Goleiro' },
  DF:  { emoji: '🛡️', label: 'Zagueiro' },
  LD:  { emoji: '🛡️', label: 'Lateral Dir.' },
  LE:  { emoji: '🛡️', label: 'Lateral Esq.' },
  CB:  { emoji: '🛡️', label: 'Zagueiro Central' },
  DM:  { emoji: '🛡️', label: 'Volante' },
  MF:  { emoji: '🎯', label: 'Meio-campo' },
  AM:  { emoji: '🎯', label: 'Meio-atacante' },
  FW:  { emoji: '⚡', label: 'Atacante' },
  ST:  { emoji: '⚡', label: 'Centroavante' },
  CF:  { emoji: '⚡', label: 'Centroavante' },
  RW:  { emoji: '⚡', label: 'Ponta Direita' },
  LW:  { emoji: '⚡', label: 'Ponta Esquerda' },
}

// Cores para o nível de risco
const RISK_COLORS: Record<DefensiveOption['riskLabel'], string> = {
  'Alto':   'bg-red-500/20 text-red-400 border-red-500/40',
  'Médio':  'bg-amber-500/20 text-amber-400 border-amber-500/40',
  'Baixo':  'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
}

interface Props {
  open: boolean
  onClose: () => void
  onResult: (result: DefensivePlayResult) => void
  onSkip: () => void  // Jogador optou por não tentar a jogada defensiva
  starters: SelectedPlayer[]
  opponentProgress: number
  attemptInTurn: number
}

export function DefensivePlayDialog({
  open,
  onClose,
  onResult,
  onSkip,
  starters,
  opponentProgress,
  attemptInTurn,
}: Props) {
  const [phase, setPhase] = useState<DefPhase>('SELECT_OPTION')
  const [selectedOption, setSelectedOption] = useState<DefensiveOption | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayer | null>(null)
  const [defResult, setDefResult] = useState<DefensivePlayResult | null>(null)
  const [rolling, setRolling] = useState(false)
  const [displayFace, setDisplayFace] = useState(1)

  // 3 opções em ordem aleatória (memoizado para não re-embaralhar a cada render)
  const options = useMemo(() => sampleDefensiveOptions(), [open])

  // Titulares disponíveis (filtrar nulls)
  const availableStarters = useMemo(() =>
    starters.filter((s) => s !== null),
    [starters]
  )

  // Faces do d20 para animação
  const RANDOM_FACES = [3, 17, 8, 14, 5, 19, 11, 2, 16, 7, 12, 18, 4, 9, 13, 6, 20, 1, 15, 10]

  const handleSelectOption = (option: DefensiveOption) => {
    setSelectedOption(option)
    setPhase('SELECT_PLAYER')
  }

  const handleBackToOptions = () => {
    setSelectedOption(null)
    setSelectedPlayer(null)
    setPhase('SELECT_OPTION')
  }

  const handleSelectPlayer = (player: SelectedPlayer) => {
    if (!selectedOption) return
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
      const result = resolveDefensivePlay(selectedOption, player.position, player.name)
      setDefResult(result)
      setDisplayFace(result.dice)
      setRolling(false)
    }, 1800)
  }

  const handleConfirmResult = () => {
    if (defResult) {
      onResult(defResult)
      // Reset para próxima abertura
      setPhase('SELECT_OPTION')
      setSelectedOption(null)
      setSelectedPlayer(null)
      setDefResult(null)
    }
  }

  const handleSkip = () => {
    // Reset para próxima abertura
    setPhase('SELECT_OPTION')
    setSelectedOption(null)
    setSelectedPlayer(null)
    setDefResult(null)
    onSkip()
  }

  const getPosLabel = (pos: string) => POSITION_DEF_META[pos]?.label ?? pos
  const getPosEmoji = (pos: string) => POSITION_DEF_META[pos]?.emoji ?? '⚽'

  const getBonusForOption = (option: DefensiveOption, position: string): number => {
    return option.bonusByPosition[position] ?? 2
  }

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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sky-400">
            <Shield className="h-5 w-5" />
            Jogada Defensiva {attemptInTurn > 1 && <Badge className="bg-amber-600 text-white">Tentativa {attemptInTurn}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {phase === 'SELECT_OPTION'
              ? 'O oponente está com a bola! Escolha uma opção defensiva para tentar interromper o ataque.'
              : phase === 'SELECT_PLAYER'
                ? `Opção selecionada: ${selectedOption?.emoji} ${selectedOption?.name}. Escolha o jogador para executar.`
                : rolling
                  ? 'Rolando o d20...'
                  : defResult?.ballStolen
                    ? '🎯 ROUBADA DE BOLA! Você recuperou a posse!'
                    : defResult?.success
                      ? '✅ Jogada bem-sucedida! Progresso do oponente reduzido.'
                      : '❌ Jogada falhou. A vez do oponente continua.'}
          </DialogDescription>
        </DialogHeader>

        {/* Banner mostrando progresso do oponente */}
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-amber-300 font-semibold">⚽ Progresso do oponente</span>
            <span className="text-amber-400 font-bold">{opponentProgress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-700">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all"
              style={{ width: `${opponentProgress}%` }}
            />
          </div>
          {opponentProgress >= 60 && (
            <p className="mt-1.5 text-[10px] text-amber-400/80 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {opponentProgress >= 80 ? 'PERIGO! Oponente muito perto do gol!' : 'Atenção: oponente se aproximando do gol!'}
            </p>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* ===== FASE 1: Selecionar opção ===== */}
          {phase === 'SELECT_OPTION' && (
            <motion.div
              key="select-option"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3"
            >
              {/* Botão para pular */}
              <Button
                variant="outline"
                onClick={handleSkip}
                className="w-full border-gray-700 text-gray-400 hover:bg-gray-900 hover:text-gray-300 flex items-center gap-2"
              >
                <SkipForward className="h-4 w-4" />
                Não tentar — deixar oponente continuar
              </Button>

              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Escolha sua opção defensiva:
              </p>

              <div className="grid grid-cols-1 gap-3">
                {options.map((option) => (
                  <motion.button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelectOption(option)}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className="flex w-full items-start gap-3 rounded-lg border border-sky-800/30 bg-gray-800/50 p-4 text-left transition-colors hover:border-sky-500 hover:bg-sky-900/20"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-sky-500/10 text-2xl">
                      {option.emoji}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-white">{option.name}</p>
                        <Badge variant="outline" className={`text-[10px] ${RISK_COLORS[option.riskLabel]}`}>
                          Risco {option.riskLabel}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] border-sky-700 text-sky-300">
                          DC {option.dc}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-400">{option.description}</p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {option.stealsBall ? (
                          <Badge className="text-[10px] bg-emerald-600 text-white">✓ Rouba bola</Badge>
                        ) : (
                          <Badge className="text-[10px] bg-gray-600 text-white">✗ Não rouba</Badge>
                        )}
                        {option.progressReduction > 0 && (
                          <Badge className="text-[10px] bg-amber-600 text-white">
                            −{option.progressReduction}% progresso
                          </Badge>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-sky-400 mt-1" />
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ===== FASE 2: Selecionar jogador ===== */}
          {phase === 'SELECT_PLAYER' && selectedOption && (
            <motion.div
              key="select-player"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-3"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToOptions}
                className="text-gray-400 hover:text-gray-200 flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Voltar às opções
              </Button>

              {/* Relembrar opção escolhida */}
              <Card className="border-sky-800/50 bg-sky-950/30">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/20 text-xl">
                    {selectedOption.emoji}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-sky-300">{selectedOption.name}</p>
                    <p className="text-xs text-sky-400/70">DC {selectedOption.dc} · {selectedOption.riskLabel}</p>
                  </div>
                  {selectedOption.stealsBall ? (
                    <Badge className="bg-emerald-600 text-white">Rouba bola</Badge>
                  ) : (
                    <Badge className="bg-amber-600 text-white">−{selectedOption.progressReduction}% progresso</Badge>
                  )}
                </CardContent>
              </Card>

              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Selecione o jogador (bônus varia por posição):
              </p>

              <div className="max-h-[320px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}>
                <ul className="space-y-2">
                  {availableStarters.map((player) => {
                    const bonus = getBonusForOption(selectedOption, player.position)
                    const meta = POSITION_DEF_META[player.position] ?? { emoji: '⚽', label: player.position }
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
                            <Badge className="text-[10px] px-1.5 py-0.5 bg-sky-600 text-white mt-1">
                              🛡️ Bônus: +{bonus}
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

          {/* ===== FASE 3: Resultado do dado ===== */}
          {phase === 'DICE_RESULT' && selectedOption && selectedPlayer && (
            <motion.div
              key="dice-result"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              {/* Opção + jogador selecionado */}
              <Card className="border-sky-800/50 bg-sky-950/30">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/20 text-xl">
                    {selectedOption.emoji}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-sky-300">{selectedPlayer.name}</p>
                    <p className="text-xs text-sky-400/70">
                      {getPosEmoji(selectedPlayer.position)} {getPosLabel(selectedPlayer.position)} · {selectedOption.name}
                    </p>
                  </div>
                  <Badge className="bg-sky-600">DEFENSOR</Badge>
                </CardContent>
              </Card>

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
                      <strong className="text-sky-400">+{defResult.bonus}</strong> ={' '}
                      <strong className="text-white">{defResult.total}</strong> vs DC{' '}
                      <strong className="text-amber-400">{defResult.dc}</strong>
                    </div>
                    <div className="mt-2 rounded-lg bg-gray-800/80 p-3 text-center text-sm max-w-md">
                      <p className={defResult.success ? 'text-emerald-400' : 'text-red-400'}>
                        {defResult.narrative}
                      </p>
                    </div>
                    {/* Badges de efeito */}
                    {defResult.success && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {defResult.ballStolen && (
                          <Badge className="bg-emerald-600 text-white">⚽ Roubo de bola</Badge>
                        )}
                        {defResult.progressReduction > 0 && (
                          <Badge className="bg-amber-600 text-white">
                            ↓ {defResult.progressReduction}% progresso oponente
                          </Badge>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Botões de ação */}
              {!rolling && defResult && (
                <div className="flex gap-3">
                  <Button
                    onClick={handleConfirmResult}
                    className={`flex-1 ${
                      defResult.ballStolen
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : defResult.success
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-gray-700 hover:bg-gray-800 text-gray-300'
                    }`}
                  >
                    {defResult.ballStolen ? (
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
