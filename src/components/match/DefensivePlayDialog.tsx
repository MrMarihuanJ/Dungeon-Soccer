'use client'

// =====================================================================
// DefensivePlayDialog - Diálogo de jogada defensiva
// --------------------------------------------------------------------
// ATUALIZAÇÃO: em momentos aleatórios durante a vez do oponente
//   (quando a bola está com o adversário), o usuário recebe 3 opções
//   defensivas distintas para tentar recuperar a posse de bola:
//
//   1. Carrinho Agressivo (Alto Risco)     — DC 16, rouba + reduz 20%
//   2. Interceptação de Passe (Médio Risco)— DC 14, rouba bola
//   3. Marcação Pressiva (Baixo Risco)     — DC 12, só reduz 10%
//
// Fluxo:
//   FASE 1: SELECT_OPTION
//     - Mostra os 3 cards de opções defensivas com risco/bônus/efeito
//     - Usuário escolhe UMA opção
//   FASE 2: SELECT_PLAYER
//     - Lista os titulares em campo para executar a jogada escolhida
//     - Mostra o bônus esperado por posição (cada opção tem sua tabela)
//   FASE 3: DICE_RESULT
//     - Animação do d20 + bônus vs DC da opção escolhida
//     - Resultado: sucesso (roubo/pressão) ou falha
//
// Após o resultado:
//   - Se roubou a bola → turno do oponente ENCERRA, usuário joga
//   - Se só fez pressão → turno do oponente CONTINUA, mas progresso cai
//   - Se falhou → turno do oponente CONTINUA normalmente
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
  Shield, Swords, ArrowRight, ChevronLeft, Zap, Target, SkipForward,
  AlertTriangle, TrendingUp, TrendingDown, Footprints, Hand, Activity,
} from 'lucide-react'
import type { SelectedPlayer } from '@/lib/football/store'
import type { DefensivePlayResult, DefensiveOption } from '@/lib/match-engine'
import {
  resolveDefensivePlay, sampleDefensiveOptions, DEFENSIVE_OPTIONS,
} from '@/lib/match-engine'

type DefPhase = 'SELECT_OPTION' | 'SELECT_PLAYER' | 'DICE_RESULT'

// Mapeamento de posição para emoji e label (para exibição)
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

