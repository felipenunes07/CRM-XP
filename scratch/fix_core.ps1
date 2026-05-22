$filePath = "c:\Users\Felipe\Desktop\CRM XP\CRM-XP\apps\api\src\modules\whatsapp\whatsappMonitorCore.ts"
$lines = [System.Collections.ArrayList]@(Get-Content $filePath)

# Replace line 192 (index 191) which is "    return null;"
# with two lines: comment + fallback + return
$lines.RemoveAt(191)  # Remove "    return null;"
$lines.Insert(191, '    // Some Evolution API payloads (especially fromMe) carry text at the top level')
$lines.Insert(192, '    const fallback = pickString(message as Record<string, unknown>, ["body", "text", "caption", "content"]);')
$lines.Insert(193, '    return fallback;')

Set-Content $filePath -Value ($lines -join "`r`n") -NoNewline
Write-Host "OK - whatsappMonitorCore.ts updated ($($lines.Count) lines)"
