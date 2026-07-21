'use client'

// =====================================================================
// ActionCard - Card de ação animado (clicável)
// =====================================================================

import { motion } from 'framer-motion'
import { Shield, Target, Zap } from 'lucide-react'
import type { FootballAction } from '@/lib/dnd-actions'
import { CATEGORY_META } from '@/lib/dnd-actions'

interface Props {
  action: FootballAction
  index: number
  onSelect: (action: FootballAction) => void
  disabled?: boolean
}

export function ActionCard({ action, index, onSelect, disabled }: Props) {
  const meta = CATEGORY_META[action.category]

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(action)}
      initial={{ opacity: 0, y: 30, rotateX: -30 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ delay: index * 0.1, type: 'spring', stiffness: 200, damping: 15 }}
      whileHover={{ scale: disabled ? 1 : 1.04, y: disabled ? 0 : -4 }}
      whileTap={{ scale: disabled ? 1 : 0.96 }}
      className={`relative flex flex-col gap-2 rounded-2xl border border-white/10 bg-gradient-to-br ${meta.color} p-4 text-left shadow-lg ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:shadow-2xl'
      }`}
    >
      {/* Emoji gigante no topo */}
      <div className="flex items-center justify-between">
        <span className="text-3xl drop-shadow">{action.emoji}</span>
        <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90">
          {meta.label}
        </span>
      </div>

      {/* Nome da ação */}
      <h3 className="text-base font-bold leading-tight text-white drop-shadow">
        {action.name}
      </h3>

      {/* Descrição */}
      <p className="text-xs leading-tight text-white/80">{action.description}</p>

      {/* Stats: DC, Progresso */}
      <div className="mt-1 flex items-center gap-3 text-[10px] text-white/90">
        <span className="flex items-center gap-1 rounded bg-black/30 px-2 py-0.5">
          <Shield className="h-3 w-3" /> DC {action.dc}
        </span>
        <span className="flex items-center gap-1 rounded bg-black/30 px-2 py-0.5">
          <Zap className="h-3 w-3" /> +{action.progress}%
        </span>
        {action.goalChance > 0 && (
          <span className="flex items-center gap-1 rounded bg-black/40 px-2 py-0.5 font-bold text-yellow-200">
            <Target className="h-3 w-3" /> {Math.round(action.goalChance * 100)}%
          </span>
        )}
      </div>

      {/* Bônus de proficiência */}
      <div className="text-[10px] text-white/70">
        Bônus: <strong className="text-yellow-200">+{action.skillBonus}</strong>
      </div>
    </motion.button>
  )
}
