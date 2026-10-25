---
Task ID: v3.2-main
Agent: Super Z (main)
Task: Fix free kick freeze, substitution bug, enhance XP system with match stats, add cards/injuries/availability UI, implement idempotent XP system with progression and rewards.

Work Log:
- Investigated existing code: free-kick-system.ts, player-match-state.ts, xp-system.ts, match-engine.ts, action/substitution/free-kick-resolve routes, MatchArena.tsx, FreeKickDialog.tsx, grant-xp-helper.ts, dnd-actions.ts, prisma/schema.prisma
- Identified root cause of free kick freeze: `pendingFreeKickInfo` state was declared in MatchArena but NEVER populated from action response data. The FreeKickDialog opened with null prop, returned null (invisible), and `processing=true` was never reset — game frozen.
- Identified root cause of substitution bug: `homeTeamStateJson` and `awayTeamStateJson` were initialized to `'{}'` at match creation, so `playerStates` was empty. `getPlayerStatus()` fell back to 'ACTIVE' for everyone (including reserves, which should be 'RESERVE').
- Verified free kick actions are already exclusive to FREE_KICK context (sampleMixedActions filters out FREE_KICK category) — no fix needed.

Fixes applied:
- MatchArena.tsx: Set `pendingFreeKickInfo` from `data.pendingFreeKick` in action response (fixes freeze)
- MatchArena.tsx: Reset `processing=false` when opening FreeKickDialog and SubstitutionModal (so user can interact)
- MatchArena.tsx: Clear `pendingFreeKickInfo` after free kick resolution
- MatchArena.tsx: Sync `pendingFreeKickInfo` from server state in `fetchMatchState` (for opponent polling)
- /api/match/create: Added `buildInitialTeamStateJson()` that hydrates `homeTeamStateJson` with proper playerStates (starters as ACTIVE, reserves as RESERVE) at match creation
- /api/match/join: Added same hydration for `awayTeamStateJson` when opponent joins
- /api/match/action: Added hydration fallback for legacy matches (created before v3.2)
- /api/match/free-kick-resolve: Same hydration fallback
- /api/match/substitution: Refactored to use shared `hydrateTeamStateFromUserId` helper
- New file: src/lib/team-state-hydration.ts (shared hydration helper)

XP System Enhancements:
- xp-system.ts: Added `computeTeamMatchStats()` function that extracts goals, cards, fouls, offsides, ball steals, goalkeeper saves from match events
- xp-system.ts: Extended `calculateMatchXp()` to accept `stats` field and apply bonuses/penalties:
  * +3 per goal (cap +15)
  * +2 per ball steal (cap +10)
  * +3 per goalkeeper save (cap +12)
  * +1 per foul suffered (cap +5)
  * -1 per yellow card (cap -6)
  * -3 per red card (cap -9)
  * -1 per offside (cap -3)
  * Floor at 0 (never negative)
- grant-xp-helper.ts: Now fetches match events and computes stats for both teams, passes to calculateMatchXp

New API Endpoints:
- GET /api/user/profile: Returns XP, level, progress, rewards, W/L/D stats, win rate
- GET /api/user/xp-history: Returns paginated XP grant history with summary

New UI Components:
- src/components/user/XpPanel.tsx: Full XP/level panel with progress bar, rewards, stats
- src/components/match/PlayerStatusBadge.tsx: Visual badge for player status (ACTIVE/RESERVE/INJURED/etc.)
- src/components/match/EventHistoryPanel.tsx: Rich event history with badges, colors, highlights

UI Integration:
- MatchArena.tsx: Added XpPanel to FINISHED phase (shows progress after match)
- MatchArena.tsx: Added xpGrantedInfo state with toast showing XP gained + level-up
- MatchArena.tsx: Replaced simple history list with EventHistoryPanel (richer UI with goal/crit/fail badges)
- TeamBuilderApp.tsx: Added XpPanel to sidebar (visible when user is logged in)

Tests:
- Added 10 new tests for computeTeamMatchStats and calculateMatchXp with stats
- All 154 tests pass (was 144 before)
- Lint: 0 errors, 2 pre-existing warnings

Verification:
- Dev server runs on port 3000 (HTTP 200)
- /api/user/profile returns full profile JSON correctly
- /api/user/xp-history returns history correctly
- Agent Browser confirmed XpPanel renders with all elements (level, XP, progress, rewards, stats)
- Page loads cleanly with no console errors

