$filePath = "c:\Users\Felipe\Desktop\CRM XP\CRM-XP\apps\api\src\modules\whatsapp\whatsappMonitorCore.ts"
$lines = Get-Content $filePath

for ($i = 188; $i -le 196; $i++) {
    $lineNum = $i + 1
    Write-Host "${lineNum}: [$($lines[$i])]"
}
