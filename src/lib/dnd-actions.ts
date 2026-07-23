// =====================================================================
// D&D Actions Library — 100+ ações de futebol para o modo RPG
// --------------------------------------------------------------------
// Categorias (cada ação pertence a uma categoria):
//   - KICKOFF (saída de bola) — 15+ ações
//   - PASS (passe) — 20+ ações
//   - DRIBBLE (drible) — 20+ ações
//   - SHOOT (chute ao gol) — 15+ ações
//   - DEFEND (defesa/interceptação) — 15+ ações
//   - SPECIAL (jogadas especiais / bônus) — 15+ ações
// =====================================================================

export type ActionCategory =
  | 'KICKOFF'    // saída de bola
  | 'PASS'       // passe
  | 'DRIBBLE'    // drible
  | 'SHOOT'      // chute
  | 'DEFEND'     // defesa
  | 'SPECIAL'    // jogada especial
  | 'FREE_KICK'  // cobrança de falta

export interface FootballAction {
  id: string
  name: string
  emoji: string
  category: ActionCategory
  description: string
  // Dificuldade da ação: d20 + skillBonus precisa >= DC
  dc: number
  // Bônus padrão de habilidade aplicado à jogada
  // (assumindo jogador mediano; o backend pode ajustar com base no time)
  skillBonus: number
  // Quanto avança no campo se for bem-sucedida (0-100)
  // 100 = gol; 0 = sem progresso
  progress: number
  // Risco: se falhar, o quanto a posse é perdida (probabilidade de perder bola mesmo em falha "menor")
  // 0 = sempre perde bola em falha; 1 = mantém bola mesmo em falha
  ballRetentionOnFail: number
  // Chance de gol adicional (se progress >= 80 e dc superado por 5+)
  goalChance: number
}

// =====================================================================
// AÇÕES — Saída de bola (KICKOFF) — 16 ações
// =====================================================================
const KICKOFF_ACTIONS: FootballAction[] = [
  { id: 'k01', name: 'Saída Curta', emoji: '🥅', category: 'KICKOFF', description: 'Passe rasteiro para o volante próximo. Seguro.', dc: 8,  skillBonus: 3, progress: 8,  ballRetentionOnFail: 0.3, goalChance: 0 },
  { id: 'k02', name: 'Saída Longa', emoji: '⚽', category: 'KICKOFF', description: 'Bola longa para o ataque. Risco médio.', dc: 12, skillBonus: 2, progress: 25, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'k03', name: 'Tabela no Meio', emoji: '🔗', category: 'KICKOFF', description: 'Tabela entre meias para avançar. Elegante.', dc: 13, skillBonus: 2, progress: 18, ballRetentionOnFail: 0.2, goalChance: 0 },
  { id: 'k04', name: 'Lançamento ao Lado', emoji: '🎯', category: 'KICKOFF', description: 'Lançamento longo para o lateral avançar.', dc: 14, skillBonus: 1, progress: 22, ballRetentionOnFail: 0.15, goalChance: 0 },
  { id: 'k05', name: 'Drible do Goleiro', emoji: '🤹', category: 'KICKOFF', description: 'Goleiro sai driblando (PERIGOSO!).', dc: 18, skillBonus: -1, progress: 15, ballRetentionOnFail: 0.05, goalChance: 0 },
  { id: 'k06', name: 'Passe na Reversão', emoji: '↩️', category: 'KICKOFF', description: 'Bola para o zagueiro, troca de lado.', dc: 7,  skillBonus: 4, progress: 5,  ballRetentionOnFail: 0.4, goalChance: 0 },
  { id: 'k07', name: 'Cobertura Rápida', emoji: '⚡', category: 'KICKOFF', description: 'Bola direto pro ataque, tudo ou nada.', dc: 16, skillBonus: 0, progress: 35, ballRetentionOnFail: 0, goalChance: 0.05 },
  { id: 'k08', name: 'Saída pelo Lado', emoji: '➡️', category: 'KICKOFF', description: 'Construção pela direita comlaterais.', dc: 10, skillBonus: 3, progress: 12, ballRetentionOnFail: 0.25, goalChance: 0 },
  { id: 'k09', name: 'Passe em Profundidade', emoji: '📏', category: 'KICKOFF', description: 'Bola em profundidade para o atacante.', dc: 15, skillBonus: 1, progress: 28, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'k10', name: 'Triângulo no Meio', emoji: '🔺', category: 'KICKOFF', description: 'Triângulo de passes no meio-campo.', dc: 11, skillBonus: 3, progress: 14, ballRetentionOnFail: 0.3, goalChance: 0 },
  { id: 'k11', name: 'Bola Esticada', emoji: '🚀', category: 'KICKOFF', description: 'Bola esticada pra ponta correr.', dc: 14, skillBonus: 2, progress: 24, ballRetentionOnFail: 0.15, goalChance: 0 },
  { id: 'k12', name: 'Passe Vertical', emoji: '⬆️', category: 'KICKOFF', description: 'Passe vertical ousado pro meia avançar.', dc: 13, skillBonus: 2, progress: 20, ballRetentionOnFail: 0.2, goalChance: 0 },
  { id: 'k13', name: 'Inversão de Jogo', emoji: '🔄', category: 'KICKOFF', description: 'Inverte de lado pra abrir a defesa.', dc: 9,  skillBonus: 3, progress: 10, ballRetentionOnFail: 0.35, goalChance: 0 },
  { id: 'k14', name: 'Passe Alto', emoji: '🎈', category: 'KICKOFF', description: 'Bola alçada pro atacante cabecear.', dc: 15, skillBonus: 1, progress: 26, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'k15', name: 'Saída Pressionada', emoji: '🔥', category: 'KICKOFF', description: 'Saiu sob pressão, passe apertado.', dc: 16, skillBonus: 1, progress: 16, ballRetentionOnFail: 0.05, goalChance: 0 },
  { id: 'k16', name: 'Recomeço Lento', emoji: '🐢', category: 'KICKOFF', description: 'Posse patiente, espera o adversário errar.', dc: 6,  skillBonus: 4, progress: 4,  ballRetentionOnFail: 0.5, goalChance: 0 },
]

