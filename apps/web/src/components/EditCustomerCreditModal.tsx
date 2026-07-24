import type { CustomerCreditRow } from "@olist-crm/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { customerCreditRiskLabel } from "../lib/customerCredit";
import "./customerCreditBank.css";

interface EditCustomerCreditModalProps {
  row: CustomerCreditRow | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditCustomerCreditModal({ row, isOpen, onClose }: EditCustomerCreditModalProps) {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [creditLimitInput, setCreditLimitInput] = useState("");
  const [paymentTermInput, setPaymentTermInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync inputs when modal opens for a new row
  const activeRowId = row?.id;
  const [prevRowId, setPrevRowId] = useState<string | undefined>(undefined);

  if (activeRowId !== prevRowId) {
    setPrevRowId(activeRowId);
    if (row) {
      setCreditLimitInput(String(row.creditLimit ?? 0));
      setPaymentTermInput(row.paymentTerm ? String(row.paymentTerm) : "");
      setErrorMsg(null);
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!row?.customerId || !token) {
        throw new Error("Cliente sem vínculo de cadastro para salvar ajustes.");
      }

      const limitNum = parseFloat(creditLimitInput.replace(/[^\d.,]/g, "").replace(",", "."));
      const termNum = parseInt(paymentTermInput.replace(/\D/g, ""), 10);

      const updateData: { creditLimit?: number; paymentTerm?: number } = {};
      if (!isNaN(limitNum)) updateData.creditLimit = limitNum;
      if (!isNaN(termNum)) updateData.paymentTerm = termNum;

      return api.updateCustomerCreditSettings(token, row.customerId, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-credit-overview"] });
      queryClient.invalidateQueries({ queryKey: ["customer-credit-detail"] });
      queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      onClose();
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || "Não foi possível salvar as alterações.");
    },
  });

  if (!isOpen || !row) return null;

  return (
    <div className="bankfin bankfin-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="bankfin-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Ajustar limite e prazo"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="bankfin-modal-head">
          <div>
            <h3>Limite e prazo</h3>
            <p>
              {row.customerDisplayName} · {row.customerCode || "Sem código"}
            </p>
          </div>
          <button type="button" className="bankfin-btn-icon" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="bankfin-modal-body">
            {errorMsg ? <div className="bankfin-modal-error">{errorMsg}</div> : null}

            <div className="bankfin-modal-summary">
              <span>
                Saldo devedor <strong>{formatCurrency(row.debtAmount)}</strong>
              </span>
              <span>
                Risco <strong>{customerCreditRiskLabel(row.riskLevel)}</strong>
              </span>
            </div>

            <div className="bankfin-field">
              <label htmlFor="bankfin-limit-input">Novo limite de crédito</label>
              <div className="bankfin-input-wrap">
                <span className="bankfin-input-prefix">R$</span>
                <input
                  id="bankfin-limit-input"
                  className="has-prefix"
                  type="text"
                  inputMode="decimal"
                  value={creditLimitInput}
                  onChange={(event) => setCreditLimitInput(event.target.value)}
                  placeholder="0,00"
                />
              </div>
              <small>Limite atual: {formatCurrency(row.creditLimit)}</small>
            </div>

            <div className="bankfin-field">
              <label htmlFor="bankfin-term-input">Novo prazo de pagamento (dias)</label>
              <input
                id="bankfin-term-input"
                type="number"
                min="0"
                max="365"
                value={paymentTermInput}
                onChange={(event) => setPaymentTermInput(event.target.value)}
                placeholder="Ex: 30, 45, 60"
              />
              <small>Prazo atual: {row.paymentTerm ? `${row.paymentTerm} dias` : "Sem prazo"}</small>
            </div>
          </div>

          <footer className="bankfin-modal-foot">
            <button type="button" className="bankfin-btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="bankfin-btn-primary" disabled={mutation.isPending}>
              <ShieldCheck size={15} />
              {mutation.isPending ? "Salvando..." : "Salvar alteração"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
