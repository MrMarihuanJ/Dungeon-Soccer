'use client'

// =====================================================================
// MatchArena - Componente principal que orquestra a partida RPG
// --------------------------------------------------------------------
// Fases:
//   1. COIN_FLIP — mostra moeda girando + resultado
//   2. PLAYER_TURN — jogador atual escolhe ação, vê dado, vê resultado
//   3. FINISHED — placar final + vencedor
// =====================================================================

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Swords, Trophy, ArrowLeft, Coins, Play, Loader2, History, ChevronRight,
} from 'lucide-react'
import { CoinFlip } from './CoinFlip'
import { DiceRoll } from './DiceRoll'
import { ActionCard } from './ActionCard'
import {
  sampleActions, sampleMixedActions, CATEGORY_META,
  type FootballAction,
} from '@/lib/dnd-actions'
import {
  type MatchState, type Possession, type DiceRollResult, type MatchEvent,
} from '@/lib/match-engine'
import { toast } from 'sonner'

interface Player {
  id: string
  username: string
  displayName?: string | null
  xp?: number
  wins?: number
  losses?: number
  draws?: number
}

interface Props {
  matchId: string
  homeUser: Player
  awayUser: Player
  currentUserId: string
  initialState?: MatchState
  onExit: () => void
}

type Phase = 'COIN_FLIP' | 'PLAYER_TURN' | 'OPPONENT_TURN' | 'FINISHED'

