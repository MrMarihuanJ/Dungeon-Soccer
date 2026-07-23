'use client'

// =====================================================================
// MatchArena - Componente principal que orquestra a partida RPG
// --------------------------------------------------------------------
// Fases:
//   0. WAITING — esperando oponente entrar (multiplayer)
//   1. COIN_FLIP — mostra moeda girando + resultado
//   2. PLAYER_TURN — jogador atual escolhe ação, vê dado, vê resultado
//   3. OPPONENT_TURN — esperando jogada do oponente (polling)
//   4. PAUSED — partida pausada, timer congelado
//   5. HALFTIME — intervalo (apenas FULL_90)
//   6. FINISHED — placar final + vencedor
// =====================================================================

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Swords, Trophy, ArrowLeft, Coins, Play, Loader2, History, ChevronRight,
  AlertTriangle, Users, Pause, RotateCcw, Clock, Coffee, Zap, Share2,
} from 'lucide-react'
import { CoinFlip } from './CoinFlip'
import { DiceRoll } from './DiceRoll'
import { ActionCard } from './ActionCard'
import { SubstitutionModal } from './SubstitutionModal'
import { VARReview } from './VARReview'
import { FreeKickDialog } from './FreeKickDialog'
import { MatchInviteDialog } from './MatchInviteDialog'
import {
  sampleActions, sampleMixedActions, CATEGORY_META,
  type FootballAction,
} from '@/lib/dnd-actions'
import {
  type MatchState, type Possession, type DiceRollResult, type MatchEvent,
  type PenaltyEvent, type TeamMatchState, type GameMode,
  GAME_MODE_CONFIG, calculateMatchTime, calculateRemainingTimeMs,
  checkMatchEndCondition, isHalftimeReached,
  pickPlayerForAction,
} from '@/lib/match-engine'
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
  inviteCode?: string
  initialState?: MatchState
  isOffline?: boolean  // Offline mode: bot auto-plays on OPPONENT_TURN
  onExit: () => void
}

type Phase = 'WAITING' | 'COIN_FLIP' | 'PLAYER_TURN' | 'OPPONENT_TURN' | 'FINISHED' | 'PENALTY_EVENT' | 'VAR_REVIEW' | 'FREE_KICK' | 'SUBSTITUTION' | 'PAUSED' | 'HALFTIME'

