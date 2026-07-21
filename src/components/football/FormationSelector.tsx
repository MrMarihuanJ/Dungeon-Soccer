'use client'

// =====================================================================
// FormationSelector - Seletor de formação tática
// =====================================================================

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { FORMATIONS } from '@/lib/football/formations'
import { Users } from 'lucide-react'

interface Props {
  value: string
  onChange: (id: string) => void
}

export function FormationSelector({ value, onChange }: Props) {
  const current = FORMATIONS.find((f) => f.id === value)
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="formation-select" className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
        <Users className="h-3.5 w-3.5" /> Formação
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="formation-select" className="w-full sm:w-[180px]">
          <SelectValue placeholder="Escolha..." />
        </SelectTrigger>
        <SelectContent>
          {FORMATIONS.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              <div className="flex flex-col">
                <span className="font-semibold">{f.name}</span>
                <span className="text-[10px] text-gray-500">{f.positions.length} jogadores</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current && (
        <p className="text-[11px] leading-tight text-gray-500">{current.description}</p>
      )}
    </div>
  )
}
