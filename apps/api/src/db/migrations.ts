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
  -- Add new_count and daily_items_sold columns to dashboard_daily_metrics
  ALTER TABLE dashboard_daily_metrics ADD COLUMN IF NOT EXISTS new_count INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE dashboard_daily_metrics ADD COLUMN IF NOT EXISTS daily_items_sold INTEGER NOT NULL DEFAULT 0;
  `,
  `
  -- UazAPI provider support: multi-provider WhatsApp instances
  ALTER TABLE whatsapp_instances
    ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'EVOLUTION',
    ADD COLUMN IF NOT EXISTS uazapi_base_url TEXT,
    ADD COLUMN IF NOT EXISTS uazapi_token TEXT;

  -- Carousel message support for campaigns
  ALTER TABLE whatsapp_campaigns
    ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'TEXT',
    ADD COLUMN IF NOT EXISTS carousel_data JSONB;
  `,
  `
  CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$;

  CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_sign_in_at TIMESTAMPTZ,
    CHECK (role IN ('admin', 'vendas', 'financeiro', 'operacional', 'viewer'))
  );

  CREATE TABLE IF NOT EXISTS permissions (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    role TEXT NOT NULL,
    permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role, permission_key),
    CHECK (role IN ('admin', 'vendas', 'financeiro', 'operacional', 'viewer'))
  );

  ALTER TABLE profiles ALTER COLUMN role DROP DEFAULT;
  ALTER TABLE profiles ALTER COLUMN role TYPE TEXT USING lower(role::text);
  ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'viewer';

  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND constraint_name = 'profiles_id_fkey'
    ) THEN
      ALTER TABLE profiles DROP CONSTRAINT profiles_id_fkey;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'name'
    ) THEN
      ALTER TABLE profiles ALTER COLUMN name DROP NOT NULL;
    END IF;
  END $$;

  CREATE TABLE IF NOT EXISTS user_permissions (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    allowed BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, permission_key)
  );

  ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'viewer',
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;

  UPDATE profiles
  SET full_name = COALESCE(NULLIF(full_name, ''), split_part(email, '@', 1), 'Usuario')
  WHERE full_name IS NULL OR full_name = '';

  ALTER TABLE profiles ALTER COLUMN full_name SET NOT NULL;

  INSERT INTO permissions (key, name, description)
  VALUES
    ('dashboard.view', 'Dashboard geral', 'Visualizar os indicadores principais do CRM.'),
    ('commercial.view', 'Ferramentas comerciais', 'Acessar clientes, agenda, pipeline e prospeccao.'),
    ('commercial.manage', 'Gestao comercial', 'Criar e alterar registros comerciais.'),
    ('messages.view', 'Mensagens', 'Visualizar mensagens, disparos e conversas.'),
    ('messages.manage', 'Gestao de mensagens', 'Criar modelos, campanhas e responder conversas.'),
    ('finance.view', 'Financeiro', 'Visualizar credito, comprovantes e informacoes financeiras.'),
    ('finance.manage', 'Gestao financeira', 'Atualizar metas e dados financeiros.'),
    ('reports.view', 'Relatorios', 'Visualizar relatorios e analises.'),
    ('settings.manage', 'Configuracoes', 'Alterar configuracoes internas do CRM.'),
    ('admin.panel.view', 'Painel administrativo', 'Acessar area administrativa.'),
    ('admin.users.manage', 'Gestao de usuarios', 'Criar, editar, desativar usuarios e redefinir acessos.'),
    ('automations.view', 'Automacoes', 'Visualizar automacoes.'),
    ('automations.manage', 'Gestao de automacoes', 'Criar, editar, executar e aprovar automacoes.'),
    ('integrations.manage', 'Integracoes', 'Gerenciar integracoes e instancias externas.')
  ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description;

  INSERT INTO role_permissions (role, permission_key)
  SELECT 'admin', key FROM permissions
  ON CONFLICT DO NOTHING;

  INSERT INTO role_permissions (role, permission_key)
  VALUES
    ('vendas', 'dashboard.view'),
    ('vendas', 'commercial.view'),
    ('vendas', 'commercial.manage'),
    ('vendas', 'messages.view'),
    ('vendas', 'messages.manage'),
    ('vendas', 'reports.view'),
    ('vendas', 'automations.view'),
    ('financeiro', 'dashboard.view'),
    ('financeiro', 'finance.view'),
    ('financeiro', 'finance.manage'),
    ('financeiro', 'reports.view'),
    ('operacional', 'dashboard.view'),
    ('operacional', 'commercial.view'),
    ('operacional', 'messages.view'),
    ('operacional', 'reports.view'),
    ('operacional', 'automations.view'),
    ('operacional', 'integrations.manage'),
    ('viewer', 'dashboard.view'),
    ('viewer', 'reports.view')
  ON CONFLICT DO NOTHING;

  INSERT INTO profiles (id, email, full_name, role, is_active, created_at, updated_at, last_sign_in_at)
  SELECT
    u.id,
    u.email,
    u.name,
    CASE
      WHEN UPPER(u.role) = 'ADMIN' THEN 'admin'
      WHEN UPPER(u.role) = 'SELLER' THEN 'vendas'
      ELSE 'operacional'
    END,
    TRUE,
    u.created_at,
    u.updated_at,
    u.last_login_at
  FROM users u
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      updated_at = NOW(),
      last_sign_in_at = EXCLUDED.last_sign_in_at;

  CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
  CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);
  CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);

  DROP TRIGGER IF EXISTS set_profiles_updated_at ON profiles;
  CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  DROP TRIGGER IF EXISTS set_user_permissions_updated_at ON user_permissions;
  CREATE TRIGGER set_user_permissions_updated_at
    BEFORE UPDATE ON user_permissions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `,
  `
  -- Performance indexes for dashboard, reports and WhatsApp monitor read paths.
  CREATE INDEX IF NOT EXISTS idx_orders_customer_order_date
    ON orders(customer_id, order_date DESC);

  CREATE INDEX IF NOT EXISTS idx_order_items_order_quantity
    ON order_items(order_id, quantity);

  CREATE INDEX IF NOT EXISTS idx_deal_activities_type_created_at
    ON deal_activities(activity_type, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_deal_activities_deal_type_created_at
    ON deal_activities(deal_id, activity_type, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_deal_activities_whatsapp_message_id
    ON deal_activities ((metadata ->> 'messageId'))
    WHERE metadata ? 'messageId';

  CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_remote_instance_created
    ON whatsapp_incoming_messages(remote_jid, instance_name, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_message_created
    ON whatsapp_incoming_messages(message_id, created_at DESC);

  -- Serves the per-group "latest message" lookup used by the conversation list
  -- (group preview by JID) and the group detail query. Without created_at as the
  -- 2nd column (the older index put instance_name in the middle) Postgres had to
  -- scan + sort every row of a group per deal row, spiking CPU on the monitor page.
  CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_jid_created
    ON whatsapp_incoming_messages(remote_jid, created_at DESC, id DESC);
  `,
  `
  -- Evolution API Webhook Idempotency & Database Optimizations
  CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL DEFAULT 'evolution',
    event_type VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    message_id VARCHAR(200),
    remote_jid VARCHAR(200),
    instance_name VARCHAR(100),
    instance_id UUID,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL,
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_webhook_events_idempotency_key ON webhook_events(idempotency_key);
  CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events(received_at DESC);

  CREATE INDEX IF NOT EXISTS idx_deals_whatsapp_jid ON deals(whatsapp_jid);
  CREATE INDEX IF NOT EXISTS idx_pipeline_stages_won_lost ON pipeline_stages(is_won, is_lost);
  CREATE INDEX IF NOT EXISTS idx_deal_activities_whatsapp_provider_id
    ON deal_activities ((metadata ->> 'providerMessageId'))
    WHERE metadata ? 'providerMessageId';
  `,
  `
  -- WhatsApp monitor performance indexes
  CREATE INDEX IF NOT EXISTS idx_deal_activities_whatsapp_deal_created
    ON deal_activities(deal_id, created_at DESC, id DESC)
    WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED');

  CREATE INDEX IF NOT EXISTS idx_deal_activities_whatsapp_created
    ON deal_activities(created_at DESC, id DESC)
    WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED');

  CREATE INDEX IF NOT EXISTS idx_deal_activities_whatsapp_type_created
    ON deal_activities(activity_type, created_at DESC, id DESC)
    WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED');

  CREATE INDEX IF NOT EXISTS idx_deal_activities_whatsapp_deal_instance
    ON deal_activities(deal_id, (LOWER(COALESCE(metadata ->> 'instance', ''))))
    WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED');

  CREATE INDEX IF NOT EXISTS idx_deals_whatsapp_jid_not_null
    ON deals(whatsapp_jid)
    WHERE whatsapp_jid IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_deals_whatsapp_instance_id
    ON deals(whatsapp_instance_id)
    WHERE whatsapp_instance_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_deals_whatsapp_last_activity
    ON deals(last_activity_at DESC, id DESC)
    WHERE whatsapp_jid IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_deals_whatsapp_instance_last_activity
    ON deals(whatsapp_instance_id, last_activity_at DESC, id DESC)
    WHERE whatsapp_jid IS NOT NULL
      AND whatsapp_instance_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_deals_whatsapp_assigned_last_activity
    ON deals(assigned_to, last_activity_at DESC, id DESC)
    WHERE whatsapp_jid IS NOT NULL
      AND assigned_to IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_deals_whatsapp_assigned_name_last_activity
    ON deals((LOWER(COALESCE(assigned_to_name, ''))), last_activity_at DESC, id DESC)
    WHERE whatsapp_jid IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_remote_lower_instance_created
    ON whatsapp_incoming_messages(
      remote_jid,
      (LOWER(COALESCE(instance_name, ''))),
      created_at DESC,
      id DESC
    );

  CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_profiles_remote_instance_updated
    ON whatsapp_chat_profiles(remote_jid, instance_name, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_whatsapp_participant_profiles_jid_instance_updated
    ON whatsapp_participant_profiles(participant_jid, instance_name, updated_at DESC);
  `,
  `
  -- Pre-aggregated WhatsApp activity read model
  CREATE TABLE IF NOT EXISTS whatsapp_activity_rollups (
    period_date DATE NOT NULL,
    hour SMALLINT NOT NULL CHECK (hour >= 0 AND hour <= 23),
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    instance_name TEXT,
    display_label TEXT,
    phone_number TEXT,
    profile_picture_url TEXT,
    remote_jid TEXT NOT NULL,
    chat_name TEXT,
    sent_messages INTEGER NOT NULL DEFAULT 0,
    received_messages INTEGER NOT NULL DEFAULT 0,
    response_count INTEGER NOT NULL DEFAULT 0,
    response_seconds_total DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (period_date, hour, agent_id, remote_jid)
  );

  CREATE INDEX IF NOT EXISTS idx_whatsapp_activity_rollups_period
    ON whatsapp_activity_rollups(period_date DESC, hour);

  CREATE INDEX IF NOT EXISTS idx_whatsapp_activity_rollups_agent_period
    ON whatsapp_activity_rollups(agent_id, period_date DESC);

  CREATE INDEX IF NOT EXISTS idx_whatsapp_activity_rollups_last_message
    ON whatsapp_activity_rollups(last_message_at DESC);
  `,
  `
  -- WhatsApp LID/PN alias mapping for Evolution/Baileys mixed identifiers
  CREATE TABLE IF NOT EXISTS whatsapp_jid_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name VARCHAR(100) NOT NULL DEFAULT '',
    alias_jid VARCHAR(200) NOT NULL,
    canonical_jid VARCHAR(200) NOT NULL,
    alias_type VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    source VARCHAR(80),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(instance_name, alias_jid)
  );

  CREATE INDEX IF NOT EXISTS idx_whatsapp_jid_aliases_canonical
    ON whatsapp_jid_aliases(instance_name, canonical_jid);

  CREATE INDEX IF NOT EXISTS idx_whatsapp_jid_aliases_alias_type
    ON whatsapp_jid_aliases(alias_type);

  WITH raw_candidates AS (
    SELECT
      LOWER(COALESCE(instance_name, '')) AS instance_name,
      LOWER(remote_jid) AS alias_jid,
      COALESCE(
        NULLIF(raw_payload #>> '{key,remoteJidAlt}', ''),
        NULLIF(raw_payload ->> 'remoteJidAlt', ''),
        CASE
          WHEN COALESCE(from_me, false) = false THEN COALESCE(
            NULLIF(raw_payload #>> '{key,senderPn}', ''),
            NULLIF(raw_payload ->> 'senderPn', '')
          )
          ELSE NULL
        END
      ) AS phone_candidate
    FROM whatsapp_incoming_messages
    WHERE remote_jid LIKE '%@lid'
      OR (
        remote_jid NOT LIKE '%@%'
        AND length(regexp_replace(remote_jid, '\\D', '', 'g')) > 13
      )
  ),
  normalized_candidates AS (
    SELECT
      instance_name,
      alias_jid,
      CASE
        WHEN LOWER(phone_candidate) LIKE '%@s.whatsapp.net' THEN LOWER(phone_candidate)
        WHEN regexp_replace(COALESCE(phone_candidate, ''), '\\D', '', 'g') <> '' THEN
          regexp_replace(phone_candidate, '\\D', '', 'g') || '@s.whatsapp.net'
        ELSE NULL
      END AS canonical_jid
    FROM raw_candidates
  )
  INSERT INTO whatsapp_jid_aliases (
    instance_name, alias_jid, canonical_jid, alias_type, source,
    first_seen_at, last_seen_at, created_at, updated_at
  )
  SELECT
    instance_name,
    alias_jid,
    canonical_jid,
    'LID',
    'migration-backfill',
    NOW(),
    NOW(),
    NOW(),
    NOW()
  FROM normalized_candidates
  WHERE canonical_jid IS NOT NULL
    AND canonical_jid <> alias_jid
  ON CONFLICT (instance_name, alias_jid) DO UPDATE SET
    canonical_jid = EXCLUDED.canonical_jid,
    alias_type = EXCLUDED.alias_type,
    source = COALESCE(whatsapp_jid_aliases.source, EXCLUDED.source),
    last_seen_at = NOW(),
    updated_at = NOW();
  `,
  `
  -- WhatsApp monitor identity repair for Evolution JID/LID payloads.
  CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_participant_lower_instance_created
    ON whatsapp_incoming_messages(
      participant_jid,
      (LOWER(COALESCE(instance_name, ''))),
      created_at DESC,
      id DESC
    );
 
  CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_lower_instance_created
    ON whatsapp_incoming_messages(
      (LOWER(COALESCE(instance_name, ''))),
      created_at DESC,
      id DESC
    );
 
  CREATE INDEX IF NOT EXISTS idx_whatsapp_jid_aliases_instance_alias_canonical
    ON whatsapp_jid_aliases(instance_name, alias_jid, canonical_jid);
 
  DO $$
  DECLARE
    lid_deals INTEGER;
    numeric_names INTEGER;
    seller_avatar_profiles INTEGER;
    unlinked_outbound INTEGER;
  BEGIN
    SELECT COUNT(*) INTO lid_deals
    FROM deals
    WHERE whatsapp_jid LIKE '%@lid'
      AND COALESCE(last_activity_at, created_at) >= NOW() - INTERVAL '3 days';
 
    SELECT COUNT(*) INTO numeric_names
    FROM deals
    WHERE whatsapp_jid IS NOT NULL
      AND COALESCE(last_activity_at, created_at) >= NOW() - INTERVAL '3 days'
      AND (
        customer_display_name IS NULL
        OR customer_display_name = ''
        OR LOWER(customer_display_name) = LOWER(whatsapp_jid)
        OR regexp_replace(customer_display_name, '\\D', '', 'g') = regexp_replace(whatsapp_jid, '\\D', '', 'g')
      );
 
    SELECT COUNT(*) INTO seller_avatar_profiles
    FROM whatsapp_chat_profiles wcp
    JOIN whatsapp_instances wi
      ON LOWER(wi.instance_name) = LOWER(wcp.instance_name)
    WHERE wcp.updated_at >= NOW() - INTERVAL '3 days'
      AND NULLIF(wcp.profile_picture_url, '') IS NOT NULL
      AND wcp.profile_picture_url = wi.profile_picture_url;
 
    SELECT COUNT(*) INTO unlinked_outbound
    FROM whatsapp_incoming_messages wim
    WHERE wim.created_at >= NOW() - INTERVAL '3 days'
      AND COALESCE(wim.from_me, false) = true
      AND NOT EXISTS (
        SELECT 1
        FROM deal_activities da
        WHERE da.metadata ->> 'messageId' = wim.message_id
           OR da.metadata ->> 'providerMessageId' = wim.message_id
      );
 
    RAISE NOTICE 'whatsapp_identity_repair before: lid_deals=%, numeric_names=%, seller_avatar_profiles=%, unlinked_outbound=%',
      lid_deals, numeric_names, seller_avatar_profiles, unlinked_outbound;
  END $$;
 
  WITH source_messages AS (
    SELECT
      LOWER(COALESCE(instance_name, '')) AS instance_name,
      LOWER(COALESCE(remote_jid, '')) AS remote_jid,
      LOWER(COALESCE(participant_jid, '')) AS participant_jid,
      raw_payload,
      created_at
    FROM whatsapp_incoming_messages
    WHERE created_at >= NOW() - INTERVAL '3 days'
      AND LOWER(COALESCE(remote_jid, '')) NOT LIKE '%@g.us'
  ),
  candidate_pairs AS (
    SELECT
      source_messages.instance_name,
      source_messages.created_at,
      CASE
        WHEN LOWER(alias_value) LIKE '%@lid' THEN LOWER(alias_value)
        WHEN regexp_replace(COALESCE(alias_value, ''), '\\D', '', 'g') <> ''
          AND LENGTH(regexp_replace(COALESCE(alias_value, ''), '\\D', '', 'g')) > 13
          THEN regexp_replace(alias_value, '\\D', '', 'g') || '@lid'
        ELSE NULL
      END AS alias_jid,
      CASE
        WHEN LOWER(COALESCE(phone_value, '')) LIKE '%@lid' THEN NULL
        WHEN LOWER(COALESCE(phone_value, '')) LIKE '%@g.us' THEN NULL
        WHEN LOWER(COALESCE(phone_value, '')) LIKE '%@s.whatsapp.net' THEN LOWER(phone_value)
        WHEN LENGTH(regexp_replace(COALESCE(phone_value, ''), '\\D', '', 'g')) BETWEEN 10 AND 13
          THEN regexp_replace(phone_value, '\\D', '', 'g') || '@s.whatsapp.net'
        ELSE NULL
      END AS canonical_jid
    FROM source_messages
    CROSS JOIN LATERAL (
      VALUES
        (source_messages.remote_jid),
        (source_messages.participant_jid),
        (source_messages.raw_payload #>> '{key,remoteJid}'),
        (source_messages.raw_payload #>> '{key,participant}'),
        (source_messages.raw_payload #>> '{key,senderJid}'),
        (source_messages.raw_payload ->> 'remoteJid'),
        (source_messages.raw_payload ->> 'chatId'),
        (source_messages.raw_payload ->> 'jid'),
        (source_messages.raw_payload ->> 'participant'),
        (source_messages.raw_payload ->> 'participantJid'),
        (source_messages.raw_payload ->> 'senderJid')
    ) aliases(alias_value)
    CROSS JOIN LATERAL (
      VALUES
        (source_messages.raw_payload #>> '{key,remoteJidPn}'),
        (source_messages.raw_payload #>> '{key,remoteJidAlt}'),
        (source_messages.raw_payload #>> '{key,senderPn}'),
        (source_messages.raw_payload #>> '{key,participantPn}'),
        (source_messages.raw_payload #>> '{key,participantAlt}'),
        (source_messages.raw_payload ->> 'remoteJidPn'),
        (source_messages.raw_payload ->> 'remoteJidAlt'),
        (source_messages.raw_payload ->> 'chatIdPn'),
        (source_messages.raw_payload ->> 'chatIdAlt'),
        (source_messages.raw_payload ->> 'jidAlt'),
        (source_messages.raw_payload ->> 'senderPn'),
        (source_messages.raw_payload ->> 'participantPn'),
        (source_messages.raw_payload ->> 'participantAlt')
    ) phones(phone_value)
  )
  INSERT INTO whatsapp_jid_aliases (
    instance_name,
    alias_jid,
    canonical_jid,
    alias_type,
    source,
    first_seen_at,
    last_seen_at,
    created_at,
    updated_at
  )
  SELECT
    instance_name,
    alias_jid,
    canonical_jid,
    'LID',
    '90-day-identity-repair',
    MIN(created_at),
    MAX(created_at),
    NOW(),
    NOW()
  FROM candidate_pairs
  WHERE alias_jid IS NOT NULL
    AND canonical_jid IS NOT NULL
    AND alias_jid <> canonical_jid
  GROUP BY instance_name, alias_jid, canonical_jid
  ON CONFLICT (instance_name, alias_jid) DO UPDATE SET
    canonical_jid = EXCLUDED.canonical_jid,
    alias_type = EXCLUDED.alias_type,
    source = COALESCE(whatsapp_jid_aliases.source, EXCLUDED.source),
    first_seen_at = LEAST(whatsapp_jid_aliases.first_seen_at, EXCLUDED.first_seen_at),
    last_seen_at = GREATEST(whatsapp_jid_aliases.last_seen_at, EXCLUDED.last_seen_at),
    updated_at = NOW();
 
  WITH safe_deal_alias AS (
    SELECT
      d.id AS deal_id,
      MIN(wja.canonical_jid) AS canonical_jid,
      COUNT(DISTINCT wja.canonical_jid) AS canonical_count
    FROM deals d
    LEFT JOIN whatsapp_instances wi
      ON wi.id = d.whatsapp_instance_id
    JOIN whatsapp_jid_aliases wja
      ON LOWER(wja.instance_name) = LOWER(COALESCE(wi.instance_name, ''))
     AND wja.alias_jid = LOWER(d.whatsapp_jid)
    WHERE LOWER(COALESCE(d.whatsapp_jid, '')) LIKE '%@lid'
      AND wja.canonical_jid LIKE '%@s.whatsapp.net'
      AND COALESCE(d.last_activity_at, d.created_at) >= NOW() - INTERVAL '3 days'
    GROUP BY d.id
  )
  UPDATE deals d
  SET
    whatsapp_jid = safe_deal_alias.canonical_jid,
    last_activity_at = COALESCE(d.last_activity_at, NOW())
  FROM safe_deal_alias
  WHERE d.id = safe_deal_alias.deal_id
    AND safe_deal_alias.canonical_count = 1;
 
  WITH inbound_profiles AS (
    SELECT DISTINCT ON (profile_instance_name, profile_remote_jid)
      profile_instance_name AS instance_name,
      profile_remote_jid AS remote_jid,
      inbound_sender_name AS display_name,
      profile_picture_url,
      jsonb_build_object(
        'source', '90-day-identity-repair',
        'messageId', message_id,
        'createdAt', created_at
      ) AS raw_profile,
      created_at
    FROM (
      SELECT
        LOWER(COALESCE(wim.instance_name, '')) AS profile_instance_name,
        COALESCE(wja.canonical_jid, LOWER(wim.remote_jid)) AS profile_remote_jid,
        NULLIF(wim.sender_name, '') AS inbound_sender_name,
        COALESCE(NULLIF(wim.chat_profile_picture_url, ''), NULLIF(wim.sender_profile_picture_url, '')) AS profile_picture_url,
        wim.message_id,
        wim.created_at,
        wi.assigned_user_name,
        wi.display_label,
        wi.instance_name
      FROM whatsapp_incoming_messages wim
      LEFT JOIN whatsapp_jid_aliases wja
        ON LOWER(wja.instance_name) = LOWER(COALESCE(wim.instance_name, ''))
       AND wja.alias_jid = LOWER(wim.remote_jid)
      LEFT JOIN whatsapp_instances wi
        ON LOWER(wi.instance_name) = LOWER(COALESCE(wim.instance_name, ''))
      WHERE wim.created_at >= NOW() - INTERVAL '3 days'
        AND COALESCE(wim.from_me, false) = false
        AND LOWER(COALESCE(wim.remote_jid, '')) NOT LIKE '%@g.us'
        AND (
          NULLIF(wim.sender_name, '') IS NOT NULL
          OR NULLIF(wim.chat_profile_picture_url, '') IS NOT NULL
          OR NULLIF(wim.sender_profile_picture_url, '') IS NOT NULL
        )
    ) candidates
    WHERE profile_remote_jid IS NOT NULL
      AND NOT (
        inbound_sender_name IS NOT NULL
        AND (
          LOWER(inbound_sender_name) = LOWER(COALESCE(assigned_user_name, ''))
          OR LOWER(inbound_sender_name) = LOWER(COALESCE(display_label, ''))
          OR LOWER(inbound_sender_name) = LOWER(COALESCE(instance_name, ''))
          OR LOWER(inbound_sender_name) = 'xp ' || split_part(LOWER(COALESCE(assigned_user_name, '')), ' ', 1)
        )
      )
    ORDER BY profile_instance_name, profile_remote_jid, created_at DESC
  )
  INSERT INTO whatsapp_chat_profiles (
    instance_name,
    remote_jid,
    display_name,
    profile_picture_url,
    is_group,
    raw_profile,
    last_synced_at,
    created_at,
    updated_at
  )
  SELECT
    instance_name,
    remote_jid,
    display_name,
    profile_picture_url,
    false,
    raw_profile,
    created_at,
    NOW(),
    NOW()
  FROM inbound_profiles
  ON CONFLICT (instance_name, remote_jid) DO UPDATE SET
    display_name = CASE
      WHEN EXCLUDED.display_name IS NOT NULL
        AND (
          whatsapp_chat_profiles.display_name IS NULL
          OR whatsapp_chat_profiles.display_name = ''
          OR LOWER(whatsapp_chat_profiles.display_name) = LOWER(whatsapp_chat_profiles.remote_jid)
          OR regexp_replace(whatsapp_chat_profiles.display_name, '\\D', '', 'g') = regexp_replace(whatsapp_chat_profiles.remote_jid, '\\D', '', 'g')
        )
        THEN EXCLUDED.display_name
      ELSE whatsapp_chat_profiles.display_name
    END,
    profile_picture_url = CASE
      WHEN EXCLUDED.profile_picture_url IS NOT NULL
        AND (
          whatsapp_chat_profiles.profile_picture_url IS NULL
          OR whatsapp_chat_profiles.profile_picture_url = ''
          OR EXISTS (
            SELECT 1
            FROM whatsapp_instances wi
            WHERE LOWER(wi.instance_name) = LOWER(whatsapp_chat_profiles.instance_name)
              AND wi.profile_picture_url = whatsapp_chat_profiles.profile_picture_url
          )
        )
        THEN EXCLUDED.profile_picture_url
      ELSE whatsapp_chat_profiles.profile_picture_url
    END,
    raw_profile = COALESCE(whatsapp_chat_profiles.raw_profile, '{}'::jsonb) || EXCLUDED.raw_profile,
    last_synced_at = GREATEST(COALESCE(whatsapp_chat_profiles.last_synced_at, EXCLUDED.last_synced_at), EXCLUDED.last_synced_at),
    updated_at = NOW();
 
  DO $$
  DECLARE
    lid_deals INTEGER;
    numeric_names INTEGER;
    seller_avatar_profiles INTEGER;
    unlinked_outbound INTEGER;
  BEGIN
    SELECT COUNT(*) INTO lid_deals
    FROM deals
    WHERE whatsapp_jid LIKE '%@lid'
      AND COALESCE(last_activity_at, created_at) >= NOW() - INTERVAL '3 days';
 
    SELECT COUNT(*) INTO numeric_names
    FROM deals
    WHERE whatsapp_jid IS NOT NULL
      AND COALESCE(last_activity_at, created_at) >= NOW() - INTERVAL '3 days'
      AND (
        customer_display_name IS NULL
        OR customer_display_name = ''
        OR LOWER(customer_display_name) = LOWER(whatsapp_jid)
        OR regexp_replace(customer_display_name, '\\D', '', 'g') = regexp_replace(whatsapp_jid, '\\D', '', 'g')
      );
 
    SELECT COUNT(*) INTO seller_avatar_profiles
    FROM whatsapp_chat_profiles wcp
    JOIN whatsapp_instances wi
      ON LOWER(wi.instance_name) = LOWER(wcp.instance_name)
    WHERE wcp.updated_at >= NOW() - INTERVAL '3 days'
      AND NULLIF(wcp.profile_picture_url, '') IS NOT NULL
      AND wcp.profile_picture_url = wi.profile_picture_url;
 
    SELECT COUNT(*) INTO unlinked_outbound
    FROM whatsapp_incoming_messages wim
    WHERE wim.created_at >= NOW() - INTERVAL '3 days'
      AND COALESCE(wim.from_me, false) = true
      AND NOT EXISTS (
        SELECT 1
        FROM deal_activities da
        WHERE da.metadata ->> 'messageId' = wim.message_id
           OR da.metadata ->> 'providerMessageId' = wim.message_id
      );
 
    RAISE NOTICE 'whatsapp_identity_repair after: lid_deals=%, numeric_names=%, seller_avatar_profiles=%, unlinked_outbound=%',
      lid_deals, numeric_names, seller_avatar_profiles, unlinked_outbound;
  END $$;
  `,
  `
  CREATE TABLE IF NOT EXISTS public.whatsapp_monitor_messages (
    id                uuid primary key default gen_random_uuid(),
    deal_id           uuid not null,
    message_id        varchar(200) not null,
    remote_jid        varchar(200),
    instance_name     varchar(100),
    direction         varchar(10) not null,
    from_me           boolean not null default false,
    sender_name       varchar(200),
    sender_jid        varchar(200),
    sender_pic_url    text,
    content           text not null default '',
    media_json        jsonb,
    source            varchar(20) not null,
    created_at        timestamptz not null default now(),
    constraint uq_wmm_deal_msg_source unique (deal_id, message_id, source)
  );

  CREATE INDEX IF NOT EXISTS idx_wmm_deal_created
    on public.whatsapp_monitor_messages (deal_id, created_at desc, id desc);

  CREATE INDEX IF NOT EXISTS idx_wmm_created
    on public.whatsapp_monitor_messages (created_at desc, id desc);
  `,
  `
  -- Campaign performance attribution read indexes
  CREATE INDEX IF NOT EXISTS idx_message_logs_campaign_created
    ON message_logs(campaign_id, created_at DESC)
    WHERE campaign_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_campaign_customer_sent
    ON whatsapp_campaign_recipients(campaign_id, customer_id, sent_at)
    WHERE customer_id IS NOT NULL
      AND sent_at IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_campaign_jid_sent
    ON whatsapp_campaign_recipients(campaign_id, jid, sent_at)
    WHERE sent_at IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_orders_customer_order_date
    ON orders(customer_id, order_date)
    WHERE customer_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_orders_customer_code_order_date
    ON orders(customer_code, order_date)
    WHERE customer_code IS NOT NULL;
  `,
  `
  -- WhatsApp monitor isolation/performance indexes and avatar cleanup.
  CREATE INDEX IF NOT EXISTS idx_wmm_instance_direction_created_deal
    ON public.whatsapp_monitor_messages (
      (lower(coalesce(instance_name, ''))),
      direction,
      created_at DESC,
      deal_id
    );

  CREATE INDEX IF NOT EXISTS idx_wmm_instance_deal_created
    ON public.whatsapp_monitor_messages (
      (lower(coalesce(instance_name, ''))),
      deal_id,
      created_at DESC,
      id DESC
    );

  CREATE INDEX IF NOT EXISTS idx_wmm_remote_instance_created
    ON public.whatsapp_monitor_messages (
      remote_jid,
      (lower(coalesce(instance_name, ''))),
      created_at DESC,
      id DESC
    )
    WHERE remote_jid IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_wmm_direction_created
    ON public.whatsapp_monitor_messages (
      direction,
      created_at DESC,
      deal_id
    );

  UPDATE public.whatsapp_chat_profiles wcp
  SET profile_picture_url = NULL,
      updated_at = NOW()
  WHERE NULLIF(wcp.profile_picture_url, '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.whatsapp_instances wi
      WHERE wi.status = 'ACTIVE'
        AND NULLIF(wi.profile_picture_url, '') IS NOT NULL
        AND wi.profile_picture_url = wcp.profile_picture_url
    );

  UPDATE public.whatsapp_participant_profiles wpp
  SET profile_picture_url = NULL,
      last_synced_at = NOW()
  WHERE NULLIF(wpp.profile_picture_url, '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.whatsapp_instances wi
      WHERE wi.status = 'ACTIVE'
        AND NULLIF(wi.profile_picture_url, '') IS NOT NULL
        AND wi.profile_picture_url = wpp.profile_picture_url
    );

  UPDATE public.whatsapp_monitor_messages wmm
  SET sender_pic_url = NULL
  WHERE NULLIF(wmm.sender_pic_url, '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.whatsapp_instances wi
      WHERE wi.status = 'ACTIVE'
        AND NULLIF(wi.profile_picture_url, '') IS NOT NULL
        AND wi.profile_picture_url = wmm.sender_pic_url
    );

  UPDATE public.whatsapp_incoming_messages wim
  SET chat_profile_picture_url = CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.whatsapp_instances wi
          WHERE wi.status = 'ACTIVE'
            AND NULLIF(wi.profile_picture_url, '') IS NOT NULL
            AND wi.profile_picture_url = wim.chat_profile_picture_url
        )
        THEN NULL
        ELSE wim.chat_profile_picture_url
      END,
      sender_profile_picture_url = CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.whatsapp_instances wi
          WHERE wi.status = 'ACTIVE'
            AND NULLIF(wi.profile_picture_url, '') IS NOT NULL
            AND wi.profile_picture_url = wim.sender_profile_picture_url
        )
        THEN NULL
        ELSE wim.sender_profile_picture_url
      END
  WHERE NULLIF(wim.chat_profile_picture_url, '') IS NOT NULL
     OR NULLIF(wim.sender_profile_picture_url, '') IS NOT NULL;
  `,
  `
  -- Add video_url to campaigns
  ALTER TABLE public.whatsapp_campaigns
    ADD COLUMN IF NOT EXISTS video_url TEXT;
  `,
  `
  -- Ensure last_synced_at columns exist on profile tables.
  -- The original CREATE TABLE IF NOT EXISTS may have been a no-op if the table
  -- already existed from an earlier migration without these columns.
  ALTER TABLE public.whatsapp_chat_profiles
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

  ALTER TABLE public.whatsapp_participant_profiles
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
  `,
  `
  -- =====================================================================
  -- Performance indexes for /api/whatsapp-monitor/conversations
  -- Each index is wrapped in its own exception-safe block so one failure
  -- does not prevent the rest from being created.
  -- =====================================================================

  -- Ensure the whatsapp_monitor_messages table exists
  CREATE TABLE IF NOT EXISTS public.whatsapp_monitor_messages (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id           uuid NOT NULL,
    message_id        varchar(200) NOT NULL,
    remote_jid        varchar(200),
    instance_name     varchar(100),
    direction         varchar(10) NOT NULL,
    from_me           boolean NOT NULL DEFAULT false,
    sender_name       varchar(200),
    sender_jid        varchar(200),
    sender_pic_url    text,
    content           text NOT NULL DEFAULT '',
    media_json        jsonb,
    source            varchar(20) NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_wmm_deal_msg_source UNIQUE (deal_id, message_id, source)
  );

  -- Ensure whatsapp_groups table exists
  DO $$ BEGIN
    CREATE TABLE IF NOT EXISTS public.whatsapp_groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      jid VARCHAR(200) NOT NULL UNIQUE,
      source_name VARCHAR(300),
      instance_name VARCHAR(100),
      raw_payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  EXCEPTION WHEN others THEN NULL;
  END $$;

  DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_deals_last_activity_at_desc
      ON public.deals (last_activity_at DESC NULLS LAST, id DESC);
  EXCEPTION WHEN others THEN NULL;
  END $$;

  -- PERF (conversation list): the candidate_deals CTE in
  -- listWhatsappMonitorConversations orders by AND range-filters on
  -- COALESCE(last_activity_at, created_at). A plain column index on
  -- last_activity_at (above) CANNOT serve that COALESCE expression, so the
  -- planner full-scanned + sorted the entire deals table on every Messages
  -- load and on every 2-min background poll (limit 100). This expression
  -- index matches the ORDER BY / range predicate exactly and is partial on
  -- whatsapp_jid IS NOT NULL (mirroring monitorableWhatsappJidSql), letting
  -- the planner do an index scan + LIMIT instead of a sort of all deals.
  DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_deals_monitor_sort
      ON public.deals ((COALESCE(last_activity_at, created_at)) DESC, id DESC)
      WHERE whatsapp_jid IS NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END $$;

  DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_wmm_deal_created
      ON public.whatsapp_monitor_messages (deal_id, created_at DESC, id DESC);
  EXCEPTION WHEN others THEN NULL;
  END $$;

  DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_wmm_instance_deal_created
      ON public.whatsapp_monitor_messages (
        (lower(coalesce(instance_name, ''))),
        deal_id, created_at DESC, id DESC
      );
  EXCEPTION WHEN others THEN NULL;
  END $$;

  DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_wmm_instance_direction_created_deal
      ON public.whatsapp_monitor_messages (
        (lower(coalesce(instance_name, ''))),
        direction, created_at DESC, deal_id
      );
  EXCEPTION WHEN others THEN NULL;
  END $$;

  DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_wmm_direction_created
      ON public.whatsapp_monitor_messages (
        direction, created_at DESC, deal_id
      );
  EXCEPTION WHEN others THEN NULL;
  END $$;

  DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_wmm_remote_instance_created
      ON public.whatsapp_monitor_messages (
        remote_jid,
        (lower(coalesce(instance_name, ''))),
        created_at DESC, id DESC
      )
      WHERE remote_jid IS NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END $$;

  DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_wim_remote_jid_created
      ON public.whatsapp_incoming_messages (remote_jid, created_at DESC, id DESC);
  EXCEPTION WHEN others THEN NULL;
  END $$;

  DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_wja_instance_alias
      ON public.whatsapp_jid_aliases ((lower(instance_name)), alias_jid);
  EXCEPTION WHEN others THEN NULL;
  END $$;

  DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_wja_instance_canonical
      ON public.whatsapp_jid_aliases ((lower(instance_name)), canonical_jid);
  EXCEPTION WHEN others THEN NULL;
  END $$;

  DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_deals_whatsapp_jid
      ON public.deals (whatsapp_jid)
      WHERE whatsapp_jid IS NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END $$;
  `,
  `
  -- PERF (conversation list): the candidate_deals CTE in
  -- listWhatsappMonitorConversations orders by AND range-filters on
  -- COALESCE(last_activity_at, created_at). A plain column index on
  -- last_activity_at cannot serve that COALESCE expression, so the planner
  -- full-scanned + sorted the entire deals table on every Messages load and
  -- on every 2-min background poll (limit 100) -> multi-second / timeout.
  -- This expression index matches the ORDER BY / range predicate exactly,
  -- partial on whatsapp_jid IS NOT NULL (mirrors monitorableWhatsappJidSql),
  -- letting the planner do an index scan + LIMIT. Added as its OWN migration
  -- element so databases already past the previous version pick it up on deploy.
  DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_deals_monitor_sort
      ON public.deals ((COALESCE(last_activity_at, created_at)) DESC, id DESC)
      WHERE whatsapp_jid IS NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END $$;
  `,
  `
  -- Chatwoot-style avatar caching, fully self-hosted on Postgres: store the
  -- raw image bytes here and serve them from /api/whatsapp-monitor/avatar/:key
  -- so the chat avatar stops breaking when the ephemeral WhatsApp CDN URL expires.
  CREATE TABLE IF NOT EXISTS whatsapp_avatars (
    storage_key TEXT PRIMARY KEY,
    content_type TEXT NOT NULL DEFAULT 'image/jpeg',
    bytes BYTEA NOT NULL,
    source_url TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  DO $$ BEGIN
    ALTER TABLE whatsapp_chat_profiles ADD COLUMN IF NOT EXISTS cached_picture_url TEXT;
    ALTER TABLE whatsapp_chat_profiles ADD COLUMN IF NOT EXISTS cached_source_url TEXT;
    ALTER TABLE whatsapp_chat_profiles ADD COLUMN IF NOT EXISTS cached_at TIMESTAMPTZ;
  EXCEPTION WHEN others THEN NULL;
  END $$;
  `,
  `
  -- Tabela de cache para estatísticas de campanhas
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

  CREATE INDEX IF NOT EXISTS idx_campaign_stats_cache_updated 
  ON whatsapp_campaign_stats_cache(updated_at DESC);

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

  -- Índices de performance
  CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_created_at 
  ON whatsapp_campaigns(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_campaign_status 
  ON whatsapp_campaign_recipients(campaign_id, status) 
  INCLUDE (scheduled_for);

  CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_recipients_pending_schedule 
  ON whatsapp_campaign_recipients(campaign_id, scheduled_for) 
  WHERE status = 'PENDING';

  CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_status 
  ON whatsapp_campaigns(status) 
  WHERE status IN ('QUEUED', 'IN_PROGRESS');

  CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_cancelled 
  ON whatsapp_campaigns(cancelled_at) 
  WHERE cancelled_at IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_remote_jid_lower 
  ON whatsapp_incoming_messages(LOWER(COALESCE(remote_jid, '')));
  `,
    `
  -- Migration 40: Fix group campaign stats cache trigger logic
  -- Redefines refresh_campaign_stats_cache() to fix JID matching and recounts all campaign stats.
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'refresh_campaign_stats_cache'
    ) THEN
      EXECUTE $sql$
      CREATE OR REPLACE FUNCTION refresh_campaign_stats_cache()
      RETURNS TRIGGER AS $body$
      BEGIN
        DELETE FROM whatsapp_campaign_stats_cache 
        WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id);
        
        INSERT INTO whatsapp_campaign_stats_cache (
          campaign_id,
          total_recipients,
          pending_count,
          blocked_recent_count,
          sending_count,
          sent_count,
          failed_count,
          skipped_count,
          responded_count,
          purchased_count,
          total_revenue,
          cached_at
        )
        SELECT
          r.campaign_id,
          COUNT(*) AS total_recipients,
          COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
          COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
          COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
          COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
          COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
          COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
          
          COUNT(DISTINCT r.id) FILTER (
            WHERE r.status = 'SENT' 
              AND r.sent_at IS NOT NULL
              AND EXISTS (
                SELECT 1 
                FROM whatsapp_incoming_messages wim
                WHERE COALESCE(wim.from_me, false) = false
                  AND wim.created_at >= r.sent_at
                  AND wim.created_at < r.sent_at + INTERVAL '7 days'
                  AND LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
              )
          ) AS responded_count,
          
          COUNT(DISTINCT r.id) FILTER (
            WHERE r.status = 'SENT'
              AND r.sent_at IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM orders o
                WHERE o.order_date >= r.sent_at::date
                  AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                  AND (
                    (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                    OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                  )
              )
          ) AS purchased_count,
          
          COALESCE(SUM(
            CASE 
              WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
                (
                  SELECT COALESCE(SUM(o.total_amount), 0)
                  FROM orders o
                  WHERE o.order_date >= r.sent_at::date
                    AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                    AND (
                      (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                      OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                    )
                )
              ELSE 0
            END
          ), 0) AS total_revenue,
          
          NOW() AS cached_at
        FROM whatsapp_campaign_recipients r
        WHERE r.campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id)
        GROUP BY r.campaign_id;
        
        RETURN NEW;
      END;
      $body$ LANGUAGE plpgsql;
      $sql$;
      
      DECLARE
        campaign_record RECORD;
      BEGIN
        FOR campaign_record IN 
          SELECT DISTINCT campaign_id 
          FROM whatsapp_campaign_recipients
        LOOP
          DELETE FROM whatsapp_campaign_stats_cache 
          WHERE campaign_id = campaign_record.campaign_id;
          
          INSERT INTO whatsapp_campaign_stats_cache (
            campaign_id,
            total_recipients,
            pending_count,
            blocked_recent_count,
            sending_count,
            sent_count,
            failed_count,
            skipped_count,
            responded_count,
            purchased_count,
            total_revenue,
            cached_at
          )
          SELECT
            r.campaign_id,
            COUNT(*) AS total_recipients,
            COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
            COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
            COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
            COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
            COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
            COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
            
            COUNT(DISTINCT r.id) FILTER (
              WHERE r.status = 'SENT' 
                AND r.sent_at IS NOT NULL
                AND EXISTS (
                  SELECT 1 
                  FROM whatsapp_incoming_messages wim
                  WHERE COALESCE(wim.from_me, false) = false
                    AND wim.created_at >= r.sent_at
                    AND wim.created_at < r.sent_at + INTERVAL '7 days'
                    AND LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
                )
            ) AS responded_count,
            
            COUNT(DISTINCT r.id) FILTER (
              WHERE r.status = 'SENT'
                AND r.sent_at IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM orders o
                  WHERE o.order_date >= r.sent_at::date
                    AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                    AND (
                      (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                      OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                    )
                )
            ) AS purchased_count,
            
            COALESCE(SUM(
              CASE 
                WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
                  (
                    SELECT COALESCE(SUM(o.total_amount), 0)
                    FROM orders o
                    WHERE o.order_date >= r.sent_at::date
                      AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                      AND (
                        (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                        OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                      )
                  )
                ELSE 0
              END
            ), 0) AS total_revenue,
            
            NOW() AS cached_at
          FROM whatsapp_campaign_recipients r
          WHERE r.campaign_id = campaign_record.campaign_id
          GROUP BY r.campaign_id;
        END LOOP;
      END;
    END IF;
  END $$;
  `,
  `
  -- Migration 40: Fix group campaign stats cache trigger logic
  -- Redefines refresh_campaign_stats_cache() to fix JID matching and recounts all campaign stats.
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'refresh_campaign_stats_cache'
    ) THEN
      EXECUTE $sql$
      CREATE OR REPLACE FUNCTION refresh_campaign_stats_cache()
      RETURNS TRIGGER AS $body$
      BEGIN
        DELETE FROM whatsapp_campaign_stats_cache 
        WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id);
        
        INSERT INTO whatsapp_campaign_stats_cache (
          campaign_id,
          total_recipients,
          pending_count,
          blocked_recent_count,
          sending_count,
          sent_count,
          failed_count,
          skipped_count,
          responded_count,
          purchased_count,
          total_revenue,
          cached_at
        )
        SELECT
          r.campaign_id,
          COUNT(*) AS total_recipients,
          COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
          COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
          COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
          COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
          COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
          COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
          
          COUNT(DISTINCT r.id) FILTER (
            WHERE r.status = 'SENT' 
              AND r.sent_at IS NOT NULL
              AND EXISTS (
                SELECT 1 
                FROM whatsapp_incoming_messages wim
                WHERE COALESCE(wim.from_me, false) = false
                  AND wim.created_at >= r.sent_at
                  AND wim.created_at < r.sent_at + INTERVAL '7 days'
                  AND LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
              )
          ) AS responded_count,
          
          COUNT(DISTINCT r.id) FILTER (
            WHERE r.status = 'SENT'
              AND r.sent_at IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM orders o
                WHERE o.order_date >= r.sent_at::date
                  AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                  AND (
                    (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                    OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                  )
              )
          ) AS purchased_count,
          
          COALESCE(SUM(
            CASE 
              WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
                (
                  SELECT COALESCE(SUM(o.total_amount), 0)
                  FROM orders o
                  WHERE o.order_date >= r.sent_at::date
                    AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                    AND (
                      (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                      OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                    )
                )
              ELSE 0
            END
          ), 0) AS total_revenue,
          
          NOW() AS cached_at
        FROM whatsapp_campaign_recipients r
        WHERE r.campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id)
        GROUP BY r.campaign_id;
        
        RETURN NEW;
      END;
      $body$ LANGUAGE plpgsql;
      $sql$;
      
      DECLARE
        campaign_record RECORD;
      BEGIN
        FOR campaign_record IN 
          SELECT DISTINCT campaign_id 
          FROM whatsapp_campaign_recipients
        LOOP
          DELETE FROM whatsapp_campaign_stats_cache 
          WHERE campaign_id = campaign_record.campaign_id;
          
          INSERT INTO whatsapp_campaign_stats_cache (
            campaign_id,
            total_recipients,
            pending_count,
            blocked_recent_count,
            sending_count,
            sent_count,
            failed_count,
            skipped_count,
            responded_count,
            purchased_count,
            total_revenue,
            cached_at
          )
          SELECT
            r.campaign_id,
            COUNT(*) AS total_recipients,
            COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
            COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
            COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
            COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
            COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
            COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
            
            COUNT(DISTINCT r.id) FILTER (
              WHERE r.status = 'SENT' 
                AND r.sent_at IS NOT NULL
                AND EXISTS (
                  SELECT 1 
                  FROM whatsapp_incoming_messages wim
                  WHERE COALESCE(wim.from_me, false) = false
                    AND wim.created_at >= r.sent_at
                    AND wim.created_at < r.sent_at + INTERVAL '7 days'
                    AND LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
                )
            ) AS responded_count,
            
            COUNT(DISTINCT r.id) FILTER (
              WHERE r.status = 'SENT'
                AND r.sent_at IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM orders o
                  WHERE o.order_date >= r.sent_at::date
                    AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                    AND (
                      (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                      OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                    )
                )
            ) AS purchased_count,
            
            COALESCE(SUM(
              CASE 
                WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
                  (
                    SELECT COALESCE(SUM(o.total_amount), 0)
                    FROM orders o
                    WHERE o.order_date >= r.sent_at::date
                      AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                      AND (
                        (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                        OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                      )
                  )
                ELSE 0
              END
            ), 0) AS total_revenue,
            
            NOW() AS cached_at
          FROM whatsapp_campaign_recipients r
          WHERE r.campaign_id = campaign_record.campaign_id
          GROUP BY r.campaign_id;
        END LOOP;
      END;
    END IF;
  END $$;
  `,
  `
  -- Migration 41: Fix stats cache trigger and query logic to match exact JID or its registered aliases
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'refresh_campaign_stats_cache'
    ) THEN
      EXECUTE $sql$
      CREATE OR REPLACE FUNCTION refresh_campaign_stats_cache()
      RETURNS TRIGGER AS $body$
      BEGIN
        DELETE FROM whatsapp_campaign_stats_cache 
        WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id);
        
        INSERT INTO whatsapp_campaign_stats_cache (
          campaign_id,
          total_recipients,
          pending_count,
          blocked_recent_count,
          sending_count,
          sent_count,
          failed_count,
          skipped_count,
          responded_count,
          purchased_count,
          total_revenue,
          cached_at
        )
        SELECT
          r.campaign_id,
          COUNT(*) AS total_recipients,
          COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
          COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
          COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
          COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
          COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
          COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
          
          COUNT(DISTINCT r.id) FILTER (
            WHERE r.status = 'SENT' 
              AND r.sent_at IS NOT NULL
              AND EXISTS (
                SELECT 1 
                FROM whatsapp_incoming_messages wim
                WHERE COALESCE(wim.from_me, false) = false
                  AND wim.created_at >= r.sent_at
                  AND wim.created_at < r.sent_at + INTERVAL '7 days'
                  AND (
                    LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
                    OR EXISTS (
                      SELECT 1 FROM whatsapp_jid_aliases wja1
                      JOIN whatsapp_jid_aliases wja2 
                        ON wja1.canonical_jid = wja2.canonical_jid 
                       AND LOWER(wja1.instance_name) = LOWER(wja2.instance_name)
                      WHERE LOWER(wja1.alias_jid) = LOWER(COALESCE(wim.remote_jid, ''))
                        AND LOWER(wja2.alias_jid) = LOWER(COALESCE(r.jid, ''))
                    )
                  )
              )
          ) AS responded_count,
          
          COUNT(DISTINCT r.id) FILTER (
            WHERE r.status = 'SENT'
              AND r.sent_at IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM orders o
                WHERE o.order_date >= r.sent_at::date
                  AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                  AND (
                    (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                    OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                  )
                )
          ) AS purchased_count,
          
          COALESCE(SUM(
            CASE 
              WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
                (
                  SELECT COALESCE(SUM(o.total_amount), 0)
                  FROM orders o
                  WHERE o.order_date >= r.sent_at::date
                    AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                    AND (
                      (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                      OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                    )
                )
              ELSE 0
            END
          ), 0) AS total_revenue,
          
          NOW() AS cached_at
        FROM whatsapp_campaign_recipients r
        WHERE r.campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id)
        GROUP BY r.campaign_id;
        
        RETURN NEW;
      END;
      $body$ LANGUAGE plpgsql;
      $sql$;
      
      -- Recalculate stats for all existing campaigns with the corrected JID/alias matching logic
      DECLARE
        campaign_record RECORD;
      BEGIN
        FOR campaign_record IN 
          SELECT DISTINCT campaign_id 
          FROM whatsapp_campaign_recipients
        LOOP
          DELETE FROM whatsapp_campaign_stats_cache 
          WHERE campaign_id = campaign_record.campaign_id;
          
          INSERT INTO whatsapp_campaign_stats_cache (
            campaign_id,
            total_recipients,
            pending_count,
            blocked_recent_count,
            sending_count,
            sent_count,
            failed_count,
            skipped_count,
            responded_count,
            purchased_count,
            total_revenue,
            cached_at
          )
          SELECT
            r.campaign_id,
            COUNT(*) AS total_recipients,
            COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
            COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
            COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
            COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
            COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
            COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
            
            COUNT(DISTINCT r.id) FILTER (
              WHERE r.status = 'SENT' 
                AND r.sent_at IS NOT NULL
                AND EXISTS (
                  SELECT 1 
                  FROM whatsapp_incoming_messages wim
                  WHERE COALESCE(wim.from_me, false) = false
                    AND wim.created_at >= r.sent_at
                    AND wim.created_at < r.sent_at + INTERVAL '7 days'
                    AND (
                      LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
                      OR EXISTS (
                        SELECT 1 FROM whatsapp_jid_aliases wja1
                        JOIN whatsapp_jid_aliases wja2 
                          ON wja1.canonical_jid = wja2.canonical_jid 
                         AND LOWER(wja1.instance_name) = LOWER(wja2.instance_name)
                        WHERE LOWER(wja1.alias_jid) = LOWER(COALESCE(wim.remote_jid, ''))
                          AND LOWER(wja2.alias_jid) = LOWER(COALESCE(r.jid, ''))
                      )
                    )
                )
            ) AS responded_count,
            
            COUNT(DISTINCT r.id) FILTER (
              WHERE r.status = 'SENT'
                AND r.sent_at IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM orders o
                  WHERE o.order_date >= r.sent_at::date
                    AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                    AND (
                      (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                      OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                    )
                )
            ) AS purchased_count,
            
            COALESCE(SUM(
              CASE 
                WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
                  (
                    SELECT COALESCE(SUM(o.total_amount), 0)
                    FROM orders o
                    WHERE o.order_date >= r.sent_at::date
                      AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                      AND (
                        (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                        OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                      )
                  )
                ELSE 0
              END
            ), 0) AS total_revenue,
            
            NOW() AS cached_at
          FROM whatsapp_campaign_recipients r
          WHERE r.campaign_id = campaign_record.campaign_id
          GROUP BY r.campaign_id;
        END LOOP;
      END;
    END IF;
  END $$;
  `,
  `
  -- Migration 42: Add missing stats columns to whatsapp_campaign_stats_cache
  DO $$
  BEGIN
    ALTER TABLE whatsapp_campaign_stats_cache ADD COLUMN IF NOT EXISTS responded_count INT NOT NULL DEFAULT 0;
    ALTER TABLE whatsapp_campaign_stats_cache ADD COLUMN IF NOT EXISTS purchased_count INT NOT NULL DEFAULT 0;
    ALTER TABLE whatsapp_campaign_stats_cache ADD COLUMN IF NOT EXISTS total_revenue NUMERIC(14,2) NOT NULL DEFAULT 0;
    ALTER TABLE whatsapp_campaign_stats_cache ADD COLUMN IF NOT EXISTS cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  EXCEPTION WHEN others THEN
    NULL;
  END $$;

  -- Re-trigger a full stats refresh for all campaigns to populate the new columns
  DO $$
  DECLARE
    campaign_record RECORD;
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'refresh_campaign_stats_cache') THEN
      FOR campaign_record IN 
        SELECT DISTINCT campaign_id 
        FROM whatsapp_campaign_recipients
      LOOP
        DELETE FROM whatsapp_campaign_stats_cache WHERE campaign_id = campaign_record.campaign_id;
        
        INSERT INTO whatsapp_campaign_stats_cache (
          campaign_id,
          total_recipients,
          pending_count,
          blocked_recent_count,
          sending_count,
          sent_count,
          failed_count,
          skipped_count,
          responded_count,
          purchased_count,
          total_revenue,
          cached_at
        )
        SELECT
          r.campaign_id,
          COUNT(*) AS total_recipients,
          COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
          COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
          COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
          COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
          COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
          COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
          
          COUNT(DISTINCT r.id) FILTER (
            WHERE r.status = 'SENT' 
              AND r.sent_at IS NOT NULL
              AND EXISTS (
                SELECT 1 
                FROM whatsapp_incoming_messages wim
                WHERE COALESCE(wim.from_me, false) = false
                  AND wim.created_at >= r.sent_at
                  AND wim.created_at < r.sent_at + INTERVAL '7 days'
                  AND (
                    LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
                    OR EXISTS (
                      SELECT 1 FROM whatsapp_jid_aliases wja1
                      JOIN whatsapp_jid_aliases wja2 
                        ON wja1.canonical_jid = wja2.canonical_jid 
                       AND LOWER(wja1.instance_name) = LOWER(wja2.instance_name)
                      WHERE LOWER(wja1.alias_jid) = LOWER(COALESCE(wim.remote_jid, ''))
                        AND LOWER(wja2.alias_jid) = LOWER(COALESCE(r.jid, ''))
                    )
                  )
              )
          ) AS responded_count,
          
          COUNT(DISTINCT r.id) FILTER (
            WHERE r.status = 'SENT'
              AND r.sent_at IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM orders o
                WHERE o.order_date >= r.sent_at::date
                  AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                  AND (
                    (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                    OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                  )
              )
          ) AS purchased_count,
          
          COALESCE(SUM(
            CASE 
              WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
                (
                  SELECT COALESCE(SUM(o.total_amount), 0)
                  FROM orders o
                  WHERE o.order_date >= r.sent_at::date
                    AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                    AND (
                      (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                      OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                    )
                )
              ELSE 0
            END
          ), 0) AS total_revenue,
          
          NOW() AS cached_at
        FROM whatsapp_campaign_recipients r
        WHERE r.campaign_id = campaign_record.campaign_id
        GROUP BY r.campaign_id;
      END LOOP;
    END IF;
  END $$;
  `,
  `
  -- Migration 43: Ensure stats cache function and trigger are correctly created and bound
  -- and recalculate statistics
  CREATE OR REPLACE FUNCTION refresh_campaign_stats_cache()
  RETURNS TRIGGER AS $body$
  BEGIN
    DELETE FROM whatsapp_campaign_stats_cache 
    WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id);
    
    INSERT INTO whatsapp_campaign_stats_cache (
      campaign_id,
      total_recipients,
      pending_count,
      blocked_recent_count,
      sending_count,
      sent_count,
      failed_count,
      skipped_count,
      responded_count,
      purchased_count,
      total_revenue,
      cached_at
    )
    SELECT
      r.campaign_id,
      COUNT(*) AS total_recipients,
      COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
      COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
      COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
      COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
      COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
      COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
      
      COUNT(DISTINCT r.id) FILTER (
        WHERE r.status = 'SENT' 
          AND r.sent_at IS NOT NULL
          AND EXISTS (
            SELECT 1 
            FROM whatsapp_incoming_messages wim
            WHERE COALESCE(wim.from_me, false) = false
              AND wim.created_at >= r.sent_at
              AND wim.created_at < r.sent_at + INTERVAL '7 days'
              AND (
                LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
                OR EXISTS (
                  SELECT 1 FROM whatsapp_jid_aliases wja1
                  JOIN whatsapp_jid_aliases wja2 
                    ON wja1.canonical_jid = wja2.canonical_jid 
                   AND LOWER(wja1.instance_name) = LOWER(wja2.instance_name)
                  WHERE LOWER(wja1.alias_jid) = LOWER(COALESCE(wim.remote_jid, ''))
                    AND LOWER(wja2.alias_jid) = LOWER(COALESCE(r.jid, ''))
                )
              )
          )
      ) AS responded_count,
      
      COUNT(DISTINCT r.id) FILTER (
        WHERE r.status = 'SENT'
          AND r.sent_at IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM orders o
            WHERE o.order_date >= r.sent_at::date
              AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
              AND (
                (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
              )
          )
      ) AS purchased_count,
      
      COALESCE(SUM(
        CASE 
          WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
            (
              SELECT COALESCE(SUM(o.total_amount), 0)
              FROM orders o
              WHERE o.order_date >= r.sent_at::date
                AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                AND (
                  (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                  OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                )
            )
          ELSE 0
        END
      ), 0) AS total_revenue,
      
      NOW() AS cached_at
    FROM whatsapp_campaign_recipients r
    WHERE r.campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id)
    GROUP BY r.campaign_id;
    
    RETURN NEW;
  END;
  $body$ LANGUAGE plpgsql;

  -- Ensure trigger is correctly bound to the function
  DROP TRIGGER IF EXISTS trigger_update_campaign_stats ON whatsapp_campaign_recipients;
  DROP TRIGGER IF EXISTS trg_refresh_campaign_stats_cache ON whatsapp_campaign_recipients;
  
  CREATE TRIGGER trg_refresh_campaign_stats_cache
    AFTER INSERT OR UPDATE OR DELETE ON whatsapp_campaign_recipients
    FOR EACH ROW
    EXECUTE FUNCTION refresh_campaign_stats_cache();

  -- Recalculate statistics
  DO $$
  DECLARE
    campaign_record RECORD;
  BEGIN
    FOR campaign_record IN 
      SELECT DISTINCT campaign_id 
      FROM whatsapp_campaign_recipients
    LOOP
      DELETE FROM whatsapp_campaign_stats_cache WHERE campaign_id = campaign_record.campaign_id;
      
      INSERT INTO whatsapp_campaign_stats_cache (
        campaign_id,
        total_recipients,
        pending_count,
        blocked_recent_count,
        sending_count,
        sent_count,
        failed_count,
        skipped_count,
        responded_count,
        purchased_count,
        total_revenue,
        cached_at
      )
      SELECT
        r.campaign_id,
        COUNT(*) AS total_recipients,
        COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
        COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
        COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
        COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
        COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
        COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
        
        COUNT(DISTINCT r.id) FILTER (
          WHERE r.status = 'SENT' 
            AND r.sent_at IS NOT NULL
            AND EXISTS (
              SELECT 1 
              FROM whatsapp_incoming_messages wim
              WHERE COALESCE(wim.from_me, false) = false
                AND wim.created_at >= r.sent_at
                AND wim.created_at < r.sent_at + INTERVAL '7 days'
                AND (
                  LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
                  OR EXISTS (
                    SELECT 1 FROM whatsapp_jid_aliases wja1
                    JOIN whatsapp_jid_aliases wja2 
                      ON wja1.canonical_jid = wja2.canonical_jid 
                     AND LOWER(wja1.instance_name) = LOWER(wja2.instance_name)
                    WHERE LOWER(wja1.alias_jid) = LOWER(COALESCE(wim.remote_jid, ''))
                      AND LOWER(wja2.alias_jid) = LOWER(COALESCE(r.jid, ''))
                  )
                )
            )
        ) AS responded_count,
        
        COUNT(DISTINCT r.id) FILTER (
          WHERE r.status = 'SENT'
            AND r.sent_at IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM orders o
              WHERE o.order_date >= r.sent_at::date
                AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                AND (
                  (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                  OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                )
            )
        ) AS purchased_count,
        
        COALESCE(SUM(
          CASE 
            WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
              (
                SELECT COALESCE(SUM(o.total_amount), 0)
                FROM orders o
                WHERE o.order_date >= r.sent_at::date
                  AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                  AND (
                    (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                    OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                  )
              )
            ELSE 0
          END
        ), 0) AS total_revenue,
        
        NOW() AS cached_at
      FROM whatsapp_campaign_recipients r
      WHERE r.campaign_id = campaign_record.campaign_id
      GROUP BY r.campaign_id;
    END LOOP;
  END $$;
    `,
  `
  -- Migration 44: Fix Badge "Respondeu" - Filter Group Messages
  -- Issue: Messages from WhatsApp groups (@g.us) were being counted as individual responses
  -- Solution: Add filter to exclude group messages from response attribution

  -- Drop existing trigger and function
  DROP TRIGGER IF EXISTS trg_refresh_campaign_stats_cache ON whatsapp_campaign_recipients;
  DROP FUNCTION IF EXISTS refresh_campaign_stats_cache();

  -- Recreate function with group message filter
  CREATE OR REPLACE FUNCTION refresh_campaign_stats_cache()
  RETURNS TRIGGER AS $$
  BEGIN
    -- Clear cache for this campaign
    DELETE FROM whatsapp_campaign_stats_cache 
    WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id);
    
    -- Recalculate and insert fresh stats
    INSERT INTO whatsapp_campaign_stats_cache (
      campaign_id,
      total_recipients,
      pending_count,
      blocked_recent_count,
      sending_count,
      sent_count,
      failed_count,
      skipped_count,
      responded_count,
      purchased_count,
      total_revenue,
      cached_at
    )
    SELECT
      r.campaign_id,
      COUNT(*) AS total_recipients,
      COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
      COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
      COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
      COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
      COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
      COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
      
      -- Count recipients with responses (FIXED: exclude group messages)
      COUNT(DISTINCT r.id) FILTER (
        WHERE r.status = 'SENT' 
          AND r.sent_at IS NOT NULL
          AND EXISTS (
            SELECT 1 
            FROM whatsapp_incoming_messages wim
            WHERE COALESCE(wim.from_me, false) = false
              -- ✅ FIX: Exclude group messages
              AND LOWER(COALESCE(wim.remote_jid, '')) NOT LIKE '%@g.us'
              AND wim.created_at >= r.sent_at
              AND wim.created_at < r.sent_at + INTERVAL '7 days'
              AND LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
          )
      ) AS responded_count,
      
      -- Count recipients with purchases
      COUNT(DISTINCT r.id) FILTER (
        WHERE r.status = 'SENT'
          AND r.sent_at IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM orders o
            WHERE o.order_date >= r.sent_at::date
              AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
              AND (
                (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
              )
          )
      ) AS purchased_count,
      
      -- Calculate total revenue from attributed orders
      COALESCE(SUM(
        CASE 
          WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
            (
              SELECT COALESCE(SUM(o.total_amount), 0)
              FROM orders o
              WHERE o.order_date >= r.sent_at::date
                AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                AND (
                  (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                  OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                )
            )
          ELSE 0
        END
      ), 0) AS total_revenue,
      
      NOW() AS cached_at
    FROM whatsapp_campaign_recipients r
    WHERE r.campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id)
    GROUP BY r.campaign_id;
    
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  -- Recreate trigger
  CREATE TRIGGER trg_refresh_campaign_stats_cache
  AFTER INSERT OR UPDATE OR DELETE ON whatsapp_campaign_recipients
  FOR EACH ROW
  EXECUTE FUNCTION refresh_campaign_stats_cache();

  -- Force refresh all existing campaign caches with the new logic
  DO $$
  DECLARE
    campaign_record RECORD;
  BEGIN
    FOR campaign_record IN 
      SELECT DISTINCT campaign_id 
      FROM whatsapp_campaign_recipients
    LOOP
      DELETE FROM whatsapp_campaign_stats_cache 
      WHERE campaign_id = campaign_record.campaign_id;
      
      INSERT INTO whatsapp_campaign_stats_cache (
        campaign_id,
        total_recipients,
        pending_count,
        blocked_recent_count,
        sending_count,
        sent_count,
        failed_count,
        skipped_count,
        responded_count,
        purchased_count,
        total_revenue,
        cached_at
      )
      SELECT
        r.campaign_id,
        COUNT(*) AS total_recipients,
        COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
        COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
        COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
        COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
        COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
        COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
        
        COUNT(DISTINCT r.id) FILTER (
          WHERE r.status = 'SENT' 
            AND r.sent_at IS NOT NULL
            AND EXISTS (
              SELECT 1 
              FROM whatsapp_incoming_messages wim
              WHERE COALESCE(wim.from_me, false) = false
                AND LOWER(COALESCE(wim.remote_jid, '')) NOT LIKE '%@g.us'
                AND wim.created_at >= r.sent_at
                AND wim.created_at < r.sent_at + INTERVAL '7 days'
                AND LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
            )
        ) AS responded_count,
        
        COUNT(DISTINCT r.id) FILTER (
          WHERE r.status = 'SENT'
            AND r.sent_at IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM orders o
              WHERE o.order_date >= r.sent_at::date
                AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                AND (
                  (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                  OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                )
            )
        ) AS purchased_count,
        
        COALESCE(SUM(
          CASE 
            WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
              (
                SELECT COALESCE(SUM(o.total_amount), 0)
                FROM orders o
                WHERE o.order_date >= r.sent_at::date
                  AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                  AND (
                    (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                    OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                  )
              )
            ELSE 0
          END
        ), 0) AS total_revenue,
        
        NOW() AS cached_at
      FROM whatsapp_campaign_recipients r
      WHERE r.campaign_id = campaign_record.campaign_id
      GROUP BY r.campaign_id;
    END LOOP;
    
    RAISE NOTICE 'Successfully refreshed % campaign caches', 
      (SELECT COUNT(DISTINCT campaign_id) FROM whatsapp_campaign_recipients);
  END $$;

  -- Create index on remote_jid for faster filtering (if not exists)
  CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_remote_jid_lower 
    ON whatsapp_incoming_messages(LOWER(COALESCE(remote_jid, '')));

  COMMENT ON FUNCTION refresh_campaign_stats_cache() IS 
    'Calculates campaign statistics with GROUP MESSAGE FILTER to prevent incorrect response attribution. 
     Updated 2026-06-09 to exclude @g.us messages from response counts.';
  `,
  `
  -- Migration 45: Clean up WhatsApp JID aliases and isolate group campaigns in stats trigger
  -- Clean up polluted group/private JID cross-associations
  DELETE FROM whatsapp_jid_aliases 
  WHERE (canonical_jid LIKE '%@g.us' AND alias_jid NOT LIKE '%@g.us')
     OR (canonical_jid NOT LIKE '%@g.us' AND alias_jid LIKE '%@g.us');

  -- Recreate trigger function with partition matching logic
  CREATE OR REPLACE FUNCTION refresh_campaign_stats_cache()
  RETURNS TRIGGER AS $$
  BEGIN
    -- Clear cache for this campaign
    DELETE FROM whatsapp_campaign_stats_cache 
    WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id);
    
    -- Recalculate and insert fresh stats
    INSERT INTO whatsapp_campaign_stats_cache (
      campaign_id,
      total_recipients,
      pending_count,
      blocked_recent_count,
      sending_count,
      sent_count,
      failed_count,
      skipped_count,
      responded_count,
      purchased_count,
      total_revenue,
      cached_at
    )
    SELECT
      r.campaign_id,
      COUNT(*) AS total_recipients,
      COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
      COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
      COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
      COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
      COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
      COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
      
      -- Count recipients with responses
      COUNT(DISTINCT r.id) FILTER (
        WHERE r.status = 'SENT' 
          AND r.sent_at IS NOT NULL
          AND EXISTS (
            SELECT 1 
            FROM whatsapp_incoming_messages wim
            WHERE COALESCE(wim.from_me, false) = false
              AND wim.created_at >= r.sent_at
              AND wim.created_at < r.sent_at + INTERVAL '7 days'
              AND (
                -- Case 1: Recipient JID ends with @g.us (group campaign), match group directly
                (r.jid LIKE '%@g.us' AND wim.remote_jid LIKE '%@g.us' AND LOWER(wim.remote_jid) = LOWER(r.jid))
                OR
                -- Case 2: Recipient is a phone JID, match via clean individual-only aliases
                (
                  r.jid NOT LIKE '%@g.us' 
                  AND wim.remote_jid NOT LIKE '%@g.us'
                  AND (
                    LOWER(wim.remote_jid) = LOWER(r.jid)
                    OR EXISTS (
                      SELECT 1 FROM whatsapp_jid_aliases wja1
                      JOIN whatsapp_jid_aliases wja2 
                        ON wja1.canonical_jid = wja2.canonical_jid 
                       AND LOWER(wja1.instance_name) = LOWER(wja2.instance_name)
                      WHERE LOWER(wja1.alias_jid) = LOWER(wim.remote_jid)
                        AND LOWER(wja2.alias_jid) = LOWER(r.jid)
                        AND wja1.alias_jid NOT LIKE '%@g.us'
                        AND wja2.alias_jid NOT LIKE '%@g.us'
                        AND wja1.canonical_jid NOT LIKE '%@g.us'
                    )
                  )
                )
              )
          )
      ) AS responded_count,
      
      -- Count recipients with purchases
      COUNT(DISTINCT r.id) FILTER (
        WHERE r.status = 'SENT'
          AND r.sent_at IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM orders o
            WHERE o.order_date >= r.sent_at::date
              AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
              AND (
                (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
              )
          )
      ) AS purchased_count,
      
      -- Calculate total revenue from attributed orders
      COALESCE(SUM(
        CASE 
          WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
            (
              SELECT COALESCE(SUM(o.total_amount), 0)
              FROM orders o
              WHERE o.order_date >= r.sent_at::date
                AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                AND (
                  (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                  OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                )
            )
          ELSE 0
        END
      ), 0) AS total_revenue,
      
      NOW() AS cached_at
    FROM whatsapp_campaign_recipients r
    WHERE r.campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id)
    GROUP BY r.campaign_id;
    
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  -- Recalculate stats for all existing campaigns with the corrected partition matching logic
  DO $$
  DECLARE
    campaign_record RECORD;
  BEGIN
    FOR campaign_record IN 
      SELECT DISTINCT campaign_id 
      FROM whatsapp_campaign_recipients
    LOOP
      DELETE FROM whatsapp_campaign_stats_cache 
      WHERE campaign_id = campaign_record.campaign_id;
      
      INSERT INTO whatsapp_campaign_stats_cache (
        campaign_id,
        total_recipients,
        pending_count,
        blocked_recent_count,
        sending_count,
        sent_count,
        failed_count,
        skipped_count,
        responded_count,
        purchased_count,
        total_revenue,
        cached_at
      )
      SELECT
        r.campaign_id,
        COUNT(*) AS total_recipients,
        COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
        COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
        COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
        COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
        COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
        COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
        
        COUNT(DISTINCT r.id) FILTER (
          WHERE r.status = 'SENT' 
            AND r.sent_at IS NOT NULL
            AND EXISTS (
              SELECT 1 
              FROM whatsapp_incoming_messages wim
              WHERE COALESCE(wim.from_me, false) = false
                AND wim.created_at >= r.sent_at
                AND wim.created_at < r.sent_at + INTERVAL '7 days'
                AND (
                  (r.jid LIKE '%@g.us' AND wim.remote_jid LIKE '%@g.us' AND LOWER(wim.remote_jid) = LOWER(r.jid))
                  OR
                  (
                    r.jid NOT LIKE '%@g.us' 
                    AND wim.remote_jid NOT LIKE '%@g.us'
                    AND (
                      LOWER(wim.remote_jid) = LOWER(r.jid)
                      OR EXISTS (
                        SELECT 1 FROM whatsapp_jid_aliases wja1
                        JOIN whatsapp_jid_aliases wja2 
                          ON wja1.canonical_jid = wja2.canonical_jid 
                         AND LOWER(wja1.instance_name) = LOWER(wja2.instance_name)
                        WHERE LOWER(wja1.alias_jid) = LOWER(wim.remote_jid)
                          AND LOWER(wja2.alias_jid) = LOWER(r.jid)
                          AND wja1.alias_jid NOT LIKE '%@g.us'
                          AND wja2.alias_jid NOT LIKE '%@g.us'
                          AND wja1.canonical_jid NOT LIKE '%@g.us'
                      )
                    )
                  )
                )
            )
        ) AS responded_count,
        
        COUNT(DISTINCT r.id) FILTER (
          WHERE r.status = 'SENT'
            AND r.sent_at IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM orders o
              WHERE o.order_date >= r.sent_at::date
                AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                AND (
                  (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                  OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                )
            )
        ) AS purchased_count,
        
        COALESCE(SUM(
          CASE 
            WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
              (
                SELECT COALESCE(SUM(o.total_amount), 0)
                FROM orders o
                WHERE o.order_date >= r.sent_at::date
                  AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                  AND (
                    (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                    OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                  )
              )
            ELSE 0
          END
        ), 0) AS total_revenue,
        
        NOW() AS cached_at
      FROM whatsapp_campaign_recipients r
      WHERE r.campaign_id = campaign_record.campaign_id
      GROUP BY r.campaign_id;
    END LOOP;
  END $$;

  COMMENT ON FUNCTION refresh_campaign_stats_cache() IS
    'Calculates campaign statistics with isolated JID matching partition logic for groups and individuals. Updated 2026-06-10.';
  `,
  `
  -- Migration 46: agendamento de campanhas + trigger de cache leve + índices de performance
  ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ;

  -- Os triggers das Migrations 43-45 recalculavam responded/purchased/revenue
  -- com EXISTS sobre whatsapp_incoming_messages e orders PARA CADA LINHA
  -- alterada de destinatário — criar/disparar uma campanha de N contatos rodava
  -- o cálculo pesado N vezes. O cache só é lido para contagens de status, então
  -- o trigger volta a ser apenas contagens + hints de agenda (barato). O badge
  -- "Respondeu" é calculado em tempo real pela API com filtro de instância.
  CREATE OR REPLACE FUNCTION refresh_campaign_stats_cache()
  RETURNS TRIGGER AS $body$
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
  $body$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trigger_update_campaign_stats ON whatsapp_campaign_recipients;
  DROP TRIGGER IF EXISTS trg_refresh_campaign_stats_cache ON whatsapp_campaign_recipients;

  CREATE TRIGGER trg_refresh_campaign_stats_cache
    AFTER INSERT OR UPDATE OR DELETE ON whatsapp_campaign_recipients
    FOR EACH ROW
    EXECUTE FUNCTION refresh_campaign_stats_cache();

  -- Índices para a query de atribuição de respostas/compra das campanhas
  CREATE INDEX IF NOT EXISTS idx_wcr_campaign_status
    ON whatsapp_campaign_recipients (campaign_id, status);
  CREATE INDEX IF NOT EXISTS idx_wim_inbound_created
    ON whatsapp_incoming_messages (created_at)
    WHERE COALESCE(from_me, false) = false;
  CREATE INDEX IF NOT EXISTS idx_wim_remote_jid_lower
    ON whatsapp_incoming_messages (LOWER(remote_jid));
  CREATE INDEX IF NOT EXISTS idx_da_whatsapp_received_created
    ON deal_activities (created_at)
    WHERE activity_type = 'WHATSAPP_RECEIVED';
  CREATE INDEX IF NOT EXISTS idx_ml_campaign_id
    ON message_logs (campaign_id);
  CREATE INDEX IF NOT EXISTS idx_wja_alias_jid_lower
    ON whatsapp_jid_aliases (LOWER(alias_jid));

  -- Recalcula o cache uma única vez com a versão leve
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
  `,
  `
  -- Add menu_data (menu interativo uazapi /send/menu) to campaigns
  ALTER TABLE public.whatsapp_campaigns
    ADD COLUMN IF NOT EXISTS menu_data JSONB;
  `,
  `
  -- Resposta automatica de campanha: texto configurado na campanha e
  -- marcacao de envio unico por destinatario.
  ALTER TABLE public.whatsapp_campaigns
    ADD COLUMN IF NOT EXISTS auto_reply_text TEXT;

  ALTER TABLE public.whatsapp_campaign_recipients
    ADD COLUMN IF NOT EXISTS auto_reply_sent_at TIMESTAMPTZ;
  `,
  `
  -- Indice unico que faltava para o ON CONFLICT (message_id, deal_id) de
  -- message_events. Sem ele, toda criacao de evento de mensagem via webhook
  -- falhava com "no unique or exclusion constraint matching the ON CONFLICT".
  -- Dedup primeiro (mantem 1 por par), depois cria o indice.
  DELETE FROM message_events a
  USING message_events b
  WHERE a.ctid < b.ctid
    AND a.message_id IS NOT NULL
    AND a.message_id = b.message_id
    AND a.deal_id = b.deal_id;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_message_events_message_deal
    ON message_events(message_id, deal_id);
  `,
  `
  -- Numeros da empresa/equipe para EXCLUIR da atribuicao de resposta de campanha.
  -- Mensagem em grupo vinda de um desses numeros (ou de uma instancia) NAO conta
  -- como "cliente respondeu" -- e a propria empresa/funcionario ("contato padrao").
  -- Os numeros das instancias (whatsapp_instances.phone_number) ja entram
  -- automaticamente na atribuicao; esta tabela guarda os extras (funcionarios etc.).
  CREATE TABLE IF NOT EXISTS whatsapp_team_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Indice nos digitos para casar rapido com participant_jid normalizado.
  CREATE INDEX IF NOT EXISTS idx_whatsapp_team_contacts_digits
    ON whatsapp_team_contacts ((regexp_replace(phone_number, '\\D', '', 'g')));
  `,
  `
  -- Message intelligence optional AI batch summaries and usage caps.
  CREATE TABLE IF NOT EXISTS event_ai_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_date DATE NOT NULL DEFAULT CURRENT_DATE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL,
    status_reason TEXT NOT NULL DEFAULT '',
    period_from TIMESTAMPTZ,
    period_to TIMESTAMPTZ,
    event_count INTEGER NOT NULL DEFAULT 0,
    request_count INTEGER NOT NULL DEFAULT 0,
    input_tokens_estimated INTEGER NOT NULL DEFAULT 0,
    output_tokens_estimated INTEGER NOT NULL DEFAULT 0,
    summary_json JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status IN ('SKIPPED', 'SUCCEEDED', 'FAILED'))
  );

  CREATE INDEX IF NOT EXISTS idx_event_ai_batches_date
    ON event_ai_batches(batch_date DESC);
  CREATE INDEX IF NOT EXISTS idx_event_ai_batches_finished_at
    ON event_ai_batches(finished_at DESC);
  ALTER TABLE event_ai_batches
    ADD COLUMN IF NOT EXISTS run_source TEXT NOT NULL DEFAULT 'automatic';
  ALTER TABLE event_ai_batches DROP CONSTRAINT IF EXISTS event_ai_batches_run_source_check;
  ALTER TABLE event_ai_batches
    ADD CONSTRAINT event_ai_batches_run_source_check CHECK (run_source IN ('manual', 'automatic'));
  `,
  `
  -- Deduplicacao operacional de eventos replicados por varias instancias.
  -- A mesma mensagem de grupo pode chegar por 2+ webhooks porque varias
  -- vendedoras estao no mesmo grupo. A chave e criada pela aplicacao com
  -- grupo/remetente/texto/janela curta para manter um unico evento gerencial.
  ALTER TABLE message_events
    ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_message_events_dedupe_key
    ON message_events(dedupe_key)
    WHERE dedupe_key IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_message_events_dedupe_key
    ON message_events(dedupe_key);
  `,
  `
  -- Pausa real de campanhas: novo estado PAUSED (para todos os pendentes sem
  -- cancelar; Retomar continua de onde parou). Antes "Pausar" cancelava a campanha.
  ALTER TABLE whatsapp_campaigns DROP CONSTRAINT IF EXISTS whatsapp_campaigns_status_check;
  ALTER TABLE whatsapp_campaigns
    ADD CONSTRAINT whatsapp_campaigns_status_check
    CHECK (status IN ('QUEUED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'));
  ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
  `,
  `
  -- Automacao de carteira ("regua de relacionamento"): quando o cliente cruza um
  -- estagio (Atencao 1 / Atencao 2 / Inativo / Inativo +30), o sistema manda o
  -- template definido direto pro cliente. Comeca em modo simulacao (so registra o
  -- que MANDARIA, sem enviar). Stages: ATENCAO_1, ATENCAO_2, INATIVO, INATIVO_30.

  -- Config: qual template/mensagem cada estagio dispara (1 linha por estagio).
  CREATE TABLE IF NOT EXISTS lifecycle_stage_config (
    stage TEXT PRIMARY KEY
      CHECK (stage IN ('ATENCAO_1', 'ATENCAO_2', 'INATIVO', 'INATIVO_30')),
    template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Log: cada vez que um cliente cruza um estagio, registra o que aconteceu.
  -- action: SIMULATED (so registrou) | SENT (enviou de verdade) | SKIPPED (sem
  -- template/sem telefone/etc). UNIQUE(customer_id, stage) garante que cada
  -- cliente passa por cada estagio uma unica vez (sem reenvio do mesmo template).
  CREATE TABLE IF NOT EXISTS customer_lifecycle_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    stage TEXT NOT NULL
      CHECK (stage IN ('ATENCAO_1', 'ATENCAO_2', 'INATIVO', 'INATIVO_30')),
    template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('SIMULATED', 'SENT', 'SKIPPED')),
    detail TEXT,
    days_since_last_purchase INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_lifecycle_customer_stage
    ON customer_lifecycle_events(customer_id, stage);

  CREATE INDEX IF NOT EXISTS idx_customer_lifecycle_created_at
    ON customer_lifecycle_events(created_at DESC);

  -- Marca de "descartado": cliente que passou por todos os estagios sem voltar a
  -- comprar. Fica na propria customers para a tela de carteira filtrar facil.
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS lifecycle_discarded_at TIMESTAMPTZ;
  `,
  `
  -- Templates agora podem carregar midia (imagem/video), nao so texto — para a
  -- automacao de carteira mandar mensagem rica direto pro cliente.
  ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'TEXT'
    CHECK (message_type IN ('TEXT', 'IMAGE', 'VIDEO'));
  ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS media_url TEXT;
  `,
  `
  -- Correcao: "Pulado" (sem template/sem numero/erro) nao deve consumir a vaga
  -- unica do cliente naquele estagio. Removemos os SKIPPED ja gravados para que
  -- voltem a ser candidatos quando um template for configurado. A partir do fix,
  -- o runtime nao grava mais SKIPPED, entao isto e um no-op nos proximos deploys.
  DELETE FROM customer_lifecycle_events WHERE action = 'SKIPPED';
  `
];
