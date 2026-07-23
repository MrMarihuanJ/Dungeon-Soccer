'use client'

// =====================================================================
// TeamBuilderApp - Aplicação principal do montador de times
// Inclui: tema dark/light, easter eggs, salvar time por usuário,
//         compartilhar time, ver estatísticas no ogol.com.br
//         + modo RPG com convite/join flow
// =====================================================================

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Field } from '@/components/football/Field'
import { PlayerSearchModal } from '@/components/football/PlayerSearchModal'
import { ReserveTeam } from '@/components/football/ReserveTeam'
import { SubstitutionDialog } from '@/components/football/SubstitutionDialog'
import { Header } from '@/components/football/Header'
import { Instructions } from '@/components/football/Instructions'
import { Toolbar } from '@/components/football/Toolbar'
import { Footer } from '@/components/football/Footer'
import { ShareTeamDialog } from '@/components/football/ShareTeamDialog'
import { PlayerStatsDialog } from '@/components/football/PlayerStatsDialog'
import {
  EasterEggs,
  SECRET_TEAMS,
  fetchWikipediaPhoto,
  fallbackPhoto,
  posToPosition,
  type SecretTeamId,
} from '@/components/effects/EasterEggs'
import { MatchLobby } from '@/components/match/MatchLobby'
import { MatchArena } from '@/components/match/MatchArena'
import { TeamRatingCard } from '@/components/football/TeamRatingCard'
import { GameModeSelector } from '@/components/football/GameModeSelector'
import { useTeamStore, type SelectedPlayer } from '@/lib/football/store'
import { getFormation, type FieldPosition } from '@/lib/football/formations'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Share2, BarChart3, Swords, Loader2, AlertTriangle, Users } from 'lucide-react'
import { GAME_MODE_CONFIG, type GameMode } from '@/lib/match-engine'

type SearchMode = 'starter' | 'reserve'

interface Props {
  inviteCode?: string
}

