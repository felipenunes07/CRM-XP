# Guia de Configuração: PC da Empresa 🏢

Siga estes passos para rodar o Olist CRM no computador da empresa após fazer o `git clone`.

## 1. Pré-requisitos
Certifique-se de que o computador tem instalado:
- **Node.js** (Versão 18 ou superior)
- **Docker Desktop** (Obrigatório para o banco de dados local)
- **Git**

## 2. Preparação do Ambiente
Após clonar o repositório, entre na pasta do projeto e crie o arquivo `.env`:
1. Copie o conteúdo do `.env` do seu PC atual para o novo.
2. **Atenção:** Verifique se as senhas do Postgres e Supabase estão corretas.
3. Certifique-se de que o caminho dos arquivos Excel em `HISTORICAL_FILES` aponta para uma pasta válida no novo PC.

## 3. Instalação e Setup
Abra o terminal na pasta do projeto e rode:

```powershell
# 1. Instalar dependências
npm install

# 2. Subir os containers do Docker (Postgres e Redis)
docker-compose up -d

# 3. Preparar o banco de dados local (Tabelas, Usuários e Migrações)
npm run setup:local

# 4. Importar Histórico (2023-2025) dos arquivos Excel
npm run import:full
```

## 4. Rodando a Aplicação
Após o setup, para iniciar o CRM:
```powershell
npm run dev
```

---

### Observações Importantes:
- **Vendas 2026:** O sistema continuará puxando do Supabase Cloud automaticamente todos os dias às 06:00 AM (ou quando você iniciar o `dev`).
- **Histórico:** Os dados de 2023 a 2025 ficam salvos permanentemente no seu Postgres local após o passo `npm run import:full`.
