# Script de correção rápida de segurança - PowerShell
# Execute este script APÓS rotacionar todas as credenciais

Write-Host "🔒 Script de Correção de Segurança - CRM XP" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se as credenciais foram rotacionadas
Write-Host "⚠️  ANTES DE CONTINUAR:" -ForegroundColor Yellow
Write-Host "1. Você rotacionou a senha do Supabase?"
Write-Host "2. Você rotacionou o Google Maps API Key?"
Write-Host "3. Você rotacionou o Meta Ads Token?"
Write-Host "4. Você rotacionou o Evolution API Key?"
Write-Host "5. Você rotacionou o Olist API Token?"
Write-Host ""
$rotated = Read-Host "Todas as credenciais foram rotacionadas? (s/n)"

if ($rotated -ne "s") {
    Write-Host "❌ Por favor, rotacione todas as credenciais primeiro!" -ForegroundColor Red
    Write-Host "Leia SECURITY_FIX_INSTRUCTIONS.md para detalhes"
    exit 1
}

Write-Host ""
Write-Host "✅ Ótimo! Continuando com a limpeza do Git..." -ForegroundColor Green
Write-Host ""

# Verificar se o arquivo secrets_to_clean.txt existe
if (-not (Test-Path "secrets_to_clean.txt")) {
    Write-Host "❌ O arquivo 'secrets_to_clean.txt' não foi encontrado na raiz do projeto!" -ForegroundColor Red
    Write-Host "Por favor, crie o arquivo 'secrets_to_clean.txt' e insira os segredos expostos"
    Write-Host "(um por linha) antes de prosseguir."
    Write-Host "Exemplo:"
    Write-Host "  <SUA_SENHA_ANTIGA_DO_SUPABASE>"
    Write-Host "  <SUA_CHAVE_ANTIGA_DO_GOOGLE_MAPS>"
    exit 1
}

Write-Host "📝 Copiando lista de credenciais para a limpeza do histórico..."
$credentialsFile = "$env:TEMP\credentials_to_remove.txt"
Copy-Item -Path "secrets_to_clean.txt" -Destination $credentialsFile -Force

Write-Host "✅ Lista copiada para $credentialsFile" -ForegroundColor Green
Write-Host ""

# Baixar o BFG Repo-Cleaner JAR se não estiver presente
$bfgJarPath = "$env:TEMP\bfg.jar"
if (-not (Test-Path $bfgJarPath)) {
    Write-Host "📥 Baixando BFG Repo-Cleaner (JAR)..." -ForegroundColor Yellow
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri "https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar" -OutFile $bfgJarPath -UseBasicParsing
        Write-Host "✅ Download concluído: $bfgJarPath" -ForegroundColor Green
    } catch {
        Write-Host "❌ Falha ao baixar BFG Repo-Cleaner: $_" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ BFG Repo-Cleaner (JAR) já está disponível no cache." -ForegroundColor Green
}

Write-Host ""

# Fazer backup
Write-Host "💾 Fazendo backup do repositório..."
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "$env:USERPROFILE\crm-xp-backup-$timestamp"
Copy-Item -Path . -Destination $backupDir -Recurse -Force
Write-Host "✅ Backup criado em: $backupDir" -ForegroundColor Green
Write-Host ""

# Clonar mirror
Write-Host "📦 Clonando repositório mirror..."
$tempDir = "$env:TEMP\CRM-XP.git"
if (Test-Path $tempDir) {
    Remove-Item -Path $tempDir -Recurse -Force
}
Set-Location $env:TEMP
git clone --mirror https://github.com/felipenunes07/CRM-XP.git
Write-Host "✅ Clone concluído" -ForegroundColor Green
Write-Host ""

# Limpar com BFG
Write-Host "🧹 Limpando credenciais do histórico..."
java -jar $bfgJarPath --replace-text $credentialsFile "$tempDir"
Write-Host "✅ Limpeza concluída" -ForegroundColor Green
Write-Host ""

# Limpar e compactar
Write-Host "🗑️  Limpando referências antigas..."
Set-Location $tempDir
git reflog expire --expire=now --all
git gc --prune=now --aggressive
Write-Host "✅ Limpeza de referências concluída" -ForegroundColor Green
Write-Host ""

# Avisar sobre push
Write-Host "⚠️  ATENÇÃO: O próximo passo irá fazer um PUSH FORÇADO!" -ForegroundColor Yellow
Write-Host "Isso irá reescrever o histórico do repositório no GitHub."
Write-Host "Certifique-se de que:"
Write-Host "  1. Você tem backup (criado em: $backupDir)"
Write-Host "  2. Ninguém está trabalhando no repositório agora"
Write-Host "  3. Você tem permissão para fazer push forçado"
Write-Host ""
$pushConfirm = Read-Host "Deseja continuar com o push forçado? (s/n)"

if ($pushConfirm -eq "s") {
    Write-Host "🚀 Fazendo push forçado..."
    git push --force
    Write-Host "✅ Push concluído!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎉 SUCESSO! O histórico foi limpo." -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 PRÓXIMOS PASSOS:"
    Write-Host "1. Volte para o diretório do projeto"
    Write-Host "2. Execute: git pull --force"
    Write-Host "3. Verifique se tudo está funcionando"
    Write-Host "4. Commit as correções de código"
    Write-Host "5. Avise sua equipe para fazer git pull --force"
} else {
    Write-Host "❌ Push cancelado." -ForegroundColor Yellow
    Write-Host "Você pode fazer o push manualmente depois com:"
    Write-Host "  cd $tempDir"
    Write-Host "  git push --force"
}

Write-Host ""
Write-Host "🔍 Para verificar se ainda há credenciais no código:"
Write-Host "  node scripts/check_secrets.js"
Write-Host ""
Write-Host "📚 Documentação completa em:"
Write-Host "  - SECURITY_FIX_SUMMARY.md"
Write-Host "  - SECURITY_FIX_INSTRUCTIONS.md"
Write-Host "  - CREDENTIALS_TO_ROTATE.md"
