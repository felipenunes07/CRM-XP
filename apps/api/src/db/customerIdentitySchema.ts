// As correcoes revisadas afetam a leitura do CRM; a importacao original e seu fingerprint ficam intactos.
export const customerIdentitySchema = `
  CREATE TABLE IF NOT EXISTS customer_identity_corrections (
    source_customer_code TEXT NOT NULL CHECK (source_customer_code ~ '^(CL|KH|LJ)[0-9]+-?$'),
    label_customer_code TEXT NOT NULL DEFAULT '',
    canonical_customer_code TEXT NOT NULL CHECK (canonical_customer_code ~ '^(CL|KH|LJ)[0-9]+$'),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (source_customer_code, label_customer_code),
    CHECK (source_customer_code <> canonical_customer_code),
    CHECK (label_customer_code = '' OR label_customer_code = canonical_customer_code)
  );
  CREATE INDEX IF NOT EXISTS customer_identity_corrections_canonical_idx
    ON customer_identity_corrections (canonical_customer_code);

  CREATE OR REPLACE VIEW resolved_sales_raw AS
  SELECT s.id, s.source_system, s.source_file_id, s.import_run_id, s.external_order_id,
    CASE WHEN fix.canonical_customer_code IS NULL THEN s.external_customer_id ELSE NULL END AS external_customer_id,
    s.sale_date, s.item_description, s.quantity,
    COALESCE(fix.canonical_customer_code, s.customer_code) AS customer_code,
    s.unit_price, s.line_total, s.order_number, s.sku,
    CASE WHEN fix.label_customer_code <> '' THEN
      regexp_replace(s.customer_label, '^' || fix.source_customer_code || '[[:space:]]*[-:–—][[:space:]]*', '', 'i')
      ELSE s.customer_label END AS customer_label,
    s.attendant_name, s.order_status, s.order_updated_at, s.fingerprint, s.raw_payload, s.created_at,
    s.customer_code AS source_customer_code
  FROM sales_raw s
  LEFT JOIN LATERAL (
    SELECT c.source_customer_code, c.label_customer_code, c.canonical_customer_code
    FROM customer_identity_corrections c
    WHERE c.source_customer_code = s.customer_code
      AND (c.label_customer_code = '' OR s.customer_label ~*
        ('^([[:space:]]*' || c.source_customer_code || '[[:space:]]*[-:–—][[:space:]]*)?'
          || c.label_customer_code || '([[:space:]]|[-:–—]|$)'))
    ORDER BY (c.label_customer_code <> '') DESC
    LIMIT 1
  ) fix ON TRUE;
`;
