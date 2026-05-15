export const migrations = [
  `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  CREATE TABLE IF NOT EXISTS source_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type TEXT NOT NULL,
    original_path TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS import_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL,
    status TEXT NOT NULL,
    rows_seen INTEGER NOT NULL DEFAULT 0,
    rows_inserted INTEGER NOT NULL DEFAULT 0,
    rows_duplicated INTEGER NOT NULL DEFAULT 0,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS sales_raw (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system TEXT NOT NULL,
    source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL,
    import_run_id UUID REFERENCES import_runs(id) ON DELETE SET NULL,
    external_order_id TEXT,
    external_customer_id TEXT,
    sale_date DATE NOT NULL,
    item_description TEXT NOT NULL,
    quantity NUMERIC(14, 2) NOT NULL,
    customer_code TEXT NOT NULL,
    unit_price NUMERIC(14, 2) NOT NULL,
    line_total NUMERIC(14, 2) NOT NULL,
    order_number TEXT NOT NULL,
    sku TEXT,
    customer_label TEXT NOT NULL,
    attendant_name TEXT,
    order_status TEXT NOT NULL DEFAULT 'VALID',
    order_updated_at TIMESTAMPTZ,
    fingerprint TEXT NOT NULL UNIQUE,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sales_raw_customer_code ON sales_raw(customer_code);
  CREATE INDEX IF NOT EXISTS idx_sales_raw_order_number ON sales_raw(order_number);
  CREATE INDEX IF NOT EXISTS idx_sales_raw_sale_date ON sales_raw(sale_date DESC);

  CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_code TEXT UNIQUE,
    external_customer_id TEXT UNIQUE,
    display_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    internal_notes TEXT NOT NULL DEFAULT '',
    source_system_first TEXT NOT NULL,
    last_attendant TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_customers_normalized_name ON customers(normalized_name);

  ALTER TABLE customers ADD COLUMN IF NOT EXISTS internal_notes TEXT NOT NULL DEFAULT '';

  CREATE TABLE IF NOT EXISTS customer_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    normalized_name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#2956d7',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS customer_label_assignments (
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES customer_labels(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (customer_id, label_id)
  );

  CREATE INDEX IF NOT EXISTS idx_customer_label_assignments_customer_id ON customer_label_assignments(customer_id);
  CREATE INDEX IF NOT EXISTS idx_customer_label_assignments_label_id ON customer_label_assignments(label_id);

  CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system TEXT NOT NULL,
    external_order_id TEXT,
    order_number TEXT NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    customer_code TEXT NOT NULL,
    order_date DATE NOT NULL,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'VALID',
    item_count INTEGER NOT NULL DEFAULT 0,
    last_attendant TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_system, order_number, customer_code, order_date)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
  CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date DESC);

  CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sale_raw_id UUID UNIQUE REFERENCES sales_raw(id) ON DELETE CASCADE,
    sku TEXT,
    item_description TEXT NOT NULL,
    quantity NUMERIC(14, 2) NOT NULL,
    unit_price NUMERIC(14, 2) NOT NULL,
    line_total NUMERIC(14, 2) NOT NULL,
    attendant_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

  CREATE TABLE IF NOT EXISTS customer_snapshot (
    customer_id UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    customer_code TEXT,
    last_purchase_at TIMESTAMPTZ,
    days_since_last_purchase INTEGER,
    total_orders INTEGER NOT NULL DEFAULT 0,
    total_spent NUMERIC(14, 2) NOT NULL DEFAULT 0,
    avg_ticket NUMERIC(14, 2) NOT NULL DEFAULT 0,
    avg_days_between_orders NUMERIC(14, 2),
    purchase_frequency_90d NUMERIC(14, 2) NOT NULL DEFAULT 0,
    frequency_drop_ratio NUMERIC(14, 4) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'INACTIVE',
    value_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
    priority_score NUMERIC(6, 2) NOT NULL DEFAULT 0,
    predicted_next_purchase_at TIMESTAMPTZ,
    primary_insight TEXT,
    insight_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    last_attendant TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_customer_snapshot_status ON customer_snapshot(status);
  CREATE INDEX IF NOT EXISTS idx_customer_snapshot_priority ON customer_snapshot(priority_score DESC);

  CREATE TABLE IF NOT EXISTS sync_cursors (
    key TEXT PRIMARY KEY,
    cursor_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    records_seen INTEGER NOT NULL DEFAULT 0,
    records_inserted INTEGER NOT NULL DEFAULT 0,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb
  );

  CREATE TABLE IF NOT EXISTS message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS message_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
    destination TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS customer_balances_imported (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_code TEXT NOT NULL,
    customer_label TEXT NOT NULL,
    balance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS dashboard_daily_metrics (
    day DATE PRIMARY KEY,
    total_customers INTEGER NOT NULL DEFAULT 0,
    active_count INTEGER NOT NULL DEFAULT 0,
    attention_count INTEGER NOT NULL DEFAULT 0,
    inactive_count INTEGER NOT NULL DEFAULT 0,
    new_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS saved_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_saved_segments_updated_at ON saved_segments(updated_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS prospect_keyword_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    keyword TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS prospect_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_place_id TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL DEFAULT 'GOOGLE_PLACES',
    display_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    primary_category TEXT,
    normalized_primary_category TEXT,
    rating NUMERIC(4, 2),
    user_rating_count INTEGER NOT NULL DEFAULT 0,
    phone TEXT,
    normalized_phone TEXT,
    website_url TEXT,
    address TEXT,
    state TEXT NOT NULL,
    city TEXT,
    maps_url TEXT,
    score NUMERIC(6, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'NEW',
    assigned_to_user_id UUID,
    assigned_to_name TEXT,
    assigned_to_role TEXT,
    claimed_at TIMESTAMPTZ,
    first_contact_at TIMESTAMPTZ,
    last_contact_at TIMESTAMPTZ,
    last_contact_by_user_id UUID,
    last_contact_by_name TEXT,
    discard_reason TEXT,
    last_google_basic_sync_at TIMESTAMPTZ,
    last_google_detail_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (source = 'GOOGLE_PLACES'),
    CHECK (status IN ('NEW', 'CLAIMED', 'CONTACTED', 'DISCARDED'))
  );

  CREATE INDEX IF NOT EXISTS idx_prospect_leads_status ON prospect_leads(status);
  CREATE INDEX IF NOT EXISTS idx_prospect_leads_assigned_to_user_id ON prospect_leads(assigned_to_user_id);
  CREATE INDEX IF NOT EXISTS idx_prospect_leads_state_city ON prospect_leads(state, city);
  CREATE INDEX IF NOT EXISTS idx_prospect_leads_score ON prospect_leads(score DESC);
  CREATE INDEX IF NOT EXISTS idx_prospect_leads_normalized_name ON prospect_leads(normalized_name);

  CREATE TABLE IF NOT EXISTS prospect_contact_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES prospect_leads(id) ON DELETE CASCADE,
    seller_user_id UUID NOT NULL,
    seller_name TEXT NOT NULL,
    seller_role TEXT NOT NULL,
    channel TEXT NOT NULL,
    contact_type TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (channel IN ('WHATSAPP', 'PHONE', 'SITE', 'OTHER')),
    CHECK (contact_type IN ('FIRST_CONTACT', 'FOLLOW_UP', 'NO_RESPONSE', 'INTERESTED', 'DISQUALIFIED'))
  );

  CREATE INDEX IF NOT EXISTS idx_prospect_contact_attempts_lead_id ON prospect_contact_attempts(lead_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prospect_contact_attempts_seller_user_id ON prospect_contact_attempts(seller_user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS prospect_api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL,
    requested_by_user_id UUID NOT NULL,
    requested_by_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CHECK (sku IN ('TEXT_SEARCH_PRO', 'PLACE_DETAILS_ENTERPRISE'))
  );

  CREATE INDEX IF NOT EXISTS idx_prospect_api_usage_logs_sku_created_at ON prospect_api_usage_logs(sku, created_at DESC);

  CREATE TABLE IF NOT EXISTS prospect_search_snapshots (
    query_signature TEXT PRIMARY KEY,
    keyword TEXT NOT NULL,
    state TEXT NOT NULL,
    city TEXT,
    result_place_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    last_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_prospect_search_snapshots_updated_at ON prospect_search_snapshots(updated_at DESC);

  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname = 'set_updated_at'
    ) THEN
      DROP TRIGGER IF EXISTS set_prospect_keyword_presets_updated_at ON prospect_keyword_presets;
      CREATE TRIGGER set_prospect_keyword_presets_updated_at
      BEFORE UPDATE ON prospect_keyword_presets
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS set_prospect_leads_updated_at ON prospect_leads;
      CREATE TRIGGER set_prospect_leads_updated_at
      BEFORE UPDATE ON prospect_leads
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS set_prospect_search_snapshots_updated_at ON prospect_search_snapshots;
      CREATE TRIGGER set_prospect_search_snapshots_updated_at
      BEFORE UPDATE ON prospect_search_snapshots
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
  END
  $$;

  INSERT INTO prospect_keyword_presets (label, keyword, description, sort_order)
  VALUES
    ('Assistencia Tecnica', 'assistencia tecnica', 'Busca ampla para assistencias tecnicas do nicho.', 10),
    ('Distribuidora de Telas', 'distribuidora de telas', 'Distribuidores e atacados com foco em telas e reposicao.', 20),
    ('Troca de Tela', 'troca de tela', 'Leads com forte aderencia a reparo rapido e manutencao.', 30)
  ON CONFLICT (keyword) DO UPDATE
  SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

  DELETE FROM prospect_keyword_presets
  WHERE keyword IN (
    'assistencia tecnica iphone',
    'assistencia tecnica celular',
    'loja de celular',
    'loja de acessorios para celular',
    'peliculas para celular',
    'assistencia tecnica samsung',
    'revenda de celulares'
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS whatsapp_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jid TEXT NOT NULL UNIQUE,
    source_name TEXT NOT NULL,
    normalized_source_name TEXT NOT NULL,
    source_code TEXT,
    classification TEXT NOT NULL DEFAULT 'OTHER',
    mapping_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    match_method TEXT,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    mapping_note TEXT NOT NULL DEFAULT '',
    last_contact_at TIMESTAMPTZ,
    last_campaign_id UUID,
    last_message_preview TEXT,
    last_imported_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (classification IN ('WITH_ORDER', 'NO_ORDER_EXCEL', 'OTHER')),
    CHECK (mapping_status IN ('AUTO_MAPPED', 'MANUAL_MAPPED', 'PENDING_REVIEW', 'CONFIRMED_UNMATCHED', 'IGNORED')),
    CHECK (match_method IS NULL OR match_method IN ('CODE', 'NAME', 'MANUAL', 'CONFIRMED_NONE', 'IGNORED'))
  );

  CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_classification ON whatsapp_groups(classification);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_mapping_status ON whatsapp_groups(mapping_status);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_customer_id ON whatsapp_groups(customer_id);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_source_code ON whatsapp_groups(source_code);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_normalized_source_name ON whatsapp_groups(normalized_source_name);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_last_contact_at ON whatsapp_groups(last_contact_at DESC);

  CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'QUEUED',
    template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
    template_title TEXT,
    saved_segment_id UUID REFERENCES saved_segments(id) ON DELETE SET NULL,
    saved_segment_name TEXT,
    whatsapp_instance_id UUID,
    whatsapp_instance_label TEXT,
    message_text TEXT NOT NULL,
    filters_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    min_delay_seconds INTEGER NOT NULL DEFAULT 183,
    max_delay_seconds INTEGER NOT NULL DEFAULT 304,
    override_recent_block BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_user_id TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status IN ('QUEUED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'))
  );

  CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_status ON whatsapp_campaigns(status);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_created_at ON whatsapp_campaigns(created_at DESC);

  ALTER TABLE whatsapp_campaigns
    ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID,
    ADD COLUMN IF NOT EXISTS whatsapp_instance_label TEXT;

  CREATE TABLE IF NOT EXISTS whatsapp_campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES whatsapp_groups(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    jid TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_code TEXT,
    classification TEXT NOT NULL,
    mapping_status TEXT NOT NULL,
    customer_code TEXT,
    customer_display_name TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    scheduled_for TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    skipped_at TIMESTAMPTZ,
    last_error TEXT,
    provider_message_id TEXT,
    provider_status TEXT,
    response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, group_id),
    CHECK (classification IN ('WITH_ORDER', 'NO_ORDER_EXCEL', 'OTHER')),
    CHECK (mapping_status IN ('AUTO_MAPPED', 'MANUAL_MAPPED', 'PENDING_REVIEW', 'CONFIRMED_UNMATCHED', 'IGNORED')),
    CHECK (status IN ('PENDING', 'BLOCKED_RECENT', 'SENDING', 'SENT', 'FAILED', 'SKIPPED'))
  );

  CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_campaign_status
    ON whatsapp_campaign_recipients(campaign_id, status);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_group_id
    ON whatsapp_campaign_recipients(group_id);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_scheduled_for
    ON whatsapp_campaign_recipients(scheduled_for);

  ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS whatsapp_group_id UUID REFERENCES whatsapp_groups(id) ON DELETE SET NULL;
  ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL;
  ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS provider_payload JSONB;
  ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS error_message TEXT;
  ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS sent_by_user_id TEXT;
  ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS sent_by_name TEXT;

  ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_contact_campaign_id UUID;
  CREATE INDEX IF NOT EXISTS idx_customers_last_contact_at ON customers(last_contact_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS customer_credit_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL,
    source_file_path TEXT NOT NULL,
    source_file_name TEXT NOT NULL,
    source_file_size_bytes BIGINT NOT NULL,
    source_file_updated_at TIMESTAMPTZ NOT NULL,
    parser_version INTEGER NOT NULL DEFAULT 1,
    total_rows INTEGER NOT NULL DEFAULT 0,
    matched_rows INTEGER NOT NULL DEFAULT 0,
    unmatched_rows INTEGER NOT NULL DEFAULT 0,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT FALSE
  );

  ALTER TABLE customer_credit_snapshots
    ADD COLUMN IF NOT EXISTS parser_version INTEGER NOT NULL DEFAULT 1;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_credit_snapshots_active
    ON customer_credit_snapshots(is_active)
    WHERE is_active = TRUE;

  CREATE INDEX IF NOT EXISTS idx_customer_credit_snapshots_imported_at
    ON customer_credit_snapshots(imported_at DESC);

  CREATE TABLE IF NOT EXISTS customer_credit_snapshot_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES customer_credit_snapshots(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_code TEXT NOT NULL,
    customer_display_name TEXT,
    source_display_name TEXT,
    balance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 0,
    operational_state TEXT NOT NULL,
    risk_level TEXT NOT NULL DEFAULT 'OK',
    observation TEXT NOT NULL DEFAULT '',
    last_order_date DATE,
    last_payment_date DATE,
    days_since_last_order INTEGER,
    days_since_last_payment INTEGER,
    payment_term INTEGER,
    risk_score INTEGER,
    flags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    has_over_credit BOOLEAN NOT NULL DEFAULT FALSE,
    has_overdue_payment BOOLEAN NOT NULL DEFAULT FALSE,
    has_severely_overdue_payment BOOLEAN NOT NULL DEFAULT FALSE,
    has_no_payment BOOLEAN NOT NULL DEFAULT FALSE,
    has_no_order BOOLEAN NOT NULL DEFAULT FALSE,
    has_negative_credit BOOLEAN NOT NULL DEFAULT FALSE,
    has_debt_without_credit BOOLEAN NOT NULL DEFAULT FALSE,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_customer_credit_snapshot_rows_snapshot_id
    ON customer_credit_snapshot_rows(snapshot_id);
  CREATE INDEX IF NOT EXISTS idx_customer_credit_snapshot_rows_customer_id
    ON customer_credit_snapshot_rows(customer_id);
  CREATE INDEX IF NOT EXISTS idx_customer_credit_snapshot_rows_customer_code
    ON customer_credit_snapshot_rows(customer_code);
  CREATE INDEX IF NOT EXISTS idx_customer_credit_snapshot_rows_risk_level
    ON customer_credit_snapshot_rows(risk_level);
  CREATE INDEX IF NOT EXISTS idx_customer_credit_snapshot_rows_operational_state
    ON customer_credit_snapshot_rows(operational_state);

  CREATE TABLE IF NOT EXISTS customer_credit_order_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES customer_credit_snapshots(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_code TEXT NOT NULL,
    customer_display_name TEXT NOT NULL,
    source_display_name TEXT,
    order_key TEXT NOT NULL,
    order_number TEXT NOT NULL DEFAULT '',
    order_date DATE,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    units INTEGER NOT NULL DEFAULT 0,
    seller TEXT,
    doc TEXT,
    status TEXT NOT NULL DEFAULT '',
    line_count INTEGER NOT NULL DEFAULT 0,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_customer_credit_order_entries_snapshot_id
    ON customer_credit_order_entries(snapshot_id);
  CREATE INDEX IF NOT EXISTS idx_customer_credit_order_entries_customer_id
    ON customer_credit_order_entries(customer_id);
  CREATE INDEX IF NOT EXISTS idx_customer_credit_order_entries_customer_code
    ON customer_credit_order_entries(customer_code);
  CREATE INDEX IF NOT EXISTS idx_customer_credit_order_entries_order_date
    ON customer_credit_order_entries(order_date DESC);

  CREATE TABLE IF NOT EXISTS customer_credit_payment_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES customer_credit_snapshots(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_code TEXT NOT NULL,
    customer_display_name TEXT NOT NULL,
    source_display_name TEXT,
    payment_key TEXT NOT NULL,
    payment_number TEXT NOT NULL DEFAULT '',
    payment_date DATE,
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
    payment_type TEXT NOT NULL DEFAULT '',
    observation TEXT NOT NULL DEFAULT '',
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_customer_credit_payment_entries_snapshot_id
    ON customer_credit_payment_entries(snapshot_id);
  CREATE INDEX IF NOT EXISTS idx_customer_credit_payment_entries_customer_id
    ON customer_credit_payment_entries(customer_id);
  CREATE INDEX IF NOT EXISTS idx_customer_credit_payment_entries_customer_code
    ON customer_credit_payment_entries(customer_code);
  CREATE INDEX IF NOT EXISTS idx_customer_credit_payment_entries_payment_date
    ON customer_credit_payment_entries(payment_date DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS idea_board_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
    author_display_name TEXT,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status IN ('OPEN', 'CLOSED')),
    CHECK (is_anonymous OR NULLIF(BTRIM(author_display_name), '') IS NOT NULL)
  );

  CREATE INDEX IF NOT EXISTS idx_idea_board_items_status
    ON idea_board_items(status);
  CREATE INDEX IF NOT EXISTS idx_idea_board_items_updated_at
    ON idea_board_items(updated_at DESC, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_idea_board_items_created_by
    ON idea_board_items(created_by_user_id);

  ALTER TABLE idea_board_items
    ADD COLUMN IF NOT EXISTS lane_override TEXT;

  CREATE INDEX IF NOT EXISTS idx_idea_board_items_lane_override
    ON idea_board_items(lane_override);

  CREATE TABLE IF NOT EXISTS idea_board_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idea_id UUID NOT NULL REFERENCES idea_board_items(id) ON DELETE CASCADE,
    voted_by_user_id UUID NOT NULL,
    vote_option TEXT NOT NULL,
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (idea_id, voted_by_user_id),
    CHECK (vote_option IN ('LIKE', 'MAYBE', 'NO'))
  );

  CREATE INDEX IF NOT EXISTS idx_idea_board_votes_idea_id
    ON idea_board_votes(idea_id);
  CREATE INDEX IF NOT EXISTS idx_idea_board_votes_user_id
    ON idea_board_votes(voted_by_user_id);
  CREATE INDEX IF NOT EXISTS idx_idea_board_votes_updated_at
    ON idea_board_votes(updated_at DESC, created_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS inventory_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL,
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    in_stock_rows INTEGER NOT NULL DEFAULT 0,
    matched_sku_rows INTEGER NOT NULL DEFAULT 0,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT FALSE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_snapshots_active
    ON inventory_snapshots(is_active)
    WHERE is_active = TRUE;

  CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_imported_at
    ON inventory_snapshots(imported_at DESC);

  CREATE TABLE IF NOT EXISTS inventory_snapshot_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES inventory_snapshots(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    model TEXT NOT NULL,
    color TEXT,
    quality TEXT,
    price NUMERIC(14, 2) NOT NULL DEFAULT 0,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    promotion_label TEXT,
    normalized_model TEXT NOT NULL DEFAULT '',
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_inventory_snapshot_items_snapshot_id
    ON inventory_snapshot_items(snapshot_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_snapshot_items_sku
    ON inventory_snapshot_items(sku);
  CREATE INDEX IF NOT EXISTS idx_inventory_snapshot_items_normalized_model
    ON inventory_snapshot_items(normalized_model);
  `,
  `
  CREATE TABLE IF NOT EXISTS tiny_product_cache (
    sku TEXT PRIMARY KEY,
    match_method TEXT NOT NULL DEFAULT 'NONE',
    product_id TEXT,
    product_code TEXT,
    product_name TEXT,
    category_tree TEXT,
    supplier_name TEXT,
    price NUMERIC(14, 2),
    promotional_price NUMERIC(14, 2),
    cost_price NUMERIC(14, 2),
    average_cost_price NUMERIC(14, 2),
    location TEXT,
    external_created_at TIMESTAMPTZ,
    external_updated_at TIMESTAMPTZ,
    contact_id TEXT,
    seller_id TEXT,
    seller_name TEXT,
    city TEXT,
    state TEXT,
    reserved_stock NUMERIC(14, 2),
    deposit_names TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    deposits JSONB NOT NULL DEFAULT '[]'::jsonb,
    product_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    contact_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    stock_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (match_method IN ('SKU', 'MODEL', 'NONE'))
  );

  CREATE INDEX IF NOT EXISTS idx_tiny_product_cache_product_code
    ON tiny_product_cache(product_code);
  CREATE INDEX IF NOT EXISTS idx_tiny_product_cache_seller_name
    ON tiny_product_cache(seller_name);
  CREATE INDEX IF NOT EXISTS idx_tiny_product_cache_fetched_at
    ON tiny_product_cache(fetched_at DESC);

  CREATE TABLE IF NOT EXISTS tiny_contact_cache (
    customer_code TEXT PRIMARY KEY,
    contact_id TEXT,
    contact_name TEXT,
    fantasy_name TEXT,
    city TEXT,
    state TEXT,
    seller_id TEXT,
    seller_name TEXT,
    contact_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_tiny_contact_cache_contact_id
    ON tiny_contact_cache(contact_id);
  CREATE INDEX IF NOT EXISTS idx_tiny_contact_cache_seller_name
    ON tiny_contact_cache(seller_name);
  CREATE INDEX IF NOT EXISTS idx_tiny_contact_cache_fetched_at
    ON tiny_contact_cache(fetched_at DESC);
  `,
  `
  CREATE TABLE IF NOT EXISTS monthly_targets (
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    target_amount INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (year, month)
  );
  `,
  `
  ALTER TABLE monthly_targets ADD COLUMN IF NOT EXISTS attendant TEXT NOT NULL DEFAULT 'TOTAL';
  ALTER TABLE monthly_targets ADD COLUMN IF NOT EXISTS target_revenue NUMERIC(14,2) DEFAULT 0;
  ALTER TABLE monthly_targets DROP CONSTRAINT IF EXISTS monthly_targets_pkey;
  ALTER TABLE monthly_targets ADD PRIMARY KEY (year, month, attendant);
  `,
  `
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT;
  CREATE INDEX IF NOT EXISTS idx_customers_state_city ON customers(state, city);

  ALTER TABLE customer_snapshot ADD COLUMN IF NOT EXISTS state TEXT;
  ALTER TABLE customer_snapshot ADD COLUMN IF NOT EXISTS city TEXT;
  CREATE INDEX IF NOT EXISTS idx_customer_snapshot_state_city ON customer_snapshot(state, city);
  `,
  `
  -- WhatsApp instances (multi-number support)
  CREATE TABLE IF NOT EXISTS whatsapp_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name VARCHAR(100) NOT NULL UNIQUE,
    display_label VARCHAR(200) NOT NULL,
    phone_number VARCHAR(20),
    evolution_base_url TEXT NOT NULL,
    evolution_api_key TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_user_id UUID,
    assigned_user_name VARCHAR(200),
    last_health_check_at TIMESTAMPTZ,
    last_health_status VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Pipeline stages (configurable columns)
  CREATE TABLE IF NOT EXISTS pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    color VARCHAR(7) DEFAULT '#6366f1',
    is_won BOOLEAN NOT NULL DEFAULT FALSE,
    is_lost BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Default stages
  INSERT INTO pipeline_stages (name, sort_order, color, is_won, is_lost) VALUES
    ('Contato Inicial', 0, '#8b5cf6', false, false),
    ('Orcamento Enviado', 1, '#3b82f6', false, false),
    ('Negociacao', 2, '#f59e0b', false, false),
    ('Fechado Ganho', 3, '#22c55e', true, false),
    ('Perdido', 4, '#ef4444', false, true)
  ON CONFLICT DO NOTHING;

  -- Deals (negotiations)
  CREATE TABLE IF NOT EXISTS deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(300) NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_code VARCHAR(50),
    customer_display_name VARCHAR(300),
    stage_id UUID NOT NULL REFERENCES pipeline_stages(id),
    assigned_to UUID,
    assigned_to_name VARCHAR(200),
    whatsapp_instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
    whatsapp_jid VARCHAR(200),
    expected_value NUMERIC(12,2) DEFAULT 0,
    expected_close_date DATE,
    priority VARCHAR(10) DEFAULT 'MEDIUM',
    notes TEXT DEFAULT '',
    lost_reason TEXT,
    won_at TIMESTAMPTZ,
    lost_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_deals_stage_id ON deals(stage_id);
  CREATE INDEX IF NOT EXISTS idx_deals_customer_id ON deals(customer_id);
  CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON deals(assigned_to);

  -- Deal activities / timeline
  CREATE TABLE IF NOT EXISTS deal_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    activity_type VARCHAR(30) NOT NULL,
    actor_user_id UUID,
    actor_name VARCHAR(200),
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_deal_activities_deal_id ON deal_activities(deal_id);

  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'set_updated_at') THEN
      DROP TRIGGER IF EXISTS set_whatsapp_instances_updated_at ON whatsapp_instances;
      CREATE TRIGGER set_whatsapp_instances_updated_at BEFORE UPDATE ON whatsapp_instances FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS set_deals_updated_at ON deals;
      CREATE TRIGGER set_deals_updated_at BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
  END
  $$;
  `,
  `
  CREATE TABLE IF NOT EXISTS whatsapp_incoming_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remote_jid VARCHAR(200) NOT NULL,
    sender_name VARCHAR(200),
    message_text TEXT NOT NULL,
    message_id VARCHAR(200) NOT NULL UNIQUE,
    instance_name VARCHAR(100),
    raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_jid ON whatsapp_incoming_messages(remote_jid);
  `,
  `
  ALTER TABLE whatsapp_incoming_messages
    ADD COLUMN IF NOT EXISTS participant_jid VARCHAR(200),
    ADD COLUMN IF NOT EXISTS participant_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS sender_profile_picture_url TEXT,
    ADD COLUMN IF NOT EXISTS chat_display_name VARCHAR(300),
    ADD COLUMN IF NOT EXISTS chat_profile_picture_url TEXT,
    ADD COLUMN IF NOT EXISTS from_me BOOLEAN NOT NULL DEFAULT FALSE;

  CREATE TABLE IF NOT EXISTS whatsapp_chat_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name VARCHAR(100) NOT NULL DEFAULT '',
    remote_jid VARCHAR(200) NOT NULL,
    display_name VARCHAR(300),
    profile_picture_url TEXT,
    is_group BOOLEAN NOT NULL DEFAULT FALSE,
    raw_profile JSONB DEFAULT '{}'::jsonb,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(instance_name, remote_jid)
  );

  CREATE TABLE IF NOT EXISTS whatsapp_participant_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name VARCHAR(100) NOT NULL DEFAULT '',
    participant_jid VARCHAR(200) NOT NULL,
    display_name VARCHAR(300),
    profile_picture_url TEXT,
    raw_profile JSONB DEFAULT '{}'::jsonb,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(instance_name, participant_jid)
  );

  CREATE TABLE IF NOT EXISTS whatsapp_conversation_reads (
    deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    last_read_at TIMESTAMPTZ,
    force_unread BOOLEAN NOT NULL DEFAULT FALSE,
    marked_unread_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (deal_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_participant
    ON whatsapp_incoming_messages(participant_jid);

  CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_profiles_remote_jid
    ON whatsapp_chat_profiles(remote_jid);

  CREATE INDEX IF NOT EXISTS idx_whatsapp_participant_profiles_participant_jid
    ON whatsapp_participant_profiles(participant_jid);

  CREATE INDEX IF NOT EXISTS idx_whatsapp_conversation_reads_user
    ON whatsapp_conversation_reads(user_id);

  CREATE INDEX IF NOT EXISTS idx_whatsapp_conversation_reads_force_unread
    ON whatsapp_conversation_reads(user_id, force_unread)
    WHERE force_unread = TRUE;

  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'set_updated_at') THEN
      DROP TRIGGER IF EXISTS set_whatsapp_chat_profiles_updated_at ON whatsapp_chat_profiles;
      CREATE TRIGGER set_whatsapp_chat_profiles_updated_at
      BEFORE UPDATE ON whatsapp_chat_profiles
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS set_whatsapp_participant_profiles_updated_at ON whatsapp_participant_profiles;
      CREATE TRIGGER set_whatsapp_participant_profiles_updated_at
      BEFORE UPDATE ON whatsapp_participant_profiles
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
  END
  $$;
  `,
  `
  ALTER TABLE whatsapp_instances
    ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

  CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_instance_name
    ON whatsapp_instances(instance_name);
  `,
  `
  CREATE TABLE IF NOT EXISTS message_automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED')),
    channel TEXT NOT NULL CHECK (channel = 'WHATSAPP_GROUP'),
    send_mode TEXT NOT NULL DEFAULT 'APPROVAL',
    trigger_mode TEXT NOT NULL DEFAULT 'SCHEDULED',
    saved_segment_id UUID REFERENCES saved_segments(id) ON DELETE SET NULL,
    saved_segment_name TEXT,
    segment_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    flow_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    whatsapp_instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
    template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
    message_text TEXT NOT NULL DEFAULT '',
    schedule_json JSONB NOT NULL DEFAULT '{"frequency":"DAILY","time":"09:00","timezone":"America/Sao_Paulo"}'::jsonb,
    override_recent_block BOOLEAN NOT NULL DEFAULT FALSE,
    min_delay_seconds INTEGER NOT NULL DEFAULT 183,
    max_delay_seconds INTEGER NOT NULL DEFAULT 304,
    next_run_at TIMESTAMPTZ,
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_message_automations_status_next_run
    ON message_automations(status, next_run_at);

  ALTER TABLE message_automations
    ADD COLUMN IF NOT EXISTS send_mode TEXT NOT NULL DEFAULT 'APPROVAL',
    ADD COLUMN IF NOT EXISTS trigger_mode TEXT NOT NULL DEFAULT 'SCHEDULED',
    ADD COLUMN IF NOT EXISTS flow_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL;

  DO $$
  BEGIN
    ALTER TABLE message_automations DROP CONSTRAINT IF EXISTS message_automations_send_mode_check;
    ALTER TABLE message_automations
      ADD CONSTRAINT message_automations_send_mode_check CHECK (send_mode IN ('AUTOMATIC', 'APPROVAL'));
  END $$;

  DO $$
  BEGIN
    ALTER TABLE message_automations DROP CONSTRAINT IF EXISTS message_automations_trigger_mode_check;
    ALTER TABLE message_automations
      ADD CONSTRAINT message_automations_trigger_mode_check CHECK (trigger_mode IN ('SCHEDULED', 'ON_STAGE_ENTRY'));
  END $$;

  CREATE TABLE IF NOT EXISTS message_automation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID NOT NULL REFERENCES message_automations(id) ON DELETE CASCADE,
    scheduled_for TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('PENDING_APPROVAL', 'ENQUEUED', 'APPROVED', 'REJECTED', 'NO_MATCH', 'FAILED')),
    audience_snapshot JSONB NOT NULL DEFAULT '{"totalCustomerCount":0,"customerIds":[],"eligibleGroupIds":[],"blockedGroupIds":[],"unmappedCustomerIds":[]}'::jsonb,
    mapped_group_count INTEGER NOT NULL DEFAULT 0,
    unmapped_customer_count INTEGER NOT NULL DEFAULT 0,
    blocked_recent_count INTEGER NOT NULL DEFAULT 0,
    campaign_id UUID REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    rejected_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_message_automation_runs_status_scheduled_for
    ON message_automation_runs(status, scheduled_for DESC);

  DO $$
  BEGIN
    ALTER TABLE message_automation_runs DROP CONSTRAINT IF EXISTS message_automation_runs_status_check;
    ALTER TABLE message_automation_runs
      ADD CONSTRAINT message_automation_runs_status_check
      CHECK (status IN ('PENDING_APPROVAL', 'ENQUEUED', 'APPROVED', 'REJECTED', 'NO_MATCH', 'FAILED'));
  END $$;

  CREATE TABLE IF NOT EXISTS message_automation_customer_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID NOT NULL REFERENCES message_automations(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_triggered_run_id UUID REFERENCES message_automation_runs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (automation_id, customer_id, event_key)
  );

  CREATE INDEX IF NOT EXISTS idx_message_automation_customer_events_lookup
    ON message_automation_customer_events(automation_id, event_key, customer_id);
  `,
  `
  -- Messaging Intelligence Events
  CREATE TABLE IF NOT EXISTS message_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    message_id TEXT,
    activity_id UUID REFERENCES deal_activities(id) ON DELETE SET NULL,
    event_type VARCHAR(30) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    label VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT,
    CHECK (severity IN ('LOW', 'MODERATE', 'HIGH', 'CRITICAL'))
  );

  ALTER TABLE message_events DROP CONSTRAINT IF EXISTS message_events_event_type_check;
  ALTER TABLE message_events ADD CONSTRAINT message_events_event_type_check CHECK (event_type IN ('RISK', 'POSITIVE_FEEDBACK', 'NEGATIVE_FEEDBACK', 'COMPLAINT', 'PRAISE', 'QUESTION', 'ESCALATION', 'GREETING', 'NEUTRAL', 'CHURN_RISK', 'SALES_OPPORTUNITY'));

  CREATE INDEX IF NOT EXISTS idx_message_events_deal_id ON message_events(deal_id);
  CREATE INDEX IF NOT EXISTS idx_message_events_event_type ON message_events(event_type);
  CREATE INDEX IF NOT EXISTS idx_message_events_severity ON message_events(severity);
  CREATE INDEX IF NOT EXISTS idx_message_events_detected_at ON message_events(detected_at DESC);
  CREATE INDEX IF NOT EXISTS idx_message_events_resolved ON message_events(resolved_at) WHERE resolved_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_message_events_activity_id ON message_events(activity_id);
  `,
  `
  -- Event Sentiments (daily aggregation)
  CREATE TABLE IF NOT EXISTS event_sentiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    whatsapp_instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
    positive_count INTEGER NOT NULL DEFAULT 0,
    negative_count INTEGER NOT NULL DEFAULT 0,
    neutral_count INTEGER NOT NULL DEFAULT 0,
    average_score NUMERIC(4,3) NOT NULL DEFAULT 0,
    total_messages INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(date, whatsapp_instance_id)
  );

  CREATE INDEX IF NOT EXISTS idx_event_sentiments_date ON event_sentiments(date DESC);
  CREATE INDEX IF NOT EXISTS idx_event_sentiments_instance ON event_sentiments(whatsapp_instance_id);
  `,
  `
  -- Event Resolutions (audit trail)
  CREATE TABLE IF NOT EXISTS event_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES message_events(id) ON DELETE CASCADE,
    resolved_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    resolution_note TEXT NOT NULL,
    resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_event_resolutions_event_id ON event_resolutions(event_id);
  CREATE INDEX IF NOT EXISTS idx_event_resolutions_resolved_by ON event_resolutions(resolved_by);
  CREATE INDEX IF NOT EXISTS idx_event_resolutions_resolved_at ON event_resolutions(resolved_at DESC);
  `,
  `
  -- Message event classifier v2 event types for existing databases
  ALTER TABLE message_events DROP CONSTRAINT IF EXISTS message_events_event_type_check;
  ALTER TABLE message_events ADD CONSTRAINT message_events_event_type_check CHECK (event_type IN ('RISK', 'POSITIVE_FEEDBACK', 'NEGATIVE_FEEDBACK', 'COMPLAINT', 'PRAISE', 'QUESTION', 'ESCALATION', 'GREETING', 'NEUTRAL', 'CHURN_RISK', 'SALES_OPPORTUNITY'));
  `,
  `
  -- Ensure classifier v2 event types are applied after already-recorded migrations
  ALTER TABLE message_events DROP CONSTRAINT IF EXISTS message_events_event_type_check;
  ALTER TABLE message_events ADD CONSTRAINT message_events_event_type_check CHECK (event_type IN ('RISK', 'POSITIVE_FEEDBACK', 'NEGATIVE_FEEDBACK', 'COMPLAINT', 'PRAISE', 'QUESTION', 'ESCALATION', 'GREETING', 'NEUTRAL', 'CHURN_RISK', 'SALES_OPPORTUNITY'));
  `,
  `
  -- Add new_count column to dashboard_daily_metrics
  ALTER TABLE dashboard_daily_metrics ADD COLUMN IF NOT EXISTS new_count INTEGER NOT NULL DEFAULT 0;
  `,
];