export function MatchArena({
  matchId, homeUser, awayUser, currentUserId, initialState, onExit,
}: Props) {
  const [state, setState] = useState<MatchState>(initialState || {
    matchId,
    status: 'COIN_FLIP',
    coinResult: null,
    startingSide: null,
    currentPossession: null,
    homeScore: 0,
    awayScore: 0,
    homeProgress: 0,
    awayProgress: 0,
    turnCount: 0,
    maxTurns: 24,
    events: [],
    winner: null,
  })

  const [phase, setPhase] = useState<Phase>(
    initialState?.status === 'FINISHED'
      ? 'FINISHED'
      : initialState?.status === 'IN_PROGRESS'
        ? (initialState.currentPossession === (currentUserId === homeUser.id ? 'HOME' : 'AWAY') ? 'PLAYER_TURN' : 'OPPONENT_TURN')
        : 'COIN_FLIP'
  )

  const [coinFlipping, setCoinFlipping] = useState(false)
  const [diceRolling, setDiceRolling] = useState(false)
  const [lastRoll, setLastRoll] = useState<DiceRollResult | null>(null)
  const [lastEvent, setLastEvent] = useState<MatchEvent | null>(null)
  const [availableActions, setAvailableActions] = useState<FootballAction[]>([])
  const [processing, setProcessing] = useState(false)
  const [turn, setTurn] = useState(1)

  const isHome = currentUserId === homeUser.id
  const mySide: Possession = isHome ? 'HOME' : 'AWAY'
  const myUser = isHome ? homeUser : awayUser
  const oppUser = isHome ? awayUser : homeUser

  // Sorteia 3 ações de KICKOFF para o primeiro turno
  const drawKickoffActions = useCallback(() => {
    setAvailableActions(sampleActions('KICKOFF', 3))
  }, [])

  // Sorteia 5 ações mistas para turnos subsequentes
  const drawMixedActions = useCallback(() => {
    setAvailableActions(sampleMixedActions(5))
  }, [])

  // ===== COIN FLIP =====
  const handleCoinFlip = async () => {
    setCoinFlipping(true)
    try {
      const res = await fetch('/api/match/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, type: 'COIN_FLIP' }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast.error(data.error || 'Erro no lançamento da moeda.')
        setCoinFlipping(false)
        return
      }
      // Aguarda animação da moeda (2.5s)
      setTimeout(() => {
        setCoinFlipping(false)
        setState((s) => ({
          ...s,
          status: 'IN_PROGRESS',
          coinResult: data.coinResult,
          startingSide: data.startingSide,
          currentPossession: data.currentPossession,
        }))
        const myTurn = data.currentPossession === mySide
        setPhase(myTurn ? 'PLAYER_TURN' : 'OPPONENT_TURN')
        if (myTurn) {
          drawKickoffActions()
        } else {
          // O oponente começou: simula jogada dele após 1.5s
          setTimeout(() => simulateOpponent(), 1500)
        }
        setTurn(1)
      }, 2600)
    } catch {
      toast.error('Erro de rede.')
      setCoinFlipping(false)
    }
  }

  // ===== PLAYER seleciona ação =====
  const handleSelectAction = async (action: FootballAction) => {
    if (processing || diceRolling) return
    setProcessing(true)
    setDiceRolling(true)
    setLastRoll(null)
    setLastEvent(null)

    // Aguarda animação do dado (1.8s)
    setTimeout(async () => {
      try {
        const res = await fetch('/api/match/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchId, type: 'PLAY_ACTION', action }),
        })
        const data = await res.json()
        if (!data.ok) {
          toast.error(data.error || 'Erro ao processar jogada.')
          setDiceRolling(false)
          setProcessing(false)
          return
        }
        setLastRoll(data.event.roll)
        setLastEvent(data.event)
        setState((s) => ({
          ...s,
          currentPossession: data.newState.currentPossession,
          homeScore: data.newState.homeScore,
          awayScore: data.newState.awayScore,
          homeProgress: data.newState.homeProgress,
          awayProgress: data.newState.awayProgress,
          turnCount: data.newState.turnCount,
          status: data.newState.status,
          winner: data.newState.winner,
          events: [...s.events, data.event],
        }))
        setDiceRolling(false)

        // Toast para eventos especiais
        if (data.event.isGoal) {
          const scorer = data.event.possession === 'HOME' ? homeUser.username : awayUser.username
          toast.success(`⚽ GOOOOL do ${scorer}!`, { duration: 4000 })
        } else if (data.event.roll.critical === 'crit_hit') {
          toast.success('🎲 CRITICAL HIT! Sucesso automático!')
        } else if (data.event.roll.critical === 'crit_fail') {
          toast.error('💀 CRITICAL FAIL! Falha automática!')
        }

        // Após 2s, processa próximo turno
        setTimeout(() => {
          if (data.newState.status === 'FINISHED') {
            setPhase('FINISHED')
          } else {
            const stillMyTurn = data.newState.currentPossession === mySide
            setPhase(stillMyTurn ? 'PLAYER_TURN' : 'OPPONENT_TURN')
            if (stillMyTurn) {
              // Próximo turno do mesmo jogador: sorteia 5 novas ações
              drawMixedActions()
              setTurn((t) => t + 1)
            } else {
              // Posse passou pro adversário
              setAvailableActions([])
              // Simula jogada do adversário após 1.5s
              setTimeout(() => simulateOpponent(), 1500)
            }
          }
          setProcessing(false)
        }, 2200)
      } catch {
        toast.error('Erro de rede.')
        setDiceRolling(false)
        setProcessing(false)
      }
    }, 1800)
  }

  // ===== Simula jogada do adversário (IA simples) =====
  const simulateOpponent = async () => {
    setDiceRolling(true)
    setLastRoll(null)
    setLastEvent(null)
    // Sorteia uma ação aleatória (mistura de categorias)
    const actions = sampleMixedActions(1)
    const action = actions[0]
    if (!action) return

    setTimeout(async () => {
      try {
        const res = await fetch('/api/match/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matchId, type: 'PLAY_ACTION', action }),
        })
        const data = await res.json()
        if (!data.ok) {
          setDiceRolling(false)
          return
        }
        setLastRoll(data.event.roll)
        setLastEvent(data.event)
        setState((s) => ({
          ...s,
          currentPossession: data.newState.currentPossession,
          homeScore: data.newState.homeScore,
          awayScore: data.newState.awayScore,
          homeProgress: data.newState.homeProgress,
          awayProgress: data.newState.awayProgress,
          turnCount: data.newState.turnCount,
          status: data.newState.status,
          winner: data.newState.winner,
          events: [...s.events, data.event],
        }))
        setDiceRolling(false)

        if (data.event.isGoal) {
          const scorer = data.event.possession === 'HOME' ? homeUser.username : awayUser.username
          toast.success(`⚽ GOOOOL do ${scorer}!`, { duration: 4000 })
        }

        setTimeout(() => {
          if (data.newState.status === 'FINISHED') {
            setPhase('FINISHED')
          } else {
            const myTurnNow = data.newState.currentPossession === mySide
            setPhase(myTurnNow ? 'PLAYER_TURN' : 'OPPONENT_TURN')
            if (myTurnNow) {
              drawMixedActions()
              setTurn((t) => t + 1)
            } else {
              setTimeout(() => simulateOpponent(), 1500)
            }
          }
          setProcessing(false)
        }, 2200)
      } catch {
        setDiceRolling(false)
      }
    }, 1800)
  }

  // ===== Renderização =====
  const myScore = isHome ? state.homeScore : state.awayScore
  const oppScore = isHome ? state.awayScore : state.homeScore
  const myProgress = isHome ? state.homeProgress : state.awayProgress
  const oppProgress = isHome ? state.awayProgress : state.homeProgress
  const myPossession = state.currentPossession === mySide
  const winnerIsMe = state.winner === mySide

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-emerald-950/30 to-gray-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-emerald-900/50 bg-gray-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onExit} className="text-gray-300 hover:bg-gray-800 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Sair
          </Button>
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-amber-400" />
            <span className="font-bold">Partida RPG</span>
            <Badge variant="outline" className="border-emerald-700 text-emerald-300">
              Turno {turn} / {state.maxTurns}
            </Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* ===== Placar ===== */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-2xl border border-emerald-900/50 bg-gray-900/60 p-4"
        >
          <div className="flex items-center justify-between gap-4">
            {/* Jogador HOME */}
            <PlayerSide
              user={homeUser}
              isMe={isHome}
              hasPossession={state.currentPossession === 'HOME'}
              score={state.homeScore}
              progress={state.homeProgress}
              color="emerald"
            />

            {/* VS */}
            <div className="flex flex-col items-center">
              <span className="text-2xl font-black text-amber-400">VS</span>
              <span className="text-xs text-gray-500">{state.turnCount} jogadas</span>
            </div>

            {/* Jogador AWAY */}
            <PlayerSide
              user={awayUser}
              isMe={!isHome}
              hasPossession={state.currentPossession === 'AWAY'}
              score={state.awayScore}
              progress={state.awayProgress}
              color="sky"
            />
          </div>

          {/* Barra de progresso do campo */}
          {phase !== 'COIN_FLIP' && phase !== 'FINISHED' && (
            <div className="mt-4 flex items-center gap-2 text-xs">
              <span className="text-emerald-400">⚽ {homeUser.username}</span>
              <div className="relative flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                  <motion.div
                    animate={{ width: `${(state.homeProgress / 100) * 50}%` }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                  />
                  <motion.div
                    animate={{ width: `${(state.awayProgress / 100) * 50}%`, x: '100%' }}
                    className="absolute right-0 top-0 h-full origin-right bg-gradient-to-l from-sky-500 to-sky-400"
                  />
                </div>
                <div className="absolute left-1/2 top-0 h-full w-px bg-amber-400/50" />
              </div>
              <span className="text-sky-400">{awayUser.username} ⚽</span>
            </div>
          )}
        </motion.div>

        {/* ===== FASE: COIN FLIP ===== */}
        {phase === 'COIN_FLIP' && (
          <Card className="border-amber-500/30 bg-gray-900/60">
            <CardContent className="p-6">
              {!state.coinResult && !coinFlipping ? (
                <div className="flex flex-col items-center gap-6 py-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring' }}
                  >
                    <Coins className="h-16 w-16 text-amber-400" />
                  </motion.div>
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-amber-400">Pronto para começar?</h2>
                    <p className="mt-1 text-sm text-gray-400">
                      O juiz vai lançar a moeda para decidir quem sai com a bola.
                    </p>
                  </div>
                  <Button
                    onClick={handleCoinFlip}
                    disabled={coinFlipping}
                    size="lg"
                    className="gap-2 bg-amber-500 text-black hover:bg-amber-400"
                  >
                    {coinFlipping ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                    Lançar Moeda
                  </Button>
                </div>
              ) : (
                <CoinFlip
                  result={state.coinResult}
                  flipping={coinFlipping}
                  homeUser={homeUser}
                  awayUser={awayUser}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* ===== FASE: PLAYER TURN ou OPPONENT TURN ===== */}
        {(phase === 'PLAYER_TURN' || phase === 'OPPONENT_TURN') && (
          <div className="space-y-4">
            {/* Indicador de quem joga */}
            <div className="flex items-center justify-center">
              <motion.div
                key={phase}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-full px-4 py-1 text-sm font-bold ${
                  phase === 'PLAYER_TURN'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-sky-500/20 text-sky-300'
                }`}
              >
                {phase === 'PLAYER_TURN'
                  ? `🎯 Sua vez, ${myUser.username}!`
                  : `⏳ ${oppUser.username} está jogando...`}
              </motion.div>
            </div>

            {/* Dice Roll (se rolando ou com resultado) */}
            {(diceRolling || lastRoll) && (
              <Card className="border-emerald-500/30 bg-gray-900/60">
                <CardContent className="flex flex-col items-center gap-4 p-6">
                  <DiceRoll roll={lastRoll} rolling={diceRolling} />
                  {lastEvent && lastRoll && !diceRolling && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg bg-gray-800/80 p-3 text-center"
                    >
                      <p className="text-sm">
                        <span className="text-2xl">{lastEvent.action.emoji}</span>{' '}
                        <strong className="text-white">{lastEvent.action.name}</strong>
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        {lastEvent.isGoal ? (
                          <span className="text-amber-400">⚽ GOL! Progresso zerado, bola para o adversário.</span>
                        ) : lastEvent.possessionChanged ? (
                          <span className="text-red-400">❌ Perdeu a posse! Bola para o adversário.</span>
                        ) : lastEvent.roll.success ? (
                          <span className="text-emerald-400">
                            ✅ Sucesso! +{lastEvent.progressGained}% de progresso no campo.
                          </span>
                        ) : (
                          <span className="text-amber-400">⚠️ Falhou mas manteve a bola.</span>
                        )}
                      </p>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Action cards (somente no PLAYER_TURN e se não estiver processando) */}
            {phase === 'PLAYER_TURN' && !processing && availableActions.length > 0 && (
              <Card className="border-emerald-500/30 bg-gray-900/60">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-emerald-400">
                    <Swords className="h-5 w-5" />
                    {turn === 1 ? 'Escolha sua saída de bola' : 'Escolha sua próxima jogada'}
                  </CardTitle>
                  <p className="text-xs text-gray-400">
                    {turn === 1
                      ? '3 opções de saída de bola disponíveis.'
                      : '5 estratégias sorteadas das 100+ disponíveis. Clique para jogar o dado!'}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${turn > 1 ? 'lg:grid-cols-3' : ''}`}>
                    {availableActions.map((action, idx) => (
                      <ActionCard
                        key={`${action.id}-${idx}`}
                        action={action}
                        index={idx}
                        onSelect={handleSelectAction}
                        disabled={processing}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Loading do oponente */}
            {phase === 'OPPONENT_TURN' && (
              <Card className="border-sky-500/30 bg-gray-900/60">
                <CardContent className="flex items-center justify-center gap-3 p-8">
                  <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
                  <span className="text-sky-300">{oppUser.username} está pensando...</span>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ===== FASE: FINISHED ===== */}
        {phase === 'FINISHED' && (
          <Card className="border-amber-500/40 bg-gray-900/60">
            <CardContent className="flex flex-col items-center gap-6 p-8">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              >
                <Trophy className={`h-20 w-20 ${winnerIsMe ? 'text-amber-400' : 'text-gray-500'}`} />
              </motion.div>
              <div className="text-center">
                <h2 className="text-3xl font-bold text-amber-400">
                  {state.winner === 'DRAW' ? 'EMPATE!' : winnerIsMe ? 'VITÓRIA!' : 'DERROTA'}
                </h2>
                <p className="mt-2 text-sm text-gray-400">
                  Placar final: <strong className="text-emerald-400">{homeUser.username} {state.homeScore}</strong> ·{' '}
                  <strong className="text-sky-400">{state.awayScore} {awayUser.username}</strong>
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {winnerIsMe ? '+50 XP' : state.winner === 'DRAW' ? '+20 XP' : '+10 XP'}
                </p>
              </div>
              <Button onClick={onExit} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                <ArrowLeft className="h-4 w-4" />
                Voltar ao Lobby
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ===== Histórico de jogadas ===== */}
        {state.events.length > 0 && (
          <Card className="mt-6 border-gray-700/50 bg-gray-900/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm text-gray-300">
                <History className="h-4 w-4" />
                Histórico ({state.events.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px] pr-2">
                <ul className="space-y-1">
                  {[...state.events].reverse().map((e, i) => {
                    const scorer = e.possession === 'HOME' ? homeUser : awayUser
                    return (
                      <li
                        key={i}
                        className="flex items-center gap-2 rounded bg-gray-800/40 p-2 text-xs"
                      >
                        <span className="font-mono text-gray-500">#{e.turn}</span>
                        <span className="text-lg">{e.action.emoji}</span>
                        <span className="flex-1 truncate">
                          <strong className={e.possession === 'HOME' ? 'text-emerald-400' : 'text-sky-400'}>
                            {scorer.username}
                          </strong>{' '}
                          fez <strong>{e.action.name}</strong>
                        </span>
                        <span className="font-mono text-gray-400">
                          🎲{e.roll.dice}+{e.roll.bonus}={e.roll.total}
                        </span>
                        {e.isGoal && <span className="text-amber-400">⚽ GOL!</span>}
                        {!e.isGoal && e.roll.success && <span className="text-emerald-400">✓</span>}
                        {!e.isGoal && !e.roll.success && <span className="text-red-400">✗</span>}
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}

// =====================================================================
// PlayerSide - Subcomponente: avatar + score + posse de bola
// =====================================================================
function PlayerSide({
  user, isMe, hasPossession, score, progress, color,
}: {
  user: Player
  isMe: boolean
  hasPossession: boolean
  score: number
  progress: number
  color: 'emerald' | 'sky'
}) {
  const initials = (user.displayName || user.username).slice(0, 2).toUpperCase()
  const colorClass = color === 'emerald' ? 'emerald' : 'sky'

  return (
    <motion.div
      animate={hasPossession ? { scale: 1.05 } : { scale: 1 }}
      className={`flex flex-1 flex-col items-center gap-2 ${isMe ? '' : 'opacity-90'}`}
    >
      <div className={`relative rounded-full p-1 ${hasPossession ? `ring-2 ring-${colorClass}-400` : ''}`}>
        <Avatar className={`h-14 w-14 border-2 border-${colorClass}-500`}>
          <AvatarFallback className={`bg-gradient-to-br from-${colorClass}-500 to-${colorClass}-700 font-bold text-white`}>
            {initials}
          </AvatarFallback>
        </Avatar>
        {hasPossession && (
          <motion.div
            animate={{ y: [-2, 2, -2] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-lg"
          >
            ⚽
          </motion.div>
        )}
      </div>
      <div className="text-center">
        <p className={`text-sm font-bold ${isMe ? `text-${colorClass}-300` : 'text-gray-300'}`}>
          {user.username}
          {isMe && <span className="ml-1 text-[10px] text-gray-500">(você)</span>}
        </p>
        <p className={`text-3xl font-black ${color === 'emerald' ? 'text-emerald-400' : 'text-sky-400'}`}>
          {score}
        </p>
      </div>
    </motion.div>
  )
}
