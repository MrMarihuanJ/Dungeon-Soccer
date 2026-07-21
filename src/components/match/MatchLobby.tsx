'use client'

// =====================================================================
// MatchLobby - Tela inicial do modo RPG: escolhe amigo para desafiar
// =====================================================================

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ArrowLeft, Swords, BookOpen, Trophy, Dice5 } from 'lucide-react'
import { FriendsPanel } from './FriendsPanel'
import { MatchArena } from './MatchArena'
import { toast } from 'sonner'

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

type LobbyState = 'friends' | 'match'

export function MatchLobby({ currentUser, onExit }: Props) {
  const [state, setState] = useState<LobbyState>('friends')
  const [matchId, setMatchId] = useState<string | null>(null)
  const [opponent, setOpponent] = useState<Friend | null>(null)
  const [creating, setCreating] = useState(false)

  const handleChallenge = async (friend: Friend) => {
    setCreating(true)
    try {
      const res = await fetch('/api/match/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opponentId: friend.id }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast.error(data.error || 'Erro ao criar partida.')
        return
      }
      setMatchId(data.match.id)
      setOpponent(friend)
      setState('match')
      toast.success(`Partida contra ${friend.username} iniciada!`)
    } catch {
      toast.error('Erro de rede.')
    } finally {
      setCreating(false)
    }
  }

  if (state === 'match' && matchId && opponent) {
    return (
      <MatchArena
        matchId={matchId}
        homeUser={{
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
        }}
        awayUser={{
          id: opponent.id,
          username: opponent.username,
          displayName: opponent.displayName,
        }}
        currentUserId={currentUser.id}
        onExit={() => {
          setState('friends')
          setMatchId(null)
          setOpponent(null)
        }}
      />
    )
  }

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
            Desafie seus amigos para partidas com regras de <strong className="text-amber-300">Dungeons & Dragons</strong>:
            lance a moeda, role o d20 e execute mais de 100 ações estratégicas!
          </p>
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

        {/* Friends Panel */}
        <FriendsPanel onChallenge={handleChallenge} />

        {/* Loading overlay quando estiver criando partida */}
        {creating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Swords className="h-10 w-10 text-amber-400" />
              </motion.div>
              <p className="text-sm text-gray-300">Criando partida...</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
