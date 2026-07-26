'use client'

// =====================================================================
// Instructions - Modal com instruções de uso
// --------------------------------------------------------------------
// CORREÇÃO 10: Atualizado para incluir as novas regras de:
//   - Substituições (limite de 5/6, contagem por lesão, interface clara)
//   - Cobrança de falta (apenas em infrações + multiplicadores dinâmicos)
//   - Jogadas defensivas (roubo de bola, anti-repetição)
//   - Sistema de XP / nível / benefícios desbloqueáveis
//   - Punições automáticas (cartão vermelho remove do campo)
// =====================================================================

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  MousePointerClick, Search, Users, ArrowLeftRight, Database,
  Target, Shield, TrendingUp, Award, AlertTriangle,
} from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Step {
  icon: typeof MousePointerClick
  title: string
  text: string
}

const STEPS: Step[] = [
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
    title: '4. Banco e posição designada',
    text: 'Use "+ Reserva" para convocar jogadores para o banco. Você pode mudar a "posição de banco" de cada reserva no seletor abaixo do nome — útil para organizar taticamente.',
  },
  {
    icon: Shield,
    title: '5. Substituições durante o jogo',
    text: 'Cada partida permite 5 substituições (ou 6 se você for nível 3+). Substituições por lesão também contam no limite. Se atingir o limite e houver lesão, o time joga com um a menos. Escolha quem sai e quem entra em duas fases claras.',
  },
  {
    icon: Target,
    title: '6. Cobrança de falta com multiplicador',
    text: 'Quando ocorre uma falta real (infração), o time favorecido pode cobrar. Cada batedor recebe um multiplicador aleatório: 🔥 BÔNUS (+5% a +30%), 💀 PENALIDADE (-5% a -25%), ou ⚖️ NEUTRO. A chance de gol exibida já inclui o multiplicador. O sistema evita repetições consecutivas do mesmo batedor e do mesmo sinal.',
  },
  {
    icon: TrendingUp,
    title: '7. Jogada defensiva (roubo de bola)',
    text: 'Durante a vez do oponente (modo online), pode aparecer uma chance de jogada defensiva! Escolha um defensor e role um d20 + skillBonus vs DC 14. Se acertar, você rouba a bola e joga novamente. Após uma roubada bem-sucedida, a próxima jogada defensiva NÃO é oferecida (anti-repetição).',
  },
  {
    icon: AlertTriangle,
    title: '8. Cartões vermelhos e punições',
    text: 'Cartão vermelho remove o jogador de campo definitivamente — o time fica com um a menos. Cartões amarelos acumulam. O status de cartões, jogadores em campo e substituições é exibido no header da partida.',
  },
  {
    icon: Award,
    title: '9. Sistema de XP e níveis',
    text: 'Cada vitória/empate/derrota acumula XP. Suba de nível para desbloquear benefícios: 🛡️ Defensor Nato (nível 2), 👥 Banco Qualificado (nível 3, +1 sub), ⭐ Veterano (nível 5, +25% XP), 🎯 Tático (nível 7), 👑 Lenda Viva (nível 10, +50% XP). A barra de progressão é exibida no header.',
  },
  {
    icon: Database,
    title: '10. Persistência automática',
    text: 'Seu time é salvo automaticamente no navegador (localStorage). Recarregue a página sem medo: o time continua montado. Substituições durante partidas também são persistidas no servidor.',
  },
]

export function Instructions({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-emerald-700 dark:text-emerald-400">
            Como usar o Dungeon Soccer
          </DialogTitle>
        </DialogHeader>
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-900/50">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{s.title}</span>
                <span className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">{s.text}</span>
              </div>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  )
}
