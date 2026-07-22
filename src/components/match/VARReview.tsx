'use client'

// =====================================================================
// VARReview - Componente de revisão do VAR com dado
// --------------------------------------------------------------------
// Mostra animação de VAR, rola d20 para decidir, exibe resultado
// =====================================================================

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Tv, Loader2, CheckCircle2, XCircle, Dice5 } from 'lucide-react'

interface Props {
  open: boolean
  onClose: (decision: 'CONFIRMED' | 'OVERTURNED') => void
  originalEvent: string  // description of what's being reviewed
}

type VARPhase = 'ANNOUNCE' | 'REVIEWING' | 'ROLLING' | 'RESULT'

export function VARReview({ open, onClose, originalEvent }: Props) {
  const [phase, setPhase] = useState<VARPhase>('ANNOUNCE')
  const [diceResult, setDiceResult] = useState<number | null>(null)
  const [decision, setDecision] = useState<'CONFIRMED' | 'OVERTURNED' | null>(null)

  // Auto-advance phases
  useEffect(() => {
    if (!open) {
      setPhase('ANNOUNCE')
      setDiceResult(null)
      setDecision(null)
      return
    }
    if (phase === 'ANNOUNCE') {
      const t = setTimeout(() => setPhase('REVIEWING'), 1500)
      return () => clearTimeout(t)
    }
    if (phase === 'REVIEWING') {
      const t = setTimeout(() => {
        setPhase('ROLLING')
        // Roll the dice
        const d20 = Math.floor(Math.random() * 20) + 1
        setDiceResult(d20)
        setDecision(d20 >= 12 ? 'CONFIRMED' : 'OVERTURNED')
        setTimeout(() => setPhase('RESULT'), 1200)
      }, 2500)
      return () => clearTimeout(t)
    }
  }, [phase, open])

  const handleConfirm = () => {
    if (decision) onClose(decision)
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-blue-400">
            <Tv className="h-5 w-5" />
            VAR — Video Assistant Referee
          </DialogTitle>
          <DialogDescription>
            Revisão do lance em andamento...
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <AnimatePresence mode="wait">
            {/* Phase 1: Announcement */}
            {phase === 'ANNOUNCE' && (
              <motion.div
                key="announce"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex flex-col items-center gap-3 text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-blue-500 bg-blue-500/20"
                >
                  <Tv className="h-10 w-10 text-blue-400" />
                </motion.div>
                <p className="text-lg font-bold text-blue-300">📺 VAR ACIONADO!</p>
                <p className="text-sm text-gray-400">{originalEvent}</p>
              </motion.div>
            )}

            {/* Phase 2: Reviewing */}
            {phase === 'REVIEWING' && (
              <motion.div
                key="reviewing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 text-center"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-yellow-500 bg-yellow-500/20">
                  <Loader2 className="h-10 w-10 animate-spin text-yellow-400" />
                </div>
                <p className="text-sm text-yellow-300">Analisando o lance...</p>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
                      className="h-2 w-2 rounded-full bg-yellow-400"
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Phase 3: Rolling dice */}
            {phase === 'ROLLING' && (
              <motion.div
                key="rolling"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3 text-center"
              >
                <motion.div
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 0.5, repeat: 3, ease: 'linear' }}
                  className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-amber-500 bg-amber-500/20"
                >
                  <Dice5 className="h-10 w-10 text-amber-400" />
                </motion.div>
                <p className="text-sm text-amber-300">Decidindo com o dado...</p>
              </motion.div>
            )}

            {/* Phase 4: Result */}
            {phase === 'RESULT' && decision && diceResult !== null && (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="flex flex-col items-center gap-4 text-center"
              >
                <div className={`flex h-20 w-20 items-center justify-center rounded-full border-4 ${
                  decision === 'CONFIRMED'
                    ? 'border-emerald-500 bg-emerald-500/20'
                    : 'border-red-500 bg-red-500/20'
                }`}>
                  {decision === 'CONFIRMED' ? (
                    <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                  ) : (
                    <XCircle className="h-10 w-10 text-red-400" />
                  )}
                </div>
                <div>
                  <p className={`text-xl font-black ${
                    decision === 'CONFIRMED' ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {decision === 'CONFIRMED' ? '✅ DECISÃO MANTIDA!' : '❌ DECISÃO INVERTIDA!'}
                  </p>
                  <p className="mt-1 text-sm text-gray-400">
                    d20 = {diceResult} {decision === 'CONFIRMED' ? '≥ 12' : '< 12'}
                  </p>
                </div>
                <Badge className={decision === 'CONFIRMED' ? 'bg-emerald-600' : 'bg-red-600'}>
                  {decision === 'CONFIRMED' ? 'CONFIRMADO' : 'INVERTIDO'}
                </Badge>
                <Button
                  onClick={handleConfirm}
                  className={`gap-2 ${
                    decision === 'CONFIRMED'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  Continuar
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  )
}