export function MatchArena({
  matchId, homeUser, awayUser, currentUserId, gameMode = 'QUICK_MATCH', inviteCode, initialState, isOffline = false, onExit,
}: Props) {
  const modeConfig = GAME_MODE_CONFIG[gameMode]

  const [state, setState] = useState<MatchState>(initialState || {
    matchId,
    status: 'WAITING',
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
  })

  const [phase, setPhase] = useState<Phase>(
    initialState?.status === 'FINISHED'
      ? 'FINISHED'
      : initialState?.status === 'PAUSED'
        ? 'PAUSED'
        : initialState?.status === 'HALFTIME'
          ? 'HALFTIME'
          : initialState?.status === 'WAITING'
            ? 'WAITING'
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
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)

  // Refs for timers
  const matchTimerRef = useRef<NodeJS.Timeout | null>(null)
  const turnTimerRef = useRef<NodeJS.Timeout | null>(null)
  const autoPlayRef = useRef(false)

  // Populate starters/reserves from the Zustand store (use useMemo to avoid setState in effect)
  const { starters: storeStarters, reserves: storeReserves } = useTeamStore()
  const startersList = useMemo(() => Object.values(storeStarters).filter((p): p is SelectedPlayer => p !== null), [storeStarters])
  const reservesList = useMemo(() => storeReserves, [storeReserves])
  useEffect(() => {
    setMyStarters(startersList)
    setMyReserves(reservesList)
  }, [startersList, reservesList])

  const isHome = currentUserId === homeUser.id
  const mySide: Possession = isHome ? 'HOME' : 'AWAY'
  const myUser = isHome ? homeUser : awayUser
  const oppUser = isHome ? awayUser : homeUser

  // ===== Initial state fetch on mount (sync with server) =====
  useEffect(() => {
    const doInitialFetch = async () => {
      try {
        const res = await fetch(`/api/match/state?id=${matchId}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!data.ok) return

        const serverState = data.match

        setState((s) => ({
          ...s,
          status: serverState.status,
          currentPossession: serverState.currentPossession,
          homeScore: serverState.homeScore,
          awayScore: serverState.awayScore,
          homeProgress: serverState.homeProgress,
          awayProgress: serverState.awayProgress,
          turnCount: serverState.turnCount,
          winner: serverState.winner,
          homeTeamState: serverState.homeTeamState || s.homeTeamState,
          awayTeamState: serverState.awayTeamState || s.awayTeamState,
          events: serverState.events || s.events,
          coinResult: serverState.coinResult || s.coinResult,
          matchEndReason: serverState.matchEndReason || '',
          matchStartedAt: serverState.matchStartedAt ? new Date(serverState.matchStartedAt) : null,
          pausedAt: serverState.pausedAt ? new Date(serverState.pausedAt) : null,
          secondHalfStartedAt: serverState.secondHalfStartedAt ? new Date(serverState.secondHalfStartedAt) : null,
          turnStartedAt: serverState.turnStartedAt ? new Date(serverState.turnStartedAt) : null,
          totalPausedMs: serverState.totalPausedMs || 0,
          halftimeTaken: serverState.halftimeTaken || false,
        }))

        // Update phase based on server status
        if (serverState.status === 'WAITING') {
          setPhase('WAITING')
        } else if (serverState.status === 'COIN_FLIP') {
          setPhase('COIN_FLIP')
        } else if (serverState.status === 'IN_PROGRESS') {
          const myTurnNow = serverState.currentPossession === mySide
          setPhase(myTurnNow ? 'PLAYER_TURN' : 'OPPONENT_TURN')
        } else if (serverState.status === 'FINISHED') {
          setPhase('FINISHED')
        } else if (serverState.status === 'HALFTIME') {
          setPhase('HALFTIME')
        } else if (serverState.status === 'PAUSED') {
          setPhase('PAUSED')
        }
      } catch {
        // Silently fail — polling will retry
      }
    }
    doInitialFetch()
  }, [matchId])

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
    // BUG FIX: Auto-play also excludes DEFEND (same logic as drawMixedActions)
    const actions = sampleMixedActions(1, true)
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
          setAvailableActions([])
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
  // BUG FIX: When it's MY turn (I have possession), exclude DEFEND actions.
  // In real football, the attacking team shouldn't have "defend" options —
  // a successful DEFEND action would steal the ball from yourself.
  const drawMixedActions = useCallback(() => {
    // When drawing actions for the team WITH possession, exclude DEFEND
    setAvailableActions(sampleMixedActions(5, true))
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
          toast(`${penaltyEmojis[pe.type] ?? '⚠️'} ${pe.description}`, {
            duration: 4000,
            style: { background: pe.type === 'RED_CARD' ? '#7f1d1d' : pe.type === 'INJURY' ? '#78350f' : '#1e293b' },
          })

          setTimeout(() => {
            handlePenaltyFlow(pe)
          }, 2500)
          return
        }

        // BUG FIX: Clear action cards immediately to prevent double-click during
        // the 2.2s result display window. Previously, availableActions remained
        // visible for ~2.2s after processing, allowing the player to submit
        // another action in the same turn.
        setAvailableActions([])
        // No penalty: normal flow
        proceedToNextTurn(data)
        // Keep processing=true until phase transition completes (inside proceedToNextTurn)
        // Previously setProcessing(false) here allowed re-clicking during the 2.2s delay
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
    // BUG FIX: Only show FreeKickDialog if the free kick favors MY team.
    // If the opponent is favored (e.g., I committed a foul), transition to their turn instead.
    if (pe.requiresFreeKick || pe.type === 'FOUL') {
      if (pe.favoredPossession === mySide) {
        setFreeKickPossession(pe.favoredPossession)
        setFreeKickOpen(true)
        return
      }
      // Free kick favors opponent — skip dialog and transition to their turn
      finishPenaltyAndContinue()
      return
    }
    if (pe.type === 'PENALTY_KICK') {
      if (pe.favoredPossession === mySide) {
        setFreeKickPossession(pe.favoredPossession)
        setFreeKickOpen(true)
        return
      }
      // Penalty favors opponent — skip dialog and transition to their turn
      finishPenaltyAndContinue()
      return
    }
    finishPenaltyAndContinue()
  }

  // BUG FIX: Use setState updater to get fresh state (avoids stale closure).
  // Previously, `state.currentPossession` was read from a stale closure captured
  // inside setTimeout callbacks (e.g. 2500ms penalty delay). This caused wrong
  // phase assignment — PLAYER_TURN when it should be OPPONENT_TURN.
  const finishPenaltyAndContinue = () => {
    setCurrentPenalty(null)
    setPendingPenalty(null)
    // Use setState updater to read fresh state instead of stale closure
    setState((freshState) => {
      if (freshState.status === 'FINISHED') {
        setPhase('FINISHED')
      } else {
        const stillMyTurn = freshState.currentPossession === mySide
        setPhase(stillMyTurn ? 'PLAYER_TURN' : 'OPPONENT_TURN')
        if (stillMyTurn) {
          drawMixedActions()
          setTurn((t) => t + 1)
        } else {
          setAvailableActions([])
        }
      }
      setProcessing(false)
      return freshState // Return same state — we only used it to read currentPossession
    })
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

  // BUG FIX: Free kick play callback — now validates turn ownership before proceeding.
  // Previously, this bypassed the processing/diceRolling guards blindly, allowing
  // actions to be submitted even when it was the opponent's turn.
  const handleFreeKickPlay = async (kickerId: string, action: FootballAction) => {
    setFreeKickOpen(false)
    // Validate: only proceed if it's actually my team's turn (possession)
    // This prevents submitting a free kick when the opponent should be playing
    setState((freshState) => {
      if (freshState.currentPossession !== mySide) {
        toast.error('Não é seu turno para cobrar a falta.')
        finishPenaltyAndContinue()
        return freshState
      }
      // Reset flags only after confirming it's my turn
      setProcessing(false)
      setDiceRolling(false)
      // Find kicker name for narrative
      const kicker = myStarters.find(p => p.id === kickerId)
      const kickerName = kicker?.name
      // Fire-and-forget — handleSelectAction manages its own state
      handleSelectAction(action, kickerName)
      return freshState
    })
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

  // BUG FIX: Set processing=false AFTER phase transition (inside the timeout),
  // not before. This eliminates the 2.2s window where processing=false but
  // phase hasn't changed yet, which allowed players to click action cards twice.
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
        }
      }
      // Move processing=false here — after phase transition is complete
      setProcessing(false)
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

  // ===== fetchMatchState (atualiza estado local com dados do servidor) =====
  const fetchMatchState = async () => {
    try {
      const res = await fetch(`/api/match/state?id=${matchId}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (!data.ok) return

      const serverState = data.match
      
      setState((s) => ({
        ...s,
        status: serverState.status,
        currentPossession: serverState.currentPossession,
        homeScore: serverState.homeScore,
        awayScore: serverState.awayScore,
        homeProgress: serverState.homeProgress,
        awayProgress: serverState.awayProgress,
        turnCount: serverState.turnCount,
        winner: serverState.winner,
        homeTeamState: serverState.homeTeamState || s.homeTeamState,
        awayTeamState: serverState.awayTeamState || s.awayTeamState,
        events: serverState.events || s.events,
        coinResult: serverState.coinResult || s.coinResult,
        matchEndReason: serverState.matchEndReason || '',
      }))

      // Update phase based on new status
      if (serverState.status === 'COIN_FLIP' && !serverState.coinResult) {
        setPhase('COIN_FLIP')
      } else if (serverState.status === 'IN_PROGRESS') {
        const myTurnNow = serverState.currentPossession === mySide
        setPhase(myTurnNow ? 'PLAYER_TURN' : 'OPPONENT_TURN')
        if (myTurnNow) drawMixedActions()
        lastEventCountRef.current = (serverState.events || []).length
      } else if (serverState.status === 'FINISHED') {
        setPhase('FINISHED')
      }
    } catch (err) {
      console.error('[MatchArena] fetch state error:', err)
    }
  }

  // ===== BOT AUTO-PLAY (offline mode) =====
  // In offline mode, when it's OPPONENT_TURN, the bot plays automatically
  // after a short delay to simulate "thinking".
  const botAutoPlayRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Only auto-play bot when offline and it's the bot's turn
    if (!isOffline || phase !== 'OPPONENT_TURN' || state.status !== 'IN_PROGRESS' || processing || diceRolling) {
      if (botAutoPlayRef.current) {
        clearTimeout(botAutoPlayRef.current)
        botAutoPlayRef.current = null
      }
      return
    }

    // Bot "thinks" for 1.5-2.5 seconds before playing
    const thinkDelay = 1500 + Math.random() * 1000
    botAutoPlayRef.current = setTimeout(() => {
      const actions = sampleMixedActions(1, true)
      const action = actions[0]
      if (action) {
        // Use generic bot player name for narrative
        handleSelectAction(action, 'Bot')
      }
    }, thinkDelay)

    return () => {
      if (botAutoPlayRef.current) {
        clearTimeout(botAutoPlayRef.current)
        botAutoPlayRef.current = null
      }
    }
  }, [isOffline, phase, state.status, processing, diceRolling])

  // ===== POLL FOR OPPONENT ACTIONS (online multiplayer only) =====
  const opponentPollRef = useRef<NodeJS.Timeout | null>(null)
  const lastEventCountRef = useRef(state.events.length)

  useEffect(() => {
    // In offline mode, we don't poll — the bot auto-plays instead
    if (isOffline) {
      if (opponentPollRef.current) {
        clearInterval(opponentPollRef.current)
        opponentPollRef.current = null
      }
      return
    }

    // Only poll when it's the opponent's turn and the game is in progress (online mode)
    if (phase !== 'OPPONENT_TURN' || state.status !== 'IN_PROGRESS') {
      if (opponentPollRef.current) {
        clearInterval(opponentPollRef.current)
        opponentPollRef.current = null
      }
      return
    }

    // Poll every 2 seconds for state updates
    opponentPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/match/state?id=${matchId}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!data.ok) return

        const serverState = data.match
        const serverEvents = serverState.events || []
        
        // Check if there are new events (opponent played)
        if (serverEvents.length > lastEventCountRef.current) {
          const newEvents = serverEvents.slice(lastEventCountRef.current)
          const latestEvent = newEvents[newEvents.length - 1]

          // Update state with server data
          setState((s) => ({
            ...s,
            currentPossession: serverState.currentPossession,
            homeScore: serverState.homeScore,
            awayScore: serverState.awayScore,
            homeProgress: serverState.homeProgress,
            awayProgress: serverState.awayProgress,
            turnCount: serverState.turnCount,
            status: serverState.status,
            winner: serverState.winner,
            homeTeamState: serverState.homeTeamState || s.homeTeamState,
            awayTeamState: serverState.awayTeamState || s.awayTeamState,
            events: [...s.events, ...newEvents],
            matchEndReason: serverState.matchEndReason || '',
          }))
          
          lastEventCountRef.current = serverEvents.length

          // Show last event
          if (latestEvent) {
            setLastEvent(latestEvent)
            if (latestEvent.roll) setLastRoll(latestEvent.roll)

            if (latestEvent.isGoal) {
              const scorer = latestEvent.possession === 'HOME' ? homeUser.username : awayUser.username
              toast.success(`⚽ GOOOOL! ${latestEvent.playerName || scorer} marca!`, { duration: 4000 })
              
              if (gameMode === 'QUICK_MATCH') {
                if (serverState.homeScore >= modeConfig.goalsToWin || serverState.awayScore >= modeConfig.goalsToWin) {
                  setTimeout(() => setPhase('FINISHED'), 2000)
                  return
                }
              }
            }
          }

          // Check for penalty events
          if (latestEvent?.penaltyEvent) {
            const pe = latestEvent.penaltyEvent
            setCurrentPenalty(pe)
            toast(`${pe.description}`, { duration: 4000 })
            setTimeout(() => handlePenaltyFlow(pe), 2500)
            return
          }

          // Determine whose turn it is now
          if (serverState.status === 'FINISHED') {
            setPhase('FINISHED')
            setProcessing(false)
          } else {
            const myTurnNow = serverState.currentPossession === mySide
            setPhase(myTurnNow ? 'PLAYER_TURN' : 'OPPONENT_TURN')
            if (myTurnNow) {
              drawMixedActions()
              setTurn((t) => t + 1)
            }
            setProcessing(false)
          }
        }
      } catch (err) {
        console.error('[MatchArena] opponent poll error:', err)
      }
    }, 2000)

    return () => {
      if (opponentPollRef.current) {
        clearInterval(opponentPollRef.current)
        opponentPollRef.current = null
      }
    }
  }, [phase, state.status, matchId, mySide, gameMode, modeConfig.goalsToWin])

  // ===== Poll for opponent joining (WAITING phase) =====
  useEffect(() => {
    if (phase !== 'WAITING') return

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/match/state?id=${matchId}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!data.ok) return

        const serverState = data.match
        if (serverState.status === 'COIN_FLIP' || serverState.status === 'IN_PROGRESS') {
          // Opponent has joined! Update state
          setState((s) => ({
            ...s,
            status: serverState.status,
            currentPossession: serverState.currentPossession,
            coinResult: serverState.coinResult,
          }))
          
          if (serverState.status === 'COIN_FLIP') {
            setPhase('COIN_FLIP')
            toast.success('🎉 Oponente entrou! A partida vai começar!')
          } else if (serverState.status === 'IN_PROGRESS') {
            // Game already started (coin was flipped)
            const myTurnNow = serverState.currentPossession === mySide
            setPhase(myTurnNow ? 'PLAYER_TURN' : 'OPPONENT_TURN')
            if (myTurnNow) drawKickoffActions()
          }
        }
      } catch {
        // Silently retry
      }
    }, 3000)

    return () => clearInterval(pollInterval)
  }, [phase, matchId, mySide])

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
          {phase !== 'COIN_FLIP' && phase !== 'FINISHED' && phase !== 'PAUSED' && phase !== 'HALFTIME' && phase !== 'WAITING' && (
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

        {/* ===== FASE: WAITING (esperando oponente) ===== */}
        {phase === 'WAITING' && (
          <Card className="border-amber-500/30 bg-gray-900/60">
            <CardContent className="flex flex-col items-center gap-6 p-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring' }}
              >
                <Users className="h-20 w-20 text-amber-400" />
              </motion.div>
              <div className="text-center">
                <h2 className="text-3xl font-bold text-amber-400">⏳ Esperando oponente</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Compartilhe o link com um amigo para jogar ao vivo!
                </p>
              </div>
              <Button
                onClick={() => setInviteDialogOpen(true)}
                className="gap-2 bg-amber-500 text-black hover:bg-amber-400"
                size="lg"
              >
                <Share2 className="h-5 w-5" />
                Convide um jogador
              </Button>
              
              {/* MatchInviteDialog */}
              {inviteCode && (
                <MatchInviteDialog
                  inviteCode={inviteCode}
                  matchId={matchId}
                  gameMode={modeConfig.label}
                  open={inviteDialogOpen}
                  onClose={() => setInviteDialogOpen(false)}
                  onOpponentJoined={() => {
                    setInviteDialogOpen(false)
                    // Refresh match state from server
                    fetchMatchState()
                  }}
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
        {(phase === 'PLAYER_TURN' || phase === 'OPPONENT_TURN') && (
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
                    : 'bg-sky-500/20 text-sky-300'
                }`}
              >
                {phase === 'PLAYER_TURN'
                  ? `🎯 Sua vez, ${myUser.username}!`
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

            {/* ===== OPPONENT_TURN (esperando jogada do oponente) ===== */}
            {phase === 'OPPONENT_TURN' && (
              <Card className="border-sky-500/30 bg-gray-900/60">
                <CardContent className="flex flex-col items-center gap-6 p-8">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Loader2 className="h-16 w-16 text-sky-400" />
                  </motion.div>
                  <div className="text-center">
                    <h2 className="text-xl font-bold text-sky-400">
                      🎲 {oppUser.username} está jogando...
                    </h2>
                    <p className="mt-1 text-sm text-gray-400">
                      Esperando a jogada do oponente. A partida será atualizada automaticamente.
                    </p>
                    {lastEvent && (
                      <div className="mt-3 rounded-lg bg-gray-800/50 p-3 text-xs text-gray-300">
                        Última jogada: {lastEvent.action?.emoji} {lastEvent.action?.name} — 
                        {lastEvent.roll?.success ? 'Sucesso!' : 'Falha!'}
                      </div>
                    )}
                  </div>
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

      {/* BUG FIX: Only render FreeKickDialog if it's my team's free kick.
          Previously, this dialog was always rendered using myStarters regardless
          of who was favored, causing the fouling player to select a kicker for
          the opponent's free kick. */}
      <FreeKickDialog
        open={freeKickOpen}
        onClose={() => { setFreeKickOpen(false); finishPenaltyAndContinue() }}
        onPlayFreeKick={handleFreeKickPlay}
        fieldPlayers={myStarters}
        possession={freeKickPossession}
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
