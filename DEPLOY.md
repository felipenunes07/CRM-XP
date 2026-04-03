# Deploy

## Arquitetura

- Frontend: Vercel
- Backend: Supabase Auth + Postgres + SQL RPC

## Variaveis da Vercel

- `VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co`
- `VITE_SUPABASE_ANON_KEY=SEU_ANON_KEY`

O arquivo [`vercel.json`](/C:/Users/felip/Desktop/Olist%20CRM%20Clientes/vercel.json) ja builda somente o frontend do monorepo.

## Preparar o Supabase

1. Crie o projeto no Supabase.
2. Aplique as migrations da pasta [`supabase/migrations`](/C:/Users/felip/Desktop/Olist%20CRM%20Clientes/supabase/migrations).
3. Crie o primeiro usuario em `Authentication > Users`.
4. No metadata desse usuario, informe pelo menos:

```json
{
  "name": "Administrador",
  "role": "ADMIN"
}
```

5. Se voce importar dados direto em `sales_raw`, rode depois:

```sql
select public.rebuild_read_models();
```

## Ordem de subida

1. Suba o repo para o GitHub sem o arquivo `.env`.
2. Aplique as migrations no Supabase.
3. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` na Vercel.
4. Faça o deploy da Vercel.
5. Entre com o usuario criado no Supabase Auth.

## Seguranca

- Nao suba o `.env` atual para o GitHub.
- Troque as credenciais que ja ficaram expostas no `.env` local antes de publicar.
- Nunca use a `service_role key` no frontend.
