export const returnExecutionMigration = `
 ALTER TABLE return_cases DROP CONSTRAINT return_cases_stage_check;
 ALTER TABLE return_cases ADD CONSTRAINT return_cases_stage_check CHECK(stage IN ('received','triage','triage_completed','closed'));
 ALTER TABLE return_cases ADD COLUMN closed_at TIMESTAMPTZ, ADD COLUMN closed_by UUID REFERENCES profiles(id), ADD COLUMN closure_note TEXT NOT NULL DEFAULT '';
 CREATE UNIQUE INDEX return_items_case_id_unique ON return_items(case_id,id);
 CREATE TABLE return_commands(request_id UUID PRIMARY KEY,request_hash TEXT NOT NULL,actor_id UUID NOT NULL REFERENCES profiles(id),result_id UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE return_factory_batches(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  manufacturer TEXT NOT NULL,sent_at TIMESTAMPTZ NOT NULL,due_at TIMESTAMPTZ NOT NULL,reference TEXT NOT NULL,carrier TEXT NOT NULL,from_location TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES profiles(id),author_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),voided_at TIMESTAMPTZ,
  UNIQUE(manufacturer,reference)
 );
 CREATE TABLE return_factory_lines(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),batch_id UUID NOT NULL REFERENCES return_factory_batches(id),case_id UUID NOT NULL REFERENCES return_cases(id),item_id UUID NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity>0),protocol_snapshot TEXT NOT NULL,customer_code_snapshot TEXT NOT NULL,customer_name_snapshot TEXT NOT NULL,model_snapshot TEXT NOT NULL,manufacturer_snapshot TEXT NOT NULL,
  FOREIGN KEY(case_id,item_id) REFERENCES return_items(case_id,id),UNIQUE(batch_id,item_id)
 );
 CREATE INDEX return_factory_lines_case_idx ON return_factory_lines(case_id);
 CREATE UNIQUE INDEX return_factory_batch_reference_unique ON return_factory_batches(lower(trim(manufacturer)),lower(trim(reference)));
 CREATE TABLE return_factory_results(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),case_id UUID NOT NULL REFERENCES return_cases(id),item_id UUID NOT NULL,line_id UUID NOT NULL REFERENCES return_factory_lines(id),
  quantity INTEGER NOT NULL CHECK(quantity>0),decision TEXT NOT NULL CHECK(decision IN ('approved','refused')),compensation TEXT NOT NULL CHECK(compensation IN ('replacement','credit','none')),
  reason TEXT NOT NULL,original_report TEXT NOT NULL,translation TEXT NOT NULL,reference TEXT NOT NULL,occurred_at TIMESTAMPTZ NOT NULL,approval_reference TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),voided_at TIMESTAMPTZ,
  FOREIGN KEY(case_id,item_id) REFERENCES return_items(case_id,id),UNIQUE(line_id,reference),CHECK(decision='approved' OR compensation='none')
 );
 CREATE TABLE return_physical_receipts(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),case_id UUID NOT NULL REFERENCES return_cases(id),item_id UUID NOT NULL,line_id UUID REFERENCES return_factory_lines(id),result_id UUID REFERENCES return_factory_results(id),
  kind TEXT NOT NULL CHECK(kind IN ('original_returned','supplier_replacement','factory_retained','stock_replacement')),quantity INTEGER NOT NULL CHECK(quantity>0),
  location TEXT NOT NULL,received_by TEXT NOT NULL,reference TEXT NOT NULL,reason TEXT NOT NULL,approval_reference TEXT NOT NULL DEFAULT '',occurred_at TIMESTAMPTZ NOT NULL,
  author_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),voided_at TIMESTAMPTZ,FOREIGN KEY(case_id,item_id) REFERENCES return_items(case_id,id)
 );
 CREATE UNIQUE INDEX return_factory_result_reference_unique ON return_factory_results(line_id,lower(trim(reference)));
 CREATE UNIQUE INDEX return_stock_source_reference_unique ON return_physical_receipts(lower(trim(reference))) WHERE kind='stock_replacement' AND voided_at IS NULL;
 CREATE UNIQUE INDEX return_factory_receipt_reference_unique ON return_physical_receipts(line_id,kind,COALESCE(result_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(trim(reference))) WHERE line_id IS NOT NULL AND voided_at IS NULL;
 CREATE TABLE return_resolutions(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),case_id UUID NOT NULL REFERENCES return_cases(id),item_id UUID NOT NULL,result_id UUID REFERENCES return_factory_results(id),
  quantity INTEGER NOT NULL CHECK(quantity>0),kind TEXT NOT NULL CHECK(kind IN ('credit','replacement','return_original','not_applicable')),reason TEXT NOT NULL,approval_reference TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),voided_at TIMESTAMPTZ,FOREIGN KEY(case_id,item_id) REFERENCES return_items(case_id,id)
 );
 CREATE TABLE return_credits(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),case_id UUID NOT NULL REFERENCES return_cases(id),item_id UUID NOT NULL,resolution_id UUID REFERENCES return_resolutions(id),result_id UUID REFERENCES return_factory_results(id),
  party TEXT NOT NULL CHECK(party IN ('customer','supplier')),amount_cents BIGINT NOT NULL CHECK(amount_cents>0 AND amount_cents<=1000000000000),currency TEXT NOT NULL CHECK(currency IN ('BRL','USD','CNY')),
  price_basis TEXT NOT NULL,approval_reference TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','posted','voided','reversed')),
  official_system TEXT NOT NULL DEFAULT '',official_reference TEXT NOT NULL DEFAULT '',posted_at TIMESTAMPTZ,
  reversal_system TEXT NOT NULL DEFAULT '',reversal_reference TEXT NOT NULL DEFAULT '',reversal_reason TEXT NOT NULL DEFAULT '',reversed_at TIMESTAMPTZ,
  author_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),FOREIGN KEY(case_id,item_id) REFERENCES return_items(case_id,id),
  CHECK((party='customer' AND resolution_id IS NOT NULL AND result_id IS NULL AND currency='BRL') OR (party='supplier' AND resolution_id IS NULL AND result_id IS NOT NULL))
 );
 CREATE UNIQUE INDEX return_customer_credit_active_unique ON return_credits(resolution_id) WHERE status IN ('approved','posted');
 CREATE UNIQUE INDEX return_supplier_credit_active_unique ON return_credits(result_id) WHERE status IN ('approved','posted');
 CREATE UNIQUE INDEX return_credit_posting_unique ON return_credits(lower(trim(official_system)),lower(trim(official_reference))) WHERE official_reference<>'';
 CREATE UNIQUE INDEX return_credit_reversal_unique ON return_credits(lower(trim(reversal_system)),lower(trim(reversal_reference))) WHERE reversal_reference<>'';
 CREATE TABLE return_deliveries(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),case_id UUID NOT NULL REFERENCES return_cases(id),item_id UUID NOT NULL,resolution_id UUID NOT NULL REFERENCES return_resolutions(id),receipt_id UUID REFERENCES return_physical_receipts(id),
  quantity INTEGER NOT NULL CHECK(quantity>0),method TEXT NOT NULL CHECK(method IN ('pickup','dispatch')),asset TEXT NOT NULL CHECK(asset IN ('original','replacement')),
  recipient TEXT NOT NULL,tracking TEXT NOT NULL DEFAULT '',reference TEXT NOT NULL,sent_at TIMESTAMPTZ NOT NULL,delivered_at TIMESTAMPTZ,delivery_proof TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),voided_at TIMESTAMPTZ,FOREIGN KEY(case_id,item_id) REFERENCES return_items(case_id,id)
 );
 CREATE TABLE return_dispositions(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),case_id UUID NOT NULL REFERENCES return_cases(id),item_id UUID NOT NULL,receipt_id UUID REFERENCES return_physical_receipts(id),asset TEXT NOT NULL CHECK(asset IN ('original','replacement')),
  quantity INTEGER NOT NULL CHECK(quantity>0),destination TEXT NOT NULL CHECK(destination IN ('reconditioning','outlet','stock','china','disposal')),from_location TEXT NOT NULL,to_location TEXT NOT NULL,custodian TEXT NOT NULL,
  reference TEXT NOT NULL,reason TEXT NOT NULL,test_notes TEXT NOT NULL,occurred_at TIMESTAMPTZ NOT NULL,completed_at TIMESTAMPTZ,completion_proof TEXT NOT NULL DEFAULT '',received_by TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),voided_at TIMESTAMPTZ,FOREIGN KEY(case_id,item_id) REFERENCES return_items(case_id,id)
 );
 CREATE UNIQUE INDEX return_delivery_reference_unique ON return_deliveries(case_id,lower(trim(reference))) WHERE voided_at IS NULL;
 CREATE UNIQUE INDEX return_disposition_reference_unique ON return_dispositions(case_id,lower(trim(reference))) WHERE voided_at IS NULL;
 CREATE TABLE return_notices(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),case_id UUID NOT NULL REFERENCES return_cases(id),channel TEXT NOT NULL CHECK(channel IN ('whatsapp','phone','email','in_person')),recipient TEXT NOT NULL,summary TEXT NOT NULL,reference TEXT NOT NULL,occurred_at TIMESTAMPTZ NOT NULL,author_name TEXT NOT NULL);
 CREATE TABLE return_reviews(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),case_id UUID NOT NULL REFERENCES return_cases(id),reason TEXT NOT NULL,author_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),resolved_at TIMESTAMPTZ,resolution TEXT NOT NULL DEFAULT '');
 CREATE INDEX return_factory_results_case_idx ON return_factory_results(case_id);
 CREATE INDEX return_physical_receipts_case_idx ON return_physical_receipts(case_id);
 CREATE INDEX return_resolutions_case_idx ON return_resolutions(case_id);
 CREATE INDEX return_credits_case_idx ON return_credits(case_id);
 CREATE INDEX return_deliveries_case_idx ON return_deliveries(case_id);
 CREATE INDEX return_dispositions_case_idx ON return_dispositions(case_id);
 CREATE INDEX return_notices_case_idx ON return_notices(case_id);
 CREATE INDEX return_reviews_case_idx ON return_reviews(case_id);
 INSERT INTO permissions(key,name,description) VALUES
 ('returns.logistics','Trocas: fábrica e entrega','Registrar envios, retornos, atendimento, destinos e encerramento.'),
 ('returns.finance','Trocas: créditos','Autorizar, confirmar e estornar créditos com referência financeira.') ON CONFLICT DO NOTHING;
 INSERT INTO role_permissions(role,permission_key) VALUES ('admin','returns.logistics'),('admin','returns.finance'),('operacional','returns.logistics'),('financeiro','returns.view'),('financeiro','returns.finance') ON CONFLICT DO NOTHING;
`;
