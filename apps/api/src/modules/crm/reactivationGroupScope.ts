// A confirmacao manual escolhe o grupo comercial sem desvincular grupos de pagamento ou historicos.
export function buildReactivationGroupScopeSql(alias: string) {
  const eligible = (name: string) => `${name}.mapping_status IN ('AUTO_MAPPED','MANUAL_MAPPED')
    AND ${name}.jid ~ '^[0-9]+(-[0-9]+)?@g[.]us$'
    AND COALESCE(${name}.source_name, '') !~* '(^|[^[:alnum:]])(pagamentos?|desativad[oa]s?|defeitos?|garantias?|cobran[cç]as?)([^[:alnum:]]|$)'`;
  return `(${eligible(alias)} AND (${alias}.mapping_status = 'MANUAL_MAPPED' OR NOT EXISTS (
    SELECT 1 FROM whatsapp_groups preferred
    WHERE preferred.customer_id = ${alias}.customer_id AND preferred.mapping_status = 'MANUAL_MAPPED'
      AND ${eligible('preferred')}
  )))`;
}
