$filePath = "c:\Users\Felipe\Desktop\CRM XP\CRM-XP\apps\api\src\modules\whatsapp\whatsappMonitorCore.ts"
$content = Get-Content $filePath -Raw

# Find lines around "if (!rawMessage)"
$lines = $content -split "`n"
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match 'rawMessage') {
        Write-Host "Line $($i+1): [$($lines[$i].TrimEnd())]"
    }
}
