'use client'

// =====================================================================
// Instructions - Modal com instruções de uso
// =====================================================================

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MousePointerClick, Search, Users, ArrowLeftRight, Database } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STEPS = [
  {
    icon: MousePointerClick,
    title: '1. Escolha a formação',
    text: 'Use o seletor no topo do campo para escolher a formação tática (4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 3-4-3 ou 5-3-2). As bolas se reposicionam automaticamente.',
  },
  {
    icon: Search,
    title: '2. Clique numa bola',
    text: 'Clique em qualquer bola flutuante no campo. Um campo de texto se abrirá para você digitar o nome do jogador desejado.',
  },
  {
    icon: Users,
    title: '3. Busca em tempo real',
    text: 'Conforme você digita, o sistema consulta o banco de dados e retorna sugestões com foto, nome completo e time atual. Clique para selecionar.',
  },
  {
    icon: ArrowLeftRight,
    title: '4. Monte o banco de reservas',
    text: 'Use o botão "+ Reserva" para convocar jogadores para o banco. Depois clique em "Entrar" num reserva para substituir um titular.',
  },
  {
    icon: Database,
    title: '5. Persistência automática',
    text: 'Seu time é salvo automaticamente no navegador (localStorage). Recarregue a página sem medo: o time continua montado.',
  },
]

export function Instructions({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-emerald-700">Como usar o Cartoleiro FC</DialogTitle>
        </DialogHeader>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-900">{s.title}</span>
                <span className="text-xs leading-relaxed text-gray-600">{s.text}</span>
              </div>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  )
}
