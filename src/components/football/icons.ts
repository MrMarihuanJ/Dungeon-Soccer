// =====================================================================
// Icons — ícones locais baseados em lucide-react
// --------------------------------------------------------------------
// Alguns ícones usados no ReserveTeam não existem no lucide-react.
// Este arquivo fornece wrappers compatíveis para evitar dependências
// externas adicionais.
// =====================================================================

import {
  ArrowLeftRight as ArrowLeftRightIcon,
  Trash2 as Trash2Icon,
  UserCircle2 as UserCircle2Icon,
  Shirt as ShirtIcon,
  MapPin as MapPinIcon,
  ChevronDown as ChevronDownIcon,
  MoveRight as MoveRightIcon,
} from 'lucide-react'

export const ArrowLeftRight = ArrowLeftRightIcon
export const Trash2 = Trash2Icon
export const UserCircle2 = UserCircle2Icon
export const Shirt = ShirtIcon
export const MapPin = MapPinIcon
export const ChevronDown = ChevronDownIcon
// lucide-react não tem "MoveToField" — usamos MoveRight como análogo
export const MoveToField = MoveRightIcon
