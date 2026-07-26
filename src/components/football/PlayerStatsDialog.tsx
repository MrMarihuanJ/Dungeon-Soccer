'use client'

// =====================================================================
// PlayerStatsDialog - Exibe estatísticas atualizadas de um jogador
// Fonte única: TheSportsDB
// =====================================================================

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  BarChart3, ExternalLink, Loader2, Search, Globe,
} from 'lucide-react'
import type { SelectedPlayer } from '@/lib/football/store'

interface PlayerStatsData {
  thesportsdbUrl: string | null
  thesportsdbId: string | null
  latestStats: string | null
  team: string | null
  position: string | null
  nationality: string | null
  photoUrl: string | null
  born: string | null
  height: string | null
  weight: string | null
  sources: { name: string; data: string }[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  player: SelectedPlayer | null
}

export function PlayerStatsDialog({ open, onOpenChange, player }: Props) {
  const [stats, setStats] = useState<PlayerStatsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !player) {
      setStats(null)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    fetch(`/api/players/stats?name=${encodeURIComponent(player.name)}&team=${encodeURIComponent(player.team || '')}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setStats(data.stats)
        } else {
          setError(data.error || 'Erro ao buscar estatísticas.')
        }
      })
      .catch(() => {
        setError('Erro de conexão ao buscar estatísticas.')
      })
      .finally(() => setLoading(false))
  }, [open, player])

  if (!player) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-400">
            <BarChart3 className="h-5 w-5" />
            Estatísticas Atualizadas
          </DialogTitle>
          <DialogDescription>
            Dados de {player.name} — via TheSportsDB
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Player info card */}
          <div className="flex items-center gap-3 rounded-lg border border-emerald-800/30 bg-gray-800/50 p-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 text-xl font-black text-white">
              {player.overall || '??'}
            </div>
            <div className="flex-1">
              <p className="font-bold text-white">{player.name}</p>
              <p className="text-xs text-gray-400">
                {player.position} · {player.team}
                {player.nationality ? ` · ${player.nationality}` : ''}
              </p>
              {player.overall && (
                <div className="mt-1 flex gap-1">
                  <Badge variant="outline" className="border-emerald-700 text-[9px] text-emerald-300">PAC {player.pace || '—'}</Badge>
                  <Badge variant="outline" className="border-rose-700 text-[9px] text-rose-300">SHO {player.shooting || '—'}</Badge>
                  <Badge variant="outline" className="border-blue-700 text-[9px] text-blue-300">PAS {player.passing || '—'}</Badge>
                  <Badge variant="outline" className="border-purple-700 text-[9px] text-purple-300">DRI {player.dribbling || '—'}</Badge>
                  <Badge variant="outline" className="border-amber-700 text-[9px] text-amber-300">DEF {player.defending || '—'}</Badge>
                  <Badge variant="outline" className="border-orange-700 text-[9px] text-orange-300">PHY {player.physical || '—'}</Badge>
                </div>
              )}
            </div>
          </div>

          {loading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
              <p className="text-sm text-gray-400">Buscando estatísticas na TheSportsDB...</p>
            </div>
          )}

          {error && !loading && (
            <div className="rounded-lg border border-red-800/50 bg-red-950/20 p-4 text-center">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {stats && !loading && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                {/* TheSportsDB link */}
                <div className="flex gap-2">
                  {stats.thesportsdbUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(stats.thesportsdbUrl!, '_blank')}
                      className="flex-1 gap-1 border-sky-700 text-sky-400 hover:bg-sky-950"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      TheSportsDB
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                  {!stats.thesportsdbUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`https://www.thesportsdb.com/search.php?search=${encodeURIComponent(player.name)}`, '_blank')}
                      className="flex-1 gap-1 border-sky-700 text-sky-400 hover:bg-sky-950"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      Buscar na TheSportsDB
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {stats.latestStats && (
                  <div className="rounded-lg border border-gray-700/50 bg-gray-800/30 p-3">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">Dados recentes:</p>
                    <p className="text-xs text-gray-300">{stats.latestStats}</p>
                  </div>
                )}

                {/* Personal info */}
                {(stats.born || stats.height || stats.weight) && (
                  <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/20 p-3">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wider text-emerald-400">Informações pessoais:</p>
                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-300">
                      {stats.born && <div><span className="text-gray-500">Nascimento:</span> <span className="ml-1">{stats.born}</span></div>}
                      {stats.height && <div><span className="text-gray-500">Altura:</span> <span className="ml-1">{stats.height}</span></div>}
                      {stats.weight && <div><span className="text-gray-500">Peso:</span> <span className="ml-1">{stats.weight}</span></div>}
                    </div>
                  </div>
                )}

                {!stats.latestStats && !stats.thesportsdbUrl && (
                  <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-4 text-center">
                    <Search className="mx-auto mb-2 h-6 w-6 text-amber-400" />
                    <p className="text-sm text-amber-300">Nenhuma estatística encontrada na TheSportsDB.</p>
                    <p className="mt-1 text-xs text-gray-400">Tente buscar manualmente no site da TheSportsDB.</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
