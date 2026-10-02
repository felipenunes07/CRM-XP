import type { CustomerCreditRow } from "@olist-crm/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { customerCreditRiskLabel } from "../lib/customerCredit";
import "./customerCreditBank.css";

/**
 * Le valor digitado do jeito brasileiro: "300.000", "300000", "1.500,50",
 * "R$ 50.000,00". Ponto seguido de 3 digitos e separador de milhar.
 * Vazio = null (remove o ajuste: sem credito). undefined = invalido.
 */
export function parseBrazilianAmount(input: string): number | null | undefined {
  const cleaned = input.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

interface EditCustomerCreditModalProps {
  row: CustomerCreditRow | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditCustomerCreditModal({ row, isOpen, onClose }: EditCustomerCreditModalProps) {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [creditLimitInput, setCreditLimitInput] = useState("");
  const [internalCreditInput, setInternalCreditInput] = useState("");
  const [paymentTermInput, setPaymentTermInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync inputs when modal opens for a new row
  const activeRowId = row?.id;
  const [prevRowId, setPrevRowId] = useState<string | undefined>(undefined);

  if (activeRowId !== prevRowId) {
    setPrevRowId(activeRowId);
    if (row) {
      setCreditLimitInput(row.creditLimit ? String(row.creditLimit) : "");
      setInternalCreditInput(row.internalCreditLimit ? String(row.internalCreditLimit) : "");
      setPaymentTermInput(row.paymentTerm ? String(row.paymentTerm) : "");
      setErrorMsg(null);
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!row?.customerId || !token) {
        throw new Error("Cliente sem vínculo de cadastro para salvar ajustes.");
      }

      const limitNum = parseBrazilianAmount(creditLimitInput);
      const internalNum = parseBrazilianAmount(internalCreditInput);
      const termNum = parseInt(paymentTermInput.replace(/\D/g, ""), 10);
      if (limitNum === undefined || internalNum === undefined) {
        throw new Error("Valor de crédito inválido. Use, por exemplo, 300.000 ou 300000.");
      }

      const updateData: { creditLimit?: number | null; internalCreditLimit?: number | null; paymentTerm?: number } = {
        creditLimit: limitNum,
        internalCreditLimit: internalNum,
      };
      if (!isNaN(termNum)) updateData.paymentTerm = termNum;

      return api.updateCustomerCreditSettings(token, row.customerId, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-credit-overview"] });
      queryClient.invalidateQueries({ queryKey: ["customer-credit-detail"] });
      queryClient.invalidateQueries({ queryKey: ["customers-list"] });
      queryClient.invalidateQueries({ queryKey: ["customer-billing-alerts"] });
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
            <h3>Crédito e prazo</h3>
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
              <small>Atual: {row.creditLimit ? formatCurrency(row.creditLimit) : "sem crédito"}. Vazio = sem crédito.</small>
            </div>

            <div className="bankfin-field">
              <label htmlFor="bankfin-internal-input">Crédito interno (teto tolerado)</label>
              <div className="bankfin-input-wrap">
                <span className="bankfin-input-prefix">R$</span>
                <input
                  id="bankfin-internal-input"
                  className="has-prefix"
                  type="text"
                  inputMode="decimal"
                  value={internalCreditInput}
                  onChange={(event) => setInternalCreditInput(event.target.value)}
                  placeholder="Vazio = sem crédito interno"
                />
              </div>
              <small>
                Atual: {row.internalCreditLimit ? formatCurrency(row.internalCreditLimit) : "sem crédito interno"}
              </small>
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
            <p className="bankfin-modal-note">Ao salvar, o grupo do financeiro recebe o aviso da alteração.</p>
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