Stage Summary:
- CRITICAL: Free kick freeze FIXED (root cause: missing state propagation from action response to dialog)
- CRITICAL: Substitution bug FIXED (root cause: empty playerStates at match creation, fixed by hydrating at create/join time)
- XP system now incorporates match statistics (goals, cards, fouls, steals, saves, offsides)
- Idempotent XP granting preserved (XpGrant unique constraint + Match.xpGranted flag)
- New UI: XpPanel, PlayerStatusBadge, EventHistoryPanel components
- New API: /api/user/profile, /api/user/xp-history
- 154 tests pass, 0 lint errors

---
Task ID: v3.3-penalty-fixes
Agent: Super Z (main)
Task: Implementar Passos 4-12 do brief: pênalti exige falta na área, escolha de cobrador, bônus aleatórios, lesão definitiva, proteção no backend.

Work Log:
- Mapeou arquitetura: match-engine.ts (gera PenaltyEvent), free-kick-system.ts (multiplicador + cobrador), player-match-state.ts (máquina de estados), action/free-kick-resolve/substitution routes (orquestração), FreeKickDialog/SubstitutionModal/MatchArena (UI).
- Corrigido schema.prisma quebrado (`fields: omeUserId]` → `fields: [homeUserId]`, `@@index(omeUserId])` → `@@index([homeUserId])`). Prisma generate agora funciona.
- Atualizado next.config.ts com `turbopack.root` para corrigir erro "Turbopack Error: Next.js package not found".

Passo 4 (chute na marca do pênalti):
- src/lib/match-engine.ts: PENALTY_DESCRIPTIONS.PENALTY_KICK reescrito para incluir "marca do pênalti" em todas as 4 variantes.
- src/lib/dnd-actions.ts: Adicionado PENALTY_KICK_LABEL = 'Chute na marca do pênalti' e helper getCategoryLabelForContext(category, isPenaltyKick).
- src/lib/dnd-actions.ts: Adicionado sampleShootActions(count) para sortear jogadas de SHOOT em cobranças de pênalti.
- src/components/match/FreeKickDialog.tsx: Usa getCategoryLabelForContext para exibir "Chute na marca do pênalti" quando isPenaltyKick.

Passo 5 (pênalti só com falta na área):
- src/lib/match-engine.ts: PenaltyEvent ganhou campo `inPenaltyArea?: boolean`.
- src/lib/match-engine.ts: generatePenaltyEvent agora aceita `inPenaltyArea: boolean = false`. Quando false, qualquer sorteio de PENALTY_KICK é convertido em FOUL (falta comum). Quando true, pênalti pode ser sorteado normalmente.
- src/lib/match-engine.ts: applyActionToState calcula `inPenaltyArea` baseado no progresso de ataque do oponente (>= 75 = dentro da área penal) e passa para generatePenaltyEvent.
- src/app/api/match/action/route.ts: Defesa em profundidade — se PENALTY_KICK chegar sem `inPenaltyArea=true`, converte para FOUL com log de aviso.
- src/app/api/match/free-kick-resolve/route.ts: Defesa em profundidade — se pending for PENALTY_KICK sem `inPenaltyArea=true`, aborta cobrança e limpa pending.

Passo 6 (escolha do cobrador de pênalti):
- src/lib/free-kick-system.ts: PendingFreeKickState ganhou campo `takerSelectedByUser?: boolean`. Adicionadas funções isEligibleTaker(candidateIds, playerId) e setTakerByUser(pending, taker).
- Novo endpoint: src/app/api/match/penalty-taker-select/route.ts (POST + GET). Valida autenticação, participação, que é pênalti, que usuário é o favorecido, e que takerPlayerId é elegível (status ACTIVE). Persiste com optimistic concurrency.
- src/components/match/FreeKickDialog.tsx: Adicionada fase de seleção de cobrador. Props novas: eligibleTakers, onSelectTaker, selectingTaker. Mostra lista de jogadores ativos em campo; usuário clica para escolher.
- src/components/match/MatchArena.tsx: Adicionado estado penaltyEligibleTakers e selectingTaker. useEffect busca /api/match/penalty-taker-select quando FreeKickDialog abre para pênalti. handleSelectPenaltyTaker chama o endpoint POST.
- src/components/match/MatchArena.tsx: FreeKickDialog renderizado com os novos props.

