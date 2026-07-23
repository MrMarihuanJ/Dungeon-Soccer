'use client'

// =====================================================================
// MatchArena - Componente principal que orquestra a partida RPG
// --------------------------------------------------------------------
// Fases:
//   1. COIN_FLIP — mostra moeda girando + resultado
//   2. PLAYER_TURN — jogador atual escolhe ação, vê dado, vê resultado
//   3. OPPONENT_TURN — IA do adversário joga automaticamente
//   4. PAUSED — partida pausada, timer congelado
//   5. HALFTIME — intervalo (apenas FULL_90)
//   6. FINISHED — placar final + vencedor
// =====================================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Swords, Trophy, ArrowLeft, Coins, Play, Loader2, History, ChevronRight,
  AlertTriangle, Users, Pause, RotateCcw, Clock, Coffee, Zap, Shield,
} from 'lucide-react'
import { CoinFlip } from './CoinFlip'
import { DiceRoll } from './DiceRoll'
import { ActionCard } from './ActionCard'
import { SubstitutionModal } from './SubstitutionModal'
import { VARReview } from './VARReview'
import { FreeKickDialog } from './FreeKickDialog'
import {
  sampleActions, sampleMixedActions, CATEGORY_META,
  type FootballAction,
} from '@/lib/dnd-actions'
import {
  type MatchState, type Possession, type DiceRollResult, type MatchEvent,
  type PenaltyEvent, type TeamMatchState, type GameMode,
  type PlayerPenaltyMultiplier,
  GAME_MODE_CONFIG, calculateMatchTime, calculateRemainingTimeMs,
  checkMatchEndCondition, isHalftimeReached,
  pickPlayerForAction, generatePenaltyMultipliers,
} from '@/lib/match-engine'
import { playWhistleSound, playGoalSound } from '@/lib/sound'
import { useTeamStore, type SelectedPlayer } from '@/lib/football/store'
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
  gameMode?: GameMode
  initialState?: MatchState
  onExit: () => void
}

type Phase = 'COIN_FLIP' | 'PLAYER_TURN' | 'OPPONENT_TURN' | 'FINISHED' | 'PENALTY_EVENT' | 'VAR_REVIEW' | 'FREE_KICK' | 'SUBSTITUTION' | 'PAUSED' | 'HALFTIME' | 'DEFEND_OPPORTUNITY'

