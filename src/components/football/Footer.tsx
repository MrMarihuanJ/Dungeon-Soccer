'use client'

// =====================================================================
// Footer - Rodapé Dungeon and Soccer (com easter egg hint)
// =====================================================================

import { Heart, Github, Trophy, Globe } from 'lucide-react'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/40 bg-background/60 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5 text-emerald-500" />
            <span>
              <strong className="font-semibold text-foreground">Dungeon and Soccer</strong> · Feito
              com <Heart className="inline h-3 w-3 fill-red-500 text-red-500" /> · Next.js + Prisma +
              Neon
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Globe className="h-3.5 w-3.5 text-sky-500" />
              Busca mundial em tempo real
            </span>
            <Github className="h-3.5 w-3.5" />
          </div>
        </div>
        {/* Hint sutil de easter egg */}
        <p className="mt-2 text-center text-[10px] text-muted-foreground/60">
          🔍 Existem segredos escondidos neste site. Tente o Konami Code...
        </p>
      </div>
    </footer>
  )
}