// =====================================================================
// PASSES (PASS) — 20 ações
// =====================================================================
const PASS_ACTIONS: FootballAction[] = [
  { id: 'p01', name: 'Passe Rasteiro', emoji: '⚽', category: 'PASS', description: 'Passe rasteiro preciso, no chão.', dc: 8,  skillBonus: 4, progress: 10, ballRetentionOnFail: 0.3, goalChance: 0 },
  { id: 'p02', name: 'Passe Alto', emoji: '🎈', category: 'PASS', description: 'Passe alto por cima da zaga.', dc: 14, skillBonus: 2, progress: 18, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'p03', name: 'Passe em Profundidade', emoji: '📏', category: 'PASS', description: 'Bola na corrida do atacante.', dc: 13, skillBonus: 2, progress: 22, ballRetentionOnFail: 0.15, goalChance: 0 },
  { id: 'p04', name: 'Passe de Bico', emoji: '🦶', category: 'PASS', description: 'Passe de bico, efeito curto.', dc: 12, skillBonus: 3, progress: 12, ballRetentionOnFail: 0.2, goalChance: 0 },
  { id: 'p05', name: 'Passe de Calcanhar', emoji: '👠', category: 'PASS', description: 'Passe de calcanhar, estilo puro.', dc: 17, skillBonus: 1, progress: 14, ballRetentionOnFail: 0.05, goalChance: 0 },
  { id: 'p06', name: 'Passe Longo', emoji: '🚀', category: 'PASS', description: 'Passe de 40m, troca de lado.', dc: 14, skillBonus: 2, progress: 20, ballRetentionOnFail: 0.15, goalChance: 0 },
  { id: 'p07', name: 'Passe de Coxa', emoji: '🦵', category: 'PASS', description: 'Domina com a coxa e passa.', dc: 11, skillBonus: 3, progress: 10, ballRetentionOnFail: 0.25, goalChance: 0 },
  { id: 'p08', name: 'Passe de Peito', emoji: '💪', category: 'PASS', description: 'Domina no peito e descarrega.', dc: 13, skillBonus: 2, progress: 12, ballRetentionOnFail: 0.2, goalChance: 0 },
  { id: 'p09', name: 'Passe de Cabeça', emoji: '🧠', category: 'PASS', description: 'Cabeçada branca para o colega.', dc: 13, skillBonus: 2, progress: 14, ballRetentionOnFail: 0.15, goalChance: 0 },
  { id: 'p10', name: 'Tabela Perfeita', emoji: '🔗', category: 'PASS', description: 'Tabela 1-2 com o companheiro.', dc: 14, skillBonus: 2, progress: 22, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'p11', name: 'Passe entre Linhas', emoji: '⚡', category: 'PASS', description: 'Passe no espaço entre zaga e meio.', dc: 15, skillBonus: 1, progress: 24, ballRetentionOnFail: 0.05, goalChance: 0 },
  { id: 'p12', name: 'Lançamento 40m', emoji: '🎯', category: 'PASS', description: 'Lançamento longo para o ataque.', dc: 16, skillBonus: 1, progress: 30, ballRetentionOnFail: 0.05, goalChance: 0 },
  { id: 'p13', name: 'Passe de Primeira', emoji: '1️⃣', category: 'PASS', description: 'Passe de primeira, sem dominar.', dc: 14, skillBonus: 2, progress: 16, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'p14', name: 'Inversão Diagonal', emoji: '📐', category: 'PASS', description: 'Passe diagonal longo, troca de lado.', dc: 14, skillBonus: 2, progress: 18, ballRetentionOnFail: 0.15, goalChance: 0 },
  { id: 'p15', name: 'Passe de Canivete', emoji: '🦶', category: 'PASS', description: 'Passe de canivete, surpreendente.', dc: 16, skillBonus: 1, progress: 14, ballRetentionOnFail: 0.05, goalChance: 0 },
  { id: 'p16', name: 'Repassar pra Trás', emoji: '↩️', category: 'PASS', description: 'Bola para trás, recompor jogada.', dc: 6,  skillBonus: 5, progress: 0,  ballRetentionOnFail: 0.5, goalChance: 0 },
  { id: 'p17', name: 'Passe Filigrado', emoji: '✨', category: 'PASS', description: 'Passe com efeito, mata a zaga.', dc: 16, skillBonus: 1, progress: 22, ballRetentionOnFail: 0.05, goalChance: 0 },
  { id: 'p18', name: 'Passe Veloz', emoji: '💨', category: 'PASS', description: 'Passe muito rápido, pega defesa desprevenida.', dc: 13, skillBonus: 2, progress: 18, ballRetentionOnFail: 0.15, goalChance: 0 },
  { id: 'p19', name: 'Triângulo Curto', emoji: '🔺', category: 'PASS', description: 'Triângulo curto de passes no meio.', dc: 11, skillBonus: 3, progress: 12, ballRetentionOnFail: 0.25, goalChance: 0 },
  { id: 'p20', name: 'Toca pra Saída', emoji: '🚪', category: 'PASS', description: 'Toca pro lado pra sair da pressão.', dc: 9,  skillBonus: 4, progress: 6,  ballRetentionOnFail: 0.4, goalChance: 0 },
]

