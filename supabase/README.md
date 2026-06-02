# Supabase

Neste projeto, o Supabase nao e o banco principal do CRM.

## Uso atual

- Supabase Auth e a identidade oficial do CRM.
- O frontend usa `supabase.auth.signInWithPassword`.
- O backend valida o access token do Supabase em todas as rotas `/api`.
- O Postgres principal mantem `profiles`, `permissions`, `role_permissions` e `user_permissions` para autorizacao da API.
- A tabela antiga `users` continua como espelho de compatibilidade para FKs historicas.
- Supabase tambem pode ser usado como fonte auxiliar de vendas 2026 por `SUPABASE_DATABASE_URL` e `SUPABASE_TABLE_2026`.

## Banco principal

O Postgres principal fica em `DATABASE_URL`. E nele que entram:

- dados historicos do Dropbox/XLSX;
- snapshots de credito de cliente do Dropbox;
- vendas importadas da Olist/Tiny;
- vendas 2026 importadas do Supabase, quando configurado;
- profiles/permissoes usados pela API do CRM.

## Variaveis de ambiente de Auth

Frontend:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

Backend:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DEFAULT_ADMIN_EMAIL=admin@empresa.com
DEFAULT_ADMIN_PASSWORD=troque-esta-senha
```

`SUPABASE_SERVICE_ROLE_KEY` deve existir somente no backend. Ela e usada para criar usuarios pelo painel admin e pelo script `npm run seed:admin -w @olist-crm/api`.

## Permissoes

As permissoes base ficam em:

- `permissions`
- `role_permissions`
- `user_permissions`

O backend calcula permissoes efetivas com a regra:

1. role concede permissoes padrao;
2. override individual pode permitir permissao extra;
3. override individual de bloqueio remove permissao da role.

Usuarios com `profiles.is_active = false` sao recusados pela API mesmo com sessao Supabase valida.

## Importacao 2026

Para puxar vendas 2026 do Supabase para o Postgres principal, configure no backend:

```env
SUPABASE_DATABASE_URL=postgresql://...
SUPABASE_TABLE_2026=f_vendas_2026
```

Depois rode o importador pelo endpoint admin `POST /api/admin/import-supabase-2026` ou pelo script:

```bash
npm run import:supabase:2026 -w @olist-crm/api
```

Isso le a tabela no Supabase e grava os dados normalizados no Postgres principal.
