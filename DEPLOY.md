# Deploy

## Arquitetura real

- Frontend: Vercel, buildando `apps/web`.
- Backend: EasyPanel/VPS, rodando a API Express de `apps/api`.
- Worker: EasyPanel/VPS, rodando `npm run start:worker -w @olist-crm/api`.
- Banco principal: Postgres separado em `DATABASE_URL`. E nele que entram os dados do Dropbox, historico, Olist e importacoes.
- Redis: container interno para BullMQ/fila do worker.
- Supabase: fonte auxiliar para vendas 2026 via `SUPABASE_DATABASE_URL` e `SUPABASE_TABLE_2026`. O codigo atual de login usa JWT do backend e tabela `users` no Postgres principal.

## Vercel

Configure no projeto do frontend:

```env
VITE_API_BASE_URL=https://api.seu-dominio.com
```

O `vercel.json` ja usa:

- install: `npm ci`
- build: `npm run build -w @olist-crm/web`
- output: `apps/web/dist`

As variaveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` existem no `.env.example`, mas hoje o app nao importa o cliente Supabase no fluxo de login.

## EasyPanel

Use o `docker-compose.yml` da raiz. Ele sobe:

- `api` na porta `4000`
- `worker` para filas, sync e disparos
- `redis` interno, sem porta publica
- `campaign-media` como volume compartilhado entre API e worker para videos de campanha

Configure as variaveis do backend no EasyPanel, principalmente:

```env
NODE_ENV=production
PORT=4000
PUBLIC_URL=https://api.seu-dominio.com
WEB_ORIGIN=https://seu-front.vercel.app
DATABASE_URL=postgresql://...
REDIS_URL=redis://redis:6379
JWT_SECRET=uma-chave-grande-e-segura
DEFAULT_ADMIN_EMAIL=seu-email
DEFAULT_ADMIN_PASSWORD=senha-forte-inicial
OLIST_API_TOKEN=...
OLIST_API_BASE_URL=https://api.tiny.com.br/api2
OLIST_SYNC_START_DATE=2026-01-01
STARTUP_SYNC_ENABLED=false
WORKER_OLIST_SYNC_ENABLED=true
WORKER_OLIST_SYNC_INTERVAL_MINUTES=60
SUPABASE_DATABASE_URL=postgresql://... # somente fonte 2026, se usar
SUPABASE_TABLE_2026=f_vendas_2026
HISTORICAL_FILES=/Historico/2023.xlsx;/Historico/2024.xlsx;/Historico/2025.xlsx
DROPBOX_REFRESH_TOKEN=...
DROPBOX_APP_KEY=...
DROPBOX_APP_SECRET=...
DROPBOX_CUSTOMER_CREDIT_PATH=/XP SALDO TEMPORARIO
```

No EasyPanel, nao use caminhos locais do Windows em `HISTORICAL_FILES`. Use caminhos reais do Dropbox iniciando com `/`.

Mantenha `WORKER_OLIST_SYNC_ENABLED=true` no servico worker para atualizar os dados a cada 1 hora mesmo quando ninguem estiver logado no CRM.

Depois que o backend estiver no ar, teste:

```text
https://api.seu-dominio.com/api/health
```

## Ordem segura

1. Subir/validar o Postgres principal.
2. Configurar EasyPanel com API, worker, Redis e variaveis.
3. Validar `/api/health`.
4. Configurar `VITE_API_BASE_URL` na Vercel apontando para o backend.
5. Fazer deploy do frontend.
6. Entrar com `DEFAULT_ADMIN_EMAIL` e `DEFAULT_ADMIN_PASSWORD`, depois trocar a senha/usuario inicial.

## Seguranca

- Nunca subir `.env` para GitHub.
- Nao expor a porta do Redis publicamente.
- Nao colocar `service_role` do Supabase no frontend.
- Girar credenciais que ja tenham sido coladas em prints, chats ou commits.
- O Supabase conectado tem RLS desligado em `public.orcamentos` e `public.f_vendas_2026`. Se essas tabelas forem acessiveis por anon/auth via API do Supabase, qualquer pessoa com anon key pode ler/alterar dados. Nao habilite RLS sem politicas, porque isso bloqueia acesso. SQL base para decidir depois:

```sql
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.f_vendas_2026 ENABLE ROW LEVEL SECURITY;
```
