export const supplierPriceSchema = `
  CREATE TABLE IF NOT EXISTS price_suppliers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, source_kind TEXT NOT NULL DEFAULT 'upload', source_url TEXT, auto_sync BOOLEAN NOT NULL DEFAULT FALSE,
    last_attempt_at TIMESTAMPTZ, last_success_at TIMESTAMPTZ, last_error TEXT
  );
  CREATE TABLE IF NOT EXISTS supplier_price_snapshots (
    id UUID PRIMARY KEY, supplier_id TEXT NOT NULL REFERENCES price_suppliers(id),
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), file_name TEXT NOT NULL,
    source TEXT NOT NULL, item_count INTEGER NOT NULL CHECK (item_count > 0),
    items JSONB NOT NULL, source_file BYTEA NOT NULL, created_by TEXT
  );
  CREATE INDEX IF NOT EXISTS supplier_price_snapshots_supplier_date ON supplier_price_snapshots(supplier_id, captured_at DESC);
  ALTER TABLE price_suppliers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE supplier_price_snapshots ENABLE ROW LEVEL SECURITY;
  INSERT INTO price_suppliers(id, name, source_kind, source_url, auto_sync, last_error) VALUES
    ('uuf', 'UUF', 'upload', NULL, FALSE, NULL),
    ('fff', 'FFF', 'fff', 'https://fffpecas.com.br', TRUE, NULL),
    ('feihu', 'Feihu', 'feihu', 'https://us.wps.com/l/cbEaatsWAN2LaU3z?sa=S3&st=0&v=v2', FALSE, 'Link expirado. Aguardando nova fonte; importação manual disponível.'),
    ('skytech', 'SkyTech', 'skytech', 'https://docs.google.com/spreadsheets/d/1vVY6oEatrgRmMxWTAAfDeQmCjQYGHFosSCRxnGPi6Lc/htmlview#gid=1414860671', FALSE, 'Fonte sem acesso público. Aguardando liberação; importação manual disponível.')
  ON CONFLICT (id) DO NOTHING;
`;
