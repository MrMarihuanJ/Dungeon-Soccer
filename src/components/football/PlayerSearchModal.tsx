'use client'

// =====================================================================
// PlayerSearchModal - Modal de busca com autocomplete em tempo real
// --------------------------------------------------------------------
// Funcionalidades:
//   - Input de texto com debounce de 250ms
//   - Consulta /api/players/search em tempo real
//   - Lista de sugestões com foto, nome e time
//   - Filtro de posição (opcional) - default = posição do slot
//   - Seleção do jogador fecha o modal e dispara callback
// =====================================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, UserPlus, AlertCircle, X, Globe } from 'lucide-react'
import Image from 'next/image'
import type { FieldPosition, PositionRole } from '@/lib/football/formations'
import { ROLE_TO_POSITION } from '@/lib/football/formations'
import type { SelectedPlayer } from '@/lib/football/store'

interface ApiPlayer {
  id: string
  name: string
  fullName: string
  team: string
  position: string
  photoUrl: string
  nationality?: string | null
  shirtNumber?: number | null
  source?: 'thesportsdb' | 'transfermarkt' | 'sofascore' | 'local'
  overall?: number
  age?: number
  pace?: number
  shooting?: number
  passing?: number
  dribbling?: number
  defending?: number
  physical?: number
  leagueTier?: string
  isRetired?: boolean
  isInactive?: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  position: FieldPosition | null
  selectedPlayerIds: string[] // IDs já selecionados (titulares + reservas)
  onSelect: (player: SelectedPlayer) => void
  gameMode?: 'DREAM_TEAM' | 'WORLD_CUP'
}