// =====================================================================
// DRIBLES (DRIBBLE) — 20 ações
// =====================================================================
const DRIBBLE_ACTIONS: FootballAction[] = [
  { id: 'd01', name: 'Elastico', emoji: '🐍', category: 'DRIBBLE', description: 'O clássico elástico do Ronaldo.', dc: 16, skillBonus: 1, progress: 18, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'd02', name: 'Pedalada', emoji: '🚴', category: 'DRIBBLE', description: 'Pedaladas, estilo Cristiano.', dc: 14, skillBonus: 2, progress: 16, ballRetentionOnFail: 0.15, goalChance: 0 },
  { id: 'd03', name: 'Drible do Corpo', emoji: '🕺', category: 'DRIBBLE', description: 'Finta de corpo para um lado, vai pro outro.', dc: 13, skillBonus: 2, progress: 14, ballRetentionOnFail: 0.2, goalChance: 0 },
  { id: 'd04', name: 'Nutmeg', emoji: '🦵', category: 'DRIBBLE', description: 'Passe entre as pernas do marcador.', dc: 17, skillBonus: 0, progress: 20, ballRetentionOnFail: 0.05, goalChance: 0 },
  { id: 'd05', name: 'Corte Rápido', emoji: '✂️', category: 'DRIBBLE', description: 'Corte seco, muda de direção.', dc: 13, skillBonus: 2, progress: 14, ballRetentionOnFail: 0.2, goalChance: 0 },
  { id: 'd06', name: 'Gambeta', emoji: '💃', category: 'DRIBBLE', description: 'Gambeta argentina, encara e vai.', dc: 15, skillBonus: 1, progress: 16, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'd07', name: 'Roulette', emoji: '🎡', category: 'DRIBBLE', description: 'Roda-a-roleta, estilo Zidane.', dc: 16, skillBonus: 1, progress: 18, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'd08', name: 'Step Over', emoji: '💫', category: 'DRIBBLE', description: 'Pedalada sem tocar a bola.', dc: 13, skillBonus: 2, progress: 14, ballRetentionOnFail: 0.2, goalChance: 0 },
  { id: 'd09', name: 'Cruyff Turn', emoji: '🔄', category: 'DRIBBLE', description: 'Giro Cruyff, elegante e mortal.', dc: 15, skillBonus: 1, progress: 16, ballRetentionOnFail: 0.15, goalChance: 0 },
  { id: 'd10', name: 'Pivô e Giro', emoji: '⚙️', category: 'DRIBBLE', description: 'Pivoteia e gira atrás do zagueiro.', dc: 14, skillBonus: 2, progress: 15, ballRetentionOnFail: 0.15, goalChance: 0 },
  { id: 'd11', name: 'Finta de Passe', emoji: '🤝', category: 'DRIBBLE', description: 'Finge passar e corta pra dentro.', dc: 15, skillBonus: 1, progress: 16, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'd12', name: 'Arrancada Veloz', emoji: '⚡', category: 'DRIBBLE', description: 'Velocista, encara e dispara.', dc: 14, skillBonus: 2, progress: 22, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'd13', name: 'Drible de Costas', emoji: '🍑', category: 'DRIBBLE', description: 'De costas pra zaga, vira e vai.', dc: 15, skillBonus: 1, progress: 14, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'd14', name: 'Lançamento Pessoal', emoji: '🏃', category: 'DRIBBLE', description: 'Bola na frente, corre pra buscar.', dc: 16, skillBonus: 1, progress: 24, ballRetentionOnFail: 0.05, goalChance: 0 },
  { id: 'd15', name: 'Fintona Dupla', emoji: '🎭', category: 'DRIBBLE', description: 'Duas fintas seguidas, ousadia.', dc: 18, skillBonus: 0, progress: 18, ballRetentionOnFail: 0.05, goalChance: 0 },
  { id: 'd16', name: 'Corta-Luz', emoji: '✨', category: 'DRIBBLE', description: 'Corta pra dentro pra abrir espaço pro chute.', dc: 14, skillBonus: 2, progress: 18, ballRetentionOnFail: 0.15, goalChance: 0 },
  { id: 'd17', name: 'Toque de Placa', emoji: '🪙', category: 'DRIBBLE', description: 'Deixa a bola passar, contorna o marcador.', dc: 16, skillBonus: 1, progress: 16, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'd18', name: 'Encosta e Sai', emoji: '👻', category: 'DRIBBLE', description: 'Encosta no marcador, sai pelo outro lado.', dc: 15, skillBonus: 1, progress: 14, ballRetentionOnFail: 0.15, goalChance: 0 },
  { id: 'd19', name: 'Bicuda pra Frente', emoji: '🦵', category: 'DRIBBLE', description: 'Bicudão pra frente e corre.', dc: 13, skillBonus: 2, progress: 18, ballRetentionOnFail: 0.2, goalChance: 0 },
  { id: 'd20', name: 'Giro 360°', emoji: '🔄', category: 'DRIBBLE', description: 'Giro completo pra fugir do marcador.', dc: 16, skillBonus: 1, progress: 14, ballRetentionOnFail: 0.1, goalChance: 0 },
]

