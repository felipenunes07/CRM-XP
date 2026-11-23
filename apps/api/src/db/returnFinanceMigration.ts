export const returnFinanceMigration=`
 CREATE VIEW return_customer_financial_totals WITH (security_invoker=true) AS
 WITH grants AS (
  SELECT g.id,g.credit_id,g.customer_id,g.case_id,g.reference,g.amount_cents,
   sum(e.amount_cents) AS balance,
   COALESCE(sum(e.amount_cents) FILTER(WHERE e.kind IN ('grant','credit_reversal','legacy_transfer')),0) AS recognized,
   -COALESCE(sum(e.amount_cents) FILTER(WHERE e.kind IN ('application','application_reversal')),0) AS applied,
   count(*) FILTER(WHERE e.kind='legacy_transfer') AS transfers
  FROM return_wallet_entries g JOIN return_wallet_entries e ON e.credit_id=g.credit_id
  WHERE g.kind='grant' AND g.party='customer' AND g.currency='BRL' GROUP BY g.id
 ), mirrors AS (
  SELECT g.id,count(p.payment_key) AS n,max(p.amount)*100 AS amount,
   bool_and(regexp_replace(upper(translate(COALESCE(p.payment_type,''),'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ','aaaaeeiooouucAAAAEEIOOOUUC')),'[^A-Z]','','g') IN ('TROCA','TROCAS','DEFEITO','DEFEITOS','DEF','CANCELAMENTO','CREDITODETROCA','CREDITOPORDEFEITO')) AS valid_type
  FROM grants g LEFT JOIN (customer_credit_payment_entries p JOIN customer_credit_snapshots s ON s.id=p.snapshot_id AND s.is_active) ON p.customer_id=g.customer_id AND lower(trim(p.payment_number))=lower(trim(g.reference)) GROUP BY g.id
 ), reconciled AS (
 SELECT r.credit_id,r.coverage_cents,EXISTS(SELECT 1 FROM customer_credit_payment_entries p JOIN customer_credit_snapshots s ON s.id=p.snapshot_id AND s.is_active WHERE p.customer_id=r.customer_id AND p.payment_key=r.payment_key AND lower(trim(p.payment_number))=lower(trim(r.payment_number)) AND p.amount=r.payment_amount AND p.payment_type=r.payment_type) AS valid FROM return_credit_reconciliations r WHERE r.active
 ), linked_mirrors AS (
 SELECT g.id,count(*) AS n FROM grants g JOIN return_legacy_links l ON l.case_id=g.case_id AND l.active JOIN return_legacy_rows r ON r.id=l.source_row_id JOIN customer_credit_payment_entries p ON p.customer_id=g.customer_id AND trim(r.document)<>'' AND lower(trim(r.document))=lower(trim(p.payment_number)) JOIN customer_credit_snapshots s ON s.id=p.snapshot_id AND s.is_active GROUP BY g.id
 ), checked AS (
  SELECT g.*,m.n,m.amount,r.coverage_cents,COALESCE(l.n,0) AS linked_count,
   CASE WHEN r.credit_id IS NOT NULL AND (NOT r.valid OR r.coverage_cents>g.recognized) THEN 'Crédito conciliado mudou ou desapareceu na origem: '||g.reference
    WHEN r.credit_id IS NULL AND COALESCE(l.n,0)>0 THEN 'Documento vinculado também consta no financeiro; concilie os créditos por peça: '||g.reference
    WHEN g.balance<0 OR g.recognized<0 THEN 'Saldo nativo inconsistente: '||g.reference
    WHEN g.transfers>0 AND (m.n<>1 OR EXISTS(SELECT 1 FROM return_wallet_entries t WHERE t.credit_id=g.credit_id AND t.kind='legacy_transfer' AND NOT EXISTS(SELECT 1 FROM customer_credit_payment_entries p JOIN customer_credit_snapshots s ON s.id=p.snapshot_id AND s.is_active WHERE p.customer_id=g.customer_id AND lower(trim(p.payment_number))=lower(trim(g.reference)) AND p.payment_key=t.legacy_evidence->>'payment_key' AND p.amount=(t.legacy_evidence->>'amount')::numeric AND p.payment_type=t.legacy_evidence->>'payment_type'))) THEN 'Crédito transferido ao legado mudou ou desapareceu: '||g.reference
    WHEN g.transfers=0 AND m.n>0 AND (m.n<>1 OR NOT COALESCE(m.valid_type,FALSE) OR m.amount<=0 OR m.amount>g.recognized OR m.amount NOT IN(g.amount_cents,g.balance)) THEN 'Crédito também encontrado no legado com dados divergentes: '||g.reference
    ELSE '' END AS issue
  FROM grants g JOIN mirrors m ON m.id=g.id LEFT JOIN reconciled r ON r.credit_id=g.credit_id LEFT JOIN linked_mirrors l ON l.id=g.id
 )
 SELECT customer_id,
  sum(CASE WHEN issue<>'' THEN 0 ELSE recognized-COALESCE(coverage_cents,CASE WHEN transfers=0 AND n>0 THEN amount ELSE 0 END) END) AS adjustment_cents,
  sum(CASE WHEN issue='' AND n=0 AND linked_count=0 AND coverage_cents IS NULL THEN GREATEST(balance,0) ELSE 0 END) AS available_cents,
  sum(CASE WHEN issue<>'' OR n>0 OR linked_count>0 OR coverage_cents IS NOT NULL THEN GREATEST(balance,0) ELSE 0 END) AS held_cents,
  sum(applied) AS applied_cents,bool_or(issue<>'') AS reconciliation_required,
  COALESCE(jsonb_agg(issue) FILTER(WHERE issue<>''),'[]'::jsonb) AS issues
 FROM checked GROUP BY customer_id;

 CREATE VIEW customer_credit_effective_rows WITH (security_invoker=true) AS
 SELECT effective.*,r.balance_amount AS imported_balance_amount,
  CASE WHEN s.is_active THEN COALESCE(t.adjustment_cents,0) ELSE 0 END AS return_adjustment_cents,
  CASE WHEN s.is_active THEN COALESCE(t.available_cents,0) ELSE 0 END AS return_available_cents,
  CASE WHEN s.is_active THEN COALESCE(t.held_cents,0) ELSE 0 END AS return_held_cents,
  CASE WHEN s.is_active THEN COALESCE(t.applied_cents,0) ELSE 0 END AS return_applied_cents,
  COALESCE(s.is_active AND t.reconciliation_required,FALSE) AS return_reconciliation_required,
  CASE WHEN s.is_active THEN COALESCE(t.issues,'[]'::jsonb) ELSE '[]'::jsonb END AS return_issues
 FROM customer_credit_snapshot_rows r JOIN customer_credit_snapshots s ON s.id=r.snapshot_id
 LEFT JOIN return_customer_financial_totals t ON t.customer_id=r.customer_id
 CROSS JOIN LATERAL(SELECT r.balance_amount+CASE WHEN s.is_active AND NOT COALESCE(t.reconciliation_required,FALSE) THEN COALESCE(t.adjustment_cents,0)/100 ELSE 0 END AS balance) projected
 CROSS JOIN LATERAL jsonb_populate_record(NULL::customer_credit_snapshot_rows,to_jsonb(r)||
  CASE WHEN NOT s.is_active OR COALESCE(t.adjustment_cents,0)=0 OR COALESCE(t.reconciliation_required,FALSE) THEN '{}'::jsonb ELSE jsonb_build_object(
   'balance_amount',projected.balance,
   'has_over_credit',r.credit_limit>0 AND -projected.balance>r.credit_limit,
   'has_debt_without_credit',projected.balance<0 AND r.credit_limit<=0,
   'has_overdue_payment',projected.balance<0 AND r.has_overdue_payment,
   'has_severely_overdue_payment',projected.balance<0 AND r.has_severely_overdue_payment,
   'risk_level',CASE WHEN projected.balance>=0 THEN 'OK' ELSE r.risk_level END,
   'operational_state',CASE WHEN projected.balance>0 THEN 'HAS_CREDIT_BALANCE' WHEN projected.balance<0 AND r.credit_limit>0 AND -projected.balance>r.credit_limit THEN 'OVER_CREDIT' WHEN projected.balance<0 THEN 'OWES' WHEN r.credit_limit>0 THEN 'UNUSED_CREDIT' ELSE 'SETTLED' END
  ) END) effective;
`;
