<div align="center">
  <img src="apps/web/public/xp-factory-logo.png" alt="XP Factory Logo" width="400" />
  <h1>CRM Inteligente Olist V2</h1>
  <p>Consolide seu histórico, automatize sua sincronização e impulsione sua reativação de clientes.</p>
</div>

<hr />

## 🚀 Sobre o Projeto

O **CRM Inteligente Olist V2** é um ecossistema robusto projetado para lojistas que utilizam a plataforma Olist. Ele permite consolidar históricos complexos de vendas (XLSX), sincronizar pedidos em tempo real (Olist API V2) e gerar insights acionáveis para reativação de clientes, recorrência e gestão comercial estratégica.

Este projeto utiliza uma arquitetura de monorepo moderna, priorizando segurança, escalabilidade e facilidade de deploy.

## ✨ Funcionalidades Principais

- 📂 **Importação de Histórico XLS:** Processamento inteligente de planilhas de 2023, 2024 e 2025 com lógica de de-duplicação (idempotência por fingerprint).
- 🔄 **Sincronização Olist V2:** Integração nativa para pedidos de 2026 em diante, mantendo seu banco de dados sempre atualizado.
- 📊 **Dashboard Analítico:** Visualização de KPIs críticos, métricas de vendas e saúde da carteira de clientes.
- 📅 **Agenda Comercial & Mensagens:** Ferramentas integradas para gestão de contatos e templates de mensagens para reativação.
- 🏗️ **Read Models Consolidados:** Snapshots analíticos otimizados para consultas rápidas, eliminando a dependência direta da API da Olist para relatórios.

## 🛠️ Stack Tecnológica

### Monorepo (NPM Workspaces)
- **Frontend (`apps/web`):** React 18, Vite, TailwindCSS, React Query, Recharts.
- **API (`apps/api`):** Node.js, Express, PostgreSQL, Redis, BullMQ.
- **Shared (`packages/shared`):** Contratos tipados (TypeScript) e utilitários comuns.

### Infraestrutura & Banco
- **Database:** PostgreSQL com Supabase (Auth + Storage + RPCs).
- **Cache & Filas:** Redis com BullMQ para processamento em background.
- **Deploy:** Vercel (Frontend) & Supabase (Backend/Database).

## 🏁 Como Começar

### Pré-requisitos
- **Node.js 22+**
- **Docker Desktop** (para infra local)

### Configuração Inicial

1. **Clonar e Instalar:**
   ```bash
   git clone <repo-url>
   cd olist-crm-clientes
   npm install
   ```

2. **Variáveis de Ambiente:**
   Copie o arquivo de exemplo e preencha as chaves necessárias:
   ```bash
   cp .env.example .env
   ```
   *Nota: Configure `DATABASE_URL`, `REDIS_URL` e `OLIST_API_TOKEN`.*

3. **Subir Infraestrutura Local:**
   ```bash
   docker compose up -d
   ```

4. **Executar em Desenvolvimento:**
   Para rodar todos os serviços simultaneamente:
   ```bash
   # Terminais separados ou usando um gerenciador de processos
   npm run dev:web   # http://localhost:5173
   npm run dev:api   # http://localhost:3000
   npm run worker    # Processamento de jobs
   ```

## 📊 Fluxo de Dados Inicial

Para que o CRM tenha dados úteis, siga esta ordem:

1. **Seed de Admin:** `npm run seed:admin -w @olist-crm/api`
2. **Importação Histórica:** `npm run import:history`
3. **Sincronização 2026+:** Realizada via worker ou endpoint admin.

## 🛠️ Scripts Úteis

Disponíveis na raiz do projeto:

- `npm run dev:web`: Inicia o frontend (Vite).
- `npm run dev:api`: Inicia a API Express.
- `npm run worker`: Inicia o processamento de filas (BullMQ).
- `npm run import:history`: Dispara a importação de planilhas XLSX.
- `npm run migrate -w @olist-crm/api`: Executa migrações do banco (se aplicável).
- `npm test`: Executa a suíte de testes.
- `npm run build`: Gera o build de produção para todos os pacotes.

## 🔗 Endpoints Principais (API)

Abaixo estão as rotas fundamentais para integração e administração:

### Autenticação & Dashboard
- `POST /api/auth/login`: Autenticação de usuário.
- `GET /api/dashboard/metrics`: KPIs e métricas consolidadas.

### Gestão de Clientes
- `GET /api/customers`: Lista de clientes com filtros.
- `GET /api/customers/:id`: Detalhes completos e histórico do cliente.
- `POST /api/segments/preview`: Pré-visualização de segmentação dinâmica.

### Comercial & Mensageria
- `GET /api/agenda`: Compromissos e lembretes comerciais.
- `GET/POST/PUT/DELETE /api/messages/templates`: Gestão de modelos de mensagens.

### Administração & Sincronização
- `POST /api/admin/import-history`: Gatilho manual para importação XLSX.
- `POST /api/admin/import-supabase-2026`: Sincroniza dados do Supabase 2026.
- `POST /api/admin/sync/olist`: Sincronização direta com a API Olist V2.

## 🚢 Deploy

O deploy é otimizado para a **Vercel** e **Supabase**. Consulte os guias detalhados:
- [Guia de Deploy (DEPLOY.md)](./DEPLOY.md)
- [Configuração do Supabase (supabase/README.md)](./supabase/README.md)

## 📁 Estrutura do Monorepo

```text
├── apps/
│   ├── api/          # Backend Express & Workers
│   └── web/          # Frontend React (Vite)
├── packages/
│   └── shared/       # Tipagens e lógica compartilhada
├── supabase/
│   ├── migrations/   # Estrutura do banco e RPCs
│   └── seed/         # Dados iniciais
├── docker/           # Configurações de containers
└── scripts/          # Ferramentas de manutenção e importação
```

<hr />

<div align="center">
  <p>Desenvolvido com ❤️ para a gestão inteligente de e-commerce.</p>
</div>