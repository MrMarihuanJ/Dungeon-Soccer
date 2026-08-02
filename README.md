# Dungeon and Soccer ⚽🎲

> RPG de futebol baseado em jogadores reais — monte seu time, enfrente adversários
> e use estratégias de dados, cartas, habilidades e eventos de partida.
>
> **Versão auditada e corrigida** — veja `RELATORIO_IMPLEMENTACAO.md` para o
> detalhamento completo das correções aplicadas.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-06b6d4?logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-6-2d3748?logo=prisma)
![Vercel](https://img.shields.io/badge/Vercel-ready-black?logo=vercel)
![Neon](https://img.shields.io/badge/Neon_Postgres-ready-00e599?logo=neon)
![Tests](https://img.shields.io/badge/Tests-144_passing-brightgreen)

---

## Sumário

- [Visão Geral](#visão-geral)
- [Novidades desta versão](#novidades-desta-versão)
- [Stack Técnica](#stack-técnica)
- [Rodando Localmente](#rodando-localmente)
- [Deploy na Vercel + Neon](#deploy-na-vercel--neon)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Regras Implementadas](#regras-implementadas)
- [Testes](#testes)
- [Estrutura de Arquivos](#estrutura-de-arquivos)
- [Troubleshooting](#troubleshooting)
- [Licença](#licença)

---

## Visão Geral

Dungeon & Soccer é um jogo de RPG baseado em futebol onde usuários montam
times com jogadores reais (busca em tempo real via TheSportsDB + Wikipedia
+ banco local) e disputam partidas que combinam:

- **Mecânicas D&D:** d20, DC (Difficulty Class), skill bonus, critical hits.
- **Mecânicas de futebol:** formações, posse de bola, progresso no campo,
  gols, cartões, lesões, substituições.
- **Sistema de XP e níveis** para usuários e times.
- **Multiplayer online via convites** ou **offline vs bot**.
- **Painel administrativo** para gerenciar jogadores.

Site em produção: <https://dungeonnsoccer.vercel.app>

---

## Novidades desta versão

Esta versão é o resultado de uma auditoria técnica completa seguida de
implementação de correções críticas. Os principais destaques:

### Correções críticas
- **C1/C2:** Exclusão automática de contas inativas (>180 dias) via cron
  da Vercel — `lastLoginAt` agora é atualizado pelo servidor após login.
- **C3:** Substituições in-match agora persistem no servidor via
  `/api/match/substitution` (antes era só estado local).
- **C4:** XP idempotente via transação atômica com flag `xpGranted` +
  tabela `XpGrant` (constraint unique em `[userId, source]`).
- **C5:** Ações `FREE_KICK` não aparecem mais em jogadas normais.
- **C6:** Reserva pode ser movida para o campo (corrige crash em runtime).
- **C7:** Admin auth com hard-fail em produção sem `JWT_SECRET`/`ADMIN_PASSWORD`.

### Hotfix v2 — 4 erros em produção (agora corrigidos)
Esta é uma revisão **pós-deploy** que endereça os 4 erros reportados em
produção (`dungeonnsoccer.vercel.app`):

- **H1: "Erro interno no login"** — `db-sync.ts` não adicionava as colunas
  `lastLoginAt`, `isAdmin`, `isProtected` ao `User`. Prisma gerava SELECT
  com colunas inexistentes → SQL error 500. **Fix:** `db-sync.ts` agora
  cria essas colunas no `CREATE TABLE` e no `ADD COLUMN IF NOT EXISTS`.
- **H2: "Erro ao salvar o time"** — cascade do H1. Sem login, sem sessão,
  sem salvar time. **Fix:** corrigido pelo H1. Adicionalmente,
  `/api/user/team` agora chama `ensureDbSync()` antes de upsert.
- **H3: "Erro ao iniciar partida"** — `db-sync.ts` não adicionava as
  colunas `xpGranted`, `version`, `pendingPenaltyEventJson`,
  `varDecisionsJson`, `homeTeamJson`, `awayTeamJson` ao `Match`, nem
  criava a tabela `XpGrant`. `db.match.create` falhava no `RETURNING`.
  **Fix:** `db-sync.ts` agora cria todas essas colunas e a tabela
  `XpGrant` (com constraint unique em `[userId, source]`).
- **H4: "Jogadores sumiram do admin"** — `db-sync.ts` anterior criava
  `Player` com colunas de rating (overall, age, pace, ...) no
  `CREATE TABLE IF NOT EXISTS`, mas **não** adicionava essas colunas
  via `ADD COLUMN IF NOT EXISTS` para DBs já existentes. Prisma
  `findMany` falhava com "column overall does not exist" → admin via
  lista vazia. Adicionalmente, deploy fresco no Neon deixava a tabela
  vazia (sem seed). **Fix:** `db-sync.ts` agora adiciona todas as
  colunas de rating via `ADD COLUMN IF NOT EXISTS`, e faz **auto-seed**
  da tabela `Player` (a partir de `PLAYERS_SEED`) quando encontra o
  banco vazio — funciona em Postgres e SQLite.

Arquivos principais alterados no hotfix:
- `src/lib/db-sync.ts` — reescrito: adicionadas todas as colunas
  faltantes (User, Match, Player) + tabela XpGrant + auto-seed.
- `src/app/api/user/login/route.ts` — chama `ensureDbSync()`.
- `src/app/api/user/register/route.ts` — chama `ensureDbSync()`.
- `src/app/api/user/team/route.ts` — chama `ensureDbSync()` (GET + POST).
- `src/app/api/admin/players/route.ts` — chama `ensureDbSync()`.
- `src/app/api/players/search/route.ts` — chama `ensureDbSync()`.
- `src/app/api/cron/cleanup-inactive/route.ts` — chama `ensureDbSync()`.
- `src/app/api/seed/route.ts` — chama `ensureDbSync()`.
- `src/app/api/match/substitution/route.ts` — chama `ensureDbSync()`.
- `src/app/api/match/defensive-play/route.ts` — chama `ensureDbSync()`.
- `vercel.json` — removida referência a `var-decision/route.ts`
  (rota nunca existiu; fazia o build da Vercel reclamar).

### Novos sistemas
- **Máquina de estados de jogador** (ACTIVE/RESERVE/INJURED/SUBSTITUTED/
  SENT_OFF/UNAVAILABLE) com transições validadas no servidor.
- **Sistema de cobrança de falta** com multiplicadores aleatórios
  (positivos e negativos) gerados no servidor, anti-repetição de cobrador.
- **Limite rigoroso de 5 substituições** (táticas + lesão contam juntas),
  com bloqueio pós-limite e time jogando com jogador a menos.
- **XP para equipes e jogadores** com progressão, níveis, recompensas e
  idempotência.
- **Concorrência otimista** via campo `version` na tabela `Match`.

### Melhorias de UI/UX
- `SubstitutionModal` reescrito com fluxo de 2 fases (seleciona sai →
  seleciona entra) e acessibilidade ARIA.
- `FreeKickDialog` reformulado para mostrar multiplicador e cobrador
  designados pelo servidor.
- `ReserveTeam` com novo dropdown "Mover para o campo".
- Easter eggs cômicos adicionais (tiki-taka, catenaccio, pelé, maradona,
  vampeta, etc).

### Testes
- **144 testes** unitários e de integração cobrindo os fluxos críticos
  (free kick, sub limit, red card, XP idempotência, admin auth, etc).

Veja `RELATORIO_IMPLEMENTACAO.md` para o detalhamento completo.

---

## Stack Técnica

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Linguagem:** TypeScript 5
- **Estilo:** Tailwind CSS 4 + shadcn/ui (New York)
- **Banco:** Prisma 6 ORM + PostgreSQL (Neon em produção; SQLite em dev)
- **Auth:** HMAC-SHA256 em cookies HTTP-only (custom, sem NextAuth)
- **State:** Zustand (cliente) + TanStack Query (server)
- **Animações:** Framer Motion
- **Testes:** Vitest 4
- **Deploy:** Vercel + Neon Postgres + Vercel Cron

---

## Rodando Localmente

### Pré-requisitos
- Node.js 20+ ou Bun
- Git

### Passos

```bash
# 1. Instalar dependências
bun install
# ou: npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite .env e gere valores aleatórios para JWT_SECRET e CRON_SECRET:
#   openssl rand -hex 32

# 3. Criar banco SQLite local e popular jogadores
bunx prisma db push
bun run db:seed

# 4. Rodor em modo desenvolvimento
bun run dev
# Acesse http://localhost:3000

# 5. (Opcional) Rodar testes
bun run test
bun run test:coverage

# 6. (Opcional) Lint
bun run lint
```

### Credenciais admin em dev

Em desenvolvimento (`NODE_ENV !== 'production'`), as credenciais admin
default são `admin` / `admin123`. Em produção, a aplicação recusa iniciar
com esses valores.

---

## Deploy na Vercel + Neon

### Passo 1: Configurar Neon (PostgreSQL)

1. Crie conta em <https://neon.tech>
2. Crie um projeto e copie a connection string
3. Guarde para configurar como `DATABASE_URL` na Vercel

### Passo 2: Importar na Vercel (sem editar código manualmente)

O `prisma/schema.prisma` tem `provider = "sqlite"` por padrão (para dev
local). Em produção, o **script `scripts/swap-prisma-provider.js`** roda
automaticamente no `postinstall` e no `prebuild` da Vercel, detectando o
scheme de `DATABASE_URL` e reescrevendo o schema para `postgresql` antes
de `prisma generate` rodar.

**Você não precisa editar nenhum arquivo antes do deploy.**

1. Faça push do código para GitHub
2. Na Vercel, importe o repositório
3. Configure as variáveis de ambiente (ver `.env.example`):
   - `DATABASE_URL` = connection string do Neon (deve começar com `postgresql://`)
   - `JWT_SECRET` = gere com `openssl rand -hex 32`
   - `ADMIN_USERNAME` = seu username admin
   - `ADMIN_PASSWORD` = senha forte (≥8 chars, NÃO use `admin123`)
   - `CRON_SECRET` = gere com `openssl rand -hex 32`
   - `THESPORTSDB_API_KEY` = `"3"` (free tier) ou sua key
   - `API_FOOTBALL_KEY` = opcional (apenas se quiser fotos via API-Football)
4. Deploy

### Passo 3: Verificar saúde do banco

Após o deploy, acesse:

```
https://dungeonnsoccer.vercel.app/api/db/health
```

Resposta esperada:

```json
{
  "ok": true,
  "databaseUrlScheme": "postgresql",
  "tables": { "User": { "ok": true }, "Match_read": { "ok": true }, ... }
}
```

Se `ok: false` com hint "PROVIDER MISMATCH", veja `HOTFIX_V3_DIAGNOSIS.md`.

### Passo 4: Primeira migração do banco (opcional)

Se o `/api/db/health` indicar que as tabelas estão vazias, rode o seed:

```bash
DATABASE_URL="postgresql://..." bun run db:seed
```

Em Cold Start, o `db-sync.ts` também cria as tabelas automaticamente, e
faz auto-seed da tabela `Player` se ela estiver vazia.

### Passo 5: Verificar cron job

A Vercel executará automaticamente `/api/cron/cleanup-inactive` diariamente
às 03:00 UTC (configurado em `vercel.json`). Para testar manualmente:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://dungeonnsoccer.vercel.app/api/cron/cleanup-inactive
```

---

## Variáveis de Ambiente

Veja `.env.example` para a lista completa. As críticas são:

| Variável | Descrição | Obrigatório em prod |
|----------|-----------|---------------------|
| `DATABASE_URL` | Connection string do Neon (ou SQLite path em dev) | Sim |
| `JWT_SECRET` | HMAC secret para assinar cookies (≥16 chars) | Sim |
| `ADMIN_USERNAME` | Username do painel admin | Sim |
| `ADMIN_PASSWORD` | Senha admin (≥8 chars, não default) | Sim |
| `CRON_SECRET` | Token para autorizar o cron de cleanup | Sim |
| `THESPORTSDB_API_KEY` | Key da TheSportsDB (`"3"` para free tier) | Não |
| `API_FOOTBALL_KEY` | Key da API-Football (opcional, para fotos) | Não |
| `NEXT_PUBLIC_APP_NAME` | Nome da aplicação | Não |
| `NEXT_PUBLIC_APP_URL` | URL pública | Não |

---

## Regras Implementadas

### Substituições
- **Limite:** 5 por partida (táticas + lesão contam juntas).
- **Pós-limite:** nova lesão → jogador fica UNAVAILABLE, time joga com 1 a menos.
- **Validação:** apenas ACTIVE pode sair; apenas RESERVE pode entrar.
- **Proibido:** substituir jogador já substituído, expulso, ou ele mesmo.

### Cartões
- **Vermelho:** removido imediatamente de campo, marcado SENT_OFF, +1 redCards, não pode voltar.
- **Amarelo:** contabilizado, jogador continua em campo.

### Cobrança de Falta
- **Quando:** jogada com `requiresFreeKick=true` ou `type=PENALTY_KICK`.
- **Multiplicador:** sorteado no servidor, valor entre -4 e +5.
- **Cobrador:** sorteado no servidor, prioriza atacantes/meias, não repete consecutivo.
- **Dice roll:** no servidor, aplicado ao multiplicador.
- **Não aparece** em jogadas normais (apenas em set-piece).

### XP
- **Base:** 30/5/15 (QUICK_MATCH), 50/10/25 (TIMED_10), 100/20/40 (FULL_90).
- **Bônus:** dificuldade, vitória dominante (≥3 gols), eventos especiais.
- **Multiplicador nível:** 5% (lv 3-24), 10% (lv 25+).
- **Cap:** 100 XP por partida.
- **Idempotente:** transação atômica com `xpGranted` + `XpGrant` unique.

### Exclusão de Contas Inativas
- **Janela:** 180 dias sem `lastLoginAt` (ou `createdAt` se nunca logou).
- **Protegidos:** admins, `isProtected=true`, bot user.
- **Anonimização:** partidas históricas têm IDs de usuário trocados por placeholder.
- **Idempotente:** query baseada em timestamp; re-execução não causa erro.
- **Schedule:** diário às 03:00 UTC via Vercel Cron.

---

## Testes

```bash
bun run test              # roda uma vez
bun run test:watch        # modo watch
bun run test:coverage     # com cobertura
```

### Cobertura atual

```
✓ src/lib/__tests__/free-kick-system.test.ts (20 tests)
✓ src/lib/__tests__/player-match-state.test.ts (25 tests)
✓ src/lib/__tests__/xp-system.test.ts (36 tests)
✓ src/lib/__tests__/dnd-actions.test.ts (15 tests)
✓ src/lib/__tests__/match-engine.test.ts (20 tests)
✓ src/lib/__tests__/integration.test.ts (17 tests)
✓ src/lib/__tests__/admin-auth.test.ts (11 tests)

Test Files  7 passed (7)
     Tests  144 passed (144)
```

---

## Estrutura de Arquivos

```
.
├── prisma/
│   ├── schema.prisma          # Schema do banco (sqlite em dev, postgres em prod)
│   └── seed.ts                # Popula jogadores iniciais
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/          # Admin auth
│   │   │   ├── user/          # User auth, team, friends
│   │   │   ├── match/         # Match CRUD, action, substitution, free-kick-resolve
│   │   │   ├── cron/          # Cron cleanup-inactive
│   │   │   ├── admin/         # Admin players management
│   │   │   └── db/            # DB health
│   │   ├── page.tsx           # Página principal
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── match/             # MatchArena, SubstitutionModal, FreeKickDialog, etc
│   │   ├── football/          # TeamBuilderApp, Field, ReserveTeam, etc
│   │   ├── admin/             # AdminLogin, AdminApp, AdminDashboard
│   │   ├── ui/                # shadcn/ui components
│   │   ├── effects/           # EasterEggs
│   │   ├── theme/             # ThemeToggle, ThemeProvider
│   │   └── user/              # UserMenu
│   ├── lib/
│   │   ├── __tests__/         # 144 testes
│   │   ├── football/          # store, formations, players-data
│   │   ├── auth.ts            # Admin auth
│   │   ├── user-auth.ts       # User auth
│   │   ├── db.ts              # Prisma client
│   │   ├── db-sync.ts         # DDL sync (postgres only)
│   │   ├── match-engine.ts    # D&D + futebol rules
│   │   ├── dnd-actions.ts     # 139 ações de futebol
│   │   ├── free-kick-system.ts # NOVO: multiplicadores + cobrador
│   │   ├── player-match-state.ts # NOVO: máquina de estados
│   │   ├── xp-system.ts       # NOVO: XP, níveis, recompensas
│   │   ├── player-rating.ts
│   │   ├── sound.ts
│   │   └── utils.ts
│   └── hooks/
├── RELATORIO_IMPLEMENTACAO.md # Detalhe das correções
├── vercel.json                # Config Vercel + crons
├── .env.example
└── package.json
```

---

## Troubleshooting

### Erro: "Erro interno no login" / "Erro ao salvar o time" / "Erro ao iniciar partida"

Estes três erros têm a mesma causa raiz: o banco de dados está com
colunas faltando em relação ao schema Prisma. Isso acontece quando o
banco foi criado por uma versão antiga do `db-sync.ts` (que não incluía
`lastLoginAt`, `isAdmin`, `isProtected`, `xpGranted`, `version`, etc.).

**Solução automática (já aplicada nesta versão):** O `db-sync.ts` agora
adiciona todas as colunas faltantes via `ADD COLUMN IF NOT EXISTS` e
chamadas `ensureDbSync()` foram adicionadas em todos os endpoints que
tocam o banco. Após fazer deploy desta versão, o primeiro request
automaticamente sincroniza o schema.

**Solução manual (se o problema persistir):**
```bash
# Em produção (Neon Postgres), a sincronização é automática no primeiro
# request após o deploy. Se ainda assim falhar, force um re-deploy na
# Vercel (redeploy sem mudar o código já basta — cold start roda db-sync).

# Em dev local (SQLite):
bun run db:push      # sincroniza schema SQLite
bun run db:seed      # popula jogadores (opcional — auto-seed já faz isso)
```

### Erro: "Jogadores sumiram do admin"

Causa: a tabela `Player` foi criada sem as colunas de rating (`overall`,
`age`, `pace`, ...) por uma versão antiga do `db-sync.ts`, OU o banco
foi resetado sem re-rodar o seed.

**Solução automática (já aplicada):** O `db-sync.ts` agora:
1. Adiciona as colunas de rating via `ADD COLUMN IF NOT EXISTS`.
2. Faz **auto-seed** se a tabela `Player` estiver vazia (em qualquer
   banco, Postgres ou SQLite).

**Para popular manualmente:**
```bash
# Opção 1: Script CLI (limpa e repovoa)
bun run db:seed

# Opção 2: HTTP endpoint (idempotente, não limpa)
curl -X POST https://dungeonnsoccer.vercel.app/api/seed
# ou local:
curl -X POST http://localhost:3000/api/seed
```

### Erro: "FATAL: JWT_SECRET não configurado em produção"

Você esqueceu de configurar `JWT_SECRET` na Vercel. Gere com:
```bash
openssl rand -hex 32
```

### Erro: "FATAL: ADMIN_PASSWORD não configurado ou inseguro em produção"

`ADMIN_PASSWORD` está como `admin123` (default) ou tem <8 caracteres.
Configure uma senha forte.

### Cron retorna 401

`CRON_SECRET` não configurado ou não bate com o header `Authorization:
Bearer` enviado pela Vercel Scheduler. Verifique se o valor na Vercel
bate com o que o cron está esperando.

### Build quebra por erros TypeScript

O `next.config.ts` tem `typescript.ignoreBuildErrors = false` (reativado).
Se houver erros TS, o build falha — isso é intencional (qualidade).
Rode `bunx tsc --noEmit` para ver os erros.

### `prisma db push` falha

Verifique:
1. `DATABASE_URL` está correto no `.env`
2. Para SQLite: o diretório `db/` existe e tem permissão de escrita
3. Para Postgres: a connection string tem `?sslmode=require`

### Como forçar o sync do banco em produção

Em produção (Vercel + Neon), o sync roda automaticamente no primeiro
request após cada cold start. Para forçar:
1. Vá no dashboard da Vercel → Deployments → encontre o deploy mais recente.
2. Clique no menu `...` → **Redeploy** (não precisa mudar nada).
3. Após o novo deploy ficar pronto, faça qualquer request (ex.: abra o
   site e faça login). O `db-sync` roda no cold start.

Para verificar se o sync funcionou, chame o endpoint de health:
```bash
curl https://dungeonnsoccer.vercel.app/api/db/health
```
Ele deve retornar `{ ok: true, ... }`.

---

## Licença

Veja `LICENSE` para detalhes.

---

## Documentação adicional

- `RELATORIO_IMPLEMENTACAO.md` — auditoria completa, soluções aplicadas,
  arquivos alterados, decisões de arquitetura, limitações conhecidas e
  resultados dos testes.
