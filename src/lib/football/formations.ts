// =====================================================================
// Definições de formações táticas - Cartoleiro FC
// ---------------------------------------------------------------------
// Cada formação define posições absolutas (em % do campo) com:
//   x: posição horizontal (0-100, 50 = centro)
//   y: posição vertical (0 = nosso gol, 100 = gol adversário)
//   role: papel tático (GK, LB, CB, RB, DM, CM, AM, LW, RW, ST, etc.)
// =====================================================================

export type PositionRole =
  | 'GK'    // Goleiro
  | 'LB'    // Lateral Esquerdo
  | 'CB'    // Zagueiro Central
  | 'RB'    // Lateral Direito
  | 'LWB'   // Ala Esquerdo
  | 'RWB'   // Ala Direito
  | 'DM'    // Volante
  | 'CM'    // Meia Central
  | 'AM'    // Meia Atacante
  | 'LM'    // Meia Esquerdo
  | 'RM'    // Meia Direito
  | 'LW'    // Ponta Esquerda
  | 'RW'    // Ponta Direita
  | 'SS'    // Segundo Atacante
  | 'ST'    // Centroavante

export interface FieldPosition {
  id: string
  role: PositionRole
  label: string
  x: number  // 0-100 (esquerda -> direita)
  y: number  // 0-100 (goleiro -> ataque)
}

export interface Formation {
  id: string
  name: string      // ex: "4-3-3"
  description: string
  positions: FieldPosition[]
}

// Helper para criar posições rapidamente
const pos = (
  id: string,
  role: PositionRole,
  label: string,
  x: number,
  y: number,
): FieldPosition => ({ id, role, label, x, y })

