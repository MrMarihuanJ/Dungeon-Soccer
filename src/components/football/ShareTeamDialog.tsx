'use client'

// =====================================================================
// ShareTeamDialog - Compartilhar time via WhatsApp, Telegram ou Copiar
// =====================================================================

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Share2, MessageCircle, Send, Copy, Check, ExternalLink,
} from 'lucide-react'
import type { SelectedPlayer } from '@/lib/football/store'
import { calculateTeamRating, type LeagueTier } from '@/lib/player-rating'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  formationId: string
  starters: Record<string, SelectedPlayer | null>
  reserves: SelectedPlayer[]
  username?: string
}

function formatTeamText(
  formationId: string,
  starters: Record<string, SelectedPlayer | null>,
  reserves: SelectedPlayer[],
  username?: string,
): string {
  const startersList = Object.entries(starters)
    .filter(([, p]) => p !== null)
    .map(([posId, p]) => ({ posId, player: p! }))

  const reservesList = reserves.filter(Boolean)

  // Calculate team rating
  const startersData = startersList.map((s) => ({
    overall: s.player.overall ?? 70,
    age: s.player.age ?? 25,
    leagueTier: (s.player.leagueTier as LeagueTier) ?? 'OTHER',
    position: s.player.position,
    isRetired: s.player.isRetired,
    isInactive: s.player.isInactive,
  }))
  const reservesData = reservesList.map((p) => ({
    overall: p.overall ?? 70,
    age: p.age ?? 25,
    leagueTier: (p.leagueTier as LeagueTier) ?? 'OTHER',
    position: p.position,
    isRetired: p.isRetired,
    isInactive: p.isInactive,
  }))
  const rating = calculateTeamRating(startersData, reservesData)

  let text = `⚽ *Dungeon & Soccer — Meu Time*\n\n`
  text += `📋 Formação: ${formationId}\n`
  text += `⭐ Rating: ${rating.finalRating} OVR (${rating.stars.toFixed(1)}★)\n`
  text += `⚔️ ATA: ${rating.attackRating} | 🎯 MEI: ${rating.midfieldRating} | 🛡️ DEF: ${rating.defenseRating}\n\n`

  text += `🟢 *Titulares:*\n`
  startersList.forEach(({ posId, player }) => {
    const ovr = player.overall ? ` (${player.overall})` : ''
    const posLabel = posId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    text += `  ${posLabel}: ${player.name}${ovr} — ${player.team}\n`
  })

  if (reservesList.length > 0) {
    text += `\n🔵 *Banco:*\n`
    reservesList.forEach((p) => {
      const ovr = p.overall ? ` (${p.overall})` : ''
      text += `  ${p.position}: ${p.name}${ovr} — ${p.team}\n`
    })
  }

  text += `\n🎮 Jogue em: dungeonnsoccer.vercel.app`

  if (username) {
    text += `\n👤 @${username}`
  }

  return text
}

export function ShareTeamDialog({
  open,
  onOpenChange,
  formationId,
  starters,
  reserves,
  username,
}: Props) {
  const [copied, setCopied] = useState(false)

  const teamText = formatTeamText(formationId, starters, reserves, username)
  const encodedText = encodeURIComponent(teamText)

  const startersList = Object.values(starters).filter((p): p is SelectedPlayer => !!p)

  const handleWhatsApp = () => {
    const url = `https://wa.me/?text=${encodedText}`
    window.open(url, '_blank')
    toast.success('Abrindo WhatsApp...')
  }

  const handleTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent('https://dungeon-and-soccer.vercel.app')}&text=${encodedText}`
    window.open(url, '_blank')
    toast.success('Abrindo Telegram...')
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(teamText)
      setCopied(true)
      toast.success('Time copiado para a área de transferência!')
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = teamText
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        toast.success('Time copiado!')
        setTimeout(() => setCopied(false), 3000)
      } catch {
        toast.error('Não foi possível copiar. Tente manualmente.')
      }
      document.body.removeChild(textarea)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-400">
            <Share2 className="h-5 w-5" />
            Compartilhar Time
          </DialogTitle>
          <DialogDescription>
            Envie seu time para amigos via WhatsApp, Telegram ou copie as informações.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview */}
          <Card className="border-emerald-800/30 bg-gray-800/50">
            <CardContent className="p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                Prévia da mensagem:
              </p>
              <div className="max-h-[200px] overflow-y-auto rounded bg-gray-900/60 p-3 text-xs text-gray-300 whitespace-pre-wrap">
                {teamText}
              </div>
            </CardContent>
          </Card>

          {/* Team summary */}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Badge variant="outline" className="border-emerald-700 text-emerald-300">
              {startersList.length} titulares
            </Badge>
            <Badge variant="outline" className="border-sky-700 text-sky-300">
              {reserves.length} reservas
            </Badge>
          </div>

          {/* Share buttons */}
          <div className="grid grid-cols-3 gap-3">
            {/* WhatsApp */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleWhatsApp}
              className="flex flex-col items-center gap-2 rounded-xl border border-green-700/50 bg-green-950/30 p-4 transition-colors hover:bg-green-900/40"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-600">
                <MessageCircle className="h-6 w-6 text-white" />
              </div>
              <span className="text-xs font-bold text-green-400">WhatsApp</span>
            </motion.button>

            {/* Telegram */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleTelegram}
              className="flex flex-col items-center gap-2 rounded-xl border border-blue-700/50 bg-blue-950/30 p-4 transition-colors hover:bg-blue-900/40"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500">
                <Send className="h-6 w-6 text-white" />
              </div>
              <span className="text-xs font-bold text-blue-400">Telegram</span>
            </motion.button>

            {/* Copy */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopy}
              className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                copied
                  ? 'border-emerald-600 bg-emerald-950/30'
                  : 'border-gray-600/50 bg-gray-800/30 hover:bg-gray-700/30'
              }`}
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
                copied ? 'bg-emerald-600' : 'bg-gray-600'
              }`}>
                {copied ? (
                  <Check className="h-6 w-6 text-white" />
                ) : (
                  <Copy className="h-6 w-6 text-white" />
                )}
              </div>
              <span className={`text-xs font-bold ${copied ? 'text-emerald-400' : 'text-gray-400'}`}>
                {copied ? 'Copiado!' : 'Copiar'}
              </span>
            </motion.button>
          </div>

          {/* Info */}
          <p className="text-center text-[10px] text-gray-500">
            A mensagem inclui formação, jogadores, ratings e link do site.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