Passo 7-8 (bônus aleatórios não fixos):
- Verificado que generateFreeKickMultiplier já é aleatório (weightedPick de -4 a +5, três targets). Nenhuma vantagem fixa por jogador.
- pickFreeKickTaker usa pesos por posição (FW > MF > DF > GK) — isto é uma regra de jogo, não uma vantagem permanente de jogador específico.
- Bônus varia entre partidas e entre jogadas (gerado fresh em cada assignFreeKick).
- Testes adicionados garantem que nenhum valor aparece em >50% das chamadas.

Passo 9 (aleatoriedade no servidor):
- assignFreeKick e generateFreeKickMultiplier são chamados APENAS em API routes (/api/match/action e /api/match/penalty-taker-select). Nunca no cliente.
- O multiplicador é persistido em pendingPenaltyEventJson e nunca muda após a geração (consistência após reload).
- free-kick-resolve rola o d20 no servidor e aplica o multiplicador persistido.

Passo 10-11 (lesão + substituição remove jogador):
- src/components/match/MatchArena.tsx: activeStarters agora usa getPlayerStatus granular (filtra por status ACTIVE). Antes filtrava apenas por sentOffPlayers e injuredPlayers — não checava SUBSTITUTED ou UNAVAILABLE.
- Agora jogadores lesionados, substituídos, expulsos e indisponíveis NÃO aparecem em activeStarters, logo não podem ser alvo de ações nem aparecer como disponíveis.

Passo 12 (proteção no backend):
- /api/match/action: PENALTY_KICK sem inPenaltyArea=true → convertido em FOUL.
- /api/match/free-kick-resolve: PENALTY_KICK sem inPenaltyArea=true → cobrança abortada, pending limpo.
- /api/match/penalty-taker-select: Valida que takerPlayerId está na lista de candidatos ACTIVE. Rejeita jogadores lesionados, substituídos, expulsos, indisponíveis, reservas não-entrados.
- Todos os endpoints validam autenticação, participação, e usam optimistic concurrency via campo `version`.

Passo 13 (schema do banco):
- Nenhuma alteração de schema necessária. `inPenaltyArea` é armazenado dentro do JSON `eventsJson` e `pendingPenaltyEventJson`, não como coluna separada. Compatível com partidas existentes (campo opcional).

Passo 15 (testes):
- Novo arquivo: src/lib/__tests__/penalty-rules.test.ts com 39 testes cobrindo Passos 4-12.
- Total: 193 testes passando (154 existentes + 39 novos).
- Cobertura: rótulo pênalti, falta na área, seleção de cobrador, bônus aleatório, persistência, lesão definitiva, defesa backend.

Passo 16 (verificações):
- Lint: 0 erros, 2 warnings pré-existentes (não introduzidos).
- Testes: 193/193 passando.
- Build de produção: ✓ bem-sucedido, todas as rotas compiladas (incluindo nova /api/match/penalty-taker-select).
- Dev server: ✓ HTTP 200 na home, sem erros no console.
- Agent Browser: registrou usuário, navegou na home — sem erros.

Stage Summary:
- Schema quebrado CORRIGIDO (fields: omeUserId] → fields: [homeUserId]).
- Pênalti agora EXIGE falta dentro da área (inPenaltyArea=true), validado em engine + 2 endpoints backend.
- Cobrador de pênalti pode ser ESCOLHIDO pelo usuário entre jogadores ativos em campo.
- Bônus são ALEATÓRIOS no servidor, nunca fixos, persistidos para consistência.
- Jogadores lesionados/substituídos são DEFINITIVAMENTE removidos das listas de titulares ativos.
- Rótulo "Chute na marca do pênalti" aparece em pênaltis (não "Chute ao Gol").
- 39 novos testes validam todas as regras. Total: 193 testes passando.
- Build de produção bem-sucedido. Aplicação roda sem erros no dev server.

