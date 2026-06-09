-- Tabela de cache para estatísticas de campanhas
-- Isso acelera DRASTICAMENTE o carregamento do histórico

CREATE TABLE IF NOT EXISTS whatsapp_campaign_stats_cache (
  campaign_id UUID PRIMARY KEY REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  total_recipients INT NOT NULL DEFAULT 0,
  pending_count INT NOT NULL DEFAULT 0,
  blocked_recent_count INT NOT NULL DEFAULT 0,
  sending_count INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  next_scheduled_at TIMESTAMPTZ,
  estimated_finish_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_campaign_stats_cache_updated 
ON whatsapp_campaign_stats_cache(updated_at DESC);

-- Função para atualizar o cache automaticamente
CREATE OR REPLACE FUNCTION update_campaign_stats_cache()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO whatsapp_campaign_stats_cache (
    campaign_id,
    total_recipients,
    pending_count,
    blocked_recent_count,
    sending_count,
    sent_count,
    failed_count,
    skipped_count,
    next_scheduled_at,
    estimated_finish_at,
    updated_at
  )
  SELECT
    campaign_id,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE status = 'PENDING')::int,
    COUNT(*) FILTER (WHERE status = 'BLOCKED_RECENT')::int,
    COUNT(*) FILTER (WHERE status = 'SENDING')::int,
    COUNT(*) FILTER (WHERE status = 'SENT')::int,
    COUNT(*) FILTER (WHERE status = 'FAILED')::int,
    COUNT(*) FILTER (WHERE status = 'SKIPPED')::int,
    MIN(scheduled_for) FILTER (WHERE status = 'PENDING'),
    MAX(scheduled_for) FILTER (WHERE status IN ('PENDING', 'SENDING')),
    NOW()
  FROM whatsapp_campaign_recipients
  WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id)
  GROUP BY campaign_id
  ON CONFLICT (campaign_id) DO UPDATE SET
    total_recipients = EXCLUDED.total_recipients,
    pending_count = EXCLUDED.pending_count,
    blocked_recent_count = EXCLUDED.blocked_recent_count,
    sending_count = EXCLUDED.sending_count,
    sent_count = EXCLUDED.sent_count,
    failed_count = EXCLUDED.failed_count,
    skipped_count = EXCLUDED.skipped_count,
    next_scheduled_at = EXCLUDED.next_scheduled_at,
    estimated_finish_at = EXCLUDED.estimated_finish_at,
    updated_at = NOW();
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar cache automaticamente
DROP TRIGGER IF EXISTS trigger_update_campaign_stats ON whatsapp_campaign_recipients;
CREATE TRIGGER trigger_update_campaign_stats
  AFTER INSERT OR UPDATE OR DELETE ON whatsapp_campaign_recipients
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_stats_cache();

-- Popular cache inicial para campanhas existentes
INSERT INTO whatsapp_campaign_stats_cache (
  campaign_id,
  total_recipients,
  pending_count,
  blocked_recent_count,
  sending_count,
  sent_count,
  failed_count,
  skipped_count,
  next_scheduled_at,
  estimated_finish_at
)
SELECT
  campaign_id,
  COUNT(*)::int,
  COUNT(*) FILTER (WHERE status = 'PENDING')::int,
  COUNT(*) FILTER (WHERE status = 'BLOCKED_RECENT')::int,
  COUNT(*) FILTER (WHERE status = 'SENDING')::int,
  COUNT(*) FILTER (WHERE status = 'SENT')::int,
  COUNT(*) FILTER (WHERE status = 'FAILED')::int,
  COUNT(*) FILTER (WHERE status = 'SKIPPED')::int,
  MIN(scheduled_for) FILTER (WHERE status = 'PENDING'),
  MAX(scheduled_for) FILTER (WHERE status IN ('PENDING', 'SENDING'))
FROM whatsapp_campaign_recipients
GROUP BY campaign_id
ON CONFLICT (campaign_id) DO NOTHING;

COMMENT ON TABLE whatsapp_campaign_stats_cache IS 
'Cache de estatísticas de campanhas para carregamento ultra-rápido do histórico';
