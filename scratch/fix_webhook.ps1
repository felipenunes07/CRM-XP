$filePath = "c:\Users\Felipe\Desktop\CRM XP\CRM-XP\apps\api\src\modules\whatsapp\evolutionWebhook.ts"
$lines = [System.Collections.ArrayList]@(Get-Content $filePath)

# Replace lines 203-210 (indices 202-209) which is the if (!text) block
# with a block that creates messageContent with a media fallback
$removeCount = 8  # lines 203-210
for ($i = 0; $i -lt $removeCount; $i++) {
    $lines.RemoveAt(202)
}

# Insert new block at index 202
$newBlock = @(
    '    // Try to resolve content for messages without extracted text (e.g., media-only messages)',
    '    let messageContent = text;',
    '    if (!messageContent) {',
    '      const msgMedia = extractEvolutionMessageMedia(msg);',
    '      const msgContact = extractEvolutionMessageContact(msg);',
    '      messageContent = msgMedia',
    '        ? (msgMedia.caption || msgMedia.fileName || (',
    '            msgMedia.mediaType === "image" ? "[Imagem]" :',
    '            msgMedia.mediaType === "video" ? "[Vídeo]" :',
    '            msgMedia.mediaType === "audio" ? "[Áudio]" :',
    '            msgMedia.mediaType === "sticker" ? "[Sticker]" :',
    '            "[Documento]"',
    '          ))',
    '        : msgContact',
    '          ? "[Contato]"',
    '          : null;',
    '',
    '      if (!messageContent) {',
    '        logger.info("evolution webhook skipped message: no text and no media content", {',
    '          instance,',
    '          remoteJid,',
    '          messageId,',
    '        });',
    '        continue;',
    '      }',
    '    }'
)

for ($i = 0; $i -lt $newBlock.Count; $i++) {
    $lines.Insert(202 + $i, $newBlock[$i])
}

# Now replace remaining uses of `text` variable (the standalone ones, not inside strings)
# These occur after our new block. Let me adjust line numbers:
# After insertion, there are $newBlock.Count - $removeCount more lines = 26 - 8 = 18 extra lines
# Original line numbers that had `text`: 259, 288, 322, 335, 340, 403, 416, 421
# New line numbers: +18 = 277, 306, 340, 353, 358, 421, 434, 439

$content = $lines -join "`r`n"

# Replace standalone text references with messageContent
# textPreview: text.slice(0, 80),
$content = $content.Replace('textPreview: text.slice(0, 80),', 'textPreview: messageContent.slice(0, 80),')

# In the query params array, "text," by itself
# We need to be careful - only replace the standalone "text," in the query params, not inside strings
# Line 288 (now 306): "        text,"
$content = $content.Replace("`r`n        text,`r`n        messageId,`r`n        instanceName,", "`r`n        messageContent,`r`n        messageId,`r`n        instanceName,")

# content: text, in insertDealActivity calls
$content = $content.Replace('content: text,', 'content: messageContent,')

# content: text, in monitorMessage objects  
$content = $content.Replace('content: text,', 'content: messageContent,')

# risk: detectWhatsappMessageRisk(text),
$content = $content.Replace('risk: detectWhatsappMessageRisk(text),', 'risk: detectWhatsappMessageRisk(messageContent),')

Set-Content $filePath -Value $content -NoNewline
Write-Host "OK - evolutionWebhook.ts updated"
