'use client'

// =====================================================================
// EasterEggs - Segredos escondidos no site
// --------------------------------------------------------------------
// 1. Konami Code (↑↑↓↓←→←→ B A) → ativa "Modo Lendário": confete +
//    toast + tema dourado temporário
// 2. 7 cliques no logo do header → revela jogador secreto Pelé
// 3. Digitar "dungeon" no teclado → pulsa todos os cards
// 4. Digitar "brasil70" → monta time Brasil 1970 automaticamente
//    "brasil02" → Brasil 2002 (penta)
//    "barca08" → Barcelona 2008-09 (Pep Team)
//
// Os times secretos usam photos REAIS buscadas dinamicamente da
// Wikipedia REST API (que tem CORS habilitado).
// =====================================================================

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Crown, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
]

// =====================================================================
// Times secretos - jogadores mapeados POR POSIÇÃO (não por índice)
// --------------------------------------------------------------------
// A chave é o ID da posição na formação 4-3-3:
//   gk, lb, lcb, rcb, rb, dm, lcm, rcm, lw, st, rw
//
// wikiTitle: título do artigo na Wikipedia em inglês (para buscar foto)
// Se a busca falhar, usamos UI Avatars como fallback.
// =====================================================================

export interface SecretPlayer {
  name: string
  fullName: string
  team: string
  nationality: string
  shirtNumber: number
  wikiTitle: string // título do artigo na Wikipedia
}

export interface SecretTeam {
  formation: string
  name: string
  emoji: string
  toastDescription: string
  players: Record<string, SecretPlayer> // positionId -> player
}

