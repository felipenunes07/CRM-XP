# 🔍 Diagnóstico: Badge "Respondeu" Incorreto

## 🐛 Problema Identificado:

O badge "Respondeu" está marcando clientes como "responderam" quando na verdade não responderam. Exemplo: **Mateus Amorfo** aparece com badge "Respondeu" mas o chat está vazio.

---

## 🔬 Análise do Código:

### Arquivo: `apps/api/src/modules/whatsapp/whatsappCampaignService.ts`

A função `getWhatsappCampaignPerformance()` (linha ~475) executa uma query SQL complexa que:

1. **Busca mensagens inbound** de duas fontes:
   - `deal_activities` (mensagens de WhatsApp em negociações)
   - `whatsapp_incoming_messages` (mensagens do monitor WhatsApp)

2. **Tenta fazer match** com destinatários da campanha usando:
   ```sql
   -- Matching por customer_id
   OR customer_id = recipient.customer_id
   
   -- Matching por customer_code
   OR LOWER(customer_code) = LOWER(recipient.customer_code)
   
   -- Matching por JID (número WhatsApp)
   OR LOWER(event_jid) = LOWER(recipient.jid)
   ```

3. **Verifica janela de atribuição**:
   ```sql
   WHERE e.created_at >= r.sent_at
     AND e.created_at < r.sent_at + (7 days)
   ```

---

## 🚨 Possíveis Causas do Bug:

### 1. **Matching Incorreto de JID**
O JID (número WhatsApp) pode ter formatos diferentes:
- `5511999999999@c.us` (individual)
- `5511999999999@s.whatsapp.net` (individual antigo)
- `5511999999999-1234567890@g.us` (grupo)

Se o matching não normalizar corretamente, pode estar atribuindo mensagens de pessoas diferentes!

### 2. **Mensagens de Grupos**
A query busca mensagens de `whatsapp_incoming_messages` SEM filtrar grupos:
```sql
FROM whatsapp_incoming_messages wim
WHERE from_me = false  -- OK
-- MAS NÃO FILTRA @g.us! ⚠️
```

Isso significa que mensagens de GRUPOS podem estar sendo contadas como resposta individual!

### 3. **Deduplicação Falha**
A query usa `DISTINCT ON (event_key)` mas se `message_id` estiver vazio ou duplicado, pode contar a mesma mensagem múltiplas vezes.

### 4. **Atribuição a Campanha Errada**
A lógica tenta evitar atribuir a campanha mais recente, mas pode estar falhando:
```sql
WHERE NOT EXISTS (
  SELECT 1 FROM whatsapp_campaign_recipients newer
  WHERE newer.sent_at > r.sent_at
    AND newer.sent_at <= e.created_at
)
```

Se houver problema nessa lógica, mensagens de campanhas anteriores podem estar sendo contadas.

---

## 🔧 Solução Proposta:

### Fix 1: Adicionar Filtro de Mensagens Próprias

A query já tem `COALESCE(wim.from_me, false) = false`, mas vamos garantir que funcione.

### Fix 2: **FILTRAR MENSAGENS DE GRUPOS** ⚠️ CRÍTICO

Adicionar filtro para IGNORAR mensagens de grupos:
```sql
FROM whatsapp_incoming_messages wim
WHERE COALESCE(wim.from_me, false) = false
  AND LOWER(COALESCE(wim.remote_jid, '')) NOT LIKE '%@g.us'  -- ✅ NOVO!
```

### Fix 3: Melhorar Matching de JID

Normalizar JIDs antes de comparar (remover sufixos):
```sql
-- Função auxiliar para normalizar JID
CREATE OR REPLACE FUNCTION normalize_jid(jid text) RETURNS text AS $$
BEGIN
  RETURN LOWER(REGEXP_REPLACE(COALESCE(jid, ''), '@(c\.us|s\.whatsapp\.net)$', ''));
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### Fix 4: Adicionar Log de Debug

Adicionar logs temporários para ver quais mensagens estão sendo atribuídas:
```typescript
console.log('🔍 Inbound messages attributed:', {
  campaignId,
  recipientId,
  messageCount: inboundResult.rows.length,
  messages: inboundResult.rows.map(r => ({
    recipientId: r.recipient_id,
    content: r.content?.substring(0, 50),
    jid: r.jid,
    createdAt: r.created_at
  }))
});
```

---

## 📋 Query de Diagnóstico:

Execute essa query para ver o que está acontecendo:

```sql
-- Ver destinatários que "responderam"
SELECT 
  r.id,
  r.customer_display_name,
  r.jid,
  r.responded,
  r.response_count,
  r.first_response_at,
  r.sent_at
FROM whatsapp_campaign_recipients r
WHERE r.campaign_id = 'SEU_CAMPAIGN_ID_AQUI'
  AND r.responded = true
ORDER BY r.customer_display_name;

-- Ver mensagens atribuídas a esse destinatário
-- (substitua RECIPIENT_ID pelo ID do "Mateus Amorfo")
WITH campaign_recipients AS (
  SELECT
    id,
    campaign_id,
    customer_id,
    customer_code,
    jid,
    sent_at
  FROM whatsapp_campaign_recipients
  WHERE campaign_id = 'SEU_CAMPAIGN_ID_AQUI'
    AND id = 'RECIPIENT_ID_MATEUS_AMORFO'
    AND status = 'SENT'
    AND sent_at IS NOT NULL
)
SELECT
  wim.id,
  wim.message_id,
  wim.remote_jid,
  wim.sender_name,
  wim.message_text,
  wim.created_at,
  wim.from_me,
  r.jid AS recipient_jid,
  r.customer_display_name
FROM whatsapp_incoming_messages wim
CROSS JOIN campaign_recipients r
WHERE COALESCE(wim.from_me, false) = false
  AND wim.created_at >= r.sent_at
  AND wim.created_at < r.sent_at + INTERVAL '7 days'
  AND (
    LOWER(wim.remote_jid) = LOWER(r.jid)
    OR LOWER(wim.remote_jid) LIKE LOWER(r.jid) || '%'
  )
ORDER BY wim.created_at DESC;
```

---

## ✅ Plano de Ação:

1. ✅ **Adicionar filtro de grupos** na query SQL
2. ✅ **Adicionar logs de debug** temporários
3. ✅ **Testar com campanha real** (especialmente "Mateus Amorfo")
4. ✅ **Verificar dados** com query de diagnóstico
5. ✅ **Recalcular cache** da performance após fix

---

## 🎯 Resultado Esperado:

### Antes:
- ❌ Mateus Amorfo: Badge "Respondeu" com chat vazio
- ❌ Outros clientes marcados incorretamente

### Depois:
- ✅ Mateus Amorfo: SEM badge (porque não respondeu)
- ✅ Apenas clientes que REALMENTE responderam têm badge
- ✅ Badge sincronizado com chat real

---

**Vamos implementar o fix agora!**
