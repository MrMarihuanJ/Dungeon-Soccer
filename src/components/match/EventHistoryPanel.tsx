'use client'

// =====================================================================
// EventHistoryPanel - Painel de histórico de eventos da partida
// --------------------------------------------------------------------
// Mostra os últimos N eventos da partida com:
//   - Ícone do tipo de evento (gol, falta, cartão, etc.)
//   - Nome do jogador que executou
//   - Descrição narrativa
//   - Resultado da jogada (sucesso/falha, dado rolado)
//   - Indicadores visuais (cores) para eventos especiais
//
// Ajuda o usuário a entender o fluxo da partida e acompanhar
// lesões, cartões e substituições.
// =====================================================================

import { motion, AnimatePresence } from 'framer-motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Target, Shield, Zap, AlertTriangle, Activity } from 'lucide-react'

interface MatchEventLite {
  turn: number
  possession: string
  action?: { name?: string; emoji?: string; category?: string }
  roll?: {
    dice?: number
    success?: boolean
    critical?: 'none' | 'crit_hit' | 'crit_fail'
    total?: number
    dc?: number
  }
  isGoal?: boolean
  progressGained?: number
  penaltyEvent?: {
    type: string
    description?: string
  } | null
  playerName?: string
  narrative?: string
  timestamp?: number
}

interface Props {
  events: MatchEventLite[]
  /** Número máximo de eventos a exibir (default 30) */
  maxItems?: number
  /** Highlight do último evento */
  highlightLast?: boolean
  className?: string
}

const PENALTY_ICONS: Record<string, string> = {
  FOUL: '🟨',
  OFFSIDE: '🚫',
  CORNER: '🚩',
  BALL_OUT: '📤',
  YELLOW_CARD: '🟡',
  RED_CARD: '🔴',
  INJURY: '🏥',
  PENALTY_KICK: '⚪',
  VAR_REVIEW: '📺',
}

const CATEGORY_COLORS: Record<string, string> = {
  KICKOFF: 'border-blue-500/30 bg-blue-500/5',
  PASS: 'border-emerald-500/30 bg-emerald-500/5',
  DRIBBLE: 'border-purple-500/30 bg-purple-500/5',
  SHOOT: 'border-rose-500/30 bg-rose-500/5',
  DEFEND: 'border-amber-500/30 bg-amber-500/5',
  SPECIAL: 'border-yellow-500/30 bg-yellow-500/5',
  FREE_KICK: 'border-teal-500/30 bg-teal-500/5',
}

export function EventHistoryPanel({
  events,
  maxItems = 30,
  highlightLast = true,
  className = '',
}: Props) {
  const recentEvents = [...events].slice(-maxItems).reverse()

  if (recentEvents.length === 0) {
    return (
      <div className={`rounded-md border border-white/10 bg-gray-900/40 p-4 text-center text-xs text-muted-foreground ${className}`}>
        <Activity className="mx-auto mb-2 h-5 w-5 opacity-50" />
        Nenhum evento ainda. Comece a partida!
      </div>
    )
  }

  return (
    <ScrollArea className={`h-[320px] rounded-md border border-white/10 bg-gray-900/40 ${className}`}>
      <div className="space-y-1.5 p-2">
        <AnimatePresence initial={false}>
          {recentEvents.map((ev, idx) => {
            const isLast = idx === 0 && highlightLast
            const possessionColor = ev.possession === 'HOME' ? 'text-emerald-300' : 'text-sky-300'
            const categoryColor =
              ev.action?.category ? CATEGORY_COLORS[ev.action.category] : 'border-white/10 bg-gray-900/40'
            const hasGoal = ev.isGoal
            const hasPenalty = ev.penaltyEvent
            const hasCrit = ev.roll?.critical === 'crit_hit' || ev.roll?.critical === 'crit_fail'

            return (
              <motion.div
                key={`${ev.turn}-${idx}`}
                initial={isLast ? { opacity: 0, x: -20, scale: 0.95 } : false}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                className={`rounded-md border p-2 ${categoryColor} ${
                  isLast ? 'ring-2 ring-emerald-500/40' : ''
                } ${hasGoal ? 'ring-2 ring-yellow-400/60' : ''}`}
              >
                <div className="flex items-start gap-2">
                  {/* Turn + possession indicator */}
                  <div className="flex flex-col items-center gap-0.5 pt-0.5">
                    <span className="text-[9px] font-mono text-muted-foreground">T{ev.turn}</span>
                    <div className={`h-1.5 w-1.5 rounded-full ${ev.possession === 'HOME' ? 'bg-emerald-400' : 'bg-sky-400'}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {ev.action?.emoji && <span className="text-sm">{ev.action.emoji}</span>}
                        <span className="truncate text-xs font-medium text-white">
                          {ev.action?.name ?? 'Jogada'}
                        </span>
                        {ev.playerName && (
                          <span className="truncate text-[10px] text-muted-foreground">
                            · {ev.playerName}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {hasGoal && (
                          <Badge variant="outline" className="border-yellow-400/50 bg-yellow-400/20 text-yellow-200 text-[9px] px-1">
                            ⚽ GOL
                          </Badge>
                        )}
                        {ev.roll?.critical === 'crit_hit' && (
                          <Badge variant="outline" className="border-emerald-400/50 bg-emerald-400/20 text-emerald-200 text-[9px] px-1">
                            <Zap className="h-2 w-2" /> Crit
                          </Badge>
                        )}
                        {ev.roll?.critical === 'crit_fail' && (
                          <Badge variant="outline" className="border-red-400/50 bg-red-400/20 text-red-200 text-[9px] px-1">
                            <AlertTriangle className="h-2 w-2" /> Fail
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Dice + result */}
                    {ev.roll && (
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono">
                          🎲 {ev.roll.dice}
                          {ev.roll.total !== undefined && ev.roll.dc !== undefined && (
                            <span className={ev.roll.success ? 'text-emerald-400' : 'text-red-400'}>
                              {' '}= {ev.roll.total} vs DC {ev.roll.dc}
                            </span>
                          )}
                        </span>
                        {ev.progressGained !== undefined && ev.progressGained > 0 && (
                          <span className="text-emerald-400">+{ev.progressGained}%</span>
                        )}
                      </div>
                    )}

                    {/* Penalty event */}
                    {hasPenalty && ev.penaltyEvent && (
                      <div className="flex items-center gap-1 rounded bg-black/30 px-1.5 py-0.5 text-[10px]">
                        <span>{PENALTY_ICONS[ev.penaltyEvent.type] ?? '⚠️'}</span>
                        <span className="text-amber-300">
                          {ev.penaltyEvent.description ?? ev.penaltyEvent.type}
                        </span>
                      </div>
                    )}

                    {/* Narrative (optional) */}
                    {ev.narrative && (
                      <p className="text-[10px] italic text-muted-foreground/80 line-clamp-2">
                        {ev.narrative}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ScrollArea>
  )
}