// =====================================================================
// CHUTES (SHOOT) — 16 ações
// =====================================================================
const SHOOT_ACTIONS: FootballAction[] = [
  { id: 's01', name: 'Chute Cruzado', emoji: '🥅', category: 'SHOOT', description: 'Chute cruzado rasteiro, canto oposto.', dc: 14, skillBonus: 2, progress: 50, ballRetentionOnFail: 0, goalChance: 0.6 },
  { id: 's02', name: 'Chute Colocado', emoji: '🎯', category: 'SHOOT', description: 'Colocado no ângulo, accuracy máxima.', dc: 16, skillBonus: 1, progress: 60, ballRetentionOnFail: 0, goalChance: 0.7 },
  { id: 's03', name: 'Chute Forte', emoji: '💥', category: 'SHOOT', description: 'Pancada seca, o goleiro nem vê.', dc: 17, skillBonus: 0, progress: 65, ballRetentionOnFail: 0, goalChance: 0.65 },
  { id: 's04', name: 'Cobertura', emoji: '🎈', category: 'SHOOT', description: 'Cobre o goleiro, estilo Tchê Tchê.', dc: 18, skillBonus: 0, progress: 70, ballRetentionOnFail: 0, goalChance: 0.55 },
  { id: 's05', name: 'Falta Direto', emoji: '🚀', category: 'SHOOT', description: 'Bate direto da falta, muralha.', dc: 18, skillBonus: 0, progress: 75, ballRetentionOnFail: 0, goalChance: 0.7 },
  { id: 's06', name: 'Voleio', emoji: '⚡', category: 'SHOOT', description: 'Voleio espetacular, de primeira.', dc: 19, skillBonus: -1, progress: 75, ballRetentionOnFail: 0, goalChance: 0.6 },
  { id: 's07', name: 'Bicicleta', emoji: '🚲', category: 'SHOOT', description: 'Bicicleta espetacular! Perigosa.', dc: 20, skillBonus: -2, progress: 85, ballRetentionOnFail: 0, goalChance: 0.5 },
  { id: 's08', name: 'Cabeceada', emoji: '🧠', category: 'SHOOT', description: 'Cabeçada forte após cruzamento.', dc: 15, skillBonus: 1, progress: 60, ballRetentionOnFail: 0, goalChance: 0.65 },
  { id: 's09', name: 'Chute de Canivete', emoji: '🦶', category: 'SHOOT', description: 'Canivete, efeito inesperado.', dc: 17, skillBonus: 0, progress: 60, ballRetentionOnFail: 0, goalChance: 0.6 },
  { id: 's10', name: 'Contra-Ataque', emoji: '⚡', category: 'SHOOT', description: 'Contra-ataque mortal e veloz.', dc: 15, skillBonus: 1, progress: 65, ballRetentionOnFail: 0, goalChance: 0.7 },
  { id: 's11', name: 'Finalização no Canto', emoji: '🎯', category: 'SHOOT', description: 'Bola no cantinho, placar.', dc: 17, skillBonus: 0, progress: 70, ballRetentionOnFail: 0, goalChance: 0.75 },
  { id: 's12', name: 'Pênalti', emoji: '⚪', category: 'SHOOT', description: 'Pênalti bem cobrado, decisivo.', dc: 13, skillBonus: 2, progress: 70, ballRetentionOnFail: 0, goalChance: 0.85 },
  { id: 's13', name: 'Chute de Longe', emoji: '🚀', category: 'SHOOT', description: 'Chutaço de fora da área.', dc: 18, skillBonus: 0, progress: 55, ballRetentionOnFail: 0, goalChance: 0.4 },
  { id: 's14', name: 'Toque de Bolinha', emoji: '⚽', category: 'SHOOT', description: 'Toque por cima do goleiro que saiu.', dc: 16, skillBonus: 1, progress: 65, ballRetentionOnFail: 0, goalChance: 0.6 },
  { id: 's15', name: 'Chute no Ângulo', emoji: '📐', category: 'SHOOT', description: 'No ângulo, quase indefensável.', dc: 19, skillBonus: -1, progress: 80, ballRetentionOnFail: 0, goalChance: 0.8 },
  { id: 's16', name: 'Cabeçada de Cabeçada', emoji: '🧠', category: 'SHOOT', description: 'Rebate de cabeça na bola solta.', dc: 16, skillBonus: 0, progress: 60, ballRetentionOnFail: 0, goalChance: 0.55 },
]

