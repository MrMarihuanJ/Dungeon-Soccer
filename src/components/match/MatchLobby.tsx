'use client'

// =====================================================================
// MatchLobby - Tela inicial do modo RPG: escolhe modalidade e modo
// =====================================================================
// Two modalities:
//   - OFFLINE (vs Bot): Play immediately against an AI bot. No invite needed.
//   - ONLINE (with Invite): Create match with invite code, share with friend.
// =====================================================================

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ArrowLeft, Swords, BookOpen, Trophy, Dice5, AlertTriangle, Clock, Zap, Medal, Users, Bot, Wifi, WifiOff } from 'lucide-react'
import { MatchArena } from './MatchArena'
import { MatchInviteDialog } from './MatchInviteDialog'
import { toast } from 'sonner'
import { GAME_MODE_CONFIG, type GameMode } from '@/lib/match-engine'

interface Friend {
  id: string
  username: string
  displayName?: string | null
  wins: number
  losses: number
  draws: number
  xp: number
  friendshipId: string
}

interface CurrentUser {
  id: string
  username: string
  displayName?: string | null
}

interface Props {
  currentUser: CurrentUser
  onExit: () => void
}

type LobbyState = 'selection' | 'waiting' | 'match'
type Modality = 'offline' | 'online'

const BOT_USER_ID = 'BOT_PLAYER_DUNGEON_SOCER_001'

