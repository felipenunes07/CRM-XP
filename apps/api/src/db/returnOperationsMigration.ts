export const returnOperationsMigration=`
 CREATE TABLE return_credit_reconciliations(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),credit_id UUID NOT NULL REFERENCES return_credits(id),customer_id UUID NOT NULL REFERENCES customers(id),payment_number TEXT NOT NULL,payment_key TEXT NOT NULL,payment_amount NUMERIC NOT NULL,payment_type TEXT NOT NULL,coverage_cents BIGINT NOT NULL CHECK(coverage_cents>0),source_evidence JSONB NOT NULL,reason TEXT NOT NULL,author_id UUID NOT NULL REFERENCES profiles(id),active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),released_at TIMESTAMPTZ,release_reason TEXT);
 CREATE UNIQUE INDEX return_credit_reconciliation_active ON return_credit_reconciliations(credit_id) WHERE active;
 ALTER TABLE return_transition_settings ADD COLUMN coordinator_id UUID REFERENCES profiles(id);
 ALTER TABLE return_cases ADD COLUMN coordinator_id UUID REFERENCES profiles(id);
 ALTER TABLE return_factory_profiles ADD COLUMN allows_batch BOOLEAN NOT NULL DEFAULT FALSE;
 UPDATE return_factory_profiles SET allows_batch=TRUE WHERE code='DE';
 ALTER TABLE return_dispositions DROP CONSTRAINT return_dispositions_destination_check;
 ALTER TABLE return_dispositions ADD CONSTRAINT return_dispositions_destination_check CHECK(destination IN ('technical_review','reconditioning','outlet','stock','china','disposal'));
 CREATE TABLE return_inspection_jobs(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),case_id UUID NOT NULL REFERENCES return_cases(id),disposition_id UUID NOT NULL UNIQUE REFERENCES return_dispositions(id),
  assignee_id UUID NOT NULL REFERENCES profiles(id),coordinator_id UUID NOT NULL REFERENCES profiles(id),due_at TIMESTAMPTZ NOT NULL,notes TEXT NOT NULL,
  recommendation TEXT CHECK(recommendation IN ('reconditioning','outlet','stock','china','disposal')),test_notes TEXT NOT NULL DEFAULT '',seal TEXT NOT NULL DEFAULT '',
  completed_at TIMESTAMPTZ,completed_by UUID REFERENCES profiles(id),version INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE return_price_snapshots(revision_id UUID PRIMARY KEY REFERENCES return_legacy_revisions(id),formula_version TEXT NOT NULL,source_formula TEXT NOT NULL,catalog_range TEXT NOT NULL,sales_through DATE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE return_price_history(revision_id UUID NOT NULL REFERENCES return_price_snapshots(revision_id),customer_code TEXT NOT NULL,sku TEXT NOT NULL,quantity NUMERIC NOT NULL,weighted_cents NUMERIC NOT NULL,invalid BOOLEAN NOT NULL DEFAULT FALSE,PRIMARY KEY(revision_id,customer_code,sku));
 CREATE TABLE return_price_catalog(revision_id UUID NOT NULL REFERENCES return_price_snapshots(revision_id),sku TEXT NOT NULL,unit_cents BIGINT,ambiguous BOOLEAN NOT NULL DEFAULT FALSE,model TEXT NOT NULL DEFAULT '',color TEXT NOT NULL DEFAULT '',quality TEXT NOT NULL DEFAULT '',PRIMARY KEY(revision_id,sku));
 CREATE TABLE return_reason_rules(revision_id UUID NOT NULL REFERENCES return_price_snapshots(revision_id),code TEXT NOT NULL,label TEXT NOT NULL,outcome TEXT NOT NULL CHECK(outcome IN ('refused','external_analysis','no_defect','resale')),PRIMARY KEY(revision_id,code));
 CREATE TABLE return_price_overrides(sku TEXT PRIMARY KEY,unit_cents BIGINT NOT NULL CHECK(unit_cents>0 AND unit_cents<=250000),version INTEGER NOT NULL DEFAULT 1,reason TEXT NOT NULL,author_id UUID NOT NULL REFERENCES profiles(id),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 ALTER TABLE return_credits ADD COLUMN calculation_evidence JSONB NOT NULL DEFAULT '{}';
 ALTER TABLE return_sale_cancellations ADD COLUMN sale_source_evidence JSONB NOT NULL DEFAULT '{}';
 ALTER TABLE return_items ADD COLUMN reason_code TEXT NOT NULL DEFAULT '';
 ALTER TABLE return_items ADD COLUMN customer_reported_defect TEXT NOT NULL DEFAULT '',ADD COLUMN customer_evidence_reference TEXT NOT NULL DEFAULT '',ADD COLUMN test_finding TEXT NOT NULL DEFAULT 'not_tested' CHECK(test_finding IN ('reproduced','not_reproduced','not_tested'));
 CREATE TABLE return_sku_aliases(revision_id UUID NOT NULL REFERENCES return_price_snapshots(revision_id),sku TEXT NOT NULL,canonical_sku TEXT NOT NULL,ambiguous BOOLEAN NOT NULL DEFAULT FALSE,PRIMARY KEY(revision_id,sku));
 ALTER TABLE return_stock_lots ADD COLUMN factory_code TEXT REFERENCES return_factory_profiles(code);
 UPDATE return_stock_lots s SET factory_code=i.factory_code FROM return_items i WHERE i.id=s.item_id;
 ALTER TABLE return_stock_lots ALTER COLUMN factory_code SET NOT NULL;
 CREATE TABLE return_legacy_auxiliary_rows(revision_id UUID NOT NULL REFERENCES return_legacy_revisions(id),sheet TEXT NOT NULL,row_number INTEGER NOT NULL,search_text TEXT NOT NULL,raw_payload JSONB NOT NULL,PRIMARY KEY(revision_id,sheet,row_number));
 CREATE INDEX return_auxiliary_revision_idx ON return_legacy_auxiliary_rows(revision_id,sheet);
 CREATE TABLE return_legacy_archives(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),source_name TEXT NOT NULL,source_sha256 TEXT NOT NULL UNIQUE,export_sha256 TEXT NOT NULL,rows_count INTEGER NOT NULL,author_id UUID NOT NULL REFERENCES profiles(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE return_legacy_archive_rows(archive_id UUID NOT NULL REFERENCES return_legacy_archives(id),sheet TEXT NOT NULL,row_number INTEGER NOT NULL,search_text TEXT NOT NULL,raw_payload JSONB NOT NULL,PRIMARY KEY(archive_id,sheet,row_number));
`;
