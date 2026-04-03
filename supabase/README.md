# Supabase

Este projeto agora usa o Supabase como backend:

- Auth: Supabase Auth
- Banco: Supabase Postgres
- Funcoes de leitura/escrita: SQL RPC em `supabase/migrations`

## Aplicar as migrations

Se estiver usando Supabase CLI:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

Ou cole os arquivos SQL da pasta `supabase/migrations` no SQL Editor do Supabase na ordem dos nomes.

## Primeiro usuario

1. Crie um usuario em `Authentication > Users`.
2. Defina no metadata algo como:

```json
{
  "name": "Administrador",
  "role": "ADMIN"
}
```

O trigger das migrations cria/atualiza automaticamente a linha correspondente em `public.profiles`.

## Dados comerciais

As tabelas principais do CRM ficam em `public`.

Para recalcular os snapshots analiticos depois de importar dados para `sales_raw`, rode:

```sql
select public.rebuild_read_models();
```