---
Task ID: v3.4-db-players-fix
Agent: Super Z (main)
Task: Corrigir "busca e exibição de jogadores do banco não retorna dados" — diagnóstico completo em produção (https://dungeonnsoccer.vercel.app) e correção dos arquivos necessários.

Work Log:
- Diagnosticou produção ao vivo: /api/db/health revelou Match_read falhando ("inviteCode of expected non-nullable type String, found null") e /api/players/search retornando {thesportsdb: 0, local: 0}.
- CAUSA RAIZ 1: TheSportsDB desativou permanentemente a chave pública "3" (usada como fallback em 3 rotas). A API responde com texto de erro em vez de JSON, o código trata como zero resultados silenciosamente.
- CAUSA RAIZ 2: banco Neon tinha apenas 9 jogadores obscuros. O auto-seed antigo só rodava com a tabela 100% vazia, então o catálogo curado (114 jogadores) nunca era inserido.
- CAUSA RAIZ 3: auto-seed usava createMany({skipDuplicates: true}) — argumento NÃO suportado no provider SQLite do Prisma ("Unknown argument skipDuplicates"). Erro engolido pelo catch deixava o banco local vazio.
- CAUSA RAIZ 4: busca local usava mode:'insensitive' — argumento NÃO suportado no SQLite ("Unknown argument mode"). Em dev local, toda busca do banco falhava silenciosamente (retornava []).
- CAUSA RAIZ 5: schema declarava inviteCode String (não-nulo) mas o DDL do db-sync cria a coluna como TEXT nullable; registros legados com NULL quebravam TODAS as leituras da tabela Match em produção (list, state, action, join, health).

Fixes applied:
- NOVO src/lib/sportsdb.ts: getSportsDbKey() mapeia a chave morta "3"/vazia para a nova chave de testes "123" (fallback automático — o deploy volta a funcionar mesmo antes de atualizar a env var).
- /api/players/search, /api/players/stats, /api/players/ogol: usam sportsDbSearchUrl() do helper (chave resolvida centralizadamente).
- src/lib/db-sync.ts: auto-seed reescrito como sincronização por nome — 1 query busca nomes existentes, createMany insere APENAS os faltantes, sem skipDuplicates (compatível SQLite e Postgres, não-destrutivo, preenche bancos parciais como o de produção).
- prisma/schema.prisma: inviteCode String? @unique (nullable) — destrava leituras de registros legados sem alterar dados.
- NOVO src/lib/db-filters.ts: containsInsensitive() compatível com Postgres (mode:'insensitive') e SQLite (LIKE já é case-insensitive ASCII).
- /api/players/search: filtros contains via containsInsensitive() — busca local volta a funcionar em SQLite.
- /api/admin/players e /api/user/search: mesma correção (busca admin também era case-sensitive no Postgres de produção).
- /api/seed (POST): reescrito com a mesma lógica de sincronização por nome (insere faltantes, preserva existentes, responde com total inserted).
- players-data.ts: 'Everaldo' (Bahia) renomeado para 'Everaldo Soares' — havia nome duplicado com a lenda do Grêmio 1970, o que quebraria a sincronização por nome.
- .gitignore: adicionado .env e *.db (evita subir credenciais/banco no GitHub).
- .env.example: chave TheSportsDB documentada como "123" com aviso de que a "3" foi desativada; DATABASE_URL dev com caminho relativo file:./dev.db (testado).
- README.md: instruções de deploy e tabela de variáveis atualizadas para a nova chave.

Tests:
- NOVOS: sportsdb-key.test.ts (7), db-filters.test.ts (7), player-seed-sync.test.ts (6) — 20 testes novos cobrindo todas as causas raiz.
- Total: 213 testes passando (193 existentes + 20 novos).
- Lint: 0 erros (2 warnings pré-existentes não introduzidos).
- Build de produção: OK (next build com Turbopack).

Verification (produção local + servidor `next start`):
- /api/db/health: todas as tabelas OK (antes: Match_read falhando).
- /api/players/search?q=neymar: 2 resultados (local OVR 85 + TheSportsDB) — antes: 0.
- Busca por time (flamengo), por posição (pos=GK), com acento (pelé), maiúsculas (NEYMAR): todas OK.
- WORLD_CUP mode: exclui aposentados corretamente.
- POST /api/seed: idempotente (114 jogadores, inserted 0 na segunda chamada).
- Admin: login OK, /api/admin/players lista 114 com OVR, busca case-insensitive OK.
- Usuário: registro, login, /api/user/me, salvamento de time, criação de partida (inviteCode gerado) e listagem OK.
- Cenário legado: Match com inviteCode NULL inserido diretamente no banco é lido sem erro (testado via script dedicado).

Stage Summary:
- Busca de jogadores restaurada em AMBAS as fontes (externa + banco local).
- Catálogo de 114 jogadores (incl. 21 lendas) agora sincroniza automaticamente em qualquer banco, mesmo parcialmente povoado.
- Leituras da tabela Match destravadas para registros legados (inviteCode nullable).
- Compatibilidade SQLite (dev) e PostgreSQL/Neon (produção) garantida por helpers centralizados.
- 213 testes passando, 0 erros de lint, build OK.
