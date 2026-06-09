-- Otimização de Performance - Histórico de Campanhas
-- Criado em: 2026-06-09
-- Objetivo: Acelerar carregamento do histórico de campanhas

-- Índice para ordenação por data de criação (usado no ORDER BY)
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_created_at 
ON whatsapp_campaigns(created_at DESC);

-- Índice composto para filtrar por campanha e status de destinatários
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_campaign_status 
ON whatsapp_campaign_recipients(campaign_id, status) 
INCLUDE (scheduled_for);

-- Índice para buscar próximo agendamento
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_pending_schedule 
ON whatsapp_campaign_recipients(campaign_id, scheduled_for) 
WHERE status = 'PENDING';

-- Índice para o status da campanha (usado em WHERE conditions)
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_status 
ON whatsapp_campaigns(status) 
WHERE status IN ('QUEUED', 'IN_PROGRESS');

-- Índice para buscar campanhas canceladas
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_cancelled 
ON whatsapp_campaigns(cancelled_at) 
WHERE cancelled_at IS NOT NULL;

-- ANALYZE para atualizar estatísticas do planejador
ANALYZE whatsapp_campaigns;
ANALYZE whatsapp_campaign_recipients;
