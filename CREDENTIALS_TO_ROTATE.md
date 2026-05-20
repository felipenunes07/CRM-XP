# 🔐 OUTRAS CREDENCIAIS QUE DEVEM SER ROTACIONADAS

Além da credencial do Supabase, encontrei outras credenciais sensíveis no seu `.env` que também estão expostas no repositório:

## 🚨 CRÍTICO - Rotacionar Imediatamente:

### 1. Google Maps API Key
```
GOOGLE_MAPS_API_KEY=AIzaSyDW...3XE (Chave antiga exposta)
```
**Ação:** 
- Acesse: https://console.cloud.google.com/apis/credentials
- Revogue esta chave
- Crie uma nova com restrições de domínio/IP

### 2. Meta Ads Access Token
```
META_ADS_ACCESS_TOKEN=EAAVZCyZ...7lRN (Token antigo exposto)
```
**Ação:**
- Acesse: https://business.facebook.com/settings/security
- Revogue este token
- Gere um novo token com permissões mínimas necessárias

### 3. Evolution API Key
```
EVOLUTION_API_KEY=D0AD7ED2...5A60 (Chave antiga exposta)
```
**Ação:**
- Acesse o painel da Evolution API
- Revogue esta chave
- Gere uma nova

### 4. Supabase Anon Key
```
VITE_SUPABASE_ANON_KEY=eyJhbGci...zEGY (Chave antiga exposta)
```
**Nota:** Esta é uma chave pública (anon key), mas ainda assim deve ser rotacionada após rotacionar a senha do banco.

### 5. Olist API Token
```
OLIST_API_TOKEN=919ab6db...3a208 (Token antigo exposto)
```
**Ação:**
- Acesse o painel da Olist/Tiny
- Revogue este token
- Gere um novo

---

## ⚠️ MÉDIO - Considerar Rotação:

### JWT Secret
```
JWT_SECRET=olist-crm-local-secret
```
**Ação:** Gere um secret mais forte:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 📝 CHECKLIST DE ROTAÇÃO:

- [ ] Google Maps API Key rotacionada
- [ ] Meta Ads Access Token rotacionado
- [ ] Evolution API Key rotacionada
- [ ] Olist API Token rotacionado
- [ ] Supabase Anon Key verificada
- [ ] JWT Secret atualizado
- [ ] Arquivo `.env` atualizado
- [ ] Aplicação testada com novas credenciais
- [ ] Histórico do Git limpo
- [ ] Monitoramento de uso suspeito ativado

---

## 🛡️ IMPACTO DE CADA CREDENCIAL:

| Credencial | Impacto se Comprometida | Prioridade |
|------------|-------------------------|------------|
| Supabase DB | Acesso total ao banco de dados | 🔴 CRÍTICO |
| Meta Ads Token | Acesso à conta de anúncios, gastos não autorizados | 🔴 CRÍTICO |
| Google Maps Key | Custos inesperados de API | 🟠 ALTO |
| Evolution API | Acesso ao WhatsApp Business | 🟠 ALTO |
| Olist Token | Acesso a pedidos e clientes | 🟠 ALTO |
| JWT Secret | Falsificação de tokens de autenticação | 🟡 MÉDIO |

---

**IMPORTANTE:** Após rotacionar todas as credenciais, limpe o histórico do Git para remover TODAS as credenciais antigas.
