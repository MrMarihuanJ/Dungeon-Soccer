'use client'

// =====================================================================
// SubstitutionModal - Modal de substituição (lesão ou voluntária)
// --------------------------------------------------------------------
// Permite escolher um jogador do banco para entrar no lugar de outro.
// Máximo de 5 substituições por partida. Se excedido e houver lesão,
// o time joga com um a menos.
// =====================================================================

import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { ArrowRight, Heart, AlertTriangle, UserMinus, Users } from 'lucide-react'
import type { SelectedPlayer } from '@/lib/football/store'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (outPlayerId: string, inPlayerId: string) => void
  injuredPlayer: SelectedPlayer | null
  reserves: SelectedPlayer[]
  starters: SelectedPlayer[]
  substitutionsUsed: number
  maxSubstitutions: number
  isForced: boolean  // true = injury, false = voluntary
}

export function SubstitutionModal({
  open,
  onClose,
  onConfirm,
  injuredPlayer,
  reserves,
  starters,
  substitutionsUsed,
  maxSubstitutions,
  isForced,
}: Props) {
  const remaining = maxSubstitutions - substitutionsUsed
  const canSubstitute = remaining > 0
  const outPlayer = injuredPlayer
  const availableReserves = reserves.filter(
    (r) => !r.isInactive && !r.isRetired // basic filter
  )

  const handleSelectReserve = (reserve: SelectedPlayer) => {
    if (!outPlayer) {
      // Voluntary sub: need to pick who goes out
      // For simplicity, we'll pass the reserve and let parent handle it
      onConfirm('', reserve.id)
      return
    }
    onConfirm(outPlayer.id, reserve.id)
  }

  const handlePlayWithout = () => {
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isForced ? (
              <>
                <Heart className="h-5 w-5 text-red-500" />
                <span className="text-red-400">Lesão! Substituição Necessária</span>
              </>
            ) : (
              <>
                <Users className="h-5 w-5 text-emerald-400" />
                <span className="text-emerald-400">Substituição Voluntária</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isForced
              ? `${outPlayer?.name ?? 'Jogador'} se lesionou e não pode continuar!`
              : 'Escolha um titular para sair e um reserva para entrar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stats */}
          <div className="flex items-center justify-between rounded-lg bg-gray-800/50 p-3">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-gray-300">Substituições:</span>
            </div>
            <Badge className={remaining > 0 ? 'bg-emerald-600' : 'bg-red-600'}>
              {substitutionsUsed} / {maxSubstitutions}
            </Badge>
          </div>

          {/* Injured player info */}
          {isForced && outPlayer && (
            <Card className="border-red-800/50 bg-red-950/30">
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
                  <Heart className="h-5 w-5 text-red-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-300">{outPlayer.name}</p>
                  <p className="text-xs text-red-400/70">
                    {outPlayer.position} · {outPlayer.team}
                    {outPlayer.overall ? ` · OVR ${outPlayer.overall}` : ''}
                  </p>
                </div>
                <Badge variant="outline" className="border-red-700 text-red-400">
                  SAI
                </Badge>
              </CardContent>
            </Card>
          )}

          {/* Can't substitute */}
          {!canSubstitute && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-red-800/50 bg-red-950/20 p-4 text-center">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="text-sm text-red-300">
                {isForced
                  ? 'Todas as 5 substituições já foram usadas! O time continuará com um jogador a menos.'
                  : 'Limite de 5 substituições atingido!'}
              </p>
              <Button onClick={handlePlayWithout} variant="outline" className="border-red-700 text-red-400 hover:bg-red-950">
                Continuar sem substituição
              </Button>
            </div>
          )}

          {/* Available reserves */}
          {canSubstitute && availableReserves.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                Escolha o reserva que entra:
              </p>
              <div className="max-h-[280px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 transparent' }}>
                <ul className="space-y-2">
                  {availableReserves.map((reserve) => (
                    <motion.li
                      key={reserve.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectReserve(reserve)}
                        className="flex w-full items-center gap-3 rounded-lg border border-emerald-800/30 bg-gray-800/50 p-3 text-left transition-colors hover:border-emerald-600 hover:bg-emerald-900/20"
                      >
                        <Avatar className="h-10 w-10 border border-emerald-600">
                          <AvatarFallback className="bg-emerald-700 text-xs font-bold text-white">
                            {reserve.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-white">{reserve.name}</p>
                          <p className="text-xs text-gray-400">
                            {reserve.position} · {reserve.team}
                            {reserve.overall ? ` · OVR ${reserve.overall}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge className="bg-emerald-600">ENTRA</Badge>
                          <ArrowRight className="h-4 w-4 text-emerald-400" />
                        </div>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {canSubstitute && availableReserves.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-amber-800/50 bg-amber-950/20 p-4 text-center">
              <UserMinus className="h-8 w-8 text-amber-400" />
              <p className="text-sm text-amber-300">
                Não há reservas disponíveis! O time jogará com um a menos.
              </p>
              <Button onClick={handlePlayWithout} variant="outline" className="border-amber-700 text-amber-400 hover:bg-amber-950">
                Continuar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
