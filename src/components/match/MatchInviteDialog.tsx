// =====================================================================
// MatchInviteDialog - UI para compartilhar convite de partida
// --------------------------------------------------------------------
// Mostra o inviteCode e link shareable.
// Botões: WhatsApp, Telegram, Copiar link, Email
// =====================================================================

'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Share2, Copy, Check, MessageCircle, Send, Mail, Link2, Clock, Loader2, Users,
} from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  inviteCode: string
  matchId: string
  gameMode: string
  open: boolean
  onClose: () => void
  onOpponentJoined?: () => void
}

export function MatchInviteDialog({ inviteCode, matchId, gameMode, open, onClose, onOpponentJoined }: Props) {
  const [copied, setCopied] = useState(false)
  const [checking, setChecking] = useState(false)
  const [opponentJoined, setOpponentJoined] = useState(false)

  // Constrói o link de convite baseado na URL atual
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const inviteLink = `${baseUrl}/?invite=${inviteCode}`

  // Polling: verifica se oponente entrou
  useEffect(() => {
    if (!open || opponentJoined) return

    const checkInterval = setInterval(async () => {
      setChecking(true)
      try {
        const res = await fetch(`/api/match/state?id=${matchId}`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (data.ok && data.match?.status === 'COIN_FLIP') {
            setOpponentJoined(true)
            onOpponentJoined?.()
            toast.success('🎉 Oponente entrou na partida! Vamos jogar!')
          }
        }
      } catch {
        // Silently fail — polling will retry
      } finally {
        setChecking(false)
      }
    }, 3000) // Poll every 3 seconds

    return () => clearInterval(checkInterval)
  }, [open, matchId, opponentJoined, onOpponentJoined])

  // Copiar link
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      toast.success('Link copiado!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select input text
      const input = document.getElementById('invite-link-input') as HTMLInputElement
      if (input) {
        input.select()
        document.execCommand('copy')
        setCopied(true)
        toast.success('Link copiado!')
        setTimeout(() => setCopied(false), 2000)
      }
    }
  }

  // WhatsApp
  const handleWhatsApp = () => {
    const text = `🎮 Vamos jogar Dungeon Soccer! Entre na partida com o código: ${inviteCode}\n\nOu clique no link: ${inviteLink}`
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
    toast('Link enviado via WhatsApp!')
  }

  // Telegram
  const handleTelegram = () => {
    const text = `🎮 Vamos jogar Dungeon Soccer! Entre na partida com o código: ${inviteCode}\n\nOu clique no link: ${inviteLink}`
    const url = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
    toast('Link enviado via Telegram!')
  }

  // Email
  const handleEmail = () => {
    const subject = 'Convite para partida Dungeon Soccer'
    const body = `Vamos jogar Dungeon Soccer!\n\nCódigo da partida: ${inviteCode}\n\nOu entre pelo link: ${inviteLink}\n\nModo: ${gameMode}`
    const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(url, '_blank')
    toast('Email de convite preparado!')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-gray-900 border-emerald-900/50 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-400">
            <Share2 className="h-5 w-5" />
            Convide um jogador
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Compartilhe o link com um amigo para jogar ao vivo!
          </DialogDescription>
        </DialogHeader>

        {opponentJoined ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 py-6"
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.5, repeat: 2 }}
            >
              <Users className="h-16 w-16 text-emerald-400" />
            </motion.div>
            <h3 className="text-xl font-bold text-emerald-400">Oponente conectado!</h3>
            <p className="text-sm text-gray-300">Ambos os jogadores estão na partida. Vamos começar!</p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {/* Código de convite */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm text-gray-400">Código da partida:</p>
              <div className="flex items-center gap-3">
                <Badge className="bg-amber-500 text-white text-2xl font-mono px-6 py-3 tracking-widest">
                  {inviteCode}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="border-emerald-700 text-emerald-300"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Link shareable */}
            <div className="space-y-2">
              <p className="text-xs text-gray-400">Link de convite:</p>
              <div className="flex gap-2">
                <Input
                  id="invite-link-input"
                  value={inviteLink}
                  readOnly
                  className="bg-gray-800 border-gray-700 text-gray-300 font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="border-emerald-700 text-emerald-300 shrink-0"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Botões de compartilhamento */}
            <div className="grid grid-cols-3 gap-3">
              <Button
                onClick={handleWhatsApp}
                className="gap-2 bg-green-600 hover:bg-green-700 text-white"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
              <Button
                onClick={handleTelegram}
                className="gap-2 bg-blue-500 hover:bg-blue-600 text-white"
              >
                <Send className="h-4 w-4" />
                Telegram
              </Button>
              <Button
                onClick={handleEmail}
                variant="outline"
                className="gap-2 border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                <Mail className="h-4 w-4" />
                Email
              </Button>
            </div>

            {/* Status de espera */}
            <div className="flex items-center justify-center gap-2 pt-2 text-sm text-gray-400">
              <Loader2 className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              <span>Esperando oponente entrar...</span>
            </div>

            {/* Info sobre como entrar */}
            <div className="rounded-lg bg-gray-800/50 border border-gray-700 p-3 text-xs text-gray-400 space-y-1">
              <p className="font-semibold text-gray-300">Como entrar na partida:</p>
              <p>1. O outro jogador deve acessar o link ou digitar o código <strong className="text-amber-300">{inviteCode}</strong> no site</p>
              <p>2. Ele deve estar logado com sua conta</p>
              <p>3. Após entrar, a partida começa automaticamente!</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