// =====================================================================
// DEFESAS (DEFEND) — 16 ações
// =====================================================================
const DEFEND_ACTIONS: FootballAction[] = [
  { id: 'f01', name: 'Carrinho', emoji: '🛷', category: 'DEFEND', description: 'Carrinho bemtimido pra interceptar.', dc: 14, skillBonus: 2, progress: 12, ballRetentionOnFail: 0.2, goalChance: 0 },
  { id: 'f02', name: 'Dividida de Cabeça', emoji: '💥', category: 'DEFEND', description: 'Dividida dura no meio-campo.', dc: 13, skillBonus: 2, progress: 10, ballRetentionOnFail: 0.25, goalChance: 0 },
  { id: 'f03', name: 'Interceptação', emoji: '🛡️', category: 'DEFEND', description: 'Antecipa e intercepta o passe.', dc: 15, skillBonus: 1, progress: 14, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'f04', name: 'Marcação Pressão', emoji: '🔥', category: 'DEFEND', description: 'Pressão alta, sufoca o adversário.', dc: 14, skillBonus: 2, progress: 8,  ballRetentionOnFail: 0.2, goalChance: 0 },
  { id: 'f05', name: 'Zagueiro na Bola', emoji: '🧱', category: 'DEFEND', description: 'Zagueiro afasta a bola com segurança.', dc: 10, skillBonus: 3, progress: 6,  ballRetentionOnFail: 0.4, goalChance: 0 },
  { id: 'f06', name: 'Defesa do Goleiro', emoji: '🧤', category: 'DEFEND', description: 'Goleiro defende com tranquilidade.', dc: 12, skillBonus: 3, progress: 4,  ballRetentionOnFail: 0.5, goalChance: 0 },
  { id: 'f07', name: 'Rebote no Zagueiro', emoji: '🏐', category: 'DEFEND', description: 'Rebote sobra pro zagueiro, afasta.', dc: 11, skillBonus: 3, progress: 8,  ballRetentionOnFail: 0.35, goalChance: 0 },
  { id: 'f08', name: 'Corte de Passe', emoji: '✂️', category: 'DEFEND', description: 'Corta o passe no meio, inverte.', dc: 13, skillBonus: 2, progress: 14, ballRetentionOnFail: 0.2, goalChance: 0 },
  { id: 'f09', name: 'Roubo de Bola', emoji: '⚽', category: 'DEFEND', description: 'Rouba a bola com categoria.', dc: 15, skillBonus: 1, progress: 16, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'f10', name: 'Falta Tática', emoji: '🛑', category: 'DEFEND', description: 'Falta tática para frear o ataque.', dc: 9,  skillBonus: 4, progress: 0,  ballRetentionOnFail: 0.5, goalChance: 0 },
  { id: 'f11', name: 'Impedimento', emoji: '🚫', category: 'DEFEND', description: 'Arma o impedimento, pega o ataque.', dc: 14, skillBonus: 2, progress: 10, ballRetentionOnFail: 0.15, goalChance: 0 },
  { id: 'f12', name: 'Carrinho Defensivo', emoji: '🛡️', category: 'DEFEND', description: 'Carrinho pra tirar a bola.', dc: 14, skillBonus: 2, progress: 12, ballRetentionOnFail: 0.2, goalChance: 0 },
  { id: 'f13', name: 'Marcação Dupla', emoji: '👥', category: 'DEFEND', description: 'Dois marcadores no atacante.', dc: 12, skillBonus: 3, progress: 8,  ballRetentionOnFail: 0.35, goalChance: 0 },
  { id: 'f14', name: 'Saída do Goleiro', emoji: '🥅', category: 'DEFEND', description: 'Goleiro sai da área, corta o lance.', dc: 13, skillBonus: 2, progress: 6,  ballRetentionOnFail: 0.25, goalChance: 0 },
  { id: 'f15', name: 'Espalmada', emoji: '🧤', category: 'DEFEND', description: 'Goleiro espalma pra escanteio.', dc: 14, skillBonus: 2, progress: 0,  ballRetentionOnFail: 0.3, goalChance: 0 },
  { id: 'f16', name: 'Defesa no Canto', emoji: '🛡️', category: 'DEFEND', description: 'Goleiro voa no canto e defende.', dc: 16, skillBonus: 1, progress: 0,  ballRetentionOnFail: 0.2, goalChance: 0 },
]

