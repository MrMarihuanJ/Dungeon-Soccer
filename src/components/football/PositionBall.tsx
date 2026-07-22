'use client'

// =====================================================================
// PositionBall - Bola flutuante com foto do jogador (com tema + animação)
// Agora inclui botão de ver estatísticas no ogol.com.br
// =====================================================================

import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Shirt, BarChart3 } from 'lucide-react'
import Image from 'next/image'
import type { SelectedPlayer } from '@/lib/football/store'
import type { FieldPosition } from '@/lib/football/formations'

interface Props {
  position: FieldPosition
  player: SelectedPlayer | null
  onClick: () => void
  onRemove: () => void
  onViewStats?: (player: SelectedPlayer) => void
}

export function PositionBall({ position, player, onClick, onRemove, onViewStats }: Props) {
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Label da posição */}
      <span className="mb-1 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
        {position.label}
      </span>

      {/* Bola / Foto */}
      <motion.button
        type="button"
        onClick={onClick}
        whileHover={{ scale: 1.15, y: -3 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 400, damping: 12 }}
        className={`relative h-12 w-12 overflow-hidden rounded-full border-2 shadow-lg transition-all sm:h-14 sm:w-14 md:h-16 md:w-16 ${
          player
            ? 'border-white ring-2 ring-emerald-400/60 dark:ring-emerald-400/40'
            : 'border-dashed border-white/70 bg-emerald-600/80 hover:bg-emerald-500 dark:bg-emerald-700/80 dark:hover:bg-emerald-600'
        }`}
        aria-label={player ? `Jogador: ${player.name}` : `Adicionar jogador em ${position.label}`}
      >
        {player ? (
          <>
            <Image
              src={player.photoUrl}
              alt={player.name}
              fill
              sizes="64px"
              className="object-cover"
              unoptimized
            />
            {/* Overall badge estilo FIFA (canto superior esquerdo) */}
            {player.overall && (
              <span className={`absolute left-0 top-0 rounded-br-md px-1 text-[10px] font-black leading-tight text-white ${
                player.overall >= 90 ? 'bg-gradient-to-br from-yellow-400 to-amber-600'
                  : player.overall >= 84 ? 'bg-gradient-to-br from-purple-500 to-purple-700'
                    : player.overall >= 75 ? 'bg-gradient-to-br from-yellow-500 to-yellow-700'
                      : 'bg-gradient-to-br from-gray-500 to-gray-700'
              }`}>
                {player.overall}
              </span>
            )}
            {player.shirtNumber && (
              <span className="absolute bottom-0 right-0 rounded-tl-md bg-emerald-500 px-1.5 text-[10px] font-bold text-white">
                {player.shirtNumber}
              </span>
            )}
          </>
        ) : (
          <motion.div
            animate={{ rotate: [0, 90, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="flex h-full w-full items-center justify-center"
          >
            <Plus className="h-5 w-5 text-white sm:h-6 sm:w-6" strokeWidth={2.5} />
          </motion.div>
        )}
      </motion.button>

      {/* Card de info do jogador */}
      <AnimatePresence>
        {player && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.9 }}
            className="absolute top-full mt-2 flex flex-col items-center"
          >
            <div className="flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 shadow-lg backdrop-blur dark:bg-gray-900/95">
              <Shirt className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span className="max-w-[100px] truncate text-[11px] font-semibold text-gray-900 dark:text-gray-100">
                {player.name}
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">·</span>
              <span className="max-w-[80px] truncate text-[10px] text-gray-600 dark:text-gray-400">
                {player.team}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1">
              {/* Stats button */}
              {onViewStats && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onViewStats(player)
                  }}
                  className="flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm transition-colors hover:bg-emerald-600"
                  aria-label={`Ver estatísticas de ${player.name}`}
                >
                  <BarChart3 className="h-2.5 w-2.5" /> Stats
                </button>
              )}
              {/* Remove button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove()
                }}
                className="flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm transition-colors hover:bg-red-600"
                aria-label={`Remover ${player.name}`}
              >
                <X className="h-2.5 w-2.5" /> Remover
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
