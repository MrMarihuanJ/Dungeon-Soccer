'use client'

// =====================================================================
// DiceRoll - Animação 3D do d20 girando + resultado
// =====================================================================

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { DiceRollResult } from '@/lib/match-engine'
import { getRollLabel, getRollColor } from '@/lib/match-engine'

interface Props {
  roll: DiceRollResult | null
  rolling: boolean
}

// Faces do d20 mostradas durante a animação (sequência aleatória)
const RANDOM_FACES = [3, 17, 8, 14, 5, 19, 11, 2, 16, 7, 12, 18, 4, 9, 13, 6, 20, 1, 15, 10]

export function DiceRoll({ roll, rolling }: Props) {
  const [displayFace, setDisplayFace] = useState(1)

  useEffect(() => {
    if (rolling) {
      let i = 0
      const interval = setInterval(() => {
        setDisplayFace(RANDOM_FACES[i % RANDOM_FACES.length])
        i++
      }, 80)
      return () => clearInterval(interval)
    } else if (roll) {
      setDisplayFace(roll.dice)
    }
  }, [rolling, roll])

  const isCritHit = !rolling && roll?.critical === 'crit_hit'
  const isCritFail = !rolling && roll?.critical === 'crit_fail'

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.div
        animate={
          rolling
            ? {
                rotateX: [0, 360, 720, 1080, 1440],
                rotateY: [0, 360, 720, 360, 0],
                scale: [1, 1.2, 1.1, 1.15, 1],
              }
            : isCritHit
              ? { scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }
              : isCritFail
                ? { x: [0, -10, 10, -10, 0], rotate: [0, -5, 5, 0] }
                : { scale: 1, rotate: 0 }
        }
        transition={
          rolling
            ? { duration: 1.8, ease: 'easeOut' }
            : { duration: 0.5 }
        }
        className={`relative flex h-28 w-28 items-center justify-center rounded-2xl bg-gradient-to-br shadow-2xl ${
          isCritHit
            ? 'from-yellow-300 via-amber-400 to-orange-500'
            : isCritFail
              ? 'from-red-400 via-rose-500 to-red-700'
              : 'from-emerald-400 via-emerald-500 to-emerald-700'
        }`}
      >
        {/* Brilho no crit */}
        {(isCritHit || isCritFail) && (
          <motion.div
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1, repeat: Infinity }}
            className={`absolute -inset-2 rounded-2xl blur-xl ${
              isCritHit ? 'bg-yellow-400/40' : 'bg-red-500/40'
            }`}
          />
        )}

        <span className="relative text-5xl font-black text-white drop-shadow-lg">
          {displayFace}
        </span>

        {/* Sombra 3D no canto */}
        <div className="absolute bottom-0 right-0 h-8 w-8 rounded-bl-2xl rounded-tr-2xl bg-black/20" />
      </motion.div>

      {/* Resultado textual */}
      <AnimatePresence>
        {!rolling && roll && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center gap-1"
          >
            <div className={`text-lg font-bold ${getRollColor(roll)}`}>
              {getRollLabel(roll)}
            </div>
            <div className="text-sm text-gray-400">
              🎲 d20: <strong className="text-white">{roll.dice}</strong> + bonus{' '}
              <strong className="text-emerald-400">{roll.bonus}</strong> ={' '}
              <strong className="text-white">{roll.total}</strong> vs DC{' '}
              <strong className="text-amber-400">{roll.dc}</strong>{' '}
              <span className="text-gray-500">(margem {roll.margin >= 0 ? '+' : ''}{roll.margin})</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