export const SECRET_TEAMS: Record<string, SecretTeam> = {
  brasil70: {
    formation: '4-3-3',
    name: 'Brasil 1970',
    emoji: '🇧🇷',
    toastDescription: 'Pelé, Tostão, Jairzinho, Gerson, Rivelino, Carlos Alberto, Clodoaldo, Félix...',
    players: {
      gk:  { name: 'Félix',          fullName: 'Amando dos Santos Félix',        team: 'Portuguesa (1970)',   nationality: 'Brasil', shirtNumber: 1,  wikiTitle: 'Félix (footballer)' },
      lb:  { name: 'Everaldo',       fullName: 'Everaldo Marques da Silva',      team: 'Grêmio (1970)',       nationality: 'Brasil', shirtNumber: 6,  wikiTitle: 'Everaldo Marques da Silva' },
      lcb: { name: 'Brito',          fullName: 'Hércules de Brito Ruas',         team: 'Vasco (1970)',        nationality: 'Brasil', shirtNumber: 3,  wikiTitle: 'Hércules Brito Ruas' },
      rcb: { name: 'Piazza',         fullName: 'Wilson da Silva Piazza',         team: 'Cruzeiro (1970)',     nationality: 'Brasil', shirtNumber: 4,  wikiTitle: 'Wilson da Silva Piazza' },
      rb:  { name: 'Carlos Alberto', fullName: 'Carlos Alberto Torres',         team: 'Santos (1970)',       nationality: 'Brasil', shirtNumber: 4,  wikiTitle: 'Carlos Alberto Torres' },
      dm:  { name: 'Clodoaldo',      fullName: 'Clodoaldo Tavares de Santana',  team: 'Santos (1970)',       nationality: 'Brasil', shirtNumber: 5,  wikiTitle: 'Clodoaldo (footballer)' },
      lcm: { name: 'Gérson',         fullName: 'Gerson de Oliveira Nunes',      team: 'São Paulo (1970)',    nationality: 'Brasil', shirtNumber: 8,  wikiTitle: 'Gérson de Oliveira Nunes' },
      rcm: { name: 'Rivelino',       fullName: 'Roberto Rivellino',             team: 'Corinthians (1970)',  nationality: 'Brasil', shirtNumber: 11, wikiTitle: 'Roberto Rivellino' },
      lw:  { name: 'Jairzinho',      fullName: 'Jair Ventura Filho',            team: 'Botafogo (1970)',     nationality: 'Brasil', shirtNumber: 7,  wikiTitle: 'Jairzinho' },
      st:  { name: 'Pelé',           fullName: 'Edson Arantes do Nascimento',   team: 'Santos (1970)',       nationality: 'Brasil', shirtNumber: 10, wikiTitle: 'Pelé' },
      rw:  { name: 'Tostão',         fullName: 'Eduardo Gonçalves de Andrade',  team: 'Cruzeiro (1970)',     nationality: 'Brasil', shirtNumber: 9,  wikiTitle: 'Tostão' },
    },
  },

  brasil02: {
    formation: '4-3-3',
    name: 'Brasil 2002',
    emoji: '🇧🇷',
    toastDescription: 'Ronaldo (R9), Rivaldo, Ronaldinho, Roberto Carlos, Cafu, Lúcio, Gilberto Silva...',
    players: {
      gk:  { name: 'Marcos',          fullName: 'Marcos Roberto Silveira Reis',     team: 'Palmeiras (2002)',       nationality: 'Brasil', shirtNumber: 1,  wikiTitle: 'Marcos Roberto Silveira Reis' },
      lb:  { name: 'Roberto Carlos',  fullName: 'Roberto Carlos da Silva Rocha',    team: 'Real Madrid (2002)',     nationality: 'Brasil', shirtNumber: 6,  wikiTitle: 'Roberto Carlos' },
      lcb: { name: 'Lúcio',           fullName: 'Lucimar da Silva Ferreira',        team: 'Bayer Leverkusen (2002)', nationality: 'Brasil', shirtNumber: 3,  wikiTitle: 'Lúcio' },
      rcb: { name: 'Roque Júnior',    fullName: 'José Vítor Roque Jr.',            team: 'AC Milan (2002)',        nationality: 'Brasil', shirtNumber: 4,  wikiTitle: 'Roque Júnior' },
      rb:  { name: 'Cafu',            fullName: 'Marcos Evangelista de Moraes',     team: 'AS Roma (2002)',         nationality: 'Brasil', shirtNumber: 2,  wikiTitle: 'Cafu' },
      dm:  { name: 'Gilberto Silva',  fullName: 'Gilberto Aparecido da Silva',     team: 'Atlético-MG (2002)',     nationality: 'Brasil', shirtNumber: 8,  wikiTitle: 'Gilberto Silva' },
      lcm: { name: 'Kleberson',       fullName: 'José Kléberson Pereira',          team: 'Atlético-PR (2002)',     nationality: 'Brasil', shirtNumber: 15, wikiTitle: 'Kléberson' },
      rcm: { name: 'Rivaldo',         fullName: 'Vitor Borba Ferreira',            team: 'Barcelona (2002)',       nationality: 'Brasil', shirtNumber: 10, wikiTitle: 'Rivaldo' },
      lw:  { name: 'Ronaldinho',      fullName: 'Ronaldo de Assis Moreira',        team: 'PSG (2002)',             nationality: 'Brasil', shirtNumber: 11, wikiTitle: 'Ronaldinho' },
      st:  { name: 'Ronaldo',         fullName: 'Ronaldo Luís Nazário de Lima',    team: 'Inter de Milão (2002)',  nationality: 'Brasil', shirtNumber: 9,  wikiTitle: 'Ronaldo (Brazilian footballer)' },
      rw:  { name: 'Edmílson',        fullName: 'José Moacir de Souza',            team: 'Olympique Lyonnais (2002)', nationality: 'Brasil', shirtNumber: 5, wikiTitle: 'Edmílson (footballer, born 1976)' },
    },
  },

  barca08: {
    formation: '4-3-3',
    name: 'Barcelona 2008-09',
    emoji: '🔴🔵',
    toastDescription: 'Messi, Xavi, Iniesta, Eto\'o, Henry, Puyol, Piqué, Dani Alves, Busquets...',
    players: {
      gk:  { name: 'Valdés',      fullName: 'Víctor Valdés Arribas',          team: 'Barcelona (2009)',  nationality: 'Espanha',  shirtNumber: 1,  wikiTitle: 'Víctor Valdés' },
      lb:  { name: 'Abidal',      fullName: 'Eric-Sylvain Bilal Abidal',      team: 'Barcelona (2009)',  nationality: 'França',   shirtNumber: 22, wikiTitle: 'Eric Abidal' },
      lcb: { name: 'Puyol',       fullName: 'Carles Puyol i Saforcada',       team: 'Barcelona (2009)',  nationality: 'Espanha',  shirtNumber: 5,  wikiTitle: 'Carles Puyol' },
      rcb: { name: 'Piqué',       fullName: 'Gerard Piqué Bernabeu',          team: 'Barcelona (2009)',  nationality: 'Espanha',  shirtNumber: 3,  wikiTitle: 'Gerard Piqué' },
      rb:  { name: 'Dani Alves',  fullName: 'Daniel Alves da Silva',          team: 'Barcelona (2009)',  nationality: 'Brasil',   shirtNumber: 2,  wikiTitle: 'Dani Alves' },
      dm:  { name: 'Busquets',    fullName: 'Sergio Busquets Burgos',         team: 'Barcelona (2009)',  nationality: 'Espanha',  shirtNumber: 16, wikiTitle: 'Sergio Busquets' },
      lcm: { name: 'Xavi',        fullName: 'Xavier Hernández Creus',         team: 'Barcelona (2009)',  nationality: 'Espanha',  shirtNumber: 6,  wikiTitle: 'Xavi Hernández' },
      rcm: { name: 'Iniesta',     fullName: 'Andrés Iniesta Luján',           team: 'Barcelona (2009)',  nationality: 'Espanha',  shirtNumber: 8,  wikiTitle: 'Andrés Iniesta' },
      lw:  { name: 'Henry',       fullName: 'Thierry Daniel Henry',           team: 'Barcelona (2009)',  nationality: 'França',   shirtNumber: 14, wikiTitle: 'Thierry Henry' },
      st:  { name: 'Eto\'o',      fullName: 'Samuel Eto\'o Fils',             team: 'Barcelona (2009)',  nationality: 'Camarões', shirtNumber: 9,  wikiTitle: 'Samuel Eto\'o' },
      rw:  { name: 'Messi',       fullName: 'Lionel Andrés Messi Cuccittini', team: 'Barcelona (2009)',  nationality: 'Argentina', shirtNumber: 10, wikiTitle: 'Lionel Messi' },
    },
  },
}

