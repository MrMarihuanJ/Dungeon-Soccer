// =====================================================================
// Match Realtime - Socket.IO mini-service para comunicação em tempo real
// --------------------------------------------------------------------
// Porta: 3003
// Funcionalidades:
//   - Sala por matchId (cada partida tem sua sala)
//   - Eventos: join_match, match_action, match_state_update,
//     coin_flip_result, opponent_action, penalty_event, match_finished
//   - O host cria a sala, o opponent entra via invite
// =====================================================================

import { Server } from 'socket.io'

const PORT = 3003

const io = new Server(PORT, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

// Tipos de eventos
interface MatchActionPayload {
  matchId: string
  userId: string
  action: any
  playerName?: string
  targetPlayerName?: string
}

interface CoinFlipPayload {
  matchId: string
  userId: string
  coinResult: string
  startingSide: string
  currentPossession: string
}

interface MatchStatePayload {
  matchId: string
  state: any
}

interface PenaltyEventPayload {
  matchId: string
  penaltyEvent: any
  newState: any
}

interface JoinMatchPayload {
  matchId: string
  userId: string
  username: string
  side: 'HOME' | 'AWAY'
}

// Mapa de salas: matchId -> Set<userId>
const matchRooms = new Map<string, Set<string>>()

io.on('connection', (socket) => {
  console.log(`[match-realtime] Client connected: ${socket.id}`)

  // ===== JOIN MATCH =====
  socket.on('join_match', (payload: JoinMatchPayload) => {
    const { matchId, userId, username, side } = payload
    console.log(`[match-realtime] User ${username} (${side}) joining match ${matchId}`)

    // Entrar na sala do Socket.IO
    socket.join(`match_${matchId}`)

    // Registrar na sala
    if (!matchRooms.has(matchId)) {
      matchRooms.set(matchId, new Set())
    }
    matchRooms.get(matchId)!.add(userId)

    // Notificar todos na sala que alguém entrou
    io.to(`match_${matchId}`).emit('player_joined', {
      matchId,
      userId,
      username,
      side,
      playersInRoom: matchRooms.get(matchId)!.size,
    })

    // Se já há 2 jogadores, notificar que a partida pode começar
    if (matchRooms.get(matchId)!.size >= 2) {
      io.to(`match_${matchId}`).emit('match_ready', {
        matchId,
        message: 'Both players connected! Ready to play.',
      })
    }
  })

  // ===== LEAVE MATCH =====
  socket.on('leave_match', (payload: { matchId: string; userId: string }) => {
    const { matchId, userId } = payload
    console.log(`[match-realtime] User ${userId} leaving match ${matchId}`)

    socket.leave(`match_${matchId}`)

    const room = matchRooms.get(matchId)
    if (room) {
      room.delete(userId)
      if (room.size === 0) {
        matchRooms.delete(matchId)
      }
    }

    io.to(`match_${matchId}`).emit('player_left', {
      matchId,
      userId,
    })
  })

  // ===== COIN FLIP RESULT =====
  // Quem lançou a moeda notifica o resultado para todos
  socket.on('coin_flip_result', (payload: CoinFlipPayload) => {
    console.log(`[match-realtime] Coin flip result for match ${payload.matchId}: ${payload.coinResult}`)
    io.to(`match_${payload.matchId}`).emit('coin_flip_result', payload)
  })

  // ===== OPPONENT ACTION =====
  // Quando um jogador faz uma jogada, notifica o oponente
  socket.on('opponent_action', (payload: MatchActionPayload) => {
    console.log(`[match-realtime] Opponent action in match ${payload.matchId}: ${payload.action?.id}`)
    io.to(`match_${payload.matchId}`).emit('opponent_action', payload)
  })

  // ===== MATCH STATE UPDATE =====
  // Qualquer mudança de estado é broadcast para todos na sala
  socket.on('match_state_update', (payload: MatchStatePayload) => {
    console.log(`[match-realtime] State update for match ${payload.matchId}`)
    io.to(`match_${payload.matchId}`).emit('match_state_update', payload)
  })

  // ===== PENALTY EVENT =====
  socket.on('penalty_event', (payload: PenaltyEventPayload) => {
    console.log(`[match-realtime] Penalty event in match ${payload.matchId}`)
    io.to(`match_${payload.matchId}`).emit('penalty_event', payload)
  })

  // ===== MATCH FINISHED =====
  socket.on('match_finished', (payload: { matchId: string; winner: string | null }) => {
    console.log(`[match-realtime] Match ${payload.matchId} finished! Winner: ${payload.winner}`)
    io.to(`match_${payload.matchId}`).emit('match_finished', payload)

    // Limpar sala após 30 segundos
    setTimeout(() => {
      matchRooms.delete(payload.matchId)
      const socketsInRoom = io.sockets.adapter.rooms.get(`match_${payload.matchId}`)
      if (socketsInRoom) {
        for (const sid of socketsInRoom) {
          io.sockets.sockets.get(sid)?.leave(`match_${payload.matchId}`)
        }
      }
    }, 30000)
  })

  // ===== CHAT MESSAGE (para comunicação durante partida) =====
  socket.on('chat_message', (payload: { matchId: string; userId: string; username: string; message: string }) => {
    io.to(`match_${payload.matchId}`).emit('chat_message', payload)
  })

  // ===== HEARTBEAT (manter conexão ativa) =====
  socket.on('heartbeat', (payload: { matchId: string; userId: string }) => {
    // Apenas confirmar que está conectado
    socket.emit('heartbeat_ack', { matchId: payload.matchId, timestamp: Date.now() })
  })

  // ===== DISCONNECT =====
  socket.on('disconnect', () => {
    console.log(`[match-realtime] Client disconnected: ${socket.id}`)
  })
})

console.log(`[match-realtime] Socket.IO server running on port ${PORT}`)