export function MatchArena({
  matchId, homeUser, awayUser, currentUserId, gameMode = 'QUICK_MATCH', initialState, onExit,
}: Props) {
  const modeConfig = GAME_MODE_CONFIG[gameMode]

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
    maxTurns: modeConfig.maxTurns > 0 ? modeConfig.maxTurns : 999,
    events: [],
    winner: null,
    homeTeamState: { substitutionsUsed: 0, maxSubstitutions: 5, redCards: 0, yellowCards: 0, injuredPlayers: [], sentOffPlayers: [] },
    awayTeamState: { substitutionsUsed: 0, maxSubstitutions: 5, redCards: 0, yellowCards: 0, injuredPlayers: [], sentOffPlayers: [] },
    gameMode,
    matchStartedAt: null,
    pausedAt: null,
    totalPausedMs: 0,
    halftimeTaken: false,
    secondHalfStartedAt: null,
    xpReward: modeConfig.xpWin,
    turnStartedAt: null,
    matchEndReason: '',
    penaltyMultipliers: [],
  })

  const [phase, setPhase] = useState<Phase>(
    initialState?.status === 'FINISHED'
      ? 'FINISHED'
      : initialState?.status === 'PAUSED'
        ? 'PAUSED'
        : initialState?.status === 'HALFTIME'
          ? 'HALFTIME'
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

  // Timer state
  const [matchTimeDisplay, setMatchTimeDisplay] = useState('--:--')
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [turnTimerSeconds, setTurnTimerSeconds] = useState(modeConfig.turnTimerSeconds)
  const [isPaused, setIsPaused] = useState(false)
  const [isHalftime, setIsHalftime] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [resuming, setResuming] = useState(false)

  // Penalty/substitution/VAR/freekick states
  const [currentPenalty, setCurrentPenalty] = useState<PenaltyEvent | null>(null)
  const [varOpen, setVarOpen] = useState(false)
  const [varEventDesc, setVarEventDesc] = useState('')
  const [freeKickOpen, setFreeKickOpen] = useState(false)
  const [freeKickPossession, setFreeKickPossession] = useState<Possession>('HOME')
  const [subOpen, setSubOpen] = useState(false)
  const [subIsForced, setSubIsForced] = useState(false)
  const [subInjuredPlayer, setSubInjuredPlayer] = useState<SelectedPlayer | null>(null)
  const [myReserves, setMyReserves] = useState<SelectedPlayer[]>([])
  const [myStarters, setMyStarters] = useState<SelectedPlayer[]>([])
  const [pendingPenalty, setPendingPenalty] = useState<PenaltyEvent | null>(null)
  const [penaltyMultipliers, setPenaltyMultipliers] = useState<PlayerPenaltyMultiplier[]>([])

  // Refs for timers
  const matchTimerRef = useRef<NodeJS.Timeout | null>(null)
  const turnTimerRef = useRef<NodeJS.Timeout | null>(null)
  const autoPlayRef = useRef(false)

  // Populate starters/reserves from the Zustand store
  const { starters: storeStarters, reserves: storeReserves } = useTeamStore()
  useEffect(() => {
    const startersList = Object.values(storeStarters).filter((p): p is SelectedPlayer => p !== null)
    setMyStarters(startersList)
    setMyReserves(storeReserves)
    // Generate penalty multipliers from starter IDs (once per match, when starters change)
    if (penaltyMultipliers.length === 0 && startersList.length > 0) {
      const starterIds = startersList.map(p => p.id)
      setPenaltyMultipliers(generatePenaltyMultipliers(starterIds))
    }
  }, [storeStarters, storeReserves])

  const isHome = currentUserId === homeUser.id
  const mySide: Possession = isHome ? 'HOME' : 'AWAY'
  const myUser = isHome ? homeUser : awayUser
  const oppUser = isHome ? awayUser : homeUser

  // ===== MATCH TIMER (real-time countdown) =====
  useEffect(() => {
    if (modeConfig.durationMs === 0 || !state.matchStartedAt || phase === 'COIN_FLIP' || phase === 'FINISHED') {
      return
    }

    if (isPaused || phase === 'PAUSED' || phase === 'HALFTIME') {
      // Don't update timer when paused
      return
    }

    const updateTimer = () => {
      const timeStr = calculateMatchTime({
        gameMode: state.gameMode,
        matchStartedAt: state.matchStartedAt,
        pausedAt: state.pausedAt,
        totalPausedMs: state.totalPausedMs,
        halftimeTaken: state.halftimeTaken,
        secondHalfStartedAt: state.secondHalfStartedAt,
      })
      setMatchTimeDisplay(timeStr)

      const remaining = calculateRemainingTimeMs({
        gameMode: state.gameMode,
        matchStartedAt: state.matchStartedAt,
        pausedAt: state.pausedAt,
        totalPausedMs: state.totalPausedMs,
        halftimeTaken: state.halftimeTaken,
        secondHalfStartedAt: state.secondHalfStartedAt,
      })
      if (remaining !== null) {
        setRemainingSeconds(Math.ceil(remaining / 1000))
      }
    }

    updateTimer()
    matchTimerRef.current = setInterval(updateTimer, 1000)

    return () => {
      if (matchTimerRef.current) clearInterval(matchTimerRef.current)
    }
  }, [state.matchStartedAt, state.pausedAt, state.totalPausedMs, state.halftimeTaken, state.secondHalfStartedAt, isPaused, phase, state.gameMode, modeConfig.durationMs])

  // ===== CHECK FOR TIME EXPIRY =====
  useEffect(() => {
    if (remainingSeconds !== null && remainingSeconds <= 0 && phase !== 'FINISHED' && phase !== 'PAUSED') {
      // Time expired - end match
      handleTimeExpired()
    }
  }, [remainingSeconds])

  // ===== CHECK FOR HALFTIME =====
  useEffect(() => {
    if (gameMode === 'FULL_90' && state.matchStartedAt && !state.halftimeTaken && phase !== 'FINISHED' && phase !== 'PAUSED' && phase !== 'HALFTIME') {
      const reached = isHalftimeReached({
        gameMode,
        matchStartedAt: state.matchStartedAt,
        pausedAt: state.pausedAt,
        totalPausedMs: state.totalPausedMs,
        halftimeTaken: false,
      })
      if (reached) {
        handleHalftimeReached()
      }
    }
  }, [remainingSeconds, state.matchStartedAt, state.halftimeTaken, phase])

  // ===== TURN TIMER =====
  useEffect(() => {
    if (phase !== 'PLAYER_TURN' || isPaused) {
      if (turnTimerRef.current) clearInterval(turnTimerRef.current)
      return
    }

    setTurnTimerSeconds(modeConfig.turnTimerSeconds)

    turnTimerRef.current = setInterval(() => {
      setTurnTimerSeconds((prev) => {
        if (prev <= 1) {
          // Auto-play a random action
          if (!autoPlayRef.current) {
            autoPlayRef.current = true
            handleAutoPlay()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (turnTimerRef.current) clearInterval(turnTimerRef.current)
    }
  }, [phase, isPaused, turn])

  // Reset turn timer when it's my turn again
  useEffect(() => {
    if (phase === 'PLAYER_TURN') {
      setTurnTimerSeconds(modeConfig.turnTimerSeconds)
      autoPlayRef.current = false
    }
  }, [phase, turn])

  const handleTimeExpired = async () => {
    // Call the action API which will detect time expiry and end the match
    try {
      const res = await fetch('/api/match/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, type: 'PLAY_ACTION', action: { id: 'idle', name: 'idle', emoji: '⏰', category: 'PASS', dc: 99, skillBonus: 0, progress: 0, ballRetentionOnFail: 0, goalChance: 0, description: '' } }),
      })
      const data = await res.json()
      if (data.ok && data.newState) {
        setState((s) => ({
          ...s,
          status: 'FINISHED',
          winner: data.newState.winner,
          matchEndReason: 'Tempo esgotado!',
        }))
        setPhase('FINISHED')
      }
    } catch {
      // Fallback: just set finished locally
      const winner = state.homeScore > state.awayScore ? 'HOME' : state.awayScore > state.homeScore ? 'AWAY' : 'DRAW'
      setState((s) => ({ ...s, status: 'FINISHED', winner, matchEndReason: 'Tempo esgotado!' }))
      setPhase('FINISHED')
    }
  }

  const handleHalftimeReached = async () => {
    try {
      // The action API will set status to HALFTIME
      // We'll update locally too
      setState((s) => ({ ...s, status: 'HALFTIME' }))
      setPhase('HALFTIME')
      setIsHalftime(true)
      toast('⚽ Fim do primeiro tempo! Intervalo.', { duration: 5000 })
    } catch {
      // ignore
    }
  }

  const handleAutoPlay = () => {
    if (processing || diceRolling) return
    const actions = sampleMixedActions(1)
    const action = actions[0]
    if (action) {
      // Seleciona jogador automaticamente
      const startersList = Object.values(storeStarters).filter((p): p is SelectedPlayer => p !== null)
      let autoPlayerName: string | undefined
      if (startersList.length > 0) {
        const { player } = pickPlayerForAction(
          startersList.map(p => ({ name: p.name, position: p.position })),
          action.category,
        )
        autoPlayerName = player
      }
      handleSelectAction(action, autoPlayerName)
    }
  }

  // ===== PAUSE / RESUME =====
  const handlePause = async () => {
    setPausing(true)
    try {
      const res = await fetch('/api/match/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId }),
      })
      const data = await res.json()
      if (data.ok) {
        setIsPaused(true)
        setPhase('PAUSED')
        setState((s) => ({ ...s, status: 'PAUSED', pausedAt: new Date() }))
        toast('⏸️ Partida pausada!')
      } else {
        toast.error(data.error || 'Erro ao pausar.')
      }
    } catch {
      toast.error('Erro de conexão ao pausar.')
    } finally {
      setPausing(false)
    }
  }

  const handleResume = async () => {
    setResuming(true)
    try {
      const res = await fetch('/api/match/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId }),
      })
      const data = await res.json()
      if (data.ok) {
        setIsPaused(false)
        setIsHalftime(false)
        // Calculate paused duration for local state
        const prevPausedMs = state.totalPausedMs
        const pausedAtTime = state.pausedAt ? new Date(state.pausedAt).getTime() : Date.now()
        const pausedDuration = Date.now() - pausedAtTime

        setState((s) => ({
          ...s,
          status: 'IN_PROGRESS',
          pausedAt: null,
          totalPausedMs: prevPausedMs + pausedDuration,
          halftimeTaken: s.halftimeTaken || isHalftime,
          secondHalfStartedAt: isHalftime ? new Date() : s.secondHalfStartedAt,
          turnStartedAt: new Date(),
        }))

        // Resume to correct phase
        const myTurn = state.currentPossession === mySide
        setPhase(myTurn ? 'PLAYER_TURN' : 'OPPONENT_TURN')
        if (myTurn) {
          drawMixedActions()
        } else {
          setTimeout(() => simulateOpponent(), 1500)
        }
        toast('▶️ Partida retomada!')
      } else {
        toast.error(data.error || 'Erro ao retomar.')
      }
    } catch {
      toast.error('Erro de conexão ao retomar.')
    } finally {
      setResuming(false)
    }
  }

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
          matchStartedAt: new Date(),
          turnStartedAt: new Date(),
        }))
        const myTurn = data.currentPossession === mySide
        setPhase(myTurn ? 'PLAYER_TURN' : 'OPPONENT_TURN')
        if (myTurn) {
          drawKickoffActions()
        } else {
          setTimeout(() => simulateOpponent(), 1500)
        }
        setTurn(1)
      }, 2600)
    } catch (err) {
      console.error('[MatchArena] coin flip error:', err)
      toast.error('Erro de conexão ao lançar moeda.')
      setCoinFlipping(false)
    }
  }

  // ===== PLAYER seleciona ação =====
  const handleSelectAction = async (action: FootballAction, forcedPlayerName?: string) => {
    if (processing || diceRolling) return
    setProcessing(true)
    setDiceRolling(true)
    setLastRoll(null)
    setLastEvent(null)

    // Seleciona jogador para narrativa
    let playerName = forcedPlayerName
    let targetPlayerName: string | undefined
    if (!playerName) {
      const startersList = Object.values(storeStarters).filter((p): p is SelectedPlayer => p !== null)
      const { player, target } = pickPlayerForAction(
        startersList.map(p => ({ name: p.name, position: p.position })),
        action.category,
      )
      playerName = player
      targetPlayerName = target
    }

    // Aguarda animação do dado (1.8s)
    setTimeout(async () => {
      try {
        const res = await fetch('/api/match/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matchId,
            type: 'PLAY_ACTION',
            action,
            playerName: playerName || undefined,
            targetPlayerName: targetPlayerName || undefined,
          }),
        })
        const data = await res.json()

        // Check for time expiry or halftime from server
        if (data.timeExpired) {
          setState((s) => ({
            ...s,
            status: 'FINISHED',
            winner: data.newState.winner,
            matchEndReason: 'Tempo esgotado!',
            homeScore: data.newState.homeScore,
            awayScore: data.newState.awayScore,
          }))
          setDiceRolling(false)
          setPhase('FINISHED')
          setProcessing(false)
          return
        }

        if (data.halftimeReached) {
          setState((s) => ({
            ...s,
            status: 'HALFTIME',
            pausedAt: new Date(),
          }))
          setDiceRolling(false)
          setPhase('HALFTIME')
          setIsHalftime(true)
          toast('⚽ Fim do primeiro tempo! Intervalo.', { duration: 5000 })
          setProcessing(false)
          return
        }

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
          homeTeamState: data.newState.homeTeamState || s.homeTeamState,
          awayTeamState: data.newState.awayTeamState || s.awayTeamState,
          events: [...s.events, data.event],
          matchEndReason: data.newState.matchEndReason || '',
          turnStartedAt: new Date(),
        }))
        setDiceRolling(false)

        // Toast para eventos especiais
        if (data.event.isGoal) {
          const scorer = data.event.possession === 'HOME' ? homeUser.username : awayUser.username
          const goalPlayerName = data.event.playerName || scorer
          playGoalSound()
          toast.success(`⚽ GOOOOL! ${goalPlayerName} marca para ${scorer}!`, { duration: 4000 })

          // Check for QUICK_MATCH win condition
          if (gameMode === 'QUICK_MATCH') {
            const newHomeScore = data.newState.homeScore
            const newAwayScore = data.newState.awayScore
            if (newHomeScore >= modeConfig.goalsToWin || newAwayScore >= modeConfig.goalsToWin) {
              setTimeout(() => {
                setPhase('FINISHED')
                setProcessing(false)
              }, 2000)
              return
            }
          }
        } else if (data.event.roll.critical === 'crit_hit') {
          toast.success('🎲 CRITICAL HIT! Sucesso automático!')
        } else if (data.event.roll.critical === 'crit_fail') {
          toast.error('💀 CRITICAL FAIL! Falha automática!')
        }

        // Handle penalty events
        if (data.event.penaltyEvent) {
          const pe = data.event.penaltyEvent
          setCurrentPenalty(pe)

          const penaltyEmojis: Record<string, string> = {
            FOUL: '🟨', OFFSIDE: '🚫', CORNER: '🚩', BALL_OUT: '📤',
            YELLOW_CARD: '🟡', RED_CARD: '🔴', INJURY: '🏥',
            PENALTY_KICK: '⚪', VAR_REVIEW: '📺',
          }
          // Play whistle sound for penalty kicks
          if (pe.type === 'PENALTY_KICK') {
            playWhistleSound()
          }
          toast(`${penaltyEmojis[pe.type] ?? '⚠️'} ${pe.description}`, {
            duration: 4000,
            style: { background: pe.type === 'RED_CARD' ? '#7f1d1d' : pe.type === 'INJURY' ? '#78350f' : pe.type === 'PENALTY_KICK' ? '#1c1917' : '#1e293b' },
          })

          setTimeout(() => {
            handlePenaltyFlow(pe)
          }, 2500)
          return
        }

        // No penalty: normal flow
        proceedToNextTurn(data)
        setProcessing(false)
      } catch (err) {
        console.error('[MatchArena] action error:', err)
        toast.error('Erro de conexão.')
        setDiceRolling(false)
        setProcessing(false)
      }
    }, 1800)
  }

  // ===== Handle penalty event flow =====
  const handlePenaltyFlow = (pe: PenaltyEvent) => {
    if (pe.requiresVAR) {
      setVarEventDesc(pe.description)
      setVarOpen(true)
      setPendingPenalty(pe)
      return
    }
    processPenaltyAfterVAR(pe)
  }

  const processPenaltyAfterVAR = (pe: PenaltyEvent) => {
    if (pe.type === 'INJURY' && pe.requiresSubstitution) {
      setSubIsForced(true)
      let injPlayer: SelectedPlayer | null = null
      if (pe.injuredPlayerId) {
        injPlayer = myStarters.find(p => p.id === pe.injuredPlayerId) || null
      }
      if (!injPlayer && myStarters.length > 0) {
        injPlayer = myStarters[Math.floor(Math.random() * myStarters.length)]
      }
      if (!injPlayer) {
        injPlayer = { id: pe.injuredPlayerId || 'unknown', name: 'Jogador Lesionado', fullName: 'Jogador Lesionado', team: '', position: 'MF', photoUrl: '' }
      }
      setSubInjuredPlayer(injPlayer)
      setSubOpen(true)
      return
    }
    if (pe.requiresFreeKick || pe.type === 'FOUL') {
      setFreeKickPossession(pe.favoredPossession)
      setFreeKickOpen(true)
      return
    }
    if (pe.type === 'PENALTY_KICK') {
      setFreeKickPossession(pe.favoredPossession)
      setFreeKickOpen(true)
      return
    }
    finishPenaltyAndContinue()
  }

  const finishPenaltyAndContinue = () => {
    setCurrentPenalty(null)
    setPendingPenalty(null)
    if (state.status === 'FINISHED') {
      setPhase('FINISHED')
    } else {
      const stillMyTurn = state.currentPossession === mySide
      setPhase(stillMyTurn ? 'PLAYER_TURN' : 'OPPONENT_TURN')
      if (stillMyTurn) {
        drawMixedActions()
        setTurn((t) => t + 1)
      } else {
        setAvailableActions([])
        setTimeout(() => simulateOpponent(), 1500)
      }
    }
    setProcessing(false)
  }

  // VAR decision callback
  const handleVARDecision = (decision: 'CONFIRMED' | 'OVERTURNED') => {
    setVarOpen(false)
    toast(decision === 'CONFIRMED' ? '📺 VAR confirmou a decisão!' : '📺 VAR inverteu a decisão!', {
      duration: 3000,
    })
    if (pendingPenalty) {
      if (decision === 'OVERTURNED') {
        finishPenaltyAndContinue()
      } else {
        processPenaltyAfterVAR(pendingPenalty)
      }
    } else {
      finishPenaltyAndContinue()
    }
  }

  // Free kick play callback
  const handleFreeKickPlay = async (kickerId: string, action: FootballAction) => {
    setFreeKickOpen(false)
    // IMPORTANTE: reset processing/diceRolling antes de chamar handleSelectAction
    // pois as flags ficaram presas do turno anterior que gerou a falta
    setProcessing(false)
    setDiceRolling(false)
    // Encontra o nome do batedor para a narrativa
    const kicker = myStarters.find(p => p.id === kickerId)
    const kickerName = kicker?.name
    await handleSelectAction(action, kickerName)
  }

  // Substitution callback
  const handleSubstitution = (outPlayerId: string, inPlayerId: string) => {
    setSubOpen(false)
    const myTeamState = isHome ? state.homeTeamState : state.awayTeamState
    const updatedTeamState: TeamMatchState = {
      ...myTeamState,
      substitutionsUsed: myTeamState.substitutionsUsed + 1,
      injuredPlayers: myTeamState.injuredPlayers.filter((id) => id !== outPlayerId),
    }
    setState((s) => ({
      ...s,
      homeTeamState: isHome ? updatedTeamState : s.homeTeamState,
      awayTeamState: isHome ? s.awayTeamState : updatedTeamState,
    }))
    toast.success('✅ Substituição realizada!')
    finishPenaltyAndContinue()
  }

  // Continue after penalty flow
  const proceedToNextTurn = (data: any) => {
    setTimeout(() => {
      if (data.newState.status === 'FINISHED') {
        setPhase('FINISHED')
      } else {
        const stillMyTurn = data.newState.currentPossession === mySide
        setPhase(stillMyTurn ? 'PLAYER_TURN' : 'OPPONENT_TURN')
        if (stillMyTurn) {
          drawMixedActions()
          setTurn((t) => t + 1)
        } else {
          setAvailableActions([])
          setTimeout(() => simulateOpponent(), 1500)
        }
      }
    }, 2200)
  }

  // ===== Voluntary substitution =====
  const handleVoluntarySub = () => {
    const myTeamState = isHome ? state.homeTeamState : state.awayTeamState
    if (myTeamState.substitutionsUsed >= myTeamState.maxSubstitutions) {
      toast.error('Limite de 5 substituições atingido!')
      return
    }
    setSubIsForced(false)
    setSubInjuredPlayer(null)
    setSubOpen(true)
  }

  // ===== Simula jogada do adversário (IA simples) =====
  // Before the opponent plays, check for a defensive opportunity (30% chance)
  const simulateOpponent = async () => {
    // Check for defensive opportunity: if the player doesn't have possession,
    // there's a 30% chance the player gets offered DEFEND actions
    if (!state.currentPossession) return
    const opponentHasPossession = state.currentPossession !== mySide
    if (opponentHasPossession) {
      const defendChance = Math.random()
      if (defendChance < 0.30) {
        // Defensive opportunity! Show DEFEND actions to the player
        setPhase('DEFEND_OPPORTUNITY')
        setAvailableActions(sampleActions('DEFEND', 3))
        toast('🛡️ Oportunidade de Defesa! Tente roubar a bola!', {
          duration: 4000,
          style: { background: '#78350f', color: '#fbbf24', border: '2px solid #92400e' },
        })
        return
      }
    }
    // No defensive opportunity, opponent plays normally
    executeOpponentPlay()
  }

  // The actual opponent simulation (separated from defensive opportunity check)
  const executeOpponentPlay = async () => {
    setDiceRolling(true)
    setLastRoll(null)
    setLastEvent(null)
    const actions = sampleMixedActions(1)
    const action = actions[0]
    if (!action) return

    // Gera nome de jogador para o adversário (usa os mesmos titulares como "time adversário")
    const oppStarters = myStarters.length > 0 ? myStarters : []
    let oppPlayerName: string | undefined
    let oppTargetName: string | undefined
    if (oppStarters.length > 0) {
      const { player, target } = pickPlayerForAction(
        oppStarters.map(p => ({ name: p.name, position: p.position })),
        action.category,
      )
      oppPlayerName = player
      oppTargetName = target
    }

    setTimeout(async () => {
      try {
        const res = await fetch('/api/match/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matchId,
            type: 'PLAY_ACTION',
            action,
            playerName: oppPlayerName,
            targetPlayerName: oppTargetName,
          }),
        })
        const data = await res.json()

        // Check for time expiry or halftime
        if (data.timeExpired) {
          setState((s) => ({
            ...s,
            status: 'FINISHED',
            winner: data.newState.winner,
            matchEndReason: 'Tempo esgotado!',
          }))
          setDiceRolling(false)
          setPhase('FINISHED')
          return
        }

        if (data.halftimeReached) {
          setState((s) => ({ ...s, status: 'HALFTIME', pausedAt: new Date() }))
          setDiceRolling(false)
          setPhase('HALFTIME')
          setIsHalftime(true)
          toast('⚽ Fim do primeiro tempo! Intervalo.', { duration: 5000 })
          return
        }

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
          homeTeamState: data.newState.homeTeamState || s.homeTeamState,
          awayTeamState: data.newState.awayTeamState || s.awayTeamState,
          events: [...s.events, data.event],
          matchEndReason: data.newState.matchEndReason || '',
          turnStartedAt: new Date(),
        }))
        setDiceRolling(false)

        if (data.event.isGoal) {
          const scorer = data.event.possession === 'HOME' ? homeUser.username : awayUser.username
          const goalPlayerName = data.event.playerName || scorer
          playGoalSound()
          toast.success(`⚽ GOOOOL! ${goalPlayerName} marca para ${scorer}!`, { duration: 4000 })

          // Check for QUICK_MATCH win
          if (gameMode === 'QUICK_MATCH') {
            const newHomeScore = data.newState.homeScore
            const newAwayScore = data.newState.awayScore
            if (newHomeScore >= modeConfig.goalsToWin || newAwayScore >= modeConfig.goalsToWin) {
              setTimeout(() => setPhase('FINISHED'), 2000)
              return
            }
          }
        }

        // Handle penalty for opponent
        if (data.event.penaltyEvent) {
          const pe = data.event.penaltyEvent
          const penaltyEmojis: Record<string, string> = {
            FOUL: '🟨', OFFSIDE: '🚫', CORNER: '🚩', BALL_OUT: '📤',
            YELLOW_CARD: '🟡', RED_CARD: '🔴', INJURY: '🏥',
            PENALTY_KICK: '⚪', VAR_REVIEW: '📺',
          }
          // Play whistle sound for penalty kicks
          if (pe.type === 'PENALTY_KICK') {
            playWhistleSound()
          }
          toast(`${penaltyEmojis[pe.type] ?? '⚠️'} ${pe.description}`, {
            duration: 4000,
            style: { background: pe.type === 'RED_CARD' ? '#7f1d1d' : pe.type === 'INJURY' ? '#78350f' : pe.type === 'PENALTY_KICK' ? '#1c1917' : '#1e293b' },
          })
          if (pe.type === 'RED_CARD') {
            setState((s) => ({
              ...s,
              awayTeamState: { ...s.awayTeamState, redCards: s.awayTeamState.redCards + 1 },
            }))
          }
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
      } catch (err) {
        console.error('[MatchArena] opponent action error:', err)
        setDiceRolling(false)
      }
    }, 1800)
  }

  // ===== Handle defensive action (DEFEND_OPPORTUNITY phase) =====
  // When the player selects a DEFEND action during the defensive opportunity phase,
  // it goes through the normal dice roll + API flow, and the result determines what happens next.
  const handleDefendAction = async (action: FootballAction, forcedPlayerName?: string) => {
    if (processing || diceRolling) return
    setProcessing(true)
    setDiceRolling(true)
    setLastRoll(null)
    setLastEvent(null)

    // Pick a player name for narrative
    let playerName = forcedPlayerName
    if (!playerName) {
      const startersList = Object.values(storeStarters).filter((p): p is SelectedPlayer => p !== null)
      const { player } = pickPlayerForAction(
        startersList.map(p => ({ name: p.name, position: p.position })),
        action.category,
      )
      playerName = player
    }

    // Wait for dice animation (1.8s)
    setTimeout(async () => {
      try {
        const res = await fetch('/api/match/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matchId,
            type: 'PLAY_ACTION',
            action,
            playerName: playerName || undefined,
          }),
        })
        const data = await res.json()

        if (data.timeExpired) {
          setState((s) => ({
            ...s,
            status: 'FINISHED',
            winner: data.newState.winner,
            matchEndReason: 'Tempo esgotado!',
            homeScore: data.newState.homeScore,
            awayScore: data.newState.awayScore,
          }))
          setDiceRolling(false)
          setPhase('FINISHED')
          setProcessing(false)
          return
        }

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
          homeTeamState: data.newState.homeTeamState || s.homeTeamState,
          awayTeamState: data.newState.awayTeamState || s.awayTeamState,
          events: [...s.events, data.event],
          matchEndReason: data.newState.matchEndReason || '',
          turnStartedAt: new Date(),
        }))
        setDiceRolling(false)

        // Handle the defensive action result:
        // - If success (possession changed to player): Go to PLAYER_TURN, draw mixed actions
        // - If fail (possession stays with opponent): Go to OPPONENT_TURN, simulate opponent play
        setTimeout(() => {
          if (data.newState.status === 'FINISHED') {
            setPhase('FINISHED')
          } else {
            const possessionChangedToMe = data.newState.currentPossession === mySide
            if (possessionChangedToMe) {
              // Defensive action succeeded! Player steals the ball
              toast.success('🛡️ Defesa sucesso! Você roubou a bola!', { duration: 3000 })
              setPhase('PLAYER_TURN')
              drawMixedActions()
              setTurn((t) => t + 1)
            } else {
              // Defensive action failed, opponent retains possession
              toast('❌ Defesa falhou! O adversário continua com a bola.', { duration: 3000 })
              setPhase('OPPONENT_TURN')
              setAvailableActions([])
              setTimeout(() => executeOpponentPlay(), 1500)
            }
          }
          setProcessing(false)
        }, 2200)
      } catch (err) {
        console.error('[MatchArena] defend action error:', err)
        toast.error('Erro de conexão.')
        setDiceRolling(false)
        setProcessing(false)
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

  // Format remaining time for display
  const formatRemainingTime = (seconds: number | null) => {
    if (seconds === null) return null
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const isTimerUrgent = remainingSeconds !== null && remainingSeconds <= 30

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
            <span className="font-bold">{modeConfig.emoji} {modeConfig.label}</span>
            {/* Timer badge */}
            {modeConfig.durationMs > 0 && state.matchStartedAt && (
              <Badge
                variant="outline"
                className={`font-mono text-sm ${
                  isTimerUrgent
                    ? 'border-red-500 bg-red-950/50 text-red-400 animate-pulse'
                    : 'border-emerald-700 text-emerald-300'
                }`}
              >
                <Clock className="mr-1 h-3 w-3" />
                {matchTimeDisplay}
                {remainingSeconds !== null && (
                  <span className="ml-1 text-[10px] opacity-70">({formatRemainingTime(remainingSeconds)})</span>
                )}
              </Badge>
            )}
            {/* QUICK_MATCH: show goal target */}
            {gameMode === 'QUICK_MATCH' && (
              <Badge variant="outline" className="border-amber-700 text-amber-300">
                ⚽ Primeiro a {modeConfig.goalsToWin}
              </Badge>
            )}
            <Badge variant="outline" className="border-emerald-700 text-emerald-300">
              Turno {turn}
            </Badge>
            {/* Match stats badges */}
            <Badge variant="outline" className="border-yellow-700 text-yellow-300 text-[10px]">
              🟡 {state.homeTeamState.yellowCards + state.awayTeamState.yellowCards}
            </Badge>
            <Badge variant="outline" className="border-red-700 text-red-300 text-[10px]">
              🔴 {state.homeTeamState.redCards + state.awayTeamState.redCards}
            </Badge>
            <Badge variant="outline" className="border-emerald-700 text-emerald-300 text-[10px]">
              🔄 {isHome ? state.homeTeamState.substitutionsUsed : state.awayTeamState.substitutionsUsed}/5
            </Badge>
          </div>
          {/* Pause/Resume button */}
          {(phase === 'PLAYER_TURN' || phase === 'OPPONENT_TURN' || phase === 'PAUSED') && (
            <Button
              variant="outline"
              size="sm"
              onClick={isPaused ? handleResume : handlePause}
              disabled={pausing || resuming}
              className={`${
                isPaused
                  ? 'border-emerald-600 text-emerald-300 hover:bg-emerald-900/30'
                  : 'border-amber-600 text-amber-300 hover:bg-amber-900/30'
              }`}
            >
              {pausing || resuming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPaused ? (
                <><Play className="h-4 w-4" /> Retomar</>
              ) : (
                <><Pause className="h-4 w-4" /> Pausar</>
              )}
            </Button>
          )}
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
            <PlayerSide
              user={homeUser}
              isMe={isHome}
              hasPossession={state.currentPossession === 'HOME'}
              score={state.homeScore}
              progress={state.homeProgress}
              color="emerald"
              goalsToWin={gameMode === 'QUICK_MATCH' ? modeConfig.goalsToWin : 0}
            />

            {/* VS */}
            <div className="flex flex-col items-center">
              <span className="text-2xl font-black text-amber-400">VS</span>
              <span className="text-xs text-gray-500">{state.turnCount} jogadas</span>
              {/* Turn timer */}
              {phase === 'PLAYER_TURN' && !isPaused && (
                <div className={`mt-1 text-xs font-mono ${turnTimerSeconds <= 10 ? 'text-red-400 animate-pulse' : 'text-gray-400'}`}>
                  ⏳ {turnTimerSeconds}s
                </div>
              )}
            </div>

            <PlayerSide
              user={awayUser}
              isMe={!isHome}
              hasPossession={state.currentPossession === 'AWAY'}
              score={state.awayScore}
              progress={state.awayProgress}
              color="sky"
              goalsToWin={gameMode === 'QUICK_MATCH' ? modeConfig.goalsToWin : 0}
            />
          </div>

          {/* Barra de progresso do campo */}
          {phase !== 'COIN_FLIP' && phase !== 'FINISHED' && phase !== 'PAUSED' && phase !== 'HALFTIME' && (
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
                    <p className="mt-2 text-xs text-amber-300/80">
                      {modeConfig.emoji} Modo: {modeConfig.label}
                      {modeConfig.durationMs > 0 && ` — ${modeConfig.durationMs / 60000} minutos`}
                      {gameMode === 'QUICK_MATCH' && ` — Primeiro a ${modeConfig.goalsToWin} gols`}
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

        {/* ===== FASE: PAUSED ===== */}
        {phase === 'PAUSED' && (
          <Card className="border-amber-500/40 bg-gray-900/60">
            <CardContent className="flex flex-col items-center gap-6 p-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring' }}
              >
                <Pause className="h-20 w-20 text-amber-400" />
              </motion.div>
              <div className="text-center">
                <h2 className="text-3xl font-bold text-amber-400">⏸️ Partida Pausada</h2>
                <p className="mt-2 text-sm text-gray-400">
                  O cronômetro está parado. Clique em &quot;Retomar&quot; para continuar.
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Placar: <strong className="text-emerald-400">{homeUser.username} {state.homeScore}</strong> ·{' '}
                  <strong className="text-sky-400">{state.awayScore} {awayUser.username}</strong>
                </p>
              </div>
              <div className="flex gap-3">
                <Button onClick={handleResume} disabled={resuming} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  {resuming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Retomar Partida
                </Button>
                <Button variant="outline" onClick={onExit} className="border-gray-600 text-gray-300">
                  <ArrowLeft className="h-4 w-4" />
                  Sair
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== FASE: HALFTIME ===== */}
        {phase === 'HALFTIME' && (
          <Card className="border-amber-500/40 bg-gray-900/60">
            <CardContent className="flex flex-col items-center gap-6 p-8">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              >
                <Coffee className="h-20 w-20 text-amber-400" />
              </motion.div>
              <div className="text-center">
                <h2 className="text-3xl font-bold text-amber-400">⚽ Intervalo</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Fim do primeiro tempo! 45:00 — Intervalo de 15 minutos.
                </p>
                <p className="mt-1 text-sm text-gray-300">
                  Placar: <strong className="text-emerald-400">{homeUser.username} {state.homeScore}</strong> ·{' '}
                  <strong className="text-sky-400">{state.awayScore} {awayUser.username}</strong>
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Clique em &quot;Iniciar 2º Tempo&quot; para continuar. O intervalo é opcional.
                </p>
              </div>
              <div className="flex gap-3">
                <Button onClick={handleResume} disabled={resuming} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  {resuming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Iniciar 2º Tempo
                </Button>
                <Button variant="outline" onClick={handlePause} className="border-gray-600 text-gray-300">
                  <Pause className="h-4 w-4" />
                  Pausar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== FASE: PLAYER TURN ou OPPONENT TURN ===== */}
        {(phase === 'PLAYER_TURN' || phase === 'OPPONENT_TURN' || phase === 'DEFEND_OPPORTUNITY') && (
          <div className="space-y-4">
            {/* Indicador de quem joga + turn timer */}
            <div className="flex items-center justify-center gap-3">
              <motion.div
                key={phase}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-full px-4 py-1 text-sm font-bold ${
                  phase === 'PLAYER_TURN'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : phase === 'DEFEND_OPPORTUNITY'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-sky-500/20 text-sky-300'
                }`}
              >
                {phase === 'PLAYER_TURN'
                  ? `🎯 Sua vez, ${myUser.username}!`
                  : phase === 'DEFEND_OPPORTUNITY'
                    ? `🛡️ Oportunidade de Defesa!`
                    : `⏳ ${oppUser.username} está jogando...`}
              </motion.div>
              {phase === 'PLAYER_TURN' && !isPaused && (
                <div className={`rounded-full px-3 py-1 text-xs font-mono ${
                  turnTimerSeconds <= 10 ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-gray-800 text-gray-400'
                }`}>
                  ⏳ {turnTimerSeconds}s restantes
                </div>
              )}
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
                      {/* Narrativa com nome do jogador */}
                      {lastEvent.narrative && (
                        <p className="mt-1 text-sm font-medium text-amber-200">
                          {lastEvent.narrative}
                        </p>
                      )}
                      {!lastEvent.narrative && lastEvent.playerName && (
                        <p className="mt-1 text-xs text-gray-300">
                          {lastEvent.playerName}{lastEvent.targetPlayerName ? ` para ${lastEvent.targetPlayerName}` : ''}
                        </p>
                      )}
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

            {/* Action cards */}
            {phase === 'PLAYER_TURN' && !processing && availableActions.length > 0 && (
              <Card className="border-emerald-500/30 bg-gray-900/60">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-emerald-400">
                      <Swords className="h-5 w-5" />
                      {turn === 1 ? 'Escolha sua saída de bola' : 'Escolha sua próxima jogada'}
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleVoluntarySub}
                      className="border-emerald-700 text-emerald-300 text-xs hover:bg-emerald-900/30"
                    >
                      <Users className="h-3 w-3" />
                      Substituir
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400">
                    {turn === 1
                      ? '3 opções de saída de bola disponíveis.'
                      : '5 estratégias sorteadas das 139+ disponíveis. Clique para jogar o dado!'}
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

            {/* Defensive Opportunity cards */}
            {phase === 'DEFEND_OPPORTUNITY' && !processing && availableActions.length > 0 && (
              <Card className="border-amber-500/30 bg-gray-900/60">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-amber-400">
                      <Shield className="h-5 w-5" />
                      🛡️ Oportunidade de Defesa
                    </CardTitle>
                  </div>
                  <p className="text-xs text-amber-300/80">
                    Se a defesa for sucesso, você rouba a bola! Se falhar, o adversário continua jogando.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {availableActions.map((action, idx) => (
                      <ActionCard
                        key={`${action.id}-${idx}`}
                        action={action}
                        index={idx}
                        onSelect={handleDefendAction}
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
                {state.matchEndReason && (
                  <p className="mt-1 text-sm text-gray-400">{state.matchEndReason}</p>
                )}
                <p className="mt-2 text-sm text-gray-400">
                  Placar final: <strong className="text-emerald-400">{homeUser.username} {state.homeScore}</strong> ·{' '}
                  <strong className="text-sky-400">{state.awayScore} {awayUser.username}</strong>
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {winnerIsMe ? `+${modeConfig.xpWin} XP` : state.winner === 'DRAW' ? `+${modeConfig.xpDraw} XP` : `+${modeConfig.xpLose} XP`}
                  {' '}({modeConfig.emoji} {modeConfig.label})
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
                          {e.narrative ? (
                            <span className="text-amber-200">{e.narrative}</span>
                          ) : (
                            <>
                              {e.playerName && (
                                <span className="text-amber-300">{e.playerName} </span>
                              )}
                              fez <strong>{e.action.name}</strong>
                            </>
                          )}
                        </span>
                        <span className="font-mono text-gray-400">
                          🎲{e.roll.dice}+{e.roll.bonus}={e.roll.total}
                        </span>
                        {e.isGoal && <span className="text-amber-400">⚽ GOL!</span>}
                        {e.penaltyEvent && (
                          <span className={
                            e.penaltyEvent.type === 'RED_CARD' ? 'text-red-400' :
                            e.penaltyEvent.type === 'YELLOW_CARD' ? 'text-yellow-400' :
                            e.penaltyEvent.type === 'INJURY' ? 'text-orange-400' :
                            e.penaltyEvent.type === 'PENALTY_KICK' ? 'text-white' :
                            'text-gray-400'
                          }>
                            {e.penaltyEvent.type === 'FOUL' && '🟨'}
                            {e.penaltyEvent.type === 'OFFSIDE' && '🚫'}
                            {e.penaltyEvent.type === 'YELLOW_CARD' && '🟡'}
                            {e.penaltyEvent.type === 'RED_CARD' && '🔴'}
                            {e.penaltyEvent.type === 'INJURY' && '🏥'}
                            {e.penaltyEvent.type === 'PENALTY_KICK' && '⚪'}
                            {e.penaltyEvent.type === 'VAR_REVIEW' && '📺'}
                            {e.penaltyEvent.type === 'CORNER' && '🚩'}
                            {e.penaltyEvent.type === 'BALL_OUT' && '📤'}
                          </span>
                        )}
                        {!e.isGoal && !e.penaltyEvent && e.roll.success && <span className="text-emerald-400">✓</span>}
                        {!e.isGoal && !e.penaltyEvent && !e.roll.success && <span className="text-red-400">✗</span>}
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </main>

      {/* ===== MODALS ===== */}
      <VARReview
        open={varOpen}
        onClose={handleVARDecision}
        originalEvent={varEventDesc}
      />

      <SubstitutionModal
        open={subOpen}
        onClose={() => { setSubOpen(false); finishPenaltyAndContinue() }}
        onConfirm={handleSubstitution}
        injuredPlayer={subInjuredPlayer}
        reserves={myReserves}
        starters={myStarters}
        substitutionsUsed={isHome ? state.homeTeamState.substitutionsUsed : state.awayTeamState.substitutionsUsed}
        maxSubstitutions={5}
        isForced={subIsForced}
      />

      <FreeKickDialog
        open={freeKickOpen}
        onClose={() => { setFreeKickOpen(false); finishPenaltyAndContinue() }}
        onPlayFreeKick={handleFreeKickPlay}
        fieldPlayers={myStarters}
        possession={freeKickPossession}
        isPenaltyKick={currentPenalty?.type === 'PENALTY_KICK'}
        penaltyMultipliers={penaltyMultipliers}
      />
    </div>
  )
}

// =====================================================================
// PlayerSide - Subcomponente: avatar + score + posse de bola
// =====================================================================
function PlayerSide({
  user, isMe, hasPossession, score, progress, color, goalsToWin,
}: {
  user: Player
  isMe: boolean
  hasPossession: boolean
  score: number
  progress: number
  color: 'emerald' | 'sky'
  goalsToWin?: number
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
        <div className="flex items-center justify-center gap-1">
          <p className={`text-3xl font-black ${color === 'emerald' ? 'text-emerald-400' : 'text-sky-400'}`}>
            {score}
          </p>
          {goalsToWin && goalsToWin > 0 && (
            <span className="text-[10px] text-gray-500">/{goalsToWin}</span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
