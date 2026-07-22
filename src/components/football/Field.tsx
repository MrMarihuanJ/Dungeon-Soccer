'use client'

// =====================================================================
// Field - Campo de futebol responsivo com tema dark/light
// =====================================================================

import { PositionBall } from './PositionBall'
import type { Formation, FieldPosition } from '@/lib/football/formations'
import type { SelectedPlayer, StartersMap } from '@/lib/football/store'

interface Props {
  formation: Formation
  starters: StartersMap
  onSelectPosition: (pos: FieldPosition) => void
  onRemovePosition: (pos: FieldPosition) => void
  onViewStats?: (player: SelectedPlayer) => void
}

export function Field({ formation, starters, onSelectPosition, onRemovePosition, onViewStats }: Props) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl shadow-2xl ring-1 ring-emerald-900/40 dark:ring-emerald-500/20">
      {/* Gramado - tema claro: emerald vibrante / tema escuro: emerald profundo */}
      <div
        className="relative aspect-[3/4] w-full bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-700 dark:from-emerald-900 dark:via-emerald-950 dark:to-black sm:aspect-[4/5]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 40px, transparent 40px, transparent 80px)',
        }}
      >
        {/* Linhas do campo (SVG) */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 130"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect x="2" y="2" width="96" height="126" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.4" />
          <line x1="2" y1="65" x2="98" y2="65" stroke="rgba(255,255,255,0.85)" strokeWidth="0.4" />
          <circle cx="50" cy="65" r="10" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.4" />
          <circle cx="50" cy="65" r="0.7" fill="rgba(255,255,255,0.85)" />
          <rect x="20" y="2" width="60" height="16" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.4" />
          <rect x="35" y="2" width="30" height="7" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.4" />
          <path d="M 40 18 A 12 12 0 0 0 60 18" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.4" />
          <rect x="20" y="112" width="60" height="16" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.4" />
          <rect x="35" y="121" width="30" height="7" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.4" />
          <path d="M 40 112 A 12 12 0 0 1 60 112" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.4" />
          <path d="M 2 6 A 4 4 0 0 1 6 2" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.4" />
          <path d="M 94 2 A 4 4 0 0 1 98 6" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.4" />
          <path d="M 2 124 A 4 4 0 0 0 6 128" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.4" />
          <path d="M 94 128 A 4 4 0 0 0 98 124" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="0.4" />
        </svg>

        {/* Bolas de jogadores */}
        {formation.positions.map((p) => (
          <PositionBall
            key={p.id}
            position={p}
            player={starters[p.id] ?? null}
            onClick={() => onSelectPosition(p)}
            onRemove={() => onRemovePosition(p)}
            onViewStats={onViewStats}
          />
        ))}

        {/* Indicadores de ataque/defesa */}
        <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
          ▲ Ataque
        </div>
        <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
          ▼ Defesa
        </div>
      </div>
    </div>
  )
}
