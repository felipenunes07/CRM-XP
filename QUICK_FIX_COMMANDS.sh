#!/bin/bash
# Script de correção rápida de segurança
# Execute este script APÓS rotacionar todas as credenciais

echo "🔒 Script de Correção de Segurança - CRM XP"
echo "============================================"
echo ""

# Verificar se as credenciais foram rotacionadas
echo "⚠️  ANTES DE CONTINUAR:"
echo "1. Você rotacionou a senha do Supabase?"
echo "2. Você rotacionou o Google Maps API Key?"
echo "3. Você rotacionou o Meta Ads Token?"
echo "4. Você rotacionou o Evolution API Key?"
echo "5. Você rotacionou o Olist API Token?"
echo ""
read -p "Todas as credenciais foram rotacionadas? (s/n): " rotated

if [ "$rotated" != "s" ]; then
    echo "❌ Por favor, rotacione todas as credenciais primeiro!"
    echo "Leia SECURITY_FIX_INSTRUCTIONS.md para detalhes"
    exit 1
fi

echo ""
echo "✅ Ótimo! Continuando com a limpeza do Git..."
echo ""

# Verificar se o arquivo secrets_to_clean.txt existe
if [ ! -f "secrets_to_clean.txt" ]; then
    echo "❌ O arquivo 'secrets_to_clean.txt' não foi encontrado na raiz do projeto!"
    echo "Por favor, crie o arquivo 'secrets_to_clean.txt' e insira os segredos expostos"
    echo "(um por linha) antes de prosseguir."
    echo "Exemplo:"
    echo "  ***REMOVED***"
    echo "  ***REMOVED***"
    exit 1
fi

echo "📝 Copiando lista de credenciais para a limpeza do histórico..."
cp secrets_to_clean.txt /tmp/credentials_to_remove.txt
echo "✅ Lista copiada para /tmp/credentials_to_remove.txt"
echo ""

# Verificar se BFG está instalado
if ! command -v bfg &> /dev/null; then
    echo "❌ BFG Repo-Cleaner não está instalado!"
    echo ""
    echo "Instale com:"
    echo "  Windows: choco install bfg-repo-cleaner"
    echo "  Mac: brew install bfg"
    echo "  Linux: sudo apt install bfg"
    echo ""
    echo "Ou baixe de: https://rtyley.github.io/bfg-repo-cleaner/"
    exit 1
fi

echo "✅ BFG encontrado!"
echo ""

# Fazer backup
echo "💾 Fazendo backup do repositório..."
BACKUP_DIR="$HOME/crm-xp-backup-$(date +%Y%m%d-%H%M%S)"
cp -r . "$BACKUP_DIR"
echo "✅ Backup criado em: $BACKUP_DIR"
echo ""

# Clonar mirror
echo "📦 Clonando repositório mirror..."
cd /tmp
rm -rf CRM-XP.git 2>/dev/null
git clone --mirror https://github.com/felipenunes07/CRM-XP.git
echo "✅ Clone concluído"
echo ""

# Limpar com BFG
echo "🧹 Limpando credenciais do histórico..."
bfg --replace-text /tmp/credentials_to_remove.txt CRM-XP.git
echo "✅ Limpeza concluída"
echo ""

# Limpar e compactar
echo "🗑️  Limpando referências antigas..."
cd CRM-XP.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
echo "✅ Limpeza de referências concluída"
echo ""

# Avisar sobre push
echo "⚠️  ATENÇÃO: O próximo passo irá fazer um PUSH FORÇADO!"
echo "Isso irá reescrever o histórico do repositório no GitHub."
echo "Certifique-se de que:"
echo "  1. Você tem backup (criado em: $BACKUP_DIR)"
echo "  2. Ninguém está trabalhando no repositório agora"
echo "  3. Você tem permissão para fazer push forçado"
echo ""
read -p "Deseja continuar com o push forçado? (s/n): " push_confirm

if [ "$push_confirm" = "s" ]; then
    echo "🚀 Fazendo push forçado..."
    git push --force
    echo "✅ Push concluído!"
    echo ""
    echo "🎉 SUCESSO! O histórico foi limpo."
    echo ""
    echo "📋 PRÓXIMOS PASSOS:"
    echo "1. Volte para o diretório do projeto"
    echo "2. Execute: git pull --force"
    echo "3. Verifique se tudo está funcionando"
    echo "4. Commit as correções de código"
    echo "5. Avise sua equipe para fazer git pull --force"
else
    echo "❌ Push cancelado."
    echo "Você pode fazer o push manualmente depois com:"
    echo "  cd /tmp/CRM-XP.git"
    echo "  git push --force"
fi

echo ""
echo "🔍 Para verificar se ainda há credenciais no código:"
echo "  node scripts/check_secrets.js"
echo ""
echo "📚 Documentação completa em:"
echo "  - SECURITY_FIX_SUMMARY.md"
echo "  - SECURITY_FIX_INSTRUCTIONS.md"
echo "  - CREDENTIALS_TO_ROTATE.md"
