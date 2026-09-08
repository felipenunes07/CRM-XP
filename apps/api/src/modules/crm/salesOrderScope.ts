/**
 * Olist orders only become sales after they are shipped. Other sources contain
 * finalized historical/imported sales and use statuses such as `VALID`.
 */
export function buildShippedSalesOnlySql(tableAlias?: string) {
  const prefix = tableAlias ? `${tableAlias}.` : "";

  return `AND (${prefix}source_system <> 'olist_v2' OR LOWER(COALESCE(${prefix}status, '')) = 'enviado')`;
}
