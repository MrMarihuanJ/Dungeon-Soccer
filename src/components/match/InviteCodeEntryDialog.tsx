// =====================================================================
// InviteCodeEntryDialog - Campo para digitar código de convite
// --------------------------------------------------------------------
// Permite que um jogador entre manualmente na partida online digitando
// o código que recebeu de um amigo (ex: "VPCQSJ").
// =====================================================================

'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { KeyRound, Loader2, ArrowRight, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitCode: (code: string) => Promise<void>
  currentUser?: { id: string; username: string; displayName?: string | null } | null
}

export function InviteCodeEntryDialog({ open, onOpenChange, onSubmitCode, currentUser }: Props) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = code.toUpperCase().trim()
    if (!trimmed || trimmed.length < 4) {
      setLocalError('O código deve ter pelo menos 4 caracteres.')
      return
    }
    if (!currentUser) {
      setLocalError('Você precisa estar logado para entrar em uma partida.')
      return
    }

    setLoading(true)
    setLocalError(null)
    try {
      await onSubmitCode(trimmed)
      setCode('')
      onOpenChange(false)
    } catch (err: any) {
      const msg = err?.message || String(err)
      setLocalError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (value: string) => {
    // Only allow valid invite code characters (A-Z, 2-3, 5-9, no I/O/0/1)
    setCode(value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6))
    setLocalError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-gray-900 border-emerald-900/50 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-400">
            <KeyRound className="h-5 w-5" />
            Entrar com Código de Convite
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Digite o código que seu amigo compartilhou para entrar na partida online.
          </DialogDescription>
        </DialogHeader>

        {!currentUser ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <AlertCircle className="h-12 w-12 text-amber-400" />
            <p className="text-sm text-gray-300">
              Você precisa estar <strong className="text-amber-300">logado</strong> para entrar em uma partida.
            </p>
            <p className="text-xs text-gray-500">
              Faça login ou crie uma conta, e depois use o código de convite.
            </p>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-emerald-700 text-emerald-300"
            >
              Voltar ao site
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Input do código */}
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-gray-400">Código do convite:</p>
              <div className="flex items-center gap-3">
                <Input
                  value={code}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder="Ex: VPCQSJ"
                  maxLength={6}
                  className="bg-gray-800 border-gray-700 text-center text-2xl font-mono tracking-widest text-amber-300 placeholder:text-gray-600 placeholder:text-sm placeholder:tracking-normal uppercase"
                  style={{ width: '180px' }}
                  disabled={loading}
                  autoFocus
                />
                <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">
                  {code.length}/6
                </Badge>
              </div>
            </div>

            {/* Erro local */}
            {localError && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-red-500/50 bg-red-950/40 p-3 text-sm text-red-300"
              >
                {localError}
              </motion.div>
            )}

            {/* Botão Entrar */}
            <Button
              onClick={handleSubmit}
              disabled={loading || code.length < 4}
              className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold shadow-lg hover:from-amber-600 hover:to-orange-700"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4" />
                  Entrar na Partida
                </>
              )}
            </Button>

            {/* Info */}
            <div className="rounded-lg bg-gray-800/50 border border-gray-700 p-3 text-xs text-gray-400 space-y-1">
              <p className="font-semibold text-gray-300">Como funciona:</p>
              <p>1. Seu amigo criou uma partida online e compartilhou um código</p>
              <p>2. Digite o código aqui e clique <strong className="text-amber-300">Entrar na Partida</strong></p>
              <p>3. A partida começa automaticamente com cara/coroa!</p>
            </div>

            {/* Tip about link */}
            <p className="text-center text-xs text-gray-500">
              Você também pode clicar no link que seu amigo enviou —
              ele já aplica o código automaticamente.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
