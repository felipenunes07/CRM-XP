import type { InventoryReplenishment } from "@olist-crm/shared";
import { formatDate, formatNumber } from "../lib/format";

export function PacklistIncomingCell({ value }: { value: InventoryReplenishment | null | undefined }) {
  if (!value) return <span>Sem leitura</span>;
  return <div className="inventory-stale-value-cell packlist-supply-cell">
    <strong>{formatNumber(value.scheduledUnits)} un. previstas em 60 dias</strong>
    <span className="inventory-table-secondary-text">Próxima: {value.nextArrivalAt ? formatDate(value.nextArrivalAt) : "sem previsão confirmada"}</span>
    {value.overdueUnits > 0 ? <span className="inventory-note-pill tone-danger">{formatNumber(value.overdueUnits)} un. atrasadas</span> : null}
    {value.incompleteUnits > 0 ? <span className="inventory-note-pill tone-warning">{formatNumber(value.incompleteUnits)} un. em cadastro incompleto</span> : null}
    {value.undatedUnits > 0 ? <span className="inventory-note-pill tone-warning">{formatNumber(value.undatedUnits)} un. sem data</span> : null}
    {value.arrivals.length ? <details>
      <summary>Ver lotes ({value.arrivals.length})</summary>
      {value.arrivals.map((lot) => <div key={lot.lotId} className="inventory-table-secondary-text">
        {lot.lotId}: {formatNumber(lot.quantity)} un. · {lot.arrivalDate ? formatDate(lot.arrivalDate) : "sem data"}
        {lot.incomplete ? " · cadastro incompleto" : lot.overdue ? " · atrasado" : ""}
        {lot.inferredYear ? " · ano inferido pela data do arquivo" : ""}
      </div>)}
    </details> : null}
  </div>;
}

export function PacklistPurchaseCell({ value }: { value: InventoryReplenishment | null | undefined }) {
  if (!value) return <span>Sem projeção</span>;
  return <div className="inventory-stale-value-cell packlist-supply-cell">
    <strong>{formatNumber(value.suggestedBuyUnits)} un.</strong>
    {value.urgentAir ? <span className="inventory-note-pill tone-danger">Avaliar envio aéreo</span> : null}
    <span className="inventory-table-secondary-text">
      {value.stockoutAt ? `Falta prevista: ${formatDate(value.stockoutAt)}` : "Cobertura suficiente por 60 dias"}
    </span>
  </div>;
}