export function TeamBuilderApp({ inviteCode }: Props) {
  const {
    formationId,
    starters,
    reserves,
    gameMode,
    setFormation,
    setStarter,
    removeStarter,
    addReserve,
    removeReserve,
    substitute,
    clearTeam,
    initStarters,
    loadFromObject,
    setGameMode,
  } = useTeamStore()

  const formation = getFormation(formationId)

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchMode, setSearchMode] = useState<SearchMode>('starter')
  const [activePosition, setActivePosition] = useState<FieldPosition | null>(null)
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [substOpen, setSubstOpen] = useState(false)
  const [reserveToEnter, setReserveToEnter] = useState<SelectedPlayer | null>(null)
  const [matchMode, setMatchMode] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; displayName?: string | null } | null>(null)

  // New: share & stats dialogs
  const [shareOpen, setShareOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [statsPlayer, setStatsPlayer] = useState<SelectedPlayer | null>(null)

  // ===== Invite/Join state =====
  const [joinState, setJoinState] = useState<'idle' | 'joining' | 'joined' | 'error'>(inviteCode ? 'joining' : 'idle')
  const [joinMatchId, setJoinMatchId] = useState<string | null>(null)
  const [joinHomeUser, setJoinHomeUser] = useState<{ id: string; username: string; displayName?: string | null } | null>(null)
  const [joinAwayUser, setJoinAwayUser] = useState<{ id: string; username: string; displayName?: string | null } | null>(null)
  const [joinGameMode, setJoinGameMode] = useState<GameMode>('QUICK_MATCH')
  const [joinInviteCode, setJoinInviteCode] = useState<string | null>(inviteCode ?? null)

  // Verifica usuário logado (para o modo de partida)
  useEffect(() => {
    fetch('/api/user/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.ok && data?.user) setCurrentUser(data.user)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    initStarters()
  }, [initStarters])

  // ===== Join Match via Invite Code =====
  const handleJoinMatch = async (code: string) => {
    setJoinState('joining')
    try {
      const res = await fetch('/api/match/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: code }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast.error(data.error || 'Erro ao entrar na partida.')
        setJoinState('error')
        // Clear invite param from URL
        const url = new URL(window.location.href)
        url.searchParams.delete('invite')
        window.history.pushState({}, '', url.toString())
        window.dispatchEvent(new PopStateEvent('popstate'))
        return
      }

      // Successfully joined! Set match data and transition
      setJoinMatchId(data.match.id)
      setMatchMode(true)
      setJoinState('joined')

      // Set home and away users
      setJoinHomeUser({
        id: data.match.homeUser.id,
        username: data.match.homeUser.username,
        displayName: data.match.homeUser.displayName,
      })
      setJoinAwayUser({
        id: data.match.awayUser.id,
        username: data.match.awayUser.username,
        displayName: data.match.awayUser.displayName,
      })
      setJoinGameMode(data.match.gameMode)
      setJoinInviteCode(code)

      // Clear invite param from URL after successful join
      const url = new URL(window.location.href)
      url.searchParams.delete('invite')
      window.history.pushState({}, '', url.toString())
      window.dispatchEvent(new PopStateEvent('popstate'))

      toast.success(`Você entrou na partida de ${data.match.homeUser.username}!`)
    } catch {
      toast.error('Erro de conexão ao entrar na partida.')
      setJoinState('error')
    }
  }

  // ===== Auto-join when inviteCode is present and user is logged in =====
  useEffect(() => {
    if (inviteCode && joinState === 'joining' && currentUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleJoinMatch(inviteCode)
    }
  }, [inviteCode, currentUser])

  const selectedIds = [
    ...Object.values(starters).map((p) => p?.id).filter(Boolean),
    ...reserves.map((r) => r.id),
  ] as string[]

  const handleSelectPosition = (pos: FieldPosition) => {
    setActivePosition(pos)
    setSearchMode('starter')
    setSearchOpen(true)
  }

  const handleAddReserve = () => {
    setActivePosition(null)
    setSearchMode('reserve')
    setSearchOpen(true)
  }

  const handlePlayerSelect = (player: SelectedPlayer) => {
    if (searchMode === 'starter' && activePosition) {
      setStarter(activePosition.id, player)
      toast.success(`${player.name} entrou como titular (${activePosition.label}).`)
    } else {
      addReserve(player)
      toast.success(`${player.name} convocado para o banco de reservas.`)
    }
  }

  const handleRemovePosition = (pos: FieldPosition) => {
    const p = starters[pos.id]
    removeStarter(pos.id)
    if (p) toast.info(`${p.name} removido do time titular.`)
  }

  const handleSubstitute = (reserve: SelectedPlayer) => {
    setReserveToEnter(reserve)
    setSubstOpen(true)
  }

  const handleConfirmSubstitution = (positionId: string) => {
    if (!reserveToEnter) return
    substitute(positionId, reserveToEnter.id)
    const outPlayer = starters[positionId]
    toast.success(
      `Substituição feita: ${reserveToEnter.name} entra no lugar de ${outPlayer?.name ?? 'titular'}.`,
    )
    setReserveToEnter(null)
  }

  const handleClear = () => {
    clearTeam()
    toast.info('Time resetado. Comece de novo!')
  }

  // ---- Salvar time no servidor (usuário logado) ----
  const handleTeamSave = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/user/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formation: formationId,
          starters,
          reserves,
        }),
      })
      const data = await res.json()
      return !!data.ok
    } catch {
      return false
    }
  }, [formationId, starters, reserves])

  // ---- Carregar time do servidor ----
  const handleTeamLoad = useCallback(
    (team: { formation: string; starters: any; reserves: any }) => {
      loadFromObject(team)
      toast.success(`Time carregado: formação ${team.formation}`)
    },
    [loadFromObject],
  )

  // ---- Easter egg: montar time secreto (com fotos reais da Wikipedia) ----
  const handleSecretTeam = async (teamId: SecretTeamId) => {
    const config = SECRET_TEAMS[teamId]
    if (!config) return

    // Avisa o usuário que as fotos estão sendo carregadas
    const loadingToast = toast.loading(`Montando ${config.emoji} ${config.name}...`, {
      description: 'Buscando fotos reais na Wikipedia...',
    })

    // Limpa time atual
    clearTeam()
    setFormation(config.formation)

    // Busca fotos em paralelo para todos os jogadores
    const entries = Object.entries(config.players)
    const withPhotos = await Promise.all(
      entries.map(async ([posId, p]) => {
        const photo = await fetchWikipediaPhoto(p.wikiTitle)
        return [
          posId,
          {
            id: `secret_${teamId}_${posId}`,
            name: p.name,
            fullName: p.fullName,
            team: p.team,
            position: posToPosition(posId),
            photoUrl: photo || fallbackPhoto(p.name),
            nationality: p.nationality,
            shirtNumber: p.shirtNumber,
          } as SelectedPlayer,
        ]
      }),
    )

    // Constrói o objeto de starters mapeado por posição
    const startersObj: Record<string, SelectedPlayer> = {}
    withPhotos.forEach(([posId, player]) => {
      startersObj[posId as string] = player as SelectedPlayer
    })

    // Aplica o time no store
    loadFromObject({
      formation: config.formation,
      starters: startersObj,
      reserves: [],
    })

    toast.dismiss(loadingToast)
    toast.success(`${config.emoji} ${config.name} — Time dos Sonhos montado!`, {
      description: config.toastDescription,
      duration: 8000,
    })
  }

  const startersCount = Object.values(starters).filter(Boolean).length

  // ===== Invite Join: Show joining/error screen =====
  if (inviteCode && joinState === 'joining' && !currentUser) {
    // User is not logged in yet, show login prompt
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-emerald-950/30 to-gray-950 p-6 text-center text-white">
        <div className="max-w-md">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Users className="mb-4 h-16 w-16 text-amber-400" />
          </motion.div>
          <h1 className="mb-3 text-2xl font-bold text-amber-400">⚔️ Convite recebido!</h1>
          <p className="mb-4 text-sm text-gray-400">
            Você recebeu um convite para jogar Dungeon Soccer, mas precisa estar logado para entrar.
          </p>
          <p className="mb-6 text-xs text-gray-500">
            Faça login e o convite será aplicado automaticamente.
          </p>
          <Button
            onClick={() => {
              // Clear invite from URL and go to login
              const url = new URL(window.location.href)
              url.searchParams.delete('invite')
              window.history.pushState({}, '', url.toString())
              window.dispatchEvent(new PopStateEvent('popstate'))
              setJoinState('idle')
              setJoinInviteCode(null)
            }}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            Voltar ao site
          </Button>
        </div>
      </div>
    )
  }

  if (inviteCode && joinState === 'joining' && currentUser) {
    // Currently attempting to join
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-emerald-950/30 to-gray-950 p-6 text-center text-white">
        <div className="max-w-md">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <Swords className="mb-4 h-16 w-16 text-amber-400" />
          </motion.div>
          <h1 className="mb-3 text-2xl font-bold text-amber-400">⚔️ Entrando na partida...</h1>
          <p className="mb-4 text-sm text-gray-400">
            Conectando com o jogador que te convidou.
          </p>
        </div>
      </div>
    )
  }

  if (inviteCode && joinState === 'error') {
    // Error joining
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-emerald-950/30 to-gray-950 p-6 text-center text-white">
        <div className="max-w-md">
          <AlertTriangle className="mb-4 h-16 w-16 text-red-400" />
          <h1 className="mb-3 text-2xl font-bold text-red-400">❌ Erro ao entrar</h1>
          <p className="mb-4 text-sm text-gray-400">
            O convite pode ser inválido, expirado ou a partida já começou.
          </p>
          <Button
            onClick={() => {
              setJoinState('idle')
              setJoinInviteCode(null)
            }}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            Voltar ao site
          </Button>
        </div>
      </div>
    )
  }

  // ===== Joined successfully via invite — render MatchArena =====
  if (joinState === 'joined' && matchMode && joinMatchId && joinHomeUser && joinAwayUser) {
    return (
      <MatchArena
        matchId={joinMatchId}
        homeUser={joinHomeUser}
        awayUser={joinAwayUser}
        currentUserId={currentUser!.id}
        gameMode={joinGameMode}
        inviteCode={joinInviteCode || ''}
        onExit={() => {
          setMatchMode(false)
          setJoinMatchId(null)
          setJoinHomeUser(null)
          setJoinAwayUser(null)
          setJoinInviteCode(null)
          setJoinState('idle')
        }}
      />
    )
  }

  // ===== Modo Partida RPG =====
  if (matchMode) {
    if (!currentUser) {
      // Se não está logado, pede para logar
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-emerald-950/30 to-gray-950 p-6 text-center text-white">
          <div className="max-w-md">
            <h1 className="mb-3 text-2xl font-bold text-amber-400">⚔️ Login necessário</h1>
            <p className="mb-6 text-sm text-gray-400">
              Para jogar partidas RPG contra amigos, você precisa estar logado. Faça login ou crie
              uma conta gratuita.
            </p>
            <button
              onClick={() => setMatchMode(false)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold hover:bg-emerald-700"
            >
              Voltar ao site
            </button>
          </div>
        </div>
      )
    }
    return (
      <MatchLobby
        currentUser={currentUser}
        onExit={() => setMatchMode(false)}
      />
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-emerald-50 via-background to-emerald-50 dark:from-gray-950 dark:via-background dark:to-emerald-950/30">
      <EasterEggs onSecretTeam={handleSecretTeam} />
      <Header
        onClear={handleClear}
        onOpenInstructions={() => setInstructionsOpen(true)}
        totalPlayers={startersCount + reserves.length}
        onTeamSave={handleTeamSave}
        onTeamLoad={handleTeamLoad}
        onOpenMatch={() => setMatchMode(true)}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {/* Hero compacto com animação */}
        <motion.section
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 text-center sm:mb-8"
        >
          <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Monte seu <span className="bg-gradient-to-r from-emerald-500 to-emerald-700 bg-clip-text text-transparent">Time dos Sonhos</span>
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Busque <strong>qualquer jogador do mundo</strong> em tempo real, escolha a formação
            tática e gerencie seu banco de reservas como um técnico.
          </p>
        </motion.section>

        {/* Toolbar + Share button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Toolbar
                formationId={formationId}
                onFormationChange={setFormation}
                onAddReserve={handleAddReserve}
                startersCount={startersCount}
                reservesCount={reserves.length}
              />
            </div>
            {/* Share button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareOpen(true)}
              disabled={startersCount === 0}
              className="gap-1 border-emerald-700 text-emerald-300 hover:bg-emerald-900/30"
              title="Compartilhar time"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Compartilhar</span>
            </Button>
          </div>
        </motion.div>

        {/* Game Mode Selector */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mb-6"
        >
          <GameModeSelector value={gameMode} onChange={setGameMode} />
        </motion.div>

        {/* Grid principal */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="lg:col-span-2"
          >
            <Field
              formation={formation}
              starters={starters}
              onSelectPosition={handleSelectPosition}
              onRemovePosition={handleRemovePosition}
              onViewStats={(player) => {
                setStatsPlayer(player)
                setStatsOpen(true)
              }}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              💡 Clique numa bola para adicionar jogador. A busca é em tempo real e cobre
              jogadores do mundo inteiro.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="lg:col-span-1"
          >
            <ReserveTeam
              reserves={reserves}
              startersCount={startersCount}
              onSubstitute={handleSubstitute}
              onRemove={removeReserve}
            />
            {/* Team Rating Card + Stats/Share buttons */}
            <div className="mt-4 space-y-3">
              <TeamRatingCard starters={starters} reserves={reserves} />

              {/* Quick action buttons */}
              {startersCount > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShareOpen(true)}
                    className="flex-1 gap-1 border-emerald-700 text-emerald-300 text-xs hover:bg-emerald-900/30"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Compartilhar Time
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Escalação atual */}
        {startersCount > 0 && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-8"
          >
            <h3 className="mb-3 text-lg font-bold text-foreground">Escalação atual</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {formation.positions.map((p) => {
                const player = starters[p.id]
                if (!player) return null
                return (
                  <motion.div
                    key={p.id}
                    whileHover={{ scale: 1.04 }}
                    className="group relative rounded-lg border border-border bg-card p-2 text-center shadow-sm"
                  >
                    <div className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">{p.label}</div>
                    <div className="truncate text-sm font-semibold text-foreground">{player.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{player.team}</div>
                    {/* Stats button (appears on hover) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setStatsPlayer(player)
                        setStatsOpen(true)
                      }}
                      className="absolute -top-1 -right-1 hidden h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white group-hover:flex"
                      title="Ver estatísticas no ogol.com.br"
                    >
                      <BarChart3 className="h-3 w-3" />
                    </button>
                  </motion.div>
                )
              })}
            </div>
          </motion.section>
        )}
      </main>

      <Footer />

      <PlayerSearchModal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        position={searchMode === 'starter' ? activePosition : null}
        selectedPlayerIds={selectedIds}
        onSelect={handlePlayerSelect}
        gameMode={gameMode}
      />
      <SubstitutionDialog
        open={substOpen}
        onOpenChange={setSubstOpen}
        reserve={reserveToEnter}
        formation={formation}
        starters={starters}
        onConfirm={handleConfirmSubstitution}
      />
      <Instructions open={instructionsOpen} onOpenChange={setInstructionsOpen} />

      {/* New: Share & Stats dialogs */}
      <ShareTeamDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        formationId={formationId}
        starters={starters}
        reserves={reserves}
        username={currentUser?.username}
      />
      <PlayerStatsDialog
        open={statsOpen}
        onOpenChange={setStatsOpen}
        player={statsPlayer}
      />
    </div>
  )
}
