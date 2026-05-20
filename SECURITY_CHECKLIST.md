# ✅ CHECKLIST DE SEGURANÇA - CRM XP

Use este checklist para acompanhar o progresso da correção de segurança.

---

## 📋 FASE 1: ROTAÇÃO DE CREDENCIAIS (CRÍTICO)

### Supabase Database
- [ ] Acessei https://supabase.com/dashboard/project/gxvxgpwdgkeskttasrfz/settings/database
- [ ] Rotacionei a senha do banco de dados
- [ ] Copiei a nova connection string
- [ ] Atualizei `SUPABASE_DATABASE_URL` no arquivo `.env`
- [ ] Testei a conexão com a nova credencial

### Google Maps API
- [ ] Acessei https://console.cloud.google.com/apis/credentials
- [ ] Revoquei a chave antiga: `AIzaSyDW...3XE` (Google Maps Key exposta)
- [ ] Criei uma nova API Key
- [ ] Configurei restrições (domínio/IP)
- [ ] Atualizei `GOOGLE_MAPS_API_KEY` no arquivo `.env`
- [ ] Testei a nova chave

### Meta Ads Access Token
- [ ] Acessei https://business.facebook.com/settings/security
- [ ] Revoquei o token antigo
- [ ] Gerei um novo token com permissões mínimas
- [ ] Atualizei `META_ADS_ACCESS_TOKEN` no arquivo `.env`
- [ ] Testei o novo token

### Evolution API
- [ ] Acessei o painel da Evolution API
- [ ] Revoquei a chave antiga: `D0AD7ED2...5A60` (Evolution API Key exposta)
- [ ] Gerei uma nova API Key
- [ ] Atualizei `EVOLUTION_API_KEY` no arquivo `.env`
- [ ] Testei a nova chave

### Olist/Tiny API
- [ ] Acessei o painel da Olist/Tiny
- [ ] Revoquei o token antigo
- [ ] Gerei um novo token
- [ ] Atualizei `OLIST_API_TOKEN` no arquivo `.env`
- [ ] Testei o novo token

### JWT Secret
- [ ] Gerei um novo secret forte: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- [ ] Atualizei `JWT_SECRET` no arquivo `.env`
- [ ] Reiniciei a aplicação

---

## 📋 FASE 2: VERIFICAÇÃO DE SEGURANÇA

### Logs de Acesso
- [ ] Verifiquei logs do Supabase para acessos suspeitos
- [ ] Verifiquei uso da API do Google Maps
- [ ] Verifiquei atividades no Meta Ads Manager
- [ ] Verifiquei logs da Evolution API
- [ ] Verifiquei logs da Olist/Tiny API

### Dados do Banco
- [ ] Verifiquei se há dados alterados sem autorização
- [ ] Verifiquei se há dados deletados
- [ ] Verifiquei se há novos usuários/registros suspeitos
- [ ] Fiz backup dos dados atuais

### Custos
- [ ] Verifiquei custos da API do Google Maps
- [ ] Verifiquei gastos no Meta Ads
- [ ] Verifiquei uso do Supabase
- [ ] Documentei qualquer anomalia

---

## 📋 FASE 3: LIMPEZA DO GIT

### Preparação
- [ ] Instalei BFG Repo-Cleaner
- [ ] Fiz backup do repositório local
- [ ] Avisei a equipe sobre a manutenção
- [ ] Confirmei que tenho permissão para push forçado

### Execução
- [ ] Executei `QUICK_FIX_COMMANDS.ps1` (Windows) ou `QUICK_FIX_COMMANDS.sh` (Linux/Mac)
- [ ] OU executei manualmente:
  - [ ] `git clone --mirror https://github.com/felipenunes07/CRM-XP.git`
  - [ ] `bfg --replace-text passwords.txt CRM-XP.git`
  - [ ] `cd CRM-XP.git`
  - [ ] `git reflog expire --expire=now --all`
  - [ ] `git gc --prune=now --aggressive`
  - [ ] `git push --force`

### Verificação
- [ ] Verifiquei que o push foi bem-sucedido
- [ ] Verifiquei no GitHub que as credenciais foram removidas
- [ ] Fiz `git pull --force` no repositório local
- [ ] Avisei a equipe para fazer `git pull --force`

---

## 📋 FASE 4: COMMIT DAS CORREÇÕES

