'use client'

// =====================================================================
// TeamRatingCard - Mostra o rating do time estilo FIFA Ultimate Team
// =====================================================================

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Star, Shield, Sword, Target, Users } from 'lucide-react'
import type { SelectedPlayer } from '@/lib/football/store'
import { calculateTeamRating, type LeagueTier } from '@/lib/player-rating'

interface Props {
  starters: Record<string, SelectedPlayer | null>
  reserves: SelectedPlayer[]
}

export function TeamRatingCard({ starters, reserves }: Props) {
  // Filtra titulares preenchidos
  const startersList = Object.values(starters).filter((p): p is SelectedPlayer => !!p)
  const startersData = startersList.map((p) => ({
    overall: p.overall ?? 70,
    age: p.age ?? 25,
    leagueTier: (p.leagueTier as LeagueTier) ?? 'OTHER',
    position: p.position,
    isRetired: p.isRetired,
    isInactive: p.isInactive,
  }))
  const reservesData = reserves.map((p) => ({
    overall: p.overall ?? 70,
    age: p.age ?? 25,
    leagueTier: (p.leagueTier as LeagueTier) ?? 'OTHER',
    position: p.position,
    isRetired: p.isRetired,
    isInactive: p.isInactive,
  }))

  const rating = calculateTeamRating(startersData, reservesData)

  // Cor do rating baseado no valor
  const ratingColor = rating.finalRating >= 90
    ? 'from-yellow-400 to-amber-600'
    : rating.finalRating >= 84
      ? 'from-purple-500 to-purple-700'
      : rating.finalRating >= 75
        ? 'from-yellow-500 to-yellow-700'
        : rating.finalRating >= 68
          ? 'from-gray-300 to-gray-500'
          : 'from-orange-400 to-orange-700'

  if (startersList.length === 0) {
    return null
  }

  return (
    <Card className="border-emerald-500/30 bg-card/95 backdrop-blur">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Rating principal */}
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br ${ratingColor} shadow-lg`}
          >
            <span className="text-3xl font-black leading-none text-white">{rating.finalRating}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/80">OVR</span>
          </motion.div>

          {/* Estrelas */}
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => {
                const filled = i <= Math.floor(rating.stars)
                const half = !filled && i - 0.5 === rating.stars
                return (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${
                      filled
                        ? 'fill-amber-400 text-amber-400'
                        : half
                          ? 'fill-amber-200 text-amber-300'
                          : 'text-gray-300 dark:text-gray-700'
                    }`}
                  />
                )
              })}
              <span className="ml-1 text-xs font-bold text-muted-foreground">
                {rating.stars.toFixed(1)}
              </span>
            </div>

            {/* Stats por área */}
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="flex items-center gap-1 rounded bg-rose-500/10 px-1.5 py-0.5">
                <Sword className="h-3 w-3 text-rose-500" />
                <span className="font-bold text-rose-700 dark:text-rose-400">ATA {rating.attackRating}</span>
              </div>
              <div className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5">
                <Target className="h-3 w-3 text-emerald-500" />
                <span className="font-bold text-emerald-700 dark:text-emerald-400">MEI {rating.midfieldRating}</span>
              </div>
              <div className="flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5">
                <Shield className="h-3 w-3 text-sky-500" />
                <span className="font-bold text-sky-700 dark:text-sky-400">DEF {rating.defenseRating}</span>
              </div>
            </div>

            {/* Detalhes */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {startersList.length}/11 titulares
              </span>
              <span>
                Bônus banco: +{rating.reservesBonus}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
