'use client'

// =====================================================================
// CoinFlip - Animação 3D de moeda girando para decidir quem começa
// =====================================================================

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'

interface Props {
  result: 'heads' | 'tails' | null
  flipping: boolean
  homeUser: { username: string }
  awayUser: { username: string }
}

export function CoinFlip({ result, flipping, homeUser, awayUser }: Props) {
  const [displayResult, setDisplayResult] = useState<'heads' | 'tails' | null>(null)

  useEffect(() => {
    if (!flipping && result) {
      const t = setTimeout(() => setDisplayResult(result), 100)
      return () => clearTimeout(t)
    }
    if (flipping) {
      // Pequeno delay para não conflitar com render
      const t = setTimeout(() => setDisplayResult(null), 0)
      return () => clearTimeout(t)
    }
  }, [result, flipping])

  const winner = displayResult === 'heads' ? homeUser : displayResult === 'tails' ? awayUser : null

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-bold text-amber-400 sm:text-3xl"
      >
        ⚖️ Lançamento da Moeda
      </motion.h2>

      <p className="max-w-md text-center text-sm text-gray-400">
        O juiz vai lançar a moeda. <strong className="text-emerald-400">{homeUser.username}</strong> escolheu{' '}
        <span className="font-bold text-amber-400">CARA</span> ·{' '}
        <strong className="text-sky-400">{awayUser.username}</strong> escolheu{' '}
        <span className="font-bold text-amber-400">COROA</span>.
      </p>

      <div className="relative flex h-48 w-48 items-center justify-center [perspective:1000px]">
        <motion.div
          animate={
            flipping
              ? { rotateY: [0, 720, 1440, 2160, 2880], y: [0, -40, -60, -40, 0] }
              : { rotateY: displayResult === 'tails' ? 180 : 0, y: 0 }
          }
          transition={
            flipping
              ? { duration: 2.5, ease: 'easeInOut' }
              : { duration: 0.3 }
          }
          className="relative h-40 w-40 [transform-style:preserve-3d]"
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 shadow-2xl [backface-visibility:hidden]">
            <Trophy className="h-12 w-12 text-amber-900" />
            <span className="mt-1 text-xs font-bold text-amber-900">CARA</span>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-gradient-to-br from-gray-300 via-gray-400 to-gray-600 shadow-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <span className="text-5xl font-bold text-gray-800">⚽</span>
            <span className="mt-1 text-xs font-bold text-gray-800">COROA</span>
          </div>
        </motion.div>

        <motion.div
          animate={{ opacity: flipping ? [0.3, 0.8, 0.3] : 0.5, scale: flipping ? [1, 1.1, 1] : 1 }}
          transition={{ duration: 1, repeat: flipping ? Infinity : 0 }}
          className="absolute -inset-4 rounded-full bg-amber-400/20 blur-2xl"
        />
      </div>

      <AnimatePresence>
        {!flipping && displayResult && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="flex flex-col items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-8 py-4 text-center"
          >
            <span className="text-3xl font-bold text-amber-400">
              {displayResult === 'heads' ? '🪙 CARA!' : '⚽ COROA!'}
            </span>
            <p className="text-sm text-gray-300">
              <strong className={winner === homeUser ? 'text-emerald-400' : 'text-sky-400'}>
                {winner?.username}
              </strong>{' '}
              começa com a bola! 🎯
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
