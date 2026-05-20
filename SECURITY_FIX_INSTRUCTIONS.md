# 🚨 INSTRUÇÕES DE SEGURANÇA - AÇÃO IMEDIATA NECESSÁRIA

## ✅ O que já foi corrigido automaticamente:

1. ✅ Removidas credenciais hardcoded de **11 arquivos**:
   - `scripts/check_import_counts.js`
   - `apps/api/confirm-data.js`
   - `test_db.js`
   - `check_schema.js`
   - `check_snapshot_schema.js`
   - `scratch/check_credit_standalone.js`
   - `scripts/setup_system.js`
   - E outros arquivos em `brain/` e `scratch/`

2. ✅ Todos os arquivos agora usam variáveis de ambiente (`process.env`)
3. ✅ Atualizado `.env.example` com documentação
4. ✅ Verificado que `.env` está no `.gitignore`

---

## 🔴 AÇÕES CRÍTICAS QUE VOCÊ PRECISA FAZER AGORA:

### 1. ROTACIONAR A SENHA DO SUPABASE (URGENTE!)

A credencial exposta ainda está ativa e qualquer pessoa pode acessar seu banco de dados.

**Passos:**
1. Acesse: https://supabase.com/dashboard/project/gxvxgpwdgkeskttasrfz/settings/database
2. Vá em **Database Settings** → **Connection Pooling**
3. Clique em **Reset Database Password**
4. Copie a nova senha
5. Atualize o arquivo `.env` com a nova connection string:
   ```
   SUPABASE_DATABASE_URL=postgresql://postgres.gxvxgpwdgkeskttasrfz:NOVA_SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   ```

### 2. LIMPAR O HISTÓRICO DO GIT

A credencial antiga ainda está no histórico público do GitHub. Você tem 2 opções:

#### Opção A: Usar BFG Repo-Cleaner (Recomendado)
```bash
# Instalar BFG
# Windows: choco install bfg-repo-cleaner
# Mac: brew install bfg

# Fazer backup do repositório
git clone --mirror https://github.com/felipenunes07/CRM-XP.git

# Remover a credencial do histórico
bfg --replace-text passwords.txt CRM-XP.git

# Limpar e fazer push forçado
cd CRM-XP.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

Crie um arquivo `secrets_to_clean.txt` na raiz do projeto com as chaves a remover (uma por linha), por exemplo:
```
[sua_senha_do_supabase_antiga]
[sua_chave_do_google_maps_antiga]
[seu_token_do_meta_ads_antigo]
```

#### Opção B: Usar git-filter-repo
```bash
# Instalar git-filter-repo
pip install git-filter-repo

# Remover o arquivo do histórico
git filter-repo --path scripts/check_import_counts.js --invert-paths

# Fazer push forçado
git push origin --force --all
```

### 3. VERIFICAR ACESSOS SUSPEITOS

1. Acesse o painel do Supabase
2. Vá em **Logs** → **Database Logs**
3. Verifique se há acessos de IPs desconhecidos desde 03/04/2026
4. Se encontrar atividade suspeita, considere:
   - Fazer backup dos dados
   - Verificar se houve alterações não autorizadas
   - Reportar ao suporte do Supabase

### 4. COMMITAR AS CORREÇÕES

```bash
git add .
git commit -m "fix: remove hardcoded database credentials and use environment variables"
git push
```

---

## 📋 CHECKLIST DE SEGURANÇA

- [ ] Senha do Supabase rotacionada
- [ ] Arquivo `.env` atualizado com nova senha
- [ ] Histórico do Git limpo (BFG ou git-filter-repo)
- [ ] Push forçado realizado
- [ ] Logs do Supabase verificados
- [ ] Correções commitadas
- [ ] Testes realizados para garantir que tudo funciona

---

## 🔒 BOAS PRÁTICAS PARA O FUTURO

1. **NUNCA** commite arquivos `.env` ou credenciais
2. Use sempre variáveis de ambiente para dados sensíveis
3. Configure pre-commit hooks para detectar segredos:
   ```bash
   npm install --save-dev @commitlint/cli husky
   npx husky install
   npx husky add .husky/pre-commit "npx secretlint **/*"
   ```
4. Use ferramentas como:
   - [git-secrets](https://github.com/awslabs/git-secrets)
   - [truffleHog](https://github.com/trufflesecurity/trufflehog)
   - [gitleaks](https://github.com/gitleaks/gitleaks)

---

## 📞 PRECISA DE AJUDA?

Se tiver dúvidas ou problemas:
1. Documente o erro
2. Verifique os logs
3. Entre em contato com o suporte do Supabase se necessário

**IMPORTANTE:** Não ignore este problema. Credenciais expostas podem resultar em:
- Perda de dados
- Custos inesperados
- Violação de privacidade
- Problemas legais

---

**Data da correção:** 19/05/2026
**Credencial exposta desde:** 03/04/2026
**Tempo de exposição:** ~46 dias
