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
];