export type SecretTeamId = keyof typeof SECRET_TEAMS

// =====================================================================
// Helper: busca foto real de jogador na Wikipedia REST API
// --------------------------------------------------------------------
// A Wikipedia REST API tem CORS habilitado, então podemos chamar
// diretamente do navegador. Retorna a URL do thumbnail ou null.
// =====================================================================
export async function fetchWikipediaPhoto(wikiTitle: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    return (
      data?.thumbnail?.source ||
      data?.originalimage?.source ||
      null
    )
  } catch {
    return null
  }
}

export function fallbackPhoto(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0d8a3f&color=fff&size=200&bold=true`
}

// =====================================================================
// Mapeia positionId → posição genérica (GK/DF/MF/FW)
// =====================================================================
export function posToPosition(posId: string): 'GK' | 'DF' | 'MF' | 'FW' {
  if (posId === 'gk') return 'GK'
  if (['lb', 'lcb', 'rcb', 'rb'].includes(posId)) return 'DF'
  if (['dm', 'lcm', 'rcm', 'cam', 'lm', 'rm'].includes(posId)) return 'MF'
  return 'FW' // lw, st, rw, ss
}

// =====================================================================
// Componente principal (Konami code + palavras secretas + confete)
// =====================================================================
interface Props {
  onSecretTeam?: (teamId: SecretTeamId) => void
}

export function EasterEggs({ onSecretTeam }: Props) {
  const [konamiIndex, setKonamiIndex] = useState(0)
  const [legendary, setLegendary] = useState(false)
  const [typedBuffer, setTypedBuffer] = useState('')
  const [confetti, setConfetti] = useState<{ id: number; x: number; color: string }[]>([])
  const confettiId = useRef(0)

  const fireConfetti = () => {
    const colors = ['#10b981', '#fbbf24', '#ef4444', '#3b82f6', '#a855f7', '#ec4899']
    const pieces = Array.from({ length: 60 }, () => ({
      id: confettiId.current++,
      x: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
    }))
    setConfetti(pieces)
    setTimeout(() => setConfetti([]), 3000)
  }

  const activateLegendary = () => {
    setLegendary(true)
    fireConfetti()
    toast.success('🏆 MODO LENDÁRIO ATIVADO!', {
      description: 'Você desbloqueou o Konami Code. Os craques estão observando...',
      duration: 6000,
    })
    setTimeout(() => setLegendary(false), 8000)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      // Konami
      const expected = KONAMI[konamiIndex]
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (key === expected) {
        const next = konamiIndex + 1
        if (next === KONAMI.length) {
          activateLegendary()
          setKonamiIndex(0)
          return
        }
        setKonamiIndex(next)
      } else {
        setKonamiIndex(key === KONAMI[0] ? 1 : 0)
      }

      // Palavras secretas
      const newBuffer = (typedBuffer + key).slice(-20).toLowerCase()
      setTypedBuffer(newBuffer)

      if (newBuffer.endsWith('dungeon')) {
        document.body.classList.add('animate-pulse-glow')
        toast.info('🐉 DUNGEON desbloqueado!', {
          description: 'O dragão observa seu time...',
          duration: 4000,
        })
        setTimeout(() => document.body.classList.remove('animate-pulse-glow'), 3000)
      }

      if (newBuffer.endsWith('brasil70') && onSecretTeam) {
        onSecretTeam('brasil70')
      }
      if (newBuffer.endsWith('brasil02') && onSecretTeam) {
        onSecretTeam('brasil02')
      }
      if (newBuffer.endsWith('barca08') && onSecretTeam) {
        onSecretTeam('barca08')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [konamiIndex, typedBuffer, onSecretTeam])

  return (
    <>
      <AnimatePresence>
        {legendary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-transparent to-emerald-500/20" />
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="relative flex flex-col items-center gap-4"
            >
              <div className="relative">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                >
                  <Crown className="h-24 w-24 text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]" />
                </motion.div>
                <Sparkles className="absolute -right-3 -top-3 h-6 w-6 text-yellow-300 animate-pulse" />
                <Sparkles className="absolute -left-3 bottom-0 h-5 w-5 text-yellow-300 animate-pulse" />
              </div>
              <div className="rounded-2xl bg-black/70 px-6 py-3 text-center backdrop-blur">
                <p className="text-2xl font-bold text-amber-400">MODO LENDÁRIO</p>
                <p className="text-sm text-amber-200">Os deuses do futebol sorriem para você</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confetti.length > 0 && (
          <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
            {confetti.map((piece) => (
              <div
                key={piece.id}
                className="absolute top-0 h-3 w-2 animate-confetti"
                style={{
                  left: `${piece.x}%`,
                  backgroundColor: piece.color,
                  animationDelay: `${Math.random() * 0.5}s`,
                  animationDuration: `${2 + Math.random() * 1}s`,
                }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
    </>
  )
}

// Hook para contar cliques no logo (revela dica do brasil70)
export function useLogoClicks(onReach: () => void) {
  const [count, setCount] = useState(0)
  const lastClick = useRef(0)

  const handleClick = () => {
    const now = Date.now()
    if (now - lastClick.current > 2000) {
      setCount(1)
    } else {
      setCount((c) => c + 1)
    }
    lastClick.current = now

    if (count + 1 === 7) {
      onReach()
      setCount(0)
    }
  }

  return handleClick
}
