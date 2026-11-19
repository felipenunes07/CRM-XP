export const returnFactoryMigration=`
 CREATE TABLE return_factory_profiles(
  code TEXT PRIMARY KEY CHECK(code~'^[A-Z0-9_]{2,30}$'),name TEXT NOT NULL,aliases JSONB NOT NULL DEFAULT '[]',workflow TEXT NOT NULL CHECK(workflow IN ('vv_batch','external_individual','internal')),
  default_assignee_id UUID REFERENCES profiles(id),instructions TEXT NOT NULL DEFAULT '',is_active BOOLEAN NOT NULL DEFAULT TRUE,version INTEGER NOT NULL DEFAULT 1,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 INSERT INTO return_factory_profiles(code,name,aliases,workflow,instructions) VALUES
 ('VV','VV','["VV","V.V."]','vv_batch','Identificar modelo e cliente na peça; formar lote e encaminhar ao técnico da fábrica. Parecer não é crédito nem retorno físico.'),
 ('DE','D.E.','["DE","D.E."]','external_individual','Separar para o responsável pelo encaminhamento D.E.; registrar análise e acerto próprios, sem exigir lote VV.'),
 ('STC','STC','["STC"]','external_individual','Encaminhamento próprio da STC. Não misturar com VV nem TC-OMG.'),
 ('TCOMG','TC-OMG','["TC-OMG","TC OMG","TCOMG"]','external_individual','Encaminhamento próprio TC-OMG. Manter origem do cliente; lote VV não se aplica.'),
 ('OTHER','Outras / análise interna','[]','internal','Análise interna direta; envio individual se houver necessidade de parecer externo.'),
 ('UNKNOWN','Fábrica a identificar','[]','external_individual','Identificar a fábrica antes de concluir o encaminhamento. Carimbo não identifica sozinho o fornecedor.');
 CREATE TABLE return_settings_events(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,resource TEXT NOT NULL,author_id UUID NOT NULL REFERENCES profiles(id),author_name TEXT NOT NULL,data JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 ALTER TABLE return_items ADD COLUMN factory_code TEXT NOT NULL DEFAULT 'OTHER' REFERENCES return_factory_profiles(code),ADD COLUMN factory_workflow TEXT NOT NULL DEFAULT 'internal',ADD COLUMN seal TEXT NOT NULL DEFAULT '',ADD COLUMN routing_override TEXT NOT NULL DEFAULT '';
 UPDATE return_items SET factory_code=CASE regexp_replace(upper(manufacturer),'[^A-Z0-9]','','g') WHEN 'VV' THEN 'VV' WHEN 'DE' THEN 'DE' WHEN 'STC' THEN 'STC' WHEN 'TCOMG' THEN 'TCOMG' ELSE 'OTHER' END;
 UPDATE return_items i SET factory_workflow=p.workflow FROM return_factory_profiles p WHERE p.code=i.factory_code;
 ALTER TABLE return_factory_batches ALTER COLUMN sent_at DROP NOT NULL;
 ALTER TABLE return_factory_batches ADD COLUMN mode TEXT NOT NULL DEFAULT 'batch' CHECK(mode IN ('batch','individual')),ADD COLUMN state TEXT NOT NULL DEFAULT 'sent' CHECK(state IN ('assembling','sent')),ADD COLUMN lot_reference TEXT NOT NULL DEFAULT '',ADD COLUMN responsible_id UUID REFERENCES profiles(id),ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
 CREATE TABLE return_transition_settings(id INTEGER PRIMARY KEY CHECK(id=1),source_path TEXT NOT NULL,source_enabled BOOLEAN NOT NULL DEFAULT TRUE,authority TEXT NOT NULL DEFAULT 'parallel' CHECK(authority IN ('parallel','crm')),cutover_at TIMESTAMPTZ,cutover_reason TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,last_checked_at TIMESTAMPTZ,last_success_at TIMESTAMPTZ,last_error TEXT NOT NULL DEFAULT '');
 INSERT INTO return_transition_settings(id,source_path) VALUES(1,'/DEFEITOS - XP/坏品表 PLANILHA DEFEITOS 2026.xlsx');
 CREATE TABLE return_legacy_revisions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),source_path TEXT NOT NULL,source_file_id TEXT NOT NULL,source_revision TEXT NOT NULL,source_hash TEXT NOT NULL,source_modified_at TIMESTAMPTZ NOT NULL,imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),row_count INTEGER NOT NULL,active BOOLEAN NOT NULL DEFAULT FALSE,UNIQUE(source_file_id,source_revision));
 CREATE UNIQUE INDEX return_legacy_active_unique ON return_legacy_revisions(active) WHERE active;
 CREATE TABLE return_legacy_rows(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),revision_id UUID NOT NULL REFERENCES return_legacy_revisions(id),sheet TEXT NOT NULL,row_number INTEGER NOT NULL,fingerprint TEXT NOT NULL,anchor TEXT NOT NULL,occurrence INTEGER NOT NULL,document TEXT NOT NULL,customer_code TEXT NOT NULL,customer_name TEXT NOT NULL,occurred_on TEXT NOT NULL,sku TEXT NOT NULL,description TEXT NOT NULL,signed_quantity NUMERIC NOT NULL,amount_cents BIGINT NOT NULL,raw_status TEXT NOT NULL,raw_payload JSONB NOT NULL,UNIQUE(revision_id,sheet,row_number));
 CREATE INDEX return_legacy_customer_idx ON return_legacy_rows(revision_id,customer_code);
 CREATE INDEX return_legacy_identity_idx ON return_legacy_rows(fingerprint,occurrence);
 CREATE TABLE return_legacy_links(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),source_row_id UUID NOT NULL REFERENCES return_legacy_rows(id),fingerprint TEXT NOT NULL,occurrence INTEGER NOT NULL,case_id UUID NOT NULL REFERENCES return_cases(id),source_revision TEXT NOT NULL,review_reason TEXT NOT NULL,author_id UUID NOT NULL REFERENCES profiles(id),author_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),active BOOLEAN NOT NULL DEFAULT TRUE,superseded_at TIMESTAMPTZ,resolution TEXT NOT NULL DEFAULT '');
 CREATE UNIQUE INDEX return_legacy_link_active_unique ON return_legacy_links(fingerprint,occurrence) WHERE active;
 CREATE TABLE return_legacy_exclusions(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),fingerprint TEXT NOT NULL,occurrence INTEGER NOT NULL,source_row_id UUID NOT NULL REFERENCES return_legacy_rows(id),reason TEXT NOT NULL,author_id UUID NOT NULL REFERENCES profiles(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(fingerprint,occurrence));
 ALTER TABLE return_cases ADD COLUMN origin TEXT NOT NULL DEFAULT 'crm',ADD COLUMN legacy_document TEXT NOT NULL DEFAULT '';
 INSERT INTO permissions(key,name,description) VALUES ('returns.configure','Trocas: configuração e migração','Configurar fábricas, origem de transição e corte de migração.'),('returns.communicate','Trocas: avisos operacionais','Enviar avisos aprovados de um protocolo pelo canal autorizado.') ON CONFLICT DO NOTHING;
 INSERT INTO role_permissions(role,permission_key) VALUES('admin','returns.configure'),('admin','returns.communicate'),('operacional','returns.communicate') ON CONFLICT DO NOTHING;
`;