export function MatchLobby({ currentUser, onExit }: Props) {
  const [state, setState] = useState<LobbyState>('selection')
  const [matchId, setMatchId] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [opponent, setOpponent] = useState<Friend | null>(null)
  const [creating, setCreating] = useState(false)
  const [lastError, setLastError] = useState<{ error: string; detail?: string } | null>(null)
  const [selectedGameMode, setSelectedGameMode] = useState<GameMode>('QUICK_MATCH')
  const [selectedModality, setSelectedModality] = useState<Modality>('offline')
  const [isOffline, setIsOffline] = useState(false)

  // ===== Create Match =====
  const handleCreateMatch = async () => {
    setCreating(true)
    setLastError(null)
    try {
      const res = await fetch('/api/match/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameMode: selectedGameMode,
          offline: selectedModality === 'offline',
        }),
      })
      let data: any
      try {
        data = await res.json()
      } catch {
        if (res.status === 401) {
          toast.error('Sessão expirada. Faça login novamente.')
        } else {
          toast.error(`Erro no servidor (${res.status}). Tente novamente.`)
        }
        return
      }
      if (!data.ok) {
        const errorMsg = data.error || 'Erro ao criar partida.'
        const errorDetail = data.detail || ''
        setLastError({ error: errorMsg, detail: errorDetail })
        toast.error(errorMsg)
        return
      }

      const match = data.match
      setMatchId(match.id)
      setInviteCode(match.inviteCode)
      setIsOffline(match.isOffline || false)

      if (selectedModality === 'offline') {
        // Offline: go directly to match (no waiting needed)
        setOpponent({
          id: BOT_USER_ID,
          username: 'Bot Dungeon Soccer',
          displayName: 'Bot',
          wins: 0,
          losses: 0,
          draws: 0,
          xp: 0,
          friendshipId: '',
        })
        setState('match')
        toast.success('Partida offline criada! Você vs Bot.')
      } else {
        // Online: show invite dialog and wait for opponent
        setState('waiting')
        toast.success('Partida criada! Compartilhe o convite com um amigo.')
      }
    } catch (err) {
      console.error('[MatchLobby] create error:', err)
      toast.error('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setCreating(false)
    }
  }

  // ===== Waiting state — opponent joined callback =====
  const handleOpponentJoined = async () => {
    if (!matchId) return
    try {
      const res = await fetch(`/api/match/state?id=${matchId}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        if (data.ok) {
          const away = data.match.awayUser
          if (away) {
            setOpponent({
              id: away.id,
              username: away.username,
              displayName: away.displayName,
              wins: away.wins,
              losses: away.losses,
              draws: away.draws,
              xp: away.xp,
              friendshipId: '',
            })
          }
          setIsOffline(data.match.isOffline || false)
          setState('match')
        }
      }
    } catch {
      toast.error('Erro ao carregar dados do oponente.')
    }
  }

  // ===== Match state — render MatchArena =====
  if (state === 'match' && matchId) {
    return (
      <MatchArena
        matchId={matchId}
        homeUser={{
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
        }}
        awayUser={opponent || { id: 'PENDING', username: 'Oponente', displayName: 'Oponente' }}
        currentUserId={currentUser.id}
        gameMode={selectedGameMode}
        inviteCode={inviteCode || ''}
        isOffline={isOffline}
        onExit={() => {
          setState('selection')
          setMatchId(null)
          setInviteCode(null)
          setOpponent(null)
          setIsOffline(false)
        }}
      />
    )
  }

  // ===== Waiting state — show invite dialog =====
  if (state === 'waiting' && matchId && inviteCode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-emerald-950/30 to-gray-950 text-white">
        <header className="sticky top-0 z-30 border-b border-emerald-900/50 bg-gray-900/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => { setState('selection'); setMatchId(null); setInviteCode(null); }} className="text-gray-300 hover:bg-gray-800 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Cancelar
            </Button>
            <div className="flex items-center gap-2">
              <motion.div
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <Swords className="h-5 w-5 text-amber-400" />
              </motion.div>
              <span className="font-bold">Modo RPG</span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 py-6">
          <Card className="border-amber-500/30 bg-gray-900/60">
            <CardContent className="flex flex-col items-center gap-6 p-8">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Users className="h-20 w-20 text-amber-400" />
              </motion.div>
              <h2 className="text-3xl font-bold text-amber-400">⏳ Esperando oponente</h2>
              <p className="text-sm text-gray-400">
                Compartilhe o convite com um amigo para jogar ao vivo!
              </p>
              <MatchInviteDialog
                inviteCode={inviteCode}
                matchId={matchId}
                gameMode={GAME_MODE_CONFIG[selectedGameMode].label}
                open={true}
                onClose={() => {}}
                onOpponentJoined={handleOpponentJoined}
              />
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  // ===== Selection state — choose modality + game mode =====
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-emerald-950/30 to-gray-950 text-white">
      <header className="sticky top-0 z-30 border-b border-emerald-900/50 bg-gray-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onExit} className="text-gray-300 hover:bg-gray-800 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao site
          </Button>
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            >
              <Swords className="h-5 w-5 text-amber-400" />
            </motion.div>
            <span className="font-bold">Modo RPG</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 text-center"
        >
          <h1 className="text-3xl font-extrabold text-amber-400 sm:text-4xl">
            ⚔️ Modo RPG: Batalha de Times
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-400">
            Regras de <strong className="text-amber-300">Dungeons & Dragons</strong>:
            lance a moeda, role o d20 e execute mais de 100 ações estratégicas!
          </p>
        </motion.div>

        {/* Aviso de erro detalhado */}
        {lastError && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-lg border border-amber-500/50 bg-amber-950/40 p-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-300">{lastError.error}</p>
                {lastError.detail && (
                  <p className="mt-1 text-xs text-amber-200/60 font-mono break-all">{lastError.detail}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLastError(null)}
                className="shrink-0 text-amber-400 hover:bg-amber-900/30"
              >
                ✕
              </Button>
            </div>
          </motion.div>
        )}

        {/* ===== Seleção de Modalidade ===== */}
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h2 className="mb-3 text-center text-lg font-bold text-gray-200">
            Escolha a Modalidade
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Offline vs Bot */}
            <motion.button
              onClick={() => setSelectedModality('offline')}
              className={`relative overflow-hidden rounded-xl border-2 p-5 text-left transition-all ${
                selectedModality === 'offline'
                  ? 'border-emerald-400 bg-emerald-950/30 shadow-lg shadow-emerald-500/10'
                  : 'border-gray-700 bg-gray-900/40 hover:border-gray-500 hover:bg-gray-900/60'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {selectedModality === 'offline' && (
                <motion.div
                  layoutId="modalityIndicator"
                  className="absolute inset-0 bg-emerald-400/5"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <div className="relative z-10">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/20">
                    <WifiOff className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div>
                    <span className={`font-bold text-lg ${selectedModality === 'offline' ? 'text-emerald-300' : 'text-gray-300'}`}>
                      Offline vs Bot
                    </span>
                    <p className="text-xs text-gray-500">Jogue agora, sem esperar</p>
                  </div>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Jogue <strong className="text-emerald-300">imediatamente</strong> contra o Bot Dungeon Soccer.
                  Não precisa de convite, não precisa esperar — comece a partida agora!
                  Ideal para treinar estratégias e testar ações.
                </p>
              </div>
            </motion.button>

            {/* Online com Convite */}
            <motion.button
              onClick={() => setSelectedModality('online')}
              className={`relative overflow-hidden rounded-xl border-2 p-5 text-left transition-all ${
                selectedModality === 'online'
                  ? 'border-amber-400 bg-amber-950/30 shadow-lg shadow-amber-500/10'
                  : 'border-gray-700 bg-gray-900/40 hover:border-gray-500 hover:bg-gray-900/60'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {selectedModality === 'online' && (
                <motion.div
                  layoutId="modalityIndicator"
                  className="absolute inset-0 bg-amber-400/5"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <div className="relative z-10">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/20">
                    <Wifi className="h-6 w-6 text-amber-400" />
                  </div>
                  <div>
                    <span className={`font-bold text-lg ${selectedModality === 'online' ? 'text-amber-300' : 'text-gray-300'}`}>
                      Online com Convite
                    </span>
                    <p className="text-xs text-gray-500">Desafie um amigo ao vivo</p>
                  </div>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Crie uma partida e <strong className="text-amber-300">envie o convite</strong> via WhatsApp,
                  Telegram ou copie o link. Quando seu amigo entrar, a partida começa ao vivo!
                  Ambos jogam com seus times montados.
                </p>
              </div>
            </motion.button>
          </div>
        </motion.div>

        {/* ===== Seleção de Modo de Jogo ===== */}
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h2 className="mb-3 text-center text-lg font-bold text-gray-200">
            <Zap className="mr-2 inline h-5 w-5 text-amber-400" />
            Escolha o Modo de Jogo
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(['QUICK_MATCH', 'TIMED_10', 'FULL_90'] as GameMode[]).map((mode) => {
              const config = GAME_MODE_CONFIG[mode]
              const isSelected = selectedGameMode === mode
              return (
                <motion.button
                  key={mode}
                  onClick={() => setSelectedGameMode(mode)}
                  className={`relative overflow-hidden rounded-xl border-2 p-4 text-left transition-all ${
                    isSelected
                      ? 'border-amber-400 bg-amber-950/30 shadow-lg shadow-amber-500/10'
                      : 'border-gray-700 bg-gray-900/40 hover:border-gray-500 hover:bg-gray-900/60'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isSelected && (
                    <motion.div
                      layoutId="gameModeIndicator"
                      className="absolute inset-0 bg-amber-400/5"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <div className="relative z-10">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-2xl">{config.emoji}</span>
                      <span className={`font-bold ${isSelected ? 'text-amber-300' : 'text-gray-300'}`}>
                        {config.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {config.description}
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-[10px]">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Medal className="h-3 w-3" />
                        +{config.xpWin} XP
                      </span>
                      {config.goalsToWin > 0 && (
                        <span className="text-amber-300">
                          ⚽ {config.goalsToWin} gols
                        </span>
                      )}
                      {config.durationMs > 0 && (
                        <span className="flex items-center gap-1 text-sky-400">
                          <Clock className="h-3 w-3" />
                          {config.durationMs / 60000} min
                        </span>
                      )}
                      {config.turnTimerSeconds > 0 && (
                        <span className="text-gray-500">
                          ⏳ {config.turnTimerSeconds}s/turno
                        </span>
                      )}
                    </div>
                  </div>
                </motion.button>
              )
            })}
          </div>
        </motion.div>

        {/* Cards explicativos */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="border-amber-500/30 bg-gray-900/60">
            <CardContent className="flex items-start gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20">
                <Trophy className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-300">1. Moeda</p>
                <p className="text-xs text-gray-400">Juiz lança a moeda 3D pra decidir quem começa.</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-500/30 bg-gray-900/60">
            <CardContent className="flex items-start gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20">
                <BookOpen className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-purple-300">2. Ação</p>
                <p className="text-xs text-gray-400">Escolha entre 3 (saída) ou 5 (turno) ações sorteadas.</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/30 bg-gray-900/60">
            <CardContent className="flex items-start gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20">
                <Dice5 className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-300">3. D20</p>
                <p className="text-xs text-gray-400">Role o d20: ≥ DC é sucesso. Natural 20 = crit!</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Create Match Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex justify-center"
        >
          <Button
            onClick={handleCreateMatch}
            disabled={creating}
            className={`gap-2 px-8 py-3 text-lg font-bold shadow-lg ${
              selectedModality === 'offline'
                ? 'bg-emerald-500 text-black hover:bg-emerald-400 shadow-emerald-500/20'
                : 'bg-amber-500 text-black hover:bg-amber-400 shadow-amber-500/20'
            }`}
            size="lg"
          >
            {creating ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Swords className="h-5 w-5" />
                </motion.div>
                Criando partida...
              </>
            ) : (
              <>
                {selectedModality === 'offline' ? (
                  <>
                    <Bot className="h-5 w-5" />
                    Jogar Offline vs Bot
                  </>
                ) : (
                  <>
                    <Users className="h-5 w-5" />
                    Criar Partida com Convite
                  </>
                )}
              </>
            )}
          </Button>
        </motion.div>

        {/* Loading overlay */}
        {creating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Swords className="h-10 w-10 text-amber-400" />
              </motion.div>
              <p className="text-sm text-gray-300">
                {selectedModality === 'offline'
                  ? `Criando partida offline (${GAME_MODE_CONFIG[selectedGameMode].label})...`
                  : `Criando partida com convite (${GAME_MODE_CONFIG[selectedGameMode].label})...`
                }
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