### Verificação Final
- [ ] Executei `node scripts/check_secrets.js`
- [ ] Confirmei que não há mais credenciais hardcoded
- [ ] Testei a aplicação localmente
- [ ] Verifiquei que todas as funcionalidades funcionam

### Commit
- [ ] `git add .`
- [ ] `git commit -m "fix: remove hardcoded credentials and use environment variables"`
- [ ] `git push`
- [ ] Verifiquei que o commit foi bem-sucedido

---

## 📋 FASE 5: PREVENÇÃO FUTURA

### Ferramentas de Segurança
- [ ] Instalei git-secrets: `choco install git-secrets` (Windows) ou `brew install git-secrets` (Mac)
- [ ] Configurei git-secrets no projeto: `git secrets --install`
- [ ] Registrei padrões AWS: `git secrets --register-aws`
- [ ] Adicionei padrões customizados para as APIs usadas

### Pre-commit Hooks
- [ ] Instalei husky: `npm install --save-dev husky`
- [ ] Inicializei husky: `npx husky install`
- [ ] Adicionei hook de verificação: `npx husky add .husky/pre-commit "node scripts/check_secrets.js"`
- [ ] Testei o hook fazendo um commit de teste

### Documentação
- [ ] Atualizei o README.md com instruções de segurança
- [ ] Documentei o processo de rotação de credenciais
- [ ] Criei guia para novos desenvolvedores
- [ ] Adicionei seção sobre variáveis de ambiente

### Monitoramento
- [ ] Configurei alertas no Supabase para acessos suspeitos
- [ ] Configurei alertas de custo no Google Cloud
- [ ] Configurei alertas de gastos no Meta Ads
- [ ] Configurei revisão mensal de credenciais

---

## 📋 FASE 6: COMUNICAÇÃO

### Equipe
- [ ] Avisei a equipe sobre o incidente
- [ ] Compartilhei as lições aprendidas
- [ ] Treinei a equipe sobre boas práticas de segurança
- [ ] Estabeleci processo de revisão de código focado em segurança

### Stakeholders
- [ ] Informei os stakeholders relevantes (se necessário)
- [ ] Documentei o incidente e a resposta
- [ ] Criei relatório de impacto (se houve)
- [ ] Implementei melhorias no processo

### Pesquisador de Segurança
- [ ] Agradeci Robin (sec.scan.github@gmail.com) pela notificação
- [ ] Confirmei que o problema foi resolvido
- [ ] Considerei apoiar o trabalho dele (Buy me a coffee / Ko-Fi)

---

## 📊 RESUMO DO PROGRESSO

**Fase 1 - Rotação de Credenciais:** ⬜ 0/6 concluído  
**Fase 2 - Verificação de Segurança:** ⬜ 0/4 concluído  
**Fase 3 - Limpeza do Git:** ⬜ 0/3 concluído  
**Fase 4 - Commit das Correções:** ⬜ 0/2 concluído  
**Fase 5 - Prevenção Futura:** ⬜ 0/4 concluído  
**Fase 6 - Comunicação:** ⬜ 0/3 concluído  

**TOTAL:** ⬜ 0/22 concluído (0%)

---

## 🎯 PRIORIDADES

1. 🔴 **CRÍTICO** - Fase 1: Rotação de Credenciais (FAZER AGORA)
2. 🟠 **ALTO** - Fase 2: Verificação de Segurança (FAZER HOJE)
3. 🟠 **ALTO** - Fase 3: Limpeza do Git (FAZER HOJE)
4. 🟡 **MÉDIO** - Fase 4: Commit das Correções (FAZER HOJE)
5. 🟢 **BAIXO** - Fase 5: Prevenção Futura (FAZER ESTA SEMANA)
6. 🟢 **BAIXO** - Fase 6: Comunicação (FAZER ESTA SEMANA)

---

## 📞 PRECISA DE AJUDA?

- **Documentação Completa:** `README_SECURITY_FIX.md`
- **Instruções Detalhadas:** `SECURITY_FIX_INSTRUCTIONS.md`
- **Lista de Credenciais:** `CREDENTIALS_TO_ROTATE.md`
- **Script Automatizado:** `QUICK_FIX_COMMANDS.ps1`
- **Verificação:** `node scripts/check_secrets.js`

---

**Data de Início:** ___/___/______  
**Data de Conclusão:** ___/___/______  
**Responsável:** _______________________  
**Status:** 🟡 Em Andamento
