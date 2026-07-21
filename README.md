# Dungeon and Soccer ⚽

> Monte seu time dos sonhos com **qualquer jogador do mundo** — busca em tempo real via TheSportsDB + Wikipedia + banco local, formações táticas, gestão de reservas e painel administrativo.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-06b6d4?logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-6-2d3748?logo=prisma)
![Vercel](https://img.shields.io/badge/Vercel-ready-black?logo=vercel)
![Neon](https://img.shields.io/badge/Neon_Postgres-ready-00e599?logo=neon)

---

## Sumário

- [Visão Geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Stack Técnica](#stack-técnica)
- [Arquitetura](#arquitetura)
- [Rodando Localmente](#rodando-localmente)
- [Deploy na Vercel + GitHub + Neon](#deploy-na-vercel--github--neon)
- [Painel Administrativo](#painel-administrativo)
- [Busca Mundial em Tempo Real](#busca-mundial-em-tempo-real)
- [Como Usar](#como-usar)
- [Estrutura de Arquivos](#estrutura-de-arquivos)
- [API Reference](#api-reference)
- [Customização](#customização)
- [Troubleshooting](#troubleshooting)
- [Licença](#licença)

---

## Visão Geral

O **Dungeon and Soccer** é um montador de times de futebol web que permite buscar **qualquer jogador do mundo** em tempo real. O usuário escolhe uma formação tática (4-3-3, 4-4-2, etc.), clica nas "bolas" posicionadas no campo para abrir um campo de busca com **autocomplete em tempo real**, seleciona o jogador desejado e vê a foto real dele aparecer na bola correspondente.

A busca consulta **3 fontes em paralelo**:
1. **TheSportsDB** — cobertura mundial (todos os jogadores de todas as ligas)
2. **Wikipedia** — fallback para atletas menos famosos
3. **Banco local** — jogadores curados/gerenciados pelo admin

Além dos 11 titulares, há um **banco de reservas** onde o usuário atua como técnico: convoca reservas e faz substituições com os titulares.

Há também um **painel administrativo** protegido por login/senha, acessível via `/?admin`, onde é possível adicionar, editar e remover jogadores do banco local.

---

## Funcionalidades

### Site principal (montador de times)
- **6 formações táticas**: 4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 3-4-3, 5-3-2
- **Campo visual responsivo** com marcações oficiais (áreas, círculo central, cantos)
- **Bolas flutuantes clicáveis** em cada posição do campo
- **Busca em tempo real** com debounce de 250ms
- **3 fontes de dados** em paralelo: TheSportsDB + Wikipedia + banco local
- **Autocomplete** com foto real, nome completo, time atual, nacionalidade e número da camisa
- **Filtro automático por posição**: ao clicar numa posição, só aparecem jogadores daquela posição
- **Foto real do jogador** exibida na bola após seleção
- **Banco de reservas** ilimitado com cards ricos
- **Sistema de substituição** com diálogo dedicado
- **Persistência local** via Zustand + localStorage
- **Toast notifications** para feedback de ações
- **Design responsivo mobile-first** com animações Framer Motion

### Painel administrativo (`/?admin`)
- **Login/senha** com cookie HTTP-only assinado (HMAC-SHA256)
- **Dashboard** com estatísticas (total de jogadores, fontes ativas)
- **CRUD completo** de jogadores do banco local:
  - Criar novo jogador (nome, posição, time, foto, nacionalidade, número)
  - Editar jogador existente (inline)
  - Remover jogador
  - Buscar jogadores por nome ou time
- **Logout** com limpeza de cookie
- **Botão "Ver site"** para voltar ao site principal

---

## Stack Técnica

| Camada | Tecnologia |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Linguagem** | TypeScript 5 |
| **Estilo** | Tailwind CSS 4 + shadcn/ui (New York) |
| **Banco de dados** | Prisma ORM (SQLite em dev, **Neon Postgres** em prod) |
| **Estado (client)** | Zustand + persist middleware |
| **Auth** | HMAC-SHA256 + cookie HTTP-only (sem dependências externas) |
| **API externa** | TheSportsDB (mundial) + Wikipedia (fallback) |
| **Ícones** | Lucide React |
| **Animações** | Framer Motion |
| **Toasts** | Sonner |
| **Hospedagem** | Vercel |
| **CI/CD** | GitHub → Vercel (deploy automático em cada push) |
| **Banco gerenciado** | Neon Postgres (serverless) |

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser (Cliente)                     │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │            Página / (App Router)                       │  │
│  │                                                        │  │
│  │   ?admin ausente  →  <TeamBuilderApp />                │  │
│  │   ?admin presente →  <AdminApp />                      │  │
│  │                     ├── <AdminLogin />                 │  │
│  │                     └── <AdminDashboard />             │  │
│  └────────────────────────────────────────────────────────┘  │
│                          ▲                                   │
│                          │ Zustand (localStorage)            │
│                          ▼                                   │
│  fetch /api/players/search · /api/auth/* · /api/admin/*     │
└──────────────────────────────────────────────────────────────┘
                            │ HTTPS
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    Vercel (Serverless)                       │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │ /api/players/search  │  │ /api/auth/login              │ │
│  │  TheSportsDB + Wiki  │  │ /api/auth/logout              │ │
│  │  + DB local (Prisma) │  │ /api/auth/me                  │ │
│  └──────────┬───────────┘  └──────────────────────────────┘ │
│             │                                               │
│  ┌──────────▼─────────────────────────────────────────────┐ │
│  │  /api/admin/players (CRUD, requer cookie admin)        │ │
│  └──────────┬─────────────────────────────────────────────┘ │
│             │                                                │
│             ▼                                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Prisma Client (conexao pooled)               │   │
│  └────────────────────────┬─────────────────────────────┘   │
└───────────────────────────┼──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│              Neon Postgres (Serverless DB)                   │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐                      │
│  │   Player       │  │   SavedTeam    │  (opcional)          │
│  └────────────────┘  └────────────────┘                      │
└──────────────────────────────────────────────────────────────┘
                            ▲
                            │ HTTPS (fetch server-side)
                            │
┌──────────────────────────────────────────────────────────────┐
│              APIs externas (busca em tempo real)             │
│                                                              │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │  TheSportsDB        │  │  Wikipedia API              │   │
│  │  thesportsdb.com    │  │  en.wikipedia.org/w/api.php │   │
│  │  (mundial, fotos)   │  │  (fallback biográfico)      │   │
│  └─────────────────────┘  └─────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

---

## Rodando Localmente

### Pré-requisitos

- [Node.js 18+](https://nodejs.org/) ou [Bun](https://bun.sh/)
- Git

### Passos

```bash
# 1. Clone o repositório
git clone https://github.com/SEU_USUARIO/dungeon-and-soccer.git
cd dungeon-and-soccer

# 2. Instale as dependências
bun install     # ou: npm install / pnpm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# (o .env já vem com SQLite + credenciais admin padrão para dev)

# 4. Crie o banco e aplique o schema
bun run db:push

# 5. Popule o banco com os jogadores iniciais
bun run db:seed
# ✅ Seed concluído! 103 jogadores inseridos.

# 6. Rode o servidor de desenvolvimento
bun run dev
# ▲ Next.js 16.1.3 (Turbopack)
# - Local: http://localhost:3000
```

Abra [http://localhost:3000](http://localhost:3000) no navegador. 🎉

Para acessar o **painel admin**, abra [http://localhost:3000/?admin](http://localhost:3000/?admin) ou clique no botão **Admin** no canto superior direito.

**Credenciais padrão (dev):**
- Usuário: `admin`
- Senha: `admin123`

---

## Deploy na Vercel + GitHub + Neon

### Passo 1: Criar o banco no Neon

1. Acesse [https://neon.tech](https://neon.tech) e crie uma conta (login com GitHub recomendado).
2. Clique em **New Project** → dê o nome `dungeon-and-soccer`.
3. Escolha a região mais próxima dos usuários (ex: `AWS US East` para América, `AWS São Paulo` para Brasil).
4. Após criar, copie a **connection string** exibida:
   ```
   postgresql://USER:PASSWORD@ep-XXXX.region.aws.neon.tech/dbname?sslmode=require
   ```

### Passo 2: Subir o código para o GitHub

```bash
git init
git add .
git commit -m "feat: Dungeon and Soccer - montador de times com busca mundial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/dungeon-and-soccer.git
git push -u origin main
```

### Passo 3: Conectar na Vercel

1. Acesse [https://vercel.com/new](https://vercel.com/new).
2. Importe o repositório `dungeon-and-soccer` do GitHub.
3. A Vercel detecta automaticamente o Next.js — **não mude nada nas configurações de build**.
4. Em **Environment Variables**, adicione:

   | Nome | Valor | Descrição |
   |---|---|---|
   | `DATABASE_URL` | `postgresql://USER:PASSWORD@ep-XXXX.region.aws.neon.tech/dbname?sslmode=require&connect_timeout=300` | Connection string do Neon |
   | `ADMIN_USERNAME` | `admin` | Usuário do painel admin |
   | `ADMIN_PASSWORD` | `sua-senha-forte-aqui` | ⚠️ Use uma senha forte! |
   | `JWT_SECRET` | `string-aleatoria-de-64-caracteres` | Gere com `openssl rand -hex 32` |
   | `THESPORTSDB_API_KEY` | `3` | Chave pública de testes (ou sua própria) |

   ⚠️ **Atenção:** adicione `&connect_timeout=300` ao final da URL do Neon para evitar timeouts em cold starts.

5. Clique em **Deploy**. Em ~2 minutos o site estará no ar em `https://dungeon-and-soccer.vercel.app`.

### Passo 4: Trocar o provider do Prisma para PostgreSQL

**Importante:** o projeto vem com `provider = "sqlite"` (para dev local). Em produção, edite `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"   // ← mude de "sqlite" para "postgresql"
  url      = env("DATABASE_URL")
}
```

Faça commit e push:

```bash
git add prisma/schema.prisma
git commit -m "chore: switch Prisma provider to postgresql for production"
git push
```

A Vercel fará redeploy automático.

### Passo 5: Seed inicial do banco em produção

Após o primeiro deploy, o banco estará vazio. Faça o seed via API:

```bash
curl -X POST https://dungeon-and-soccer.vercel.app/api/seed
# {"ok":true,"message":"Seed concluído com 103 jogadores.","total":103}
```

### Passo 6: Deploy automático funcionando

A partir de agora, **todo `git push` na `main`** dispara um deploy automático na Vercel. Branches não-main criam **Preview Deployments** isolados.

---

## Painel Administrativo

### Acesso

- **URL**: `https://seu-site.com/?admin`
- **Botão alternativo**: clique em **Admin** no canto superior direito do site
- **Credenciais** (definidas nas variáveis de ambiente):
  - `ADMIN_USERNAME` — usuário (default: `admin`)
  - `ADMIN_PASSWORD` — senha (default: `admin123` — **troque em produção!**)

### Funcionalidades

| Ação | Como |
|---|---|
| **Login** | Digite usuário e senha na tela de login |
| **Ver estatísticas** | Cards no topo do dashboard (total jogadores, fontes ativas) |
| **Adicionar jogador** | Formulário à esquerda: preencha nome, posição, time, foto, nacionalidade, número |
| **Editar jogador** | Clique no ícone de lápis (azul) ao lado do jogador na lista |
| **Remover jogador** | Clique no ícone de lixeira (vermelho) e confirme |
| **Buscar jogador** | Campo de busca acima da lista (filtra por nome ou time) |
| **Logout** | Botão "Sair" no topo |
| **Voltar ao site** | Botão "Ver site" no topo |

### Segurança

- **Cookie HTTP-only**: não acessível por JavaScript no cliente
- **SameSite=Strict**: protege contra CSRF
- **Secure em produção**: cookie só enviado via HTTPS
- **HMAC-SHA256**: token assinado, não pode ser forjado
- **Expiração**: sessão expira em 8 horas
- **Anti brute-force**: delay de 400ms + comparação constant-time
- **Validação em cada endpoint**: `/api/admin/*` valida o cookie antes de processar

---

## Busca Mundial em Tempo Real

A busca de jogadores consulta **3 fontes em paralelo** e combina os resultados:

### 1. TheSportsDB (primária)
- **URL**: `https://www.thesportsdb.com/api/v1/json/{KEY}/searchplayers.php?p={query}`
- **Cobertura**: jogadores de todas as ligas do mundo (Premier League, La Liga, Serie A, Brasileirão, MLS, etc.)
- **Dados retornados**: nome, time atual, foto, nacionalidade, posição
- **Chave pública de teste**: `3` (rate-limited)
- **Como obter chave própria**: cadastre-se em [thesportsdb.com/api.php](https://www.thesportsdb.com/api.php) (gratuito)

### 2. Wikipedia (fallback)
- **URL**: `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={query}+footballer`
- **Uso**: quando TheSportsDB não encontra o jogador
- **Dados retornados**: nome, foto (se disponível no Commons), snippet biográfico

### 3. Banco local (complementar)
- **Tabela `Player` no Prisma/Neon**
- **Uso**: jogadores curados pelo admin + jogadores criados via painel
- **Dados retornados**: nome, nome completo, time, posição, foto, nacionalidade, número da camisa

### Combinação e deduplicação
- Resultados das 3 fontes são combinados
- Duplicatas removidas por nome (case-insensitive)
- Ordem de prioridade: TheSportsDB → Local → Wikipedia
- Filtro de posição aplicado no final (se `?pos=GK|DF|MF|FW`)

### Rate limits
- **TheSportsDB chave "3"**: ~100 requests/minuto (suficiente para uso normal)
- **Wikipedia**: sem rate limit oficial, mas recomendamos uso responsável
- **Cache Next.js**: buscas repetidas em 1 minuto usam cache (não batem na API externa)

---

## Como Usar

### 1. Escolha a formação
Use o seletor **"Formação"** no topo do campo para escolher entre 4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 3-4-3 ou 5-3-2. As bolas se reposicionam automaticamente. Se você já tinha titulares escolhidos e a posição ainda existe na nova formação, eles são preservados — caso contrário, vão para o banco de reservas.

### 2. Adicione titulares
Clique em qualquer **bola flutuante** no campo. Um modal abre com um campo de texto. Comece a digitar o nome do jogador (ex: "Neymar", "Mbappe", "Bellingham"). A cada 250ms, o sistema consulta as 3 fontes em paralelo e exibe sugestões com **foto real, nome, time atual, nacionalidade** e um **badge** indicando a fonte (SportsDB / Wikipedia / Local). Clique no jogador desejado — a foto real dele aparece na bola.

> 💡 O filtro é automático: se você clicou na bola de zagueiro (ZAG), só aparecem defensores. Para ver jogadores de qualquer posição, use o botão "Convocar Reserva".

### 3. Convocar reservas
Clique em **"Convocar Reserva"** na barra de ferramentas. O mesmo modal de busca abre, mas **sem filtro de posição** — você pode adicionar qualquer jogador ao banco.

### 4. Fazer substituições
No painel "Banco de Reservas", cada reserva tem um botão **"Entrar"**. Clique nele para abrir o diálogo de substituição: escolha qual titular sai. Por padrão, só aparecem titulares da **mesma posição** do reserva. Ative o switch **"Permitir troca em qualquer posição"** para ver todos.

### 5. Acessar o painel admin
- Clique em **Admin** no canto superior direito do site, OU
- Acesse a URL `https://seu-site.com/?admin`
- Faça login com as credenciais configuradas
- Adicione, edite ou remova jogadores do banco local
- Clique em **Ver site** para voltar ao montador de times

### 6. Persistência
Seu time é salvo automaticamente no **localStorage** do navegador. Recarregue a página sem medo — o time continua montado.

---

## Estrutura de Arquivos

```
dungeon-and-soccer/
├── prisma/
│   ├── schema.prisma           # Schema do banco (Player + SavedTeam)
│   └── seed.ts                 # Script de seed (bun run db:seed)
│
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Layout root (metadata pt-BR, Sonner)
│   │   ├── page.tsx            # Detecta ?admin e roteia para AdminApp ou TeamBuilderApp
│   │   ├── globals.css         # Estilos globais (Tailwind 4)
│   │   └── api/
│   │       ├── players/
│   │       │   └── search/route.ts   # GET /api/players/search (TheSportsDB + Wiki + Local)
│   │       ├── seed/route.ts         # POST /api/seed (idempotente)
│   │       ├── auth/
│   │       │   ├── login/route.ts    # POST /api/auth/login
│   │       │   ├── logout/route.ts   # POST /api/auth/logout
│   │       │   └── me/route.ts       # GET /api/auth/me
│   │       └── admin/
│   │           └── players/route.ts  # GET/POST/PUT/DELETE /api/admin/players (CRUD)
│   │
│   ├── components/
│   │   ├── ui/                 # shadcn/ui (já instalado)
│   │   ├── football/
│   │   │   ├── Header.tsx             # Cabeçalho com botão Admin
│   │   │   ├── Footer.tsx             # Rodapé
│   │   │   ├── Toolbar.tsx            # Formação + stats + convocar
│   │   │   ├── FormationSelector.tsx  # Select de formações
│   │   │   ├── Field.tsx              # Campo SVG + marcações
│   │   │   ├── PositionBall.tsx       # Bola flutuante clicável
│   │   │   ├── PlayerSearchModal.tsx  # Modal de autocomplete (com badges de fonte)
│   │   │   ├── ReserveTeam.tsx        # Painel de reservas
│   │   │   ├── SubstitutionDialog.tsx # Diálogo de substituição
│   │   │   ├── Instructions.tsx       # Modal "Como usar"
│   │   │   └── TeamBuilderApp.tsx     # App principal do montador de times
│   │   └── admin/
│   │       ├── AdminApp.tsx           # Orquestra login <-> dashboard
│   │       ├── AdminLogin.tsx         # Tela de login
│   │       └── AdminDashboard.tsx     # Dashboard com CRUD de jogadores
│   │
│   └── lib/
│       ├── db.ts                       # PrismaClient singleton
│       ├── utils.ts                    # cn() helper
│       ├── auth.ts                     # HMAC + cookie + verifyCredentials
│       └── football/
│           ├── players-data.ts         # 103 jogadores seed
│           ├── formations.ts           # 6 formações táticas
│           └── store.ts                # Zustand + persist
│
├── public/                     # Static assets
├── .env.example                # Template de variáveis (inclui ADMIN_*, JWT_SECRET, THESPORTSDB_API_KEY)
├── .gitignore
├── next.config.ts              # Config Next.js (images, standalone)
├── vercel.json                 # Config Vercel (functions, timeouts)
├── tailwind.config.ts
├── tsconfig.json
├── package.json                # Scripts: dev, build, lint, db:*
└── README.md                   # Este arquivo
```

---

## API Reference

### `GET /api/players/search`

Busca jogadores **em tempo real** em 3 fontes: TheSportsDB + Wikipedia + banco local.

**Query params:**

| Param | Tipo | Default | Descrição |
|---|---|---|---|
| `q` | string | — | Termo de busca (mínimo 2 caracteres) |
| `limit` | number | 15 | Máximo de resultados (máx 30) |
| `pos` | string | — | Filtra por posição: `GK`, `DF`, `MF`, `FW` |

**Exemplo:**

```bash
curl "https://dungeon-and-soccer.vercel.app/api/players/search?q=messi&limit=5"
```

**Resposta 200:**

```json
{
  "players": [
    {
      "id": "sdb_34146370",
      "name": "Lionel Messi",
      "fullName": "Lionel Messi",
      "team": "Inter Miami",
      "position": "FW",
      "photoUrl": "https://r2.thesportsdb.com/images/media/player/thumb/kpfsvp1725295651.jpg",
      "nationality": "Argentina",
      "shirtNumber": null,
      "source": "thesportsdb"
    }
  ],
  "total": 1,
  "query": "messi",
  "sources": {
    "thesportsdb": 1,
    "wikipedia": 0,
    "local": 0
  }
}
```

O campo `source` indica a origem: `thesportsdb`, `wikipedia` ou `local`.

---

### `POST /api/auth/login`

Autentica o admin e seta cookie HTTP-only.

**Body:**

```json
{ "username": "admin", "password": "admin123" }
```

**Resposta 200:**

```json
{ "ok": true, "user": { "username": "admin", "role": "admin" } }
```

**Resposta 401:**

```json
{ "ok": false, "error": "Usuário ou senha incorretos." }
```

---

### `POST /api/auth/logout`

Limpa o cookie de sessão.

**Resposta 200:**

```json
{ "ok": true }
```

---

### `GET /api/auth/me`

Verifica se há sessão admin ativa.

**Resposta 200 (autenticado):**

```json
{ "ok": true, "authenticated": true, "user": { "username": "admin", "role": "admin" } }
```

**Resposta 401 (não autenticado):**

```json
{ "ok": false, "authenticated": false }
```

---

### `GET /api/admin/players`

Lista jogadores do banco local. **Requer cookie admin.**

**Query params:** `q` (busca), `limit`, `offset`

**Resposta 200:**

```json
{
  "ok": true,
  "players": [...],
  "total": 103,
  "limit": 100,
  "offset": 0
}
```

### `POST /api/admin/players`

Cria novo jogador. **Requer cookie admin.**

**Body:**

```json
{
  "name": "Cristiano Ronaldo",
  "fullName": "Cristiano Ronaldo dos Santos Aveiro",
  "position": "FW",
  "team": "Al-Nassr",
  "photoUrl": "https://...",
  "nationality": "Portugal",
  "shirtNumber": 7
}
```

### `PUT /api/admin/players?id={id}`

Atualiza jogador existente. **Requer cookie admin.**

### `DELETE /api/admin/players?id={id}`

Remove jogador. **Requer cookie admin.**

---

### `POST /api/seed`

Popula o banco com os 103 jogadores pré-definidos. **Idempotente.**

```bash
curl -X POST https://dungeon-and-soccer.vercel.app/api/seed
```

---

## Customização

### Trocar credenciais admin

Edite as variáveis de ambiente:

```bash
# .env (dev) ou painel da Vercel (prod)
ADMIN_USERNAME="meu-usuario"
ADMIN_PASSWORD="minha-senha-super-forte"
JWT_SECRET="gere-com-openssl-rand-hex-32"
```

### Trocar chave da TheSportsDB

Cadastre-se em [thesportsdb.com/api.php](https://www.thesportsdb.com/api.php) e obtenha sua chave gratuita:

```bash
THESPORTSDB_API_KEY="sua-chave-pessoal"
```

### Adicionar mais jogadores ao seed

Edite `src/lib/football/players-data.ts` e adicione entradas ao array `PLAYERS_SEED`:

```typescript
{
  name: 'Novo Jogador',
  fullName: 'Nome Completo do Jogador',
  position: 'FW',
  team: 'Santos',
  photoUrl: 'https://...',
  nationality: 'Brasil',
  shirtNumber: 11,
}
```

Depois rode `bun run db:seed` (local) ou `curl -X POST .../api/seed` (prod).

### Adicionar nova formação

Edite `src/lib/football/formations.ts` e adicione um objeto ao array `FORMATIONS`.

### Plugar outra API externa

Edite `src/app/api/players/search/route.ts` e adicione uma nova função `searchMinhaApi()`, depois adicione-a ao `Promise.all` no endpoint.

---

## Troubleshooting

### Login admin falha em produção

1. Verifique se `ADMIN_USERNAME` e `ADMIN_PASSWORD` estão definidas na Vercel.
2. Verifique se `JWT_SECRET` está definido (sem ele, o token não é assinado).
3. Limpe cookies do navegador e tente novamente.

### Busca não retorna jogadores externos

1. Verifique se `THESPORTSDB_API_KEY` está definida (default: `3`).
2. Teste a API diretamente:
   ```bash
   curl "https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=messi"
   ```
3. Se a chave `3` estiver rate-limited, cadastre sua própria chave.
4. Verifique os logs da Vercel em **Functions → /api/players/search**.

### Fotos não carregam

O `next.config.ts` já permite imagens de `commons.wikimedia.org`, `ui-avatars.com`, `www.thesportsdb.com` e `r2.thesportsdb.com`. Para adicionar outro domínio, edite `images.remotePatterns`.

### Deploy na Vercel falha com "Prisma can't reach database"

1. Confirme que a `DATABASE_URL` na Vercel tem `?sslmode=require` no final.
2. Adicione `&connect_timeout=300` para evitar timeouts.
3. Verifique no painel do Neon se o banco está ativo (não suspenso).
4. Certifique-se de que o `provider` em `prisma/schema.prisma` é `"postgresql"` em produção.

### Painel admin abre mas mostra tela branca

1. Abra o DevTools (F12) e verifique o console.
2. Teste o endpoint `/api/auth/me` diretamente:
   ```bash
   curl "https://seu-site.com/api/auth/me"
   ```
3. Se retornar 401, está funcionando corretamente (precisa fazer login).

---

## Licença

MIT — fique à vontade para usar, modificar e distribuir.

---

## Créditos

- Fotos dos jogadores: [TheSportsDB](https://www.thesportsdb.com/), [Wikipedia Commons](https://commons.wikimedia.org/) (CC BY-SA) e [UI Avatars](https://ui-avatars.com/) (fallback).
- Dados de jogadores: TheSportsDB (tempo real, mundial) + base curada manualmente (103 jogadores do Brasileirão e ídolos brasileiros na Europa).
- Stack: [Next.js](https://nextjs.org/), [Prisma](https://www.prisma.io/), [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/), [Neon](https://neon.tech/), [Vercel](https://vercel.com/), [TheSportsDB](https://www.thesportsdb.com/).