export const FORMATIONS: Formation[] = [
  // ============ 4-3-3 ============
  {
    id: '4-3-3',
    name: '4-3-3',
    description: 'Ataque forte com 3 pontas. Equilibrado para controle de meio e velocidade ofensiva.',
    positions: [
      pos('gk', 'GK', 'GOL', 50, 8),
      pos('lb', 'LB', 'LE', 12, 28),
      pos('lcb', 'CB', 'ZAG', 38, 22),
      pos('rcb', 'CB', 'ZAG', 62, 22),
      pos('rb', 'RB', 'LD', 88, 28),
      pos('dm', 'DM', 'VOL', 50, 45),
      pos('lcm', 'CM', 'MEI', 28, 58),
      pos('rcm', 'CM', 'MEI', 72, 58),
      pos('lw', 'LW', 'PE', 18, 82),
      pos('st', 'ST', 'ATA', 50, 88),
      pos('rw', 'RW', 'PD', 82, 82),
    ],
  },

  // ============ 4-4-2 ============
  {
    id: '4-4-2',
    name: '4-4-2',
    description: 'Clássico e sólido. Dois atacantes de referência e meio-campo em linha.',
    positions: [
      pos('gk', 'GK', 'GOL', 50, 8),
      pos('lb', 'LB', 'LE', 12, 28),
      pos('lcb', 'CB', 'ZAG', 38, 22),
      pos('rcb', 'CB', 'ZAG', 62, 22),
      pos('rb', 'RB', 'LD', 88, 28),
      pos('lm', 'LM', 'ME', 12, 58),
      pos('lcm', 'CM', 'MEI', 38, 55),
      pos('rcm', 'CM', 'MEI', 62, 55),
      pos('rm', 'RM', 'MD', 88, 58),
      pos('lst', 'ST', 'ATA', 38, 85),
      pos('rst', 'ST', 'ATA', 62, 85),
    ],
  },

  // ============ 3-5-2 ============
  {
    id: '3-5-2',
    name: '3-5-2',
    description: 'Três zagueiros com alas que sobem. Domínio do meio-campo e apoio lateral.',
    positions: [
      pos('gk', 'GK', 'GOL', 50, 8),
      pos('lcb', 'CB', 'ZAG', 25, 22),
      pos('ccb', 'CB', 'ZAG', 50, 18),
      pos('rcb', 'CB', 'ZAG', 75, 22),
      pos('lwb', 'LWB', 'ALE', 8, 50),
      pos('rwb', 'RWB', 'ALD', 92, 50),
      pos('ldm', 'CM', 'MEI', 30, 50),
      pos('cdm', 'DM', 'VOL', 50, 45),
      pos('rdm', 'CM', 'MEI', 70, 50),
      pos('lst', 'ST', 'ATA', 38, 85),
      pos('rst', 'ST', 'ATA', 62, 85),
    ],
  },

  // ============ 4-2-3-1 ============
  {
    id: '4-2-3-1',
    name: '4-2-3-1',
    description: 'Defesa sólida com dois volantes. Meia-armador livre e atacante central de referência.',
    positions: [
      pos('gk', 'GK', 'GOL', 50, 8),
      pos('lb', 'LB', 'LE', 12, 28),
      pos('lcb', 'CB', 'ZAG', 38, 22),
      pos('rcb', 'CB', 'ZAG', 62, 22),
      pos('rb', 'RB', 'LD', 88, 28),
      pos('ldm', 'DM', 'VOL', 35, 45),
      pos('rdm', 'DM', 'VOL', 65, 45),
      pos('lam', 'AM', 'MEI', 20, 70),
      pos('cam', 'AM', 'ARM', 50, 68),
      pos('ram', 'AM', 'MEI', 80, 70),
      pos('st', 'ST', 'ATA', 50, 88),
    ],
  },

  // ============ 3-4-3 ============
  {
    id: '3-4-3',
    name: '3-4-3',
    description: 'Ataque maximalista com três pontas. Defesa de três e meio aberto.',
    positions: [
      pos('gk', 'GK', 'GOL', 50, 8),
      pos('lcb', 'CB', 'ZAG', 25, 22),
      pos('ccb', 'CB', 'ZAG', 50, 18),
      pos('rcb', 'CB', 'ZAG', 75, 22),
      pos('lm', 'LM', 'ME', 12, 50),
      pos('lcm', 'CM', 'MEI', 38, 50),
      pos('rcm', 'CM', 'MEI', 62, 50),
      pos('rm', 'RM', 'MD', 88, 50),
      pos('lw', 'LW', 'PE', 18, 82),
      pos('st', 'ST', 'ATA', 50, 88),
      pos('rw', 'RW', 'PD', 82, 82),
    ],
  },

  // ============ 5-3-2 ============
  {
    id: '5-3-2',
    name: '5-3-2',
    description: 'Defesa reforçada com cinco. Excelente para contra-ataque com dois atacantes.',
    positions: [
      pos('gk', 'GK', 'GOL', 50, 8),
      pos('lwb', 'LWB', 'ALE', 8, 30),
      pos('lcb', 'CB', 'ZAG', 28, 20),
      pos('ccb', 'CB', 'ZAG', 50, 16),
      pos('rcb', 'CB', 'ZAG', 72, 20),
      pos('rwb', 'RWB', 'ALD', 92, 30),
      pos('lcm', 'CM', 'MEI', 25, 55),
      pos('ccm', 'CM', 'MEI', 50, 50),
      pos('rcm', 'CM', 'MEI', 75, 55),
      pos('lst', 'ST', 'ATA', 38, 85),
      pos('rst', 'ST', 'ATA', 62, 85),
    ],
  },
]

export const DEFAULT_FORMATION = FORMATIONS[0]

export const getFormation = (id: string): Formation =>
  FORMATIONS.find((f) => f.id === id) ?? DEFAULT_FORMATION

// Mapeia cada role tático para a posição genérica usada na busca de jogadores
export const ROLE_TO_POSITION: Record<PositionRole, 'GK' | 'DF' | 'MF' | 'FW'> = {
  GK: 'GK',
  LB: 'DF', CB: 'DF', RB: 'DF', LWB: 'DF', RWB: 'DF',
  DM: 'MF', CM: 'MF', AM: 'MF', LM: 'MF', RM: 'MF',
  LW: 'FW', RW: 'FW', SS: 'FW', ST: 'FW',
}
