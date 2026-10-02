import { X } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CustomerNotesPanel } from "./CustomerNotesPanel";

interface CustomerNotesDrawerProps {
  customer: { id: string; displayName: string; customerCode: string } | null;
  onClose: () => void;
}

// Abre o histórico de observações sem sair da lista, para a atendente
// registrar o retorno e já seguir para o próximo cliente.
export function CustomerNotesDrawer({ customer, onClose }: CustomerNotesDrawerProps) {
  useEffect(() => {
    if (!customer) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [customer, onClose]);

  if (!customer) return null;

  return (
    <div className="customer-notes-drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="customer-notes-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Observações de ${customer.displayName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="customer-notes-drawer-head">
          <div>
            <h3>{customer.displayName}</h3>
            <p>
              {customer.customerCode || "Sem código"} · <Link to={`/clientes/${customer.id}`}>Abrir ficha completa</Link>
            </p>
          </div>
          <button type="button" className="customer-notes-drawer-close" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <CustomerNotesPanel key={customer.id} customerId={customer.id} />
      </aside>
    </div>
  );
}
