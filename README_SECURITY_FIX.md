# 🔒 CORREÇÃO DE SEGURANÇA - GUIA RÁPIDO

## ⚠️ SITUAÇÃO

Seu repositório GitHub teve **credenciais sensíveis expostas publicamente** desde 03/04/2026 (46 dias).

Um pesquisador de segurança (Robin) encontrou e notificou você sobre:
- ✅ Credencial do banco de dados Supabase (PostgreSQL)
- ✅ Google Maps API Key
- ✅ Meta Ads Access Token
- ✅ Evolution API Key
- ✅ Olist API Token

## ✅ O QUE JÁ FOI FEITO

- ✅ **16 arquivos corrigidos** - Todas as credenciais hardcoded foram removidas
- ✅ **Código atualizado** - Agora usa variáveis de ambiente (`process.env`)
- ✅ **Documentação criada** - Guias completos de correção
- ✅ **Script de verificação** - Para detectar futuras exposições

## 🚨 O QUE VOCÊ PRECISA FAZER AGORA

### Passo 1: Rotacionar Credenciais (15 minutos)

Acesse cada serviço e gere novas credenciais:

1. **Supabase** (CRÍTICO): https://supabase.com/dashboard/project/gxvxgpwdgkeskttasrfz/settings/database
2. **Google Maps**: https://console.cloud.google.com/apis/credentials
3. **Meta Ads**: https://business.facebook.com/settings/security
4. **Evolution API**: Acesse o painel da Evolution
5. **Olist/Tiny**: Acesse o painel da API

### Passo 2: Atualizar .env (2 minutos)

Atualize o arquivo `.env` com as novas credenciais.

### Passo 3: Limpar Histórico do Git (10 minutos)

Execute o script automatizado:

**Windows (PowerShell):**
```powershell
.\QUICK_FIX_COMMANDS.ps1
```

**Linux/Mac (Bash):**
```bash
chmod +x QUICK_FIX_COMMANDS.sh
./QUICK_FIX_COMMANDS.sh
```

**Ou manualmente:**
```bash
# Instalar BFG
choco install bfg-repo-cleaner  # Windows
brew install bfg                # Mac

# Limpar histórico
git clone --mirror https://github.com/felipenunes07/CRM-XP.git
bfg --replace-text passwords.txt CRM-XP.git
cd CRM-XP.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

### Passo 4: Verificar e Commitar (5 minutos)

```bash
# Verificar se não há mais credenciais
node scripts/check_secrets.js

# Commitar as correções
git add .
git commit -m "fix: remove hardcoded credentials and use environment variables"
git push
```

## 📚 DOCUMENTAÇÃO COMPLETA

- **`SECURITY_FIX_SUMMARY.md`** - Resumo completo da correção
- **`SECURITY_FIX_INSTRUCTIONS.md`** - Instruções detalhadas passo a passo
- **`CREDENTIALS_TO_ROTATE.md`** - Lista de todas as credenciais a rotacionar
- **`scripts/check_secrets.js`** - Script para verificar credenciais expostas

## 🔍 VERIFICAR SE FOI COMPROMETIDO

1. **Supabase**: Verifique logs de acesso no dashboard
2. **Google Maps**: Verifique uso da API no console
3. **Meta Ads**: Verifique atividades suspeitas
4. **Banco de dados**: Verifique se há dados alterados/deletados

## ⏱️ TEMPO ESTIMADO

- **Rotacionar credenciais**: 15 minutos
- **Limpar histórico Git**: 10 minutos
- **Verificar e commitar**: 5 minutos
- **Total**: ~30 minutos

## 🆘 PRECISA DE AJUDA?

1. Leia a documentação completa em `SECURITY_FIX_INSTRUCTIONS.md`
2. Execute `node scripts/check_secrets.js` para verificar
3. Se tiver dúvidas, consulte os arquivos de documentação

## ⚡ AÇÃO RÁPIDA (TL;DR)

```bash
# 1. Rotacione TODAS as credenciais nos painéis dos serviços
# 2. Atualize o .env com as novas credenciais
# 3. Execute:
.\QUICK_FIX_COMMANDS.ps1  # Windows
# ou
./QUICK_FIX_COMMANDS.sh   # Linux/Mac

# 4. Verifique e commite:
node scripts/check_secrets.js
git add .
git commit -m "fix: remove hardcoded credentials"
git push
```

## 🛡️ PREVENÇÃO FUTURA

Após corrigir, instale ferramentas de prevenção:

```bash
# Git-secrets
choco install git-secrets  # Windows
brew install git-secrets   # Mac

# Configurar no projeto
git secrets --install
git secrets --register-aws

# Pre-commit hook
npm install --save-dev husky
npx husky install
npx husky add .husky/pre-commit "node scripts/check_secrets.js"
```

---

**⚠️ NÃO IGNORE ESTE PROBLEMA!**

Credenciais expostas podem resultar em:
- 💰 Custos inesperados
- 🔓 Acesso não autorizado
- 📊 Perda de dados
- ⚖️ Problemas legais (LGPD)

**Tempo de exposição**: 46 dias  
**Prioridade**: 🔴 CRÍTICA  
**Status**: 🟡 Aguardando ação do usuário
