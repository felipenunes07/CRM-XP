// Keep snapshot/customer columns visible to the planner so their filters use the base indexes.
export const returnFinanceProjectionMigration=`
 DO $projection$
 DECLARE columns_sql TEXT;
 BEGIN
  SELECT string_agg(CASE WHEN expression IS NULL THEN format('r.%I',attname)
    ELSE format('(%s)::%s AS %I',expression,format_type(atttypid,atttypmod),attname) END,',' ORDER BY attnum)
  INTO columns_sql FROM (
   SELECT a.*,CASE attname
    WHEN 'balance_amount' THEN 'CASE WHEN x.apply THEN x.balance ELSE r.balance_amount END'
    WHEN 'has_over_credit' THEN 'CASE WHEN x.apply THEN r.credit_limit>0 AND -x.balance>r.credit_limit ELSE r.has_over_credit END'
    WHEN 'has_debt_without_credit' THEN 'CASE WHEN x.apply THEN x.balance<0 AND r.credit_limit<=0 ELSE r.has_debt_without_credit END'
    WHEN 'has_overdue_payment' THEN 'CASE WHEN x.apply THEN x.balance<0 AND r.has_overdue_payment ELSE r.has_overdue_payment END'
    WHEN 'has_severely_overdue_payment' THEN 'CASE WHEN x.apply THEN x.balance<0 AND r.has_severely_overdue_payment ELSE r.has_severely_overdue_payment END'
    WHEN 'risk_level' THEN 'CASE WHEN x.apply AND x.balance>=0 THEN ''OK'' ELSE r.risk_level END'
    WHEN 'operational_state' THEN 'CASE WHEN NOT x.apply THEN r.operational_state WHEN x.balance>0 THEN ''HAS_CREDIT_BALANCE'' WHEN x.balance<0 AND r.credit_limit>0 AND -x.balance>r.credit_limit THEN ''OVER_CREDIT'' WHEN x.balance<0 THEN ''OWES'' WHEN r.credit_limit>0 THEN ''UNUSED_CREDIT'' ELSE ''SETTLED'' END'
   END AS expression FROM pg_attribute a WHERE attrelid='customer_credit_snapshot_rows'::regclass AND attnum>0 AND NOT attisdropped
  ) fields;
  EXECUTE 'CREATE OR REPLACE VIEW customer_credit_effective_rows WITH (security_invoker=true) AS SELECT '||columns_sql||',
   r.balance_amount AS imported_balance_amount,
   CASE WHEN s.is_active THEN COALESCE(t.adjustment_cents,0) ELSE 0 END AS return_adjustment_cents,
   CASE WHEN s.is_active THEN COALESCE(t.available_cents,0) ELSE 0 END AS return_available_cents,
   CASE WHEN s.is_active THEN COALESCE(t.held_cents,0) ELSE 0 END AS return_held_cents,
   CASE WHEN s.is_active THEN COALESCE(t.applied_cents,0) ELSE 0 END AS return_applied_cents,
   COALESCE(s.is_active AND t.reconciliation_required,FALSE) AS return_reconciliation_required,
   CASE WHEN s.is_active THEN COALESCE(t.issues,''[]''::jsonb) ELSE ''[]''::jsonb END AS return_issues
   FROM customer_credit_snapshot_rows r JOIN customer_credit_snapshots s ON s.id=r.snapshot_id
   LEFT JOIN return_customer_financial_totals t ON t.customer_id=r.customer_id
   CROSS JOIN LATERAL(SELECT s.is_active AND COALESCE(t.adjustment_cents,0)<>0 AND NOT COALESCE(t.reconciliation_required,FALSE) AS apply,
    r.balance_amount+CASE WHEN s.is_active AND NOT COALESCE(t.reconciliation_required,FALSE) THEN COALESCE(t.adjustment_cents,0)/100 ELSE 0 END AS balance) x';
 END $projection$;
 ANALYZE customer_credit_snapshot_rows;
 ANALYZE customer_credit_payment_entries;
 ANALYZE return_wallet_entries;
 ANALYZE return_credit_reconciliations;
 ANALYZE return_legacy_links;
`;
