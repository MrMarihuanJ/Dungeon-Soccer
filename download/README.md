# Dungeon and Soccer — Hotfix v2

Esta pasta contém o ZIP com o projeto corrigido.

## Arquivo

- **`Dungeon-Soccer-Corrigido-v2.zip`** (1.5 MB) — projeto completo
  com as 4 correções de produção aplicadas.

## Correções aplicadas nesta versão (v2)

1. **Erro interno no login** — corrigido.
2. **Erro ao salvar o time** — corrigido.
3. **Erro ao iniciar partida** — corrigido.
4. **Jogadores sumiram do admin** — corrigido (com auto-seed).

Causa raiz: o `db-sync.ts` estava desatualizado em relação ao
`prisma/schema.prisma` — faltavam várias colunas (`lastLoginAt`,
`isAdmin`, `isProtected` em User; `xpGranted`, `version`,
`pendingPenaltyEventJson`, `varDecisionsJson`, `homeTeamJson`,
`awayTeamJson` em Match; colunas de rating em Player para DBs antigos)
e a tabela `XpGrant` inteira não era criada. Prisma gerava SQL
referenciando colunas inexistentes → erro 500 em qualquer endpoint
que tocasse o banco.

## Como aplicar

1. Faça deploy do conteúdo do ZIP para a Vercel (substituindo o código
   atual).
2. Após o deploy, **não é necessário rodar migrations manuais** — o
   `db-sync.ts` atualizado adiciona as colunas faltantes via
   `ADD COLUMN IF NOT EXISTS` no primeiro request após cold start.
3. O auto-seed da tabela `Player` roda automaticamente se o banco
   estiver vazio.
4. Teste: faça login, salve um time, inicie uma partida, e acesse o
   admin — todos devem funcionar sem erros.

## Documentação

- `README.md` (dentro do ZIP) — instruções completas de setup.
- `RELATORIO_IMPLEMENTACAO.md` — auditoria técnica completa.
- `HOTFIX_V2_CORRECOES.md` — detalhamento técnico deste hotfix.