export function PlayerSearchModal({
  open,
  onOpenChange,
  position,
  selectedPlayerIds,
  onSelect,
  gameMode = 'DREAM_TEAM',
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ApiPlayer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Posição-alvo no banco (GK/DF/MF/FW) baseada no role tático do slot
  const targetPos = position ? ROLE_TO_POSITION[position.role] : null

  const runSearch = useCallback(
    async (q: string) => {
      if (!q || q.length < 1) {
        setResults([])
        setError(null)
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ q, limit: '15' })
        if (targetPos) params.set('pos', targetPos)
        if (gameMode) params.set('mode', gameMode)
        const res = await fetch(`/api/players/search?${params.toString()}`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error('Falha na busca')
        const data = await res.json()
        setResults(data.players ?? [])
      } catch (e) {
        console.error(e)
        setError('Não foi possível buscar jogadores. Tente novamente.')
        setResults([])
      } finally {
        setLoading(false)
      }
    },
    [targetPos, gameMode],
  )

  // Debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runSearch(query)
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, runSearch])

  // Limpa ao abrir
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setError(null)
    }
  }, [open])

  const handleSelect = (p: ApiPlayer) => {
    const sel: SelectedPlayer = {
      id: p.id,
      name: p.name,
      fullName: p.fullName,
      team: p.team,
      position: p.position,
      photoUrl: p.photoUrl,
      nationality: p.nationality,
      shirtNumber: p.shirtNumber,
      overall: p.overall,
      age: p.age,
      pace: p.pace,
      shooting: p.shooting,
      passing: p.passing,
      dribbling: p.dribbling,
      defending: p.defending,
      physical: p.physical,
      leagueTier: p.leagueTier,
      isRetired: p.isRetired,
      isInactive: p.isInactive,
      source: p.source,
    }
    onSelect(sel)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <Search className="h-5 w-5" />
            {position ? `Selecionar jogador · ${position.label}` : 'Buscar jogador'}
          </DialogTitle>
          <DialogDescription>
            {position
              ? `Busca mundial em tempo real via TheSportsDB + Transfermarkt + Sofascore + banco local. Filtro automático: ${targetPos}.`
              : 'Busca mundial em tempo real via TheSportsDB + Transfermarkt + Sofascore + banco local. Digite o nome de qualquer jogador do mundo.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Input com ícone */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: Neymar, Vini Jr, Pedro..."
              className="pl-9 pr-9"
              aria-label="Buscar jogador"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filtro de posição ativo */}
          {targetPos && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                Posição: {targetPos}
              </Badge>
              <span>·</span>
              <span>{results.length} resultado(s)</span>
            </div>
          )}

          {/* Resultados */}
          <ScrollArea className="h-[320px] rounded-lg border">
            <div className="p-2">
              {/* Loading */}
              {loading && (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-2 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Erro */}
              {!loading && error && (
                <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-red-600">
                  <AlertCircle className="h-6 w-6" />
                  <span>{error}</span>
                  <Button size="sm" variant="outline" onClick={() => runSearch(query)}>
                    Tentar novamente
                  </Button>
                </div>
              )}

              {/* Lista vazia (sem busca) */}
              {!loading && !error && query.length === 0 && (
                <div className="flex flex-col items-center gap-2 p-8 text-center text-gray-400">
                  <Search className="h-8 w-8" />
                  <span className="text-sm">Comece digitando o nome de um jogador</span>
                </div>
              )}

              {/* Lista vazia (sem resultados) */}
              {!loading && !error && query.length > 0 && results.length === 0 && (
                <div className="flex flex-col items-center gap-2 p-8 text-center text-gray-500">
                  <AlertCircle className="h-8 w-8" />
                  <span className="text-sm">
                    Nenhum jogador encontrado para &quot;<strong>{query}</strong>&quot;.
                  </span>
                  <span className="text-xs text-gray-400">
                    Tente outro nome ou verifique a posição.
                  </span>
                </div>
              )}

              {/* Resultados */}
              {!loading && !error && results.length > 0 && (
                <ul className="space-y-1">
                  {results.map((p) => {
                    const isSelected = selectedPlayerIds.includes(p.id)
                    const sourceBadge = p.source === 'thesportsdb'
                      ? { label: 'SportsDB', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' }
                      : p.source === 'transfermarkt'
                        ? { label: 'Transfermarkt', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' }
                        : p.source === 'sofascore'
                          ? { label: 'Sofascore', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' }
                          : { label: 'Local', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }
                    // Overall badge estilo FIFA
                    const overall = p.overall ?? 0
                    const overallTier = overall >= 90 ? 'bg-gradient-to-br from-yellow-400 to-amber-600 text-amber-900'
                      : overall >= 84 ? 'bg-gradient-to-br from-purple-500 to-purple-700 text-white'
                        : overall >= 75 ? 'bg-gradient-to-br from-yellow-500 to-yellow-700 text-white'
                          : overall >= 68 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-gray-900'
                            : 'bg-gradient-to-br from-orange-400 to-orange-700 text-white'
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          disabled={isSelected}
                          onClick={() => handleSelect(p)}
                          className={`group flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors ${
                            isSelected
                              ? 'cursor-not-allowed opacity-50'
                              : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                          }`}
                        >
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-emerald-200 bg-gray-100 dark:border-emerald-700 dark:bg-gray-800">
                            <Image
                              src={p.photoUrl}
                              alt={p.name}
                              fill
                              sizes="44px"
                              className="object-cover"
                              unoptimized
                              onError={(e) => {
                                const target = e.currentTarget as HTMLImageElement
                                target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=0d8a3f&color=fff&size=200&bold=true`
                              }}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-semibold text-gray-900 dark:text-gray-100">
                                {p.name}
                              </span>
                              {p.shirtNumber && (
                                <span className="rounded bg-emerald-100 px-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                  #{p.shirtNumber}
                                </span>
                              )}
                              {p.isRetired && (
                                <span className="rounded bg-purple-100 px-1 text-[9px] font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                                  👑 LENDA
                                </span>
                              )}
                              <span className={`rounded px-1 text-[9px] font-medium ${sourceBadge.cls}`}>
                                {sourceBadge.label}
                              </span>
                            </div>
                            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                              {p.fullName} · {p.team}
                              {p.nationality ? ` · ${p.nationality}` : ''}
                              {p.age ? ` · ${p.age}a` : ''}
                            </div>
                          </div>
                          {/* Overall badge estilo FIFA */}
                          {overall > 0 && (
                            <div className={`flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg ${overallTier}`}>
                              <span className="text-sm font-black leading-none">{overall}</span>
                              <span className="text-[7px] font-bold uppercase leading-none">OVR</span>
                            </div>
                          )}
                          <div className="shrink-0 flex items-center gap-1">
                            {/* ogol.com.br link */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                window.open(`https://www.ogol.com.br/search.php?search=${encodeURIComponent(p.name)}`, '_blank')
                              }}
                              className="rounded p-1 text-gray-400 transition-colors hover:bg-green-100 hover:text-green-600 dark:hover:bg-green-900/30 dark:hover:text-green-400"
                              title="Ver no ogol.com.br"
                            >
                              <Globe className="h-3.5 w-3.5" />
                            </button>
                            {isSelected ? (
                              <Badge variant="outline" className="text-[10px] text-gray-400">
                                já no time
                              </Badge>
                            ) : (
                              <UserPlus className="h-4 w-4 text-gray-400 transition-colors group-hover:text-emerald-600" />
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </ScrollArea>

          <p className="text-center text-[11px] text-gray-400">
            🌍 Busca mundial em tempo real · TheSportsDB + Transfermarkt + Sofascore + banco local + ogol.com.br
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