// Metadados visuais por opção (espelha DEFENSIVE_OPTIONS do engine)
const OPTION_VISUAL: Record<DefensiveOption['id'], {
  Icon: typeof Shield
  riskColor: string
  riskBadgeClass: string
}> = {
  AGGRESSIVE_TACKLE: {
    Icon: Swords,
    riskColor: 'text-rose-400',
    riskBadgeClass: 'bg-rose-600 text-white',
  },
  PASS_INTERCEPTION: {
    Icon: Hand,
    riskColor: 'text-sky-400',
    riskBadgeClass: 'bg-sky-600 text-white',
  },
  PRESSING_MARK: {
    Icon: Footprints,
    riskColor: 'text-amber-400',
    riskBadgeClass: 'bg-amber-600 text-white',
  },
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
  const [phase, setPhase] = useState<DefPhase>('SELECT_OPTION')
  const [selectedOption, setSelectedOption] = useState<DefensiveOption | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayer | null>(null)
  const [defResult, setDefResult] = useState<DefensivePlayResult | null>(null)
  const [rolling, setRolling] = useState(false)
  const [displayFace, setDisplayFace] = useState(1)
  // Ordem aleatória das 3 opções (sorteada quando o diálogo abre)
  const [shuffledOptions, setShuffledOptions] = useState<DefensiveOption[]>(DEFENSIVE_OPTIONS)

  // Reset quando o diálogo abre
  useEffect(() => {
    if (open) {
      setPhase('SELECT_OPTION')
      setSelectedOption(null)
      setSelectedPlayer(null)
      setDefResult(null)
      setRolling(false)
      setDisplayFace(1)
      setShuffledOptions(sampleDefensiveOptions())
    }
  }, [open])

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
    }
  }

  const handleSkip = () => {
    onSkip()
  }

  const getPosLabel = (pos: string) => POSITION_DEF_META[pos]?.label ?? pos
  const getPosEmoji = (pos: string) => POSITION_DEF_META[pos]?.emoji ?? '⚽'
  const getPosBonusRange = (pos: string, option: DefensiveOption) => {
    const range = option.bonusByPosition[pos]
    return range ? `+${range[0]} a +${range[1]}` : '+2 a +4'
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
            Oportunidade Defensiva!
          </DialogTitle>
          <DialogDescription>
            {phase === 'SELECT_OPTION'
              ? 'A bola está com o oponente! Escolha uma das 3 opções defensivas para tentar recuperar a posse.'
              : phase === 'SELECT_PLAYER'
                ? `Opção escolhida: ${selectedOption?.name}. Selecione o jogador para executar a jogada.`
                : rolling
                  ? 'Rolando o d20...'
                  : defResult?.ballStolen
                    ? '🎉 Roubo de bola! Você recuperou a posse!'
                    : defResult?.success
                      ? 'Marcação bem-sucedida! O oponente foi atrasado.'
                      : 'Jogada defensiva falhou. A vez do oponente continua.'}
          </DialogDescription>
        </DialogHeader>

        {/* ===== Status do oponente (banner superior) ===== */}
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/30 p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-amber-300 font-semibold">
              <Activity className="h-3 w-3" />
              Progresso do oponente
            </span>
            <span className="text-amber-400 font-bold">
              {opponentProgress}%
              {opponentProgress >= 60 && (
                <span className="ml-2 text-rose-300">⚠ Perto do gol!</span>
              )}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-amber-900/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all"
              style={{ width: `${opponentProgress}%` }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* ===== FASE 1: Selecionar opção defensiva ===== */}
          {phase === 'SELECT_OPTION' && (
            <motion.div
              key="select-option"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {/* Banner explicativo */}
              <div className="rounded-lg border border-sky-800/30 bg-sky-950/20 p-2 text-[11px] text-sky-300">
                <p className="font-semibold flex items-center gap-1">
                  <Zap className="h-3 w-3" /> Como funciona
                </p>
                <p className="text-sky-400/80 mt-0.5">
                  Cada opção tem DC, bônus por posição e efeito diferente. Escolha
                  conforme a estratégia: arriscar para roubar a bola, ou pressionar
                  para apenas atrasar o oponente. <strong className="text-emerald-400">Verde = rouba bola</strong>,{' '}
                  <span className="text-amber-400">âmbar = só atrasa</span>.
                </p>
              </div>

              {/* As 3 opções defensivas */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {shuffledOptions.map((option, idx) => {
                  const visual = OPTION_VISUAL[option.id]
                  const OptIcon = visual.Icon
                  return (
                    <motion.button
                      key={option.id}
                      type="button"
                      onClick={() => handleSelectOption(option)}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      whileHover={{ scale: 1.03, y: -3 }}
                      whileTap={{ scale: 0.97 }}
                      className={`relative flex flex-col gap-2 rounded-xl border border-white/10 bg-gradient-to-br ${option.color} p-3 text-left shadow-lg`}
                    >
                      {/* Emoji e risco */}
                      <div className="flex items-center justify-between">
                        <span className="text-3xl drop-shadow">{option.emoji}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${visual.riskBadgeClass}`}>
                          {option.riskLabel}
                        </span>
                      </div>

                      {/* Nome */}
                      <h3 className="text-sm font-bold leading-tight text-white drop-shadow">
                        {option.name}
                      </h3>

                      {/* Descrição */}
                      <p className="text-[11px] leading-tight text-white/85">
                        {option.description}
                      </p>

                      {/* Stats: DC, efeito */}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-white/90">
                        <span className="flex items-center gap-1 rounded bg-black/30 px-1.5 py-0.5">
                          <Shield className="h-3 w-3" /> DC {option.dc}
                        </span>
                        {option.stealBall ? (
                          <span className="flex items-center gap-1 rounded bg-emerald-700/60 px-1.5 py-0.5 font-bold">
                            <Swords className="h-3 w-3" /> Rouba Bola
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded bg-amber-700/60 px-1.5 py-0.5 font-bold">
                            <Activity className="h-3 w-3" /> Atrasa
                          </span>
                        )}
                        {option.progressReduction > 0 && (
                          <span className="flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 font-bold text-yellow-200">
                            <TrendingDown className="h-3 w-3" /> -{option.progressReduction}%
                          </span>
                        )}
                      </div>
                    </motion.button>
                  )
                })}
              </div>

              {/* Botão pular */}
              <Button
                variant="outline"
                onClick={handleSkip}
                className="w-full border-gray-700 text-gray-400 hover:bg-gray-900 hover:text-gray-300 flex items-center gap-2"
              >
                <SkipForward className="h-4 w-4" />
                Não tentar — deixar oponente continuar
              </Button>
            </motion.div>
          )}

          {/* ===== FASE 2: Selecionar jogador ===== */}
          {phase === 'SELECT_PLAYER' && selectedOption && (
            <motion.div
              key="select-player"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-3"
            >
              {/* Resumo da opção escolhida */}
              <div className={`rounded-lg border border-white/10 bg-gradient-to-br ${selectedOption.color} p-3`}>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{selectedOption.emoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-white">{selectedOption.name}</p>
                    <p className="text-[11px] text-white/80">
                      DC {selectedOption.dc} · {selectedOption.stealBall ? 'Rouba bola' : 'Só atrasa'}
                      {selectedOption.progressReduction > 0 && ` · Reduz ${selectedOption.progressReduction}%`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setPhase('SELECT_OPTION'); setSelectedOption(null) }}
                    className="text-white/80 hover:text-white hover:bg-white/10 text-xs"
                  >
                    <ChevronLeft className="h-3 w-3 mr-1" /> Trocar opção
                  </Button>
                </div>
              </div>

              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Selecione o jogador para executar a jogada:
              </p>
              <div className="max-h-[280px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}>
                <ul className="space-y-2">
                  {availableStarters.map((player) => {
                    const meta = POSITION_DEF_META[player.position] ?? { emoji: '⚽', label: player.position }
                    const bonusRange = getPosBonusRange(player.position, selectedOption)
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
                            {/* Mostrar bônus esperado baseado na posição E na opção */}
                            <Badge className="text-[10px] px-1.5 py-0.5 bg-sky-600 text-white mt-1">
                              🛡️ Bônus: {bonusRange}
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
          {phase === 'DICE_RESULT' && (
            <motion.div
              key="dice-result"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              {/* Opção + jogador selecionado */}
              {selectedOption && selectedPlayer && (
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
                      <p className="text-[11px] text-teal-300 mt-0.5">
                        {selectedOption.emoji} {selectedOption.name} · DC {selectedOption.dc}
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
                          : defResult.ballStolen
                            ? '✅ Bola roubada! Sua vez de jogar!'
                            : defResult.success
                              ? '🟡 Marcação bem-sucedida — oponente atrasado!'
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

                    {/* Indicador de efeito */}
                    {defResult.success && (
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        {defResult.ballStolen && (
                          <span className="rounded-full bg-emerald-600/30 px-2 py-0.5 font-bold text-emerald-300">
                            ⚽ Posse recuperada
                          </span>
                        )}
                        {defResult.progressReduction > 0 && (
                          <span className="rounded-full bg-amber-600/30 px-2 py-0.5 font-bold text-amber-300">
                            📉 Progresso do oponente: -{defResult.progressReduction}%
                          </span>
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
