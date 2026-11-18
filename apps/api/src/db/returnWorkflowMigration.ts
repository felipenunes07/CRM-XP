export const returnWorkflowMigration = `
  CREATE TABLE return_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocol_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
    request_id UUID NOT NULL UNIQUE,
    request_hash TEXT NOT NULL,
    customer_id UUID NOT NULL REFERENCES customers(id),
    stage TEXT NOT NULL DEFAULT 'received' CHECK (stage IN ('received', 'triage', 'triage_completed')),
    received_at TIMESTAMPTZ NOT NULL,
    receiver_id UUID NOT NULL REFERENCES profiles(id),
    receiver_name TEXT NOT NULL,
    declared_quantity INTEGER CHECK (declared_quantity >= 0),
    received_quantity INTEGER NOT NULL CHECK (received_quantity > 0),
    volumes INTEGER NOT NULL CHECK (volumes > 0),
    location TEXT NOT NULL CHECK (length(trim(location)) > 0),
    notes TEXT NOT NULL DEFAULT '',
    assignee_id UUID REFERENCES profiles(id),
    due_at TIMESTAMPTZ,
    next_action TEXT NOT NULL DEFAULT 'Conferir recebimento e atribuir a triagem',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX return_cases_customer_idx ON return_cases(customer_id, received_at DESC);
  CREATE INDEX return_cases_queue_idx ON return_cases(stage, due_at, received_at);
  CREATE INDEX return_cases_assignee_idx ON return_cases(assignee_id, stage);

  CREATE TABLE return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES return_cases(id),
    model TEXT NOT NULL DEFAULT '',
    sku TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    frame TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '',
    manufacturer TEXT NOT NULL DEFAULT '',
    outcome TEXT NOT NULL CHECK (outcome IN ('pending','approved','refused','external_analysis','no_defect','resale','review')),
    reason TEXT NOT NULL DEFAULT '',
    test_notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (outcome IN ('pending','review') OR (length(trim(model)) > 0 AND length(trim(test_notes)) > 0)),
    CHECK (outcome NOT IN ('refused','no_defect','resale') OR length(trim(reason)) > 0),
    CHECK (outcome <> 'external_analysis' OR length(trim(manufacturer)) > 0)
  );
  CREATE INDEX return_items_case_idx ON return_items(case_id);

  CREATE TABLE return_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES return_cases(id),
    action TEXT NOT NULL,
    author_id UUID NOT NULL REFERENCES profiles(id),
    author_name TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX return_events_case_idx ON return_events(case_id, id DESC);

  CREATE TABLE return_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES return_cases(id),
    name TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png','application/pdf')),
    bytes BYTEA NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 5242880),
    author_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX return_attachments_case_idx ON return_attachments(case_id);

  INSERT INTO permissions (key, name, description) VALUES
    ('returns.view', 'Trocas: visualizar', 'Consultar recebimentos, protocolos e a fila da Isis.'),
    ('returns.manage', 'Trocas: operar', 'Registrar recebimento, atribuir e executar triagem.')
    ON CONFLICT (key) DO NOTHING;
  INSERT INTO role_permissions (role, permission_key)
    SELECT role, permission_key FROM (VALUES ('admin'),('operacional')) r(role)
      CROSS JOIN (VALUES ('returns.view'),('returns.manage')) p(permission_key)
    ON CONFLICT DO NOTHING;
`;
