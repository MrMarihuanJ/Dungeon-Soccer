'use client'

// =====================================================================
// XpPanel - Painel de XP/Nível do usuário
// --------------------------------------------------------------------
// Mostra:
//   - Nível atual + XP total
//   - Barra de progresso para o próximo nível
//   - Recompensas já conquistadas (badges)
//   - Próximas recompensas (preview)
//   - Estatísticas W/L/D + winRate
//
// Busca dados de /api/user/profile. Pode ser embutido em qualquer página
// que precise mostrar o progresso do usuário.
// =====================================================================

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Trophy, Star, Zap, TrendingUp, Award } from 'lucide-react'
import { toast } from 'sonner'

interface EarnedReward {
  level: number
  kind: string
  label: string
  description: string
  emoji: string
}

interface UserProfile {
  userId: string
  username: string
  displayName: string | null
  xp: number
  level: number
  currentLevelXp: number
  nextLevelXp: number
  progressPct: number
  isMaxLevel: boolean
  levelMultiplier: number
  wins: number
  losses: number
  draws: number
  totalMatches: number
  winRate: number
  earnedRewards: EarnedReward[]
  upcomingRewards: EarnedReward[]
}

interface Props {
  /** Compact mode: mostra apenas nível + barra (para header) */
  compact?: boolean
  /** Classe adicional para o container */
  className?: string
}

export function XpPanel({ compact = false, className = '' }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    fetch('/api/user/profile', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (mounted && data.ok) {
          setProfile(data.profile)
        }
      })
      .catch((err) => {
        console.error('[XpPanel] fetch error:', err)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  if (loading) {
    return (
      <Card className={`border-white/10 bg-gray-900/60 ${className}`}>
        <CardContent className="p-4">
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!profile) {
    return null
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 ${className}`}>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
          <Trophy className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-bold text-emerald-300">Nível {profile.level}</span>
            <span className="text-[10px] text-muted-foreground">{profile.xp} XP</span>
          </div>
          <Progress value={profile.progressPct} className="h-1.5" />
        </div>
      </div>
    )
  }

  return (
    <Card className={`border-white/10 bg-gray-900/60 ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm text-emerald-300">
          <Trophy className="h-4 w-4" />
          Progressão de Nível
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ===== Nível + XP ===== */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-300">{profile.level}</span>
              <span className="text-xs text-muted-foreground">/ 50</span>
            </div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Nível atual</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white">{profile.xp.toLocaleString()}</div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">XP Total</p>
          </div>
        </div>

        {/* ===== Barra de progresso ===== */}
        {!profile.isMaxLevel ? (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{profile.currentLevelXp.toLocaleString()} XP</span>
              <span>{profile.nextLevelXp.toLocaleString()} XP</span>
            </div>
            <Progress value={profile.progressPct} className="h-2" />
            <p className="text-center text-[10px] text-emerald-400/80">
              {profile.progressPct.toFixed(1)}% para o nível {profile.level + 1}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-center">
            <span className="text-xs font-bold text-amber-300">🏆 Nível Máximo Atingido!</span>
          </div>
        )}

        {/* ===== Multiplicador ativo ===== */}
        {profile.levelMultiplier > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-1.5">
            <Zap className="h-3.5 w-3.5 text-purple-300" />
            <span className="text-[11px] font-medium text-purple-200">
              Bônus ativo: +{(profile.levelMultiplier * 100).toFixed(0)}% XP por vitória
            </span>
          </div>
        )}

        {/* ===== Estatísticas W/L/D ===== */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-md bg-emerald-500/10 p-2">
            <div className="text-base font-bold text-emerald-300">{profile.wins}</div>
            <div className="text-[9px] uppercase text-muted-foreground">Vitórias</div>
          </div>
          <div className="rounded-md bg-red-500/10 p-2">
            <div className="text-base font-bold text-red-300">{profile.losses}</div>
            <div className="text-[9px] uppercase text-muted-foreground">Derrotas</div>
          </div>
          <div className="rounded-md bg-amber-500/10 p-2">
            <div className="text-base font-bold text-amber-300">{profile.draws}</div>
            <div className="text-[9px] uppercase text-muted-foreground">Empates</div>
          </div>
          <div className="rounded-md bg-blue-500/10 p-2">
            <div className="text-base font-bold text-blue-300">{profile.winRate.toFixed(0)}%</div>
            <div className="text-[9px] uppercase text-muted-foreground">Win Rate</div>
          </div>
        </div>

        {/* ===== Recompensas conquistadas ===== */}
        {profile.earnedRewards.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Award className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-amber-300">
                Recompensas ({profile.earnedRewards.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {profile.earnedRewards.map((r) => (
                <motion.div
                  key={`${r.level}-${r.kind}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  title={`${r.label} (Nível ${r.level})\n${r.description}`}
                >
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 text-amber-200"
                  >
                    <span className="mr-1">{r.emoji}</span>
                    {r.label}
                  </Badge>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ===== Próximas recompensas ===== */}
        {profile.upcomingRewards.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-xs font-semibold text-blue-300">Próximas recompensas</span>
            </div>
            <div className="space-y-1">
              {profile.upcomingRewards.map((r) => {
                const xpNeeded = profile.xp >= 0
                  ? Math.max(0, (r.level * (r.level - 1) * 50) - profile.xp)
                  : 0
                return (
                  <div
                    key={`upcoming-${r.level}-${r.kind}`}
                    className="flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-2 py-1.5"
                  >
                    <span className="text-base">{r.emoji}</span>
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-medium text-blue-200">{r.label}</span>
                        <span className="text-[9px] text-muted-foreground">Nível {r.level}</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground">
                        {xpNeeded > 0 ? `${xpNeeded.toLocaleString()} XP restantes` : 'Disponível!'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ===== Footer ===== */}
        <div className="flex items-center gap-1.5 border-t border-white/5 pt-2 text-[10px] text-muted-foreground">
          <TrendingUp className="h-3 w-3" />
          <span>Ganhe XP vencendo partidas. Cap: 100 XP/jogo.</span>
        </div>
      </CardContent>
    </Card>
  )
}
