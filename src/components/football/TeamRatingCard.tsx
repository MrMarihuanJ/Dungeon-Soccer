'use client'

// =====================================================================
// TeamRatingCard - Mostra o rating do time estilo FIFA Ultimate Team v2
// --------------------------------------------------------------------
// NOVO: agora exibe química, equilíbrio positional e bônus de formação
// como componentes visuais separados, dando ao usuário uma visão
// completa de como o rating é calculado.
// =====================================================================

import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Star, Shield, Sword, Target, Users, Heart, Scale, LayoutGrid } from 'lucide-react'
import type { SelectedPlayer } from '@/lib/football/store'
import { calculateTeamRating, type LeagueTier } from '@/lib/player-rating'
import { getFormation, ROLE_TO_POSITION } from '@/lib/football/formations'

interface Props {
  starters: Record<string, SelectedPlayer | null>
  reserves: SelectedPlayer[]
  formationId?: string
}

export function TeamRatingCard({ starters, reserves, formationId }: Props) {
  // Filtra titulares preenchidos
  const startersList = Object.values(starters).filter((p): p is SelectedPlayer => !!p)
  const startersData = startersList.map((p) => ({
    overall: p.overall ?? 70,
    age: p.age ?? 25,
    leagueTier: (p.leagueTier as LeagueTier) ?? 'OTHER',
    position: p.benchPosition || p.position,  // Usa benchPosition se definida
    nationality: p.nationality,
    team: p.team ?? '',
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

  // Obtém posições da formação para bônus de formação
  const formation = formationId ? getFormation(formationId) : null
  const formationPositions = formation ? formation.positions.map(p => ({
    role: p.role,
  })) : []

  const rating = calculateTeamRating(startersData, reservesData, formationPositions)

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

            {/* Bônus breakdown */}
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              {/* Chemistry bonus */}
              <div className="flex items-center gap-1 rounded bg-pink-500/10 px-1.5 py-0.5">
                <Heart className="h-3 w-3 text-pink-500" />
                <span className="font-bold text-pink-700 dark:text-pink-400">
                  Química +{rating.chemistryBonus}
                </span>
                {rating.chemistryDetails.chemistryScore > 0 && (
                  <span className="text-[8px] text-pink-400">
                    ({rating.chemistryDetails.chemistryScore}%)
                  </span>
                )}
              </div>
              {/* Balance bonus */}
              <div className="flex items-center gap-1 rounded bg-teal-500/10 px-1.5 py-0.5">
                <Scale className="h-3 w-3 text-teal-500" />
                <span className="font-bold text-teal-700 dark:text-teal-400">
                  Equilíbrio +{rating.positionalBalanceBonus}
                </span>
                {!rating.balanceDetails.isBalanced && (
                  <span className="text-[8px] text-amber-500">desbalanceado</span>
                )}
              </div>
              {/* Formation bonus */}
              {rating.formationBonus !== 0 && (
                <div className="flex items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.5">
                  <LayoutGrid className="h-3 w-3 text-indigo-500" />
                  <span className={`font-bold ${rating.formationBonus > 0 ? 'text-indigo-700 dark:text-indigo-400' : 'text-red-700 dark:text-red-400'}`}>
                    Formação {rating.formationBonus > 0 ? '+' : ''}{rating.formationBonus}
                  </span>
                </div>
              )}
              {/* Reserves bonus */}
              <div className="flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5">
                <Users className="h-3 w-3 text-amber-500" />
                <span className="font-bold text-amber-700 dark:text-amber-400">
                  Banco +{rating.reservesBonus}
                </span>
              </div>
            </div>

            {/* Titulares count */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {startersList.length}/11 titulares
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
