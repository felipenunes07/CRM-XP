$filePath = "c:\Users\Felipe\Desktop\CRM XP\CRM-XP\apps\api\src\modules\whatsapp\evolutionWebhook.ts"
$lines = [System.Collections.ArrayList]@(Get-Content $filePath)

# Show lines 255-300 to see all uses of `text` variable
for ($i = 245; $i -le 320; $i++) {
    $lineNum = $i + 1
    if ($lines[$i] -match '\btext\b') {
        Write-Host "${lineNum}: [$($lines[$i])]"
    }
}
