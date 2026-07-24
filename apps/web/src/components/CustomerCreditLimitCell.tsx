import type { CustomerCreditRow } from "@olist-crm/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/format";

type Field = "creditLimit" | "paymentTerm";

function useInlineCreditEdit(row: CustomerCreditRow, field: Field) {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = Boolean(row.customerId) && (user?.role === "ADMIN" || user?.role === "MANAGER");

  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const mutation = useMutation({
    mutationFn: (value: number) =>
      api.updateCustomerCreditSettings(token!, row.customerId!, { [field]: value }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customer-credit-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-credit-detail"] });
      setIsEditing(false);
    },
  });

  return { canEdit, isEditing, setIsEditing, inputRef, mutation };
}

/** Campo editável na linha: clique, digite, Enter salva. Esc cancela. */
function InlineEditor({
  prefix,
  suffix,
  width,
  value,
  onChange,
  onCommit,
  onCancel,
  isPending,
  hasError,
  inputRef,
}: {
  prefix?: string;
  suffix?: string;
  width: number;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  isPending: boolean;
  hasError: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="bankfin-inline-edit" onClick={(event) => event.stopPropagation()}>
      {prefix ? <span>{prefix}</span> : null}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        style={{ width }}
        value={value}
        disabled={isPending}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onCommit();
          if (event.key === "Escape") onCancel();
        }}
      />
      {suffix ? <span>{suffix}</span> : null}
      <button type="button" aria-label="Salvar" onClick={onCommit} disabled={isPending}>
        {isPending ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
      </button>
      <button type="button" aria-label="Cancelar" onClick={onCancel} disabled={isPending}>
        <X size={14} />
      </button>
      {hasError ? <em>Falhou</em> : null}
    </div>
  );
}

export function CustomerCreditLimitCell({ row }: { row: CustomerCreditRow }) {
  const { canEdit, isEditing, setIsEditing, inputRef, mutation } = useInlineCreditEdit(row, "creditLimit");
  const [draft, setDraft] = useState(String(row.creditLimit || ""));

  const usage = row.creditLimit > 0 ? (row.debtAmount / row.creditLimit) * 100 : null;
  const tone = usage === null ? "muted" : usage > 100 ? "danger" : usage >= 80 ? "warning" : "success";
  const excess = row.creditLimit > 0 ? row.debtAmount - row.creditLimit : 0;

  // A barra vai de 0 até o maior entre o uso e o limite, com um marcador no limite:
  // assim dá para ver o tamanho do estouro, não só que estourou.
  const scale = Math.max(usage ?? 0, 100);
  const fillPercent = usage === null ? 0 : (usage / scale) * 100;
  const markerPercent = (100 / scale) * 100;

  function commit() {
    const parsed = Number(draft.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed === row.creditLimit) {
      setIsEditing(false);
      return;
    }
    mutation.mutate(parsed);
  }

  if (isEditing) {
    return (
      <InlineEditor
        prefix="R$"
        width={104}
        value={draft}
        onChange={setDraft}
        onCommit={commit}
        onCancel={() => {
          setDraft(String(row.creditLimit || ""));
          setIsEditing(false);
        }}
        isPending={mutation.isPending}
        hasError={mutation.isError}
        inputRef={inputRef}
      />
    );
  }

  return (
    <div
      className={`bankfin-cell-edit ${canEdit ? "is-editable" : ""}`}
      onClick={(event) => {
        if (!canEdit) return;
        event.stopPropagation();
        setDraft(String(row.creditLimit || ""));
        setIsEditing(true);
      }}
      title={canEdit ? "Clique para editar o limite" : undefined}
    >
      <div className="bankfin-cell-line">
        <strong className="bankfin-cell-main">
          {row.creditLimit > 0 ? formatCurrency(row.creditLimit) : "Sem limite"}
        </strong>
        {canEdit ? <Pencil size={12} className="bankfin-cell-pencil" /> : null}
        {usage !== null ? <b className={`bankfin-usage tone-${tone}`}>{usage.toFixed(0)}%</b> : null}
      </div>

      {row.creditLimit > 0 ? (
        <>
          <span className={`bankfin-meter tone-${tone}`}>
            <i style={{ width: `${fillPercent}%` }} />
            {usage !== null && usage > 100 ? <u style={{ left: `${markerPercent}%` }} /> : null}
          </span>
          <small className={`bankfin-cell-foot tone-${tone}`}>
            {excess > 0
              ? `${formatCurrency(excess)} acima do limite`
              : `${formatCurrency(Math.max(row.creditLimit - row.debtAmount, 0))} disponível`}
          </small>
        </>
      ) : null}
    </div>
  );
}

export function CustomerCreditTermCell({
  row,
  status,
}: {
  row: CustomerCreditRow;
  status: { label: string; helper: string; tone: string; progress: number | null };
}) {
  const { canEdit, isEditing, setIsEditing, inputRef, mutation } = useInlineCreditEdit(row, "paymentTerm");
  const [draft, setDraft] = useState(row.paymentTerm ? String(row.paymentTerm) : "");

  function commit() {
    const parsed = Number(draft.replace(/\D/g, ""));
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365 || parsed === row.paymentTerm) {
      setIsEditing(false);
      return;
    }
    mutation.mutate(parsed);
  }

  if (isEditing) {
    return (
      <InlineEditor
        suffix="dias"
        width={54}
        value={draft}
        onChange={setDraft}
        onCommit={commit}
        onCancel={() => {
          setDraft(row.paymentTerm ? String(row.paymentTerm) : "");
          setIsEditing(false);
        }}
        isPending={mutation.isPending}
        hasError={mutation.isError}
        inputRef={inputRef}
      />
    );
  }

  return (
    <div
      className={`bankfin-cell-edit is-left ${canEdit ? "is-editable" : ""}`}
      onClick={(event) => {
        if (!canEdit) return;
        event.stopPropagation();
        setDraft(row.paymentTerm ? String(row.paymentTerm) : "");
        setIsEditing(true);
      }}
      title={canEdit ? "Clique para editar o prazo" : undefined}
    >
      <div className="bankfin-cell-line">
        <strong className="bankfin-cell-main">
          {row.paymentTerm ? `${row.paymentTerm} dias` : "Sem prazo"}
        </strong>
        {canEdit ? <Pencil size={12} className="bankfin-cell-pencil" /> : null}
        <span className={`bankfin-cell-tag tone-${status.tone}`}>{status.label}</span>
      </div>

      {status.progress !== null ? (
        <span className={`bankfin-meter tone-${status.tone}`}>
          <i style={{ width: `${status.progress}%` }} />
        </span>
      ) : null}

      <small className="bankfin-cell-foot tone-muted">{status.helper || " "}</small>
    </div>
  );
}
