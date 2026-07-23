// =====================================================================
// useMatchRealtime - Hook para comunicação Socket.IO em partidas live
// --------------------------------------------------------------------
// Conecta ao mini-service match-realtime (porta 3003) e gerencia
// eventos em tempo real: join, coin_flip, opponent_action, state updates
// =====================================================================

'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface MatchRealtimeEvents {
  player_joined: (data: { matchId: string; userId: string; username: string; side: string; playersInRoom: number }) => void
  player_left: (data: { matchId: string; userId: string }) => void
  match_ready: (data: { matchId: string; message: string }) => void
  coin_flip_result: (data: { matchId: string; userId: string; coinResult: string; startingSide: string; currentPossession: string }) => void
  opponent_action: (data: { matchId: string; userId: string; action: any; playerName?: string; targetPlayerName?: string }) => void
  match_state_update: (data: { matchId: string; state: any }) => void
  penalty_event: (data: { matchId: string; penaltyEvent: any; newState: any }) => void
  match_finished: (data: { matchId: string; winner: string | null }) => void
  chat_message: (data: { matchId: string; userId: string; username: string; message: string }) => void
}

export function useMatchRealtime(matchId: string, userId: string, username: string, side: 'HOME' | 'AWAY') {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [opponentConnected, setOpponentConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<any>(null)

  // Conecta ao Socket.IO server
  useEffect(() => {
    if (!matchId || !userId) return

    // Conecta via Caddy proxy com XTransformPort para a porta 3003
    const socket = io('/', {
      query: { XTransformPort: '3003' },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      timeout: 10000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[useMatchRealtime] Connected to Socket.IO server')
      setConnected(true)

      // Entra na sala da partida
      socket.emit('join_match', {
        matchId,
        userId,
        username,
        side,
      })
    })

    socket.on('disconnect', () => {
      console.log('[useMatchRealtime] Disconnected from Socket.IO server')
      setConnected(false)
    })

    socket.on('connect_error', (err) => {
      console.error('[useMatchRealtime] Connection error:', err.message)
      // Não mostrar erro ao usuário — o polling fallback cuida disso
    })

    socket.on('player_joined', (data) => {
      console.log('[useMatchRealtime] Player joined:', data)
      setOpponentConnected(data.playersInRoom >= 2)
      setLastEvent({ type: 'player_joined', data })
    })

    socket.on('player_left', (data) => {
      console.log('[useMatchRealtime] Player left:', data)
      setOpponentConnected(false)
      setLastEvent({ type: 'player_left', data })
    })

    socket.on('match_ready', (data) => {
      console.log('[useMatchRealtime] Match ready:', data)
      setOpponentConnected(true)
      setLastEvent({ type: 'match_ready', data })
    })

    socket.on('opponent_action', (data) => {
      console.log('[useMatchRealtime] Opponent action:', data)
      setLastEvent({ type: 'opponent_action', data })
    })

    socket.on('match_state_update', (data) => {
      console.log('[useMatchRealtime] State update:', data)
      setLastEvent({ type: 'match_state_update', data })
    })

    socket.on('penalty_event', (data) => {
      console.log('[useMatchRealtime] Penalty event:', data)
      setLastEvent({ type: 'penalty_event', data })
    })

    socket.on('match_finished', (data) => {
      console.log('[useMatchRealtime] Match finished:', data)
      setLastEvent({ type: 'match_finished', data })
    })

    socket.on('coin_flip_result', (data) => {
      console.log('[useMatchRealtime] Coin flip result:', data)
      setLastEvent({ type: 'coin_flip_result', data })
    })

    // Cleanup ao sair
    return () => {
      socket.emit('leave_match', { matchId, userId })
      socket.disconnect()
      socketRef.current = null
    }
  }, [matchId, userId, username, side])

  // Emite evento de coin flip
  const emitCoinFlip = useCallback((coinResult: string, startingSide: string, currentPossession: string) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('coin_flip_result', {
        matchId,
        userId,
        coinResult,
        startingSide,
        currentPossession,
      })
    }
  }, [matchId, userId, connected])

  // Emite evento de jogada do oponente
  const emitOpponentAction = useCallback((action: any, playerName?: string, targetPlayerName?: string) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('opponent_action', {
        matchId,
        userId,
        action,
        playerName,
        targetPlayerName,
      })
    }
  }, [matchId, userId, connected])

  // Emite evento de atualização de estado
  const emitStateUpdate = useCallback((state: any) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('match_state_update', {
        matchId,
        state,
      })
    }
  }, [matchId, connected])

  // Emite evento de penalty
  const emitPenaltyEvent = useCallback((penaltyEvent: any, newState: any) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('penalty_event', {
        matchId,
        penaltyEvent,
        newState,
      })
    }
  }, [matchId, connected])

  // Emite evento de partida terminada
  const emitMatchFinished = useCallback((winner: string | null) => {
    if (socketRef.current && connected) {
      socketRef.current.emit('match_finished', {
        matchId,
        winner,
      })
    }
  }, [matchId, connected])

  return {
    connected,
    opponentConnected,
    lastEvent,
    emitCoinFlip,
    emitOpponentAction,
    emitStateUpdate,
    emitPenaltyEvent,
    emitMatchFinished,
  }
}
