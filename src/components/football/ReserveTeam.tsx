'use client'

// =====================================================================
// ReserveTeam - Painel do time reserva (modo técnico) - com tema
// =====================================================================

import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowLeftRight, Trash2, UserCircle2, Shirt } from 'lucide-react'
import type { SelectedPlayer } from '@/lib/football/store'

interface Props {
  reserves: SelectedPlayer[]
  startersCount: number
  onSubstitute: (reserve: SelectedPlayer) => void
  onRemove: (id: string) => void
}

const POS_LABEL: Record<string, string> = {
  GK: 'Goleiro',
  DF: 'Zagueiro',
  MF: 'Meia',
  FW: 'Atacante',
}

const POS_COLOR: Record<string, string> = {
  GK: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  DF: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  MF: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  FW: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
}

export function ReserveTeam({ reserves, startersCount, onSubstitute, onRemove }: Props) {
  return (
    <Card className="border-emerald-500/30 bg-card/95 backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
          <span className="flex items-center gap-2">
            <Shirt className="h-5 w-5" />
            Banco de Reservas
          </span>
          <Badge className="bg-emerald-600 text-white">{reserves.length} no banco</Badge>
        </CardTitle>
        <CardDescription>
          Atue como técnico: convoque reservas e faça substituições no time titular.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {reserves.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <UserCircle2 className="h-10 w-10" />
            <p className="text-sm">Nenhum reserva convocado ainda.</p>
            <p className="text-xs text-muted-foreground/70">
              Use o botão <strong>+ Reserva</strong> para convocar jogadores para o banco.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[380px] pr-2">
            <ul className="space-y-2">
              <AnimatePresence>
                {reserves.map((r) => (
                  <motion.li
                    key={r.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20, height: 0 }}
                    layout
                  >
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 transition-shadow hover:shadow-md">
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-emerald-500/50 bg-muted">
                        <Image
                          src={r.photoUrl}
                          alt={r.name}
                          fill
                          sizes="48px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {r.name}
                          </span>
                          {r.shirtNumber && (
                            <span className="rounded bg-muted px-1 text-[10px] font-bold text-muted-foreground">
                              #{r.shirtNumber}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="truncate">{r.team}</span>
                          <span>·</span>
                          <Badge
                            variant="secondary"
                            className={`px-1.5 py-0 text-[10px] ${POS_COLOR[r.position] ?? ''}`}
                          >
                            {POS_LABEL[r.position] ?? r.position}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 gap-1 bg-emerald-600 px-2 text-[11px] hover:bg-emerald-700"
                          onClick={() => onSubstitute(r)}
                          disabled={startersCount === 0}
                        >
                          <ArrowLeftRight className="h-3 w-3" />
                          Entrar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-[11px] text-red-500 hover:bg-red-500/10 hover:text-red-600"
                          onClick={() => onRemove(r.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                          Remover
                        </Button>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
