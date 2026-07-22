'use client'

// =====================================================================
// FriendsPanel - Gerencia amigos (adicionar, aceitar, listar)
// =====================================================================

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  UserPlus, Search, Check, X, Swords, Trophy, Loader2, Users, UserCheck,
} from 'lucide-react'
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

interface FriendRequestItem {
  id: string
  fromUser: { id: string; username: string; displayName?: string | null; xp: number }
}

interface Props {
  onChallenge: (friend: Friend) => void
}

export function FriendsPanel({ onChallenge }: Props) {
  const [friends, setFriends] = useState<Friend[]>([])
  const [requests, setRequests] = useState<FriendRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [fr, rq] = await Promise.all([
        fetch('/api/user/friends/list', { cache: 'no-store' }),
        fetch('/api/user/friends/requests', { cache: 'no-store' }),
      ])
      if (!fr.ok || !rq.ok) {
        if (fr.status === 401 || rq.status === 401) {
          toast.error('Sessão expirada. Faça login novamente.')
        }
        return
      }
      const frData = await fr.json()
      const rqData = await rq.json()
      if (frData.ok) setFriends(frData.friends)
      if (rqData.ok) setRequests(rqData.requests)
    } catch (err) {
      console.error('[FriendsPanel] load error:', err)
      toast.error('Erro ao carregar amigos. Verifique sua conexão.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const sendRequest = async () => {
    if (!searchQuery.trim()) return
    try {
      const res = await fetch('/api/user/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: searchQuery.trim() }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast.error(data.error || 'Erro ao enviar convite.')
        return
      }
      toast.success(`Convite enviado para @${data.toUser.username}!`)
      setSearchQuery('')
    } catch {
      toast.error('Erro de rede.')
    }
  }

  const acceptRequest = async (requestId: string) => {
    try {
      const res = await fetch('/api/user/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Amizade aceita!')
        loadData()
      } else {
        toast.error(data.error || 'Erro.')
      }
    } catch {
      toast.error('Erro de rede.')
    }
  }

  const rejectRequest = async (requestId: string) => {
    try {
      await fetch('/api/user/friends/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      })
      toast.info('Convite recusado.')
      loadData()
    } catch {}
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Coluna 1: Adicionar amigo + Convites pendentes */}
      <div className="space-y-4">
        {/* Adicionar amigo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <UserPlus className="h-5 w-5" />
              Adicionar amigo
            </CardTitle>
            <CardDescription>Digite o @usuário ou email do seu amigo.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendRequest()}
                  placeholder="@usuario ou email@email.com"
                  className="pl-9"
                />
              </div>
              <Button onClick={sendRequest} disabled={!searchQuery.trim()}>
                <UserPlus className="h-4 w-4" />
                Enviar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Convites pendentes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-amber-600 dark:text-amber-400">
              <span className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Convites pendentes
              </span>
              <Badge className="bg-amber-500 text-white">{requests.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Nenhum convite pendente.
              </p>
            ) : (
              <ul className="space-y-2">
                <AnimatePresence>
                  {requests.map((r) => (
                    <motion.li
                      key={r.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card p-2"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                          {r.fromUser.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{r.fromUser.username}</p>
                        <p className="text-[11px] text-muted-foreground">
                          XP: {r.fromUser.xp}
                        </p>
                      </div>
                      <Button size="sm" variant="default" onClick={() => acceptRequest(r.id)} className="h-8 gap-1 bg-emerald-600 px-2">
                        <Check className="h-3 w-3" />
                        Aceitar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => rejectRequest(r.id)} className="h-8 px-2 text-red-500">
                        <X className="h-3 w-3" />
                      </Button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Coluna 2: Lista de amigos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
            <span className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Seus amigos
            </span>
            <Badge className="bg-emerald-600 text-white">{friends.length}</Badge>
          </CardTitle>
          <CardDescription>Desafie um amigo para uma partida RPG!</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : friends.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Users className="h-10 w-10 opacity-30" />
              <p className="text-sm">Você ainda não tem amigos.</p>
              <p className="text-xs">Adicione alguém pelo @usuário!</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-2">
              <ul className="space-y-2">
                {friends.map((f) => {
                  const initials = (f.displayName || f.username).slice(0, 2).toUpperCase()
                  const winRate = f.wins + f.losses > 0
                    ? Math.round((f.wins / (f.wins + f.losses)) * 100)
                    : 0
                  return (
                    <motion.li
                      key={f.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card p-2"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-xs font-bold text-white">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{f.displayName || f.username}</p>
                        <p className="text-[11px] text-muted-foreground">
                          @{f.username} · {f.wins}V {f.losses}D · {winRate}% · {f.xp} XP
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => onChallenge(f)}
                        className="gap-1 bg-amber-500 hover:bg-amber-600"
                      >
                        <Swords className="h-3.5 w-3.5" />
                        Desafiar
                      </Button>
                    </motion.li>
                  )
                })}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