// =====================================================================
// ESPECIAIS (SPECIAL) — 16 ações
// =====================================================================
const SPECIAL_ACTIONS: FootballAction[] = [
  { id: 'x01', name: 'Bola Parada Mágica', emoji: '✨', category: 'SPECIAL', description: 'Bola parada treinada, gol na certa.', dc: 17, skillBonus: 0, progress: 60, ballRetentionOnFail: 0, goalChance: 0.75 },
  { id: 'x02', name: 'Contra-Ataque Mortal', emoji: '⚡', category: 'SPECIAL', description: 'Contra-ataque relâmpago 3 contra 2.', dc: 16, skillBonus: 1, progress: 50, ballRetentionOnFail: 0.05, goalChance: 0.7 },
  { id: 'x03', name: 'Pressão Alta', emoji: '🔥', category: 'SPECIAL', description: 'Pressão total, recupera no campo de ataque.', dc: 17, skillBonus: 0, progress: 25, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'x04', name: 'Catimba Tática', emoji: '🎭', category: 'SPECIAL', description: 'Catimba, ganha tempo e atrapalha.', dc: 10, skillBonus: 4, progress: 0,  ballRetentionOnFail: 0.5, goalChance: 0 },
  { id: 'x05', name: 'Tática do Treinador', emoji: '📋', category: 'SPECIAL', description: 'Tática treinada, surpreende.', dc: 13, skillBonus: 2, progress: 18, ballRetentionOnFail: 0.2, goalChance: 0 },
  { id: 'x06', name: 'Drible Inspirado', emoji: '💫', category: 'SPECIAL', description: 'Jogador iluminado, drible mágico.', dc: 14, skillBonus: 2, progress: 22, ballRetentionOnFail: 0.1, goalChance: 0 },
  { id: 'x07', name: 'Passe Mágico', emoji: '🪄', category: 'SPECIAL', description: 'Passe impossível que vira gol.', dc: 18, skillBonus: 0, progress: 35, ballRetentionOnFail: 0.05, goalChance: 0.3 },
  { id: 'x08', name: 'Vibe da Torcida', emoji: '📣', category: 'SPECIAL', description: 'Torcida empurra, ganha moral.', dc: 9,  skillBonus: 4, progress: 8,  ballRetentionOnFail: 0.45, goalChance: 0 },
  { id: 'x09', name: 'Estratégia do Mestre', emoji: '🧙', category: 'SPECIAL', description: 'Estratégia secreta do D&D: bônus +3.', dc: 11, skillBonus: 6, progress: 14, ballRetentionOnFail: 0.3, goalChance: 0 },
  { id: 'x10', name: ' Inspiração Divina', emoji: '⭐', category: 'SPECIAL', description: 'Inspiração divina: jogue 2d20, fique com o maior.', dc: 12, skillBonus: 5, progress: 16, ballRetentionOnFail: 0.25, goalChance: 0 },
  { id: 'x11', name: 'Gol Olímpico', emoji: '🏆', category: 'SPECIAL', description: 'Cobrança direto pro gol, olímpico!', dc: 19, skillBonus: -1, progress: 80, ballRetentionOnFail: 0, goalChance: 0.55 },
  { id: 'x12', name: 'Cabeçada Espectral', emoji: '👻', category: 'SPECIAL', description: 'Cabeçada que ninguém vê, surge do nada.', dc: 17, skillBonus: 0, progress: 65, ballRetentionOnFail: 0, goalChance: 0.6 },
  { id: 'x13', name: 'Passe Quântico', emoji: '🌀', category: 'SPECIAL', description: 'A bola existe e não existe ao mesmo tempo.', dc: 19, skillBonus: -1, progress: 28, ballRetentionOnFail: 0.05, goalChance: 0 },
  { id: 'x14', name: 'Bola Maldita', emoji: '😈', category: 'SPECIAL', description: 'Bola amaldiçoada: -2 pro goleiro adversário.', dc: 15, skillBonus: 2, progress: 55, ballRetentionOnFail: 0, goalChance: 0.65 },
  { id: 'x15', name: 'Elixir do Atleta', emoji: '🧪', category: 'SPECIAL', description: 'Poção rara: +3 em todas as jogadas por 3 turnos.', dc: 10, skillBonus: 5, progress: 10, ballRetentionOnFail: 0.4, goalChance: 0 },
  { id: 'x16', name: 'Maldição do Zagueiro', emoji: '💀', category: 'SPECIAL', description: 'Maldição: zagueiro adversário tropeça sozinho.', dc: 14, skillBonus: 2, progress: 30, ballRetentionOnFail: 0.05, goalChance: 0 },
]

