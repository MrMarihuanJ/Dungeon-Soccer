'use client'

// =====================================================================
// GameModeSelector - Alterna entre Dream Team e World Cup
// =====================================================================

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { GAME_MODES, type GameMode } from '@/lib/player-rating'

interface Props {
  value: GameMode
  onChange: (mode: GameMode) => void
}

export function GameModeSelector({ value, onChange }: Props) {
  return (
    <Card className="border-amber-500/30 bg-card/95 backdrop-blur">
      <CardContent className="p-3">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(GAME_MODES) as GameMode[]).map((mode) => {
            const meta = GAME_MODES[mode]
            const isActive = value === mode
            return (
              <motion.button
                key={mode}
                type="button"
                onClick={() => onChange(mode)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`relative overflow-hidden rounded-xl p-3 text-left transition-all ${
                  isActive
                    ? `bg-gradient-to-br ${meta.color} text-white shadow-lg`
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{meta.emoji}</span>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold">{meta.label}</span>
                  </div>
                </div>
                <p className={`mt-1 text-[10px] leading-tight ${
                  isActive ? 'text-white/90' : 'text-muted-foreground/70'
                }`}>
                  {mode === 'DREAM_TEAM'
                    ? 'Lendas + ativos. Sem limites.'
                    : 'Só jogadores na ativa.'}
                </p>
                {isActive && (
                  <motion.div
                    layoutId="mode-active"
                    className="absolute bottom-0 left-0 h-1 w-full bg-white/40"
                  />
                )}
              </motion.button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
