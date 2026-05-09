# Supabase

Neste projeto, o Supabase nao e o banco principal do CRM.

## Uso atual

- Supabase pode ser usado para autenticacao, se o frontend/backend forem ajustados para esse fluxo.
- O codigo atual de login usa `POST /api/auth/login`, JWT do backend e a tabela `users` no Postgres principal.
- Supabase tambem pode ser usado como fonte auxiliar de vendas 2026 por `SUPABASE_DATABASE_URL` e `SUPABASE_TABLE_2026`.

## Banco principal

O Postgres principal fica em `DATABASE_URL`. E nele que entram:

- dados historicos do Dropbox/XLSX;
- snapshots de credito de cliente do Dropbox;
- vendas importadas da Olist/Tiny;
- vendas 2026 importadas do Supabase, quando configurado;
- usuarios do login atual do backend.

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