// =====================================================================
// COBRANÇA DE FALTA (FREE_KICK) — 35 ações (só aparecem na cobrança)
// =====================================================================
const FREE_KICK_ACTIONS: FootballAction[] = [
  { id: 'fk01', name: 'Chute Direto no Gol', emoji: '🚀', category: 'FREE_KICK', description: 'Bate direto, sem cerimônia. Força total!', dc: 16, skillBonus: 1, progress: 55, ballRetentionOnFail: 0, goalChance: 0.7 },
  { id: 'fk02', name: 'Chute por Baixo da Barreira', emoji: '🐍', category: 'FREE_KICK', description: 'Rasteiro por baixo da barreira que pulou!', dc: 18, skillBonus: 0, progress: 60, ballRetentionOnFail: 0, goalChance: 0.65 },
  { id: 'fk03', name: 'Efeito Juninho', emoji: '🌀', category: 'FREE_KICK', description: 'Bola com efeito mortal, estilo Juninho Pernambucano.', dc: 17, skillBonus: 1, progress: 65, ballRetentionOnFail: 0, goalChance: 0.75 },
  { id: 'fk04', name: 'Cruzamento na Área', emoji: '✝️', category: 'FREE_KICK', description: 'Cruza na cabeça do atacante.', dc: 12, skillBonus: 3, progress: 30, ballRetentionOnFail: 0.2, goalChance: 0.3 },
  { id: 'fk05', name: 'Passe Rasteiro Lateral', emoji: '➡️', category: 'FREE_KICK', description: 'Toque pro lateral correr e cruzar.', dc: 10, skillBonus: 4, progress: 15, ballRetentionOnFail: 0.3, goalChance: 0 },
  { id: 'fk06', name: 'Bomba no Ângulo', emoji: '💥', category: 'FREE_KICK', description: 'Bomba no ângulo, goleiro nem voa.', dc: 19, skillBonus: -1, progress: 70, ballRetentionOnFail: 0, goalChance: 0.8 },
  { id: 'fk07', name: 'Toca e Volta', emoji: '🔄', category: 'FREE_KICK', description: 'Toca pro companheiro, recebe de volta e chuta.', dc: 15, skillBonus: 2, progress: 40, ballRetentionOnFail: 0.15, goalChance: 0.5 },
  { id: 'fk08', name: 'Chute Colocado Canto Esquerdo', emoji: '🎯', category: 'FREE_KICK', description: 'Colocado no canto esquerdo do goleiro.', dc: 16, skillBonus: 1, progress: 58, ballRetentionOnFail: 0, goalChance: 0.7 },
  { id: 'fk09', name: 'Chute Colocado Canto Direito', emoji: '🎯', category: 'FREE_KICK', description: 'Colocado no canto direito do goleiro.', dc: 16, skillBonus: 1, progress: 58, ballRetentionOnFail: 0, goalChance: 0.7 },
  { id: 'fk10', name: 'Barreira Pula, Rasteiro!', emoji: '🦎', category: 'FREE_KICK', description: 'Aproveita que a barreira pulou e bate rasteiro.', dc: 17, skillBonus: 0, progress: 62, ballRetentionOnFail: 0, goalChance: 0.65 },
  { id: 'fk11', name: 'Cavadinha', emoji: '🎪', category: 'FREE_KICK', description: 'Cavadinha por cima da barreira, estilo Messi.', dc: 18, skillBonus: 0, progress: 60, ballRetentionOnFail: 0, goalChance: 0.7 },
  { id: 'fk12', name: 'Cruzamento Fechado', emoji: '📐', category: 'FREE_KICK', description: 'Cruzamento fechado, bola venenosa na área.', dc: 13, skillBonus: 2, progress: 25, ballRetentionOnFail: 0.25, goalChance: 0.25 },
  { id: 'fk13', name: 'Lançamento Longo', emoji: '📏', category: 'FREE_KICK', description: 'Lança pro atacante na ponta oposta.', dc: 14, skillBonus: 2, progress: 20, ballRetentionOnFail: 0.2, goalChance: 0 },
  { id: 'fk14', name: 'Finta e Chute', emoji: '🎭', category: 'FREE_KICK', description: 'Finta que vai cruzar, mas chuta direto!', dc: 16, skillBonus: 1, progress: 55, ballRetentionOnFail: 0, goalChance: 0.6 },
  { id: 'fk15', name: 'Passe na Área para Voleio', emoji: '⚡', category: 'FREE_KICK', description: 'Toca na área pro companheiro bater de voleio.', dc: 15, skillBonus: 2, progress: 45, ballRetentionOnFail: 0.1, goalChance: 0.55 },
  { id: 'fk16', name: 'Bola Parada Treinada A', emoji: '📋', category: 'FREE_KICK', description: 'Jogada treinada: simula chute, passa pro lado.', dc: 13, skillBonus: 3, progress: 35, ballRetentionOnFail: 0.15, goalChance: 0.4 },
  { id: 'fk17', name: 'Bola Parada Treinada B', emoji: '📋', category: 'FREE_KICK', description: 'Jogada treinada: um passa, outro chuta colocado.', dc: 14, skillBonus: 2, progress: 50, ballRetentionOnFail: 0.1, goalChance: 0.65 },
  { id: 'fk18', name: 'Bola Parada Treinada C', emoji: '📋', category: 'FREE_KICK', description: 'Treinada: dois toques, chute cruzado.', dc: 14, skillBonus: 2, progress: 48, ballRetentionOnFail: 0.12, goalChance: 0.6 },
  { id: 'fk19', name: 'Cabeceada após Cruzamento', emoji: '🧠', category: 'FREE_KICK', description: 'Cruza e o atacante cabeceia com força.', dc: 14, skillBonus: 2, progress: 42, ballRetentionOnFail: 0.15, goalChance: 0.5 },
  { id: 'fk20', name: 'Chute Forte Meio Alto', emoji: '💥', category: 'FREE_KICK', description: 'Meio alto, força bruta, goleiro pra um lado.', dc: 17, skillBonus: 0, progress: 55, ballRetentionOnFail: 0, goalChance: 0.6 },
  { id: 'fk21', name: 'Efeito Roberto Carlos', emoji: '🌪️', category: 'FREE_KICK', description: 'Efeito absurdo, bola curva 90 graus!', dc: 20, skillBonus: -2, progress: 75, ballRetentionOnFail: 0, goalChance: 0.85 },
  { id: 'fk22', name: 'Passe Curto Inesperado', emoji: '🤫', category: 'FREE_KICK', description: 'Passe curto surpresa, a barreira espera chute.', dc: 11, skillBonus: 3, progress: 18, ballRetentionOnFail: 0.35, goalChance: 0 },
  { id: 'fk23', name: 'Cruzamento com Desvio', emoji: '↗️', category: 'FREE_KICK', description: 'Cruza com desvio no zagueiro, bola morre na área.', dc: 13, skillBonus: 2, progress: 28, ballRetentionOnFail: 0.2, goalChance: 0.3 },
  { id: 'fk24', name: 'Chute por Cima da Barreira', emoji: '⛰️', category: 'FREE_KICK', description: 'Por cima da barreira, cai morto no gol.', dc: 18, skillBonus: 0, progress: 62, ballRetentionOnFail: 0, goalChance: 0.7 },
  { id: 'fk25', name: 'Tabela na Barreira', emoji: '🔗', category: 'FREE_KICK', description: 'Toca pro lado da barreira, recebe e chuta.', dc: 15, skillBonus: 2, progress: 42, ballRetentionOnFail: 0.1, goalChance: 0.55 },
  { id: 'fk26', name: 'Pênalti Indireto', emoji: '⚠️', category: 'FREE_KICK', description: 'Falta indireta: toca e chuta sem tocar 2x.', dc: 15, skillBonus: 2, progress: 45, ballRetentionOnFail: 0.1, goalChance: 0.5 },
  { id: 'fk27', name: 'Chute no Cantinho', emoji: '📐', category: 'FREE_KICK', description: 'No cantinho, cirurgia precisa.', dc: 19, skillBonus: -1, progress: 65, ballRetentionOnFail: 0, goalChance: 0.8 },
  { id: 'fk28', name: 'Muralha Humana X', emoji: '🧱', category: 'FREE_KICK', description: 'Jogada ousada: esconde atrás da barreira e aparece!', dc: 16, skillBonus: 1, progress: 50, ballRetentionOnFail: 0.05, goalChance: 0.6 },
  { id: 'fk29', name: 'Chute de Canivete', emoji: '🦶', category: 'FREE_KICK', description: 'De canivete, efeito inesperado na falta.', dc: 17, skillBonus: 0, progress: 55, ballRetentionOnFail: 0, goalChance: 0.6 },
  { id: 'fk30', name: 'Lançamento para Contra-Ataque', emoji: '⚡', category: 'FREE_KICK', description: 'Em vez de chutar, lança pro veloz que parte pro gol.', dc: 14, skillBonus: 2, progress: 35, ballRetentionOnFail: 0.15, goalChance: 0.35 },
  { id: 'fk31', name: 'Bicuda sem Querer', emoji: '😅', category: 'FREE_KICK', description: 'Escorrega e bate sem querer... mas vai com perigo!', dc: 15, skillBonus: 1, progress: 40, ballRetentionOnFail: 0.1, goalChance: 0.45 },
  { id: 'fk32', name: 'Falta de Calcanhar', emoji: '👠', category: 'FREE_KICK', description: 'Bate de calcanhar pra surpreender!', dc: 19, skillBonus: -1, progress: 55, ballRetentionOnFail: 0.05, goalChance: 0.55 },
  { id: 'fk33', name: 'Gol Olímpico na Falta', emoji: '🏆', category: 'FREE_KICK', description: 'Cobra direto, bola entra sem ninguém tocar!', dc: 20, skillBonus: -2, progress: 80, ballRetentionOnFail: 0, goalChance: 0.85 },
  { id: 'fk34', name: 'Esconde e Chuta', emoji: '🤫', category: 'FREE_KICK', description: 'Simula que vai passar, chuta de surpresa!', dc: 16, skillBonus: 1, progress: 52, ballRetentionOnFail: 0.05, goalChance: 0.65 },
  { id: 'fk35', name: 'Chute Trivela', emoji: '🦶', category: 'FREE_KICK', description: 'Trivela, efeito absurdo pra fora pra dentro.', dc: 17, skillBonus: 0, progress: 58, ballRetentionOnFail: 0, goalChance: 0.7 },
]

