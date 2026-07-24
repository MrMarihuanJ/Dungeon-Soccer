'use client'

// =====================================================================
// Header - Cabeçalho do Dungeon and Soccer
// --------------------------------------------------------------------
// Inclui: logo animado (com cliques secretos), título, ações
// (Como usar, Theme toggle, User menu, Admin, Limpar)
// =====================================================================

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, RotateCcw, BookOpen, ShieldCheck, Swords } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { UserMenu } from '@/components/user/UserMenu'
import { toast } from 'sonner'
import { useRef } from 'react'

interface Props {
  onClear: () => void
  onOpenInstructions: () => void
  totalPlayers: number
  onTeamSave?: () => Promise<boolean>
  onTeamLoad?: (team: { formation: string; starters: any; reserves: any }) => void
  onOpenMatch?: () => void
}

export function Header({ onClear, onOpenInstructions, totalPlayers, onTeamSave, onTeamLoad, onOpenMatch }: Props) {
  const logoClickCount = useRef(0)
  const lastLogoClick = useRef(0)

  // Atalho para o painel admin: adiciona ?admin na URL
  const goToAdmin = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('admin', '1')
    window.history.pushState({}, '', url.toString())
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  // Logo com easter egg: 7 cliques rápidos revelam Pelé
  const handleLogoClick = () => {
    const now = Date.now()
    if (now - lastLogoClick.current > 1500) {
      logoClickCount.current = 1
    } else {
      logoClickCount.current += 1
    }
    lastLogoClick.current = now

    if (logoClickCount.current >= 7) {
      toast.success('🏆 Easter Egg desbloqueado!', {
        description: 'Digite "brasil70" para montar o time de 1970 automaticamente!',
        duration: 8000,
      })
      logoClickCount.current = 0
    } else if (logoClickCount.current >= 4) {
      toast.info(`Mais ${7 - logoClickCount.current} cliques...`, {
        duration: 1500,
      })
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Logo + título */}
        <div className="flex items-center gap-3">
          <motion.button
            type="button"
            onClick={handleLogoClick}
            whileHover={{ scale: 1.08, rotate: 5 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-md"
            aria-label="Dungeon and Soccer"
          >
            <motion.div
              animate={{ y: [0, -2, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Trophy className="h-6 w-6 text-white" />
            </motion.div>
            {/* Brilho sutil */}
            <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-tr from-white/20 to-transparent" />
          </motion.button>
          <div className="flex flex-col">
            <h1 className="text-base font-bold leading-tight text-foreground sm:text-lg">
              Dungeon <span className="text-emerald-500">and</span> Soccer
            </h1>
            <p className="text-[11px] leading-tight text-muted-foreground sm:text-xs">
              Monte seu time com jogadores do mundo inteiro
            </p>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Badge
            variant="outline"
            className="hidden border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 sm:flex"
          >
            {totalPlayers} no time
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenInstructions}
            className="text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden md:inline">Como usar</span>
          </Button>
          {onOpenMatch && (
            <Button
              size="sm"
              onClick={onOpenMatch}
              className="gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md hover:from-amber-600 hover:to-orange-700"
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 2 }}
              >
                <Swords className="h-4 w-4" />
              </motion.div>
              <span className="hidden sm:inline">Jogar</span>
            </Button>
          )}
          <ThemeToggle />
          <UserMenu onTeamSave={onTeamSave} onTeamLoad={onTeamLoad} />
          <Button
            variant="ghost"
            size="sm"
            onClick={goToAdmin}
            className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            title="Acessar painel administrativo"
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden md:inline">Admin</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            className="border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden md:inline">Limpar</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
