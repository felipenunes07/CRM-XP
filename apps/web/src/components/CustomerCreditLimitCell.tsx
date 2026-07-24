import type { CustomerCreditRow } from "@olist-crm/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";

/**
 * Limite de credito editavel direto na linha da tabela: clique no lapis,
 * digite o novo valor e confirme com Enter. Salva na hora.
 */
export function CustomerCreditLimitCell({ row }: { row: CustomerCreditRow }) {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = Boolean(row.customerId) && (user?.role === "ADMIN" || user?.role === "MANAGER");

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(String(row.creditLimit || ""));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const mutation = useMutation({
    mutationFn: (creditLimit: number) =>
      api.updateCustomerCreditSettings(token!, row.customerId!, { creditLimit }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customer-credit-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-credit-detail"] });
      setIsEditing(false);
    },
  });

  const usage = row.creditLimit > 0 ? (row.debtAmount / row.creditLimit) * 100 : null;

  function commit() {
    const parsed = Number(draft.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setIsEditing(false);
      return;
    }
    if (parsed === row.creditLimit) {
      setIsEditing(false);
      return;
    }
    mutation.mutate(parsed);
  }

  if (isEditing) {
    return (
      <div className="bankfin-inline-edit" onClick={(event) => event.stopPropagation()}>
        <span>R$</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          disabled={mutation.isPending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              setDraft(String(row.creditLimit || ""));
              setIsEditing(false);
            }
          }}
        />
        <button type="button" aria-label="Salvar limite" onClick={commit} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
        </button>
        <button
          type="button"
          aria-label="Cancelar"
          onClick={() => {
            setDraft(String(row.creditLimit || ""));
            setIsEditing(false);
          }}
          disabled={mutation.isPending}
        >
          <X size={14} />
        </button>
        {mutation.isError ? <em>Falhou</em> : null}
      </div>
    );
  }

  return (
    <div
      className={`bankfin-limit ${canEdit ? "is-editable" : ""}`}
      onClick={(event) => {
        if (!canEdit) return;
        event.stopPropagation();
        setDraft(String(row.creditLimit || ""));
        setIsEditing(true);
      }}
      title={canEdit ? "Clique para editar o limite" : undefined}
    >
      <span>
        {row.creditLimit > 0 ? formatCurrency(row.creditLimit) : "Sem limite"}
        {usage !== null ? <em>{usage.toFixed(0)}%</em> : null}
        {canEdit ? <Pencil size={11} className="bankfin-limit-pencil" /> : null}
      </span>
      {row.creditLimit > 0 ? (
        <span className="bankfin-limit-track">
          <i
            className={row.hasOverCredit ? "danger" : (usage ?? 0) >= 80 ? "warning" : ""}
            style={{ width: `${Math.min(usage ?? 0, 100)}%` }}
          />
        </span>
      ) : null}
    </div>
  );
}