// =====================================================================
// TODAS AS AÇÕES
// =====================================================================
export const ALL_ACTIONS: FootballAction[] = [
  ...KICKOFF_ACTIONS,
  ...PASS_ACTIONS,
  ...DRIBBLE_ACTIONS,
  ...SHOOT_ACTIONS,
  ...DEFEND_ACTIONS,
  ...SPECIAL_ACTIONS,
  ...FREE_KICK_ACTIONS,
]

// Total: 16 + 20 + 20 + 16 + 16 + 16 + 35 = 139 ações

// =====================================================================
// Helpers
// =====================================================================

export function getActionsByCategory(category: ActionCategory): FootballAction[] {
  return ALL_ACTIONS.filter((a) => a.category === category)
}

// Sorteia N ações aleatórias de uma categoria sem repetição
export function sampleActions(category: ActionCategory, count: number): FootballAction[] {
  const pool = getActionsByCategory(category)
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, pool.length))
}

// Sorteia N ações aleatórias de TODAS as categorias (para turnos subsequentes)
export function sampleMixedActions(count: number): FootballAction[] {
  // Prioriza ações que fazem sentido no meio do jogo (não KICKOFF ou DEFEND)
  // DEFEND actions are reserved for the "Defensive Opportunity" phase only
  const pool = ALL_ACTIONS.filter((a) => a.category !== 'KICKOFF' && a.category !== 'DEFEND')
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, pool.length))
}

// Sorteia N jogadas de cobrança de falta (só aparecem na cobrança)
export function sampleFreeKickActions(count: number): FootballAction[] {
  const pool = getActionsByCategory('FREE_KICK')
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, pool.length))
}

export const CATEGORY_META: Record<ActionCategory, { label: string; color: string; emoji: string }> = {
  KICKOFF:  { label: 'Saída de Bola',    color: 'from-blue-500 to-blue-700',        emoji: '🥅' },
  PASS:     { label: 'Passe',            color: 'from-emerald-500 to-emerald-700',  emoji: '⚽' },
  DRIBBLE:  { label: 'Drible',           color: 'from-purple-500 to-purple-700',    emoji: '🐍' },
  SHOOT:    { label: 'Chute ao Gol',     color: 'from-rose-500 to-rose-700',        emoji: '🎯' },
  DEFEND:   { label: 'Defesa',           color: 'from-amber-500 to-amber-700',      emoji: '🛡️' },
  SPECIAL:  { label: 'Especial',         color: 'from-yellow-400 to-orange-600',    emoji: '✨' },
  FREE_KICK: { label: 'Cobrança de Falta', color: 'from-teal-500 to-teal-700',         emoji: '🎯' },
}
