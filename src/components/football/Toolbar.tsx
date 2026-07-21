'use client'

// =====================================================================
// Toolbar - Barra de ferramentas (formação + stats + reservas) - com tema
// =====================================================================

import { FormationSelector } from './FormationSelector'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { UserPlus } from 'lucide-react'

interface Props {
  formationId: string
  onFormationChange: (id: string) => void
  onAddReserve: () => void
  startersCount: number
  reservesCount: number
}

export function Toolbar({
  formationId,
  onFormationChange,
  onAddReserve,
  startersCount,
  reservesCount,
}: Props) {
  return (
    <Card className="border-emerald-500/30 bg-card/95 backdrop-blur">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
        <FormationSelector value={formationId} onChange={onFormationChange} />

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center rounded-lg bg-emerald-500/10 px-3 py-1.5">
            <span className="text-lg font-bold leading-none text-emerald-700 dark:text-emerald-400">{startersCount}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Titulares</span>
          </div>
          <div className="flex flex-col items-center rounded-lg bg-amber-500/10 px-3 py-1.5">
            <span className="text-lg font-bold leading-none text-amber-700 dark:text-amber-400">{reservesCount}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Reservas</span>
          </div>
          <div className="flex flex-col items-center rounded-lg bg-sky-500/10 px-3 py-1.5">
            <span className="text-lg font-bold leading-none text-sky-700 dark:text-sky-400">{startersCount + reservesCount}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</span>
          </div>
        </div>

        <Button
          onClick={onAddReserve}
          className="bg-amber-500 hover:bg-amber-600"
        >
          <UserPlus className="h-4 w-4" />
          Convocar Reserva
        </Button>
      </CardContent>
    </Card>
  )
}
