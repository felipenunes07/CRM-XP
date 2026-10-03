import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AMBASSADOR_LABEL_NAME } from "@olist-crm/shared";
import type { CustomerLabel, CustomerListItem } from "@olist-crm/shared";
import { Check, Plus } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { useUiLanguage } from "../i18n";
import "./customerLabelCell.css";

function LabelTags({ labels }: { labels: CustomerLabel[] }) {
  return (
    <>
      {labels.map((label) => (
        <span
          key={label.id}
          className="tag"
          style={{ background: `${label.color}14`, color: label.color, borderColor: `${label.color}33` }}
        >
          {label.name}
        </span>
      ))}
    </>
  );
}

// Celula de rotulos da tabela de clientes: clicar abre um seletor para marcar
// rotulos existentes ou criar um novo sem sair da lista.
export function CustomerLabelCell({ customer }: { customer: CustomerListItem }) {
  const { tx } = useUiLanguage();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const labelsQuery = useQuery({
    queryKey: ["customer-labels"],
    queryFn: () => api.customerLabels(token!),
    enabled: Boolean(token && open),
  });

  const selectedNames = useMemo(() => customer.labels.map((label) => label.name), [customer.labels]);
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");

  const options = useMemo(
    () =>
      (labelsQuery.data ?? []).filter(
        (label) =>
          label.name !== AMBASSADOR_LABEL_NAME && label.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
      ),
    [labelsQuery.data, normalizedSearch],
  );

  const canCreate =
    normalizedSearch.length > 0 &&
    normalizedSearch !== AMBASSADOR_LABEL_NAME.toLocaleLowerCase("pt-BR") &&
    !(labelsQuery.data ?? []).some((label) => label.name.toLocaleLowerCase("pt-BR") === normalizedSearch);

  const saveMutation = useMutation({
    mutationFn: (labels: string[]) => api.updateCustomerLabels(token!, customer.id, { labels }),
    onSuccess: (updated) => {
      queryClient.setQueriesData<unknown>({ queryKey: ["customers"] }, (current: unknown) =>
        Array.isArray(current)
          ? current.map((item: CustomerListItem) => (item.id === updated.id ? { ...item, labels: updated.labels } : item))
          : current,
      );
      queryClient.setQueryData(["customer", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["customer-labels"] });
    },
  });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const width = 260;
    setPosition({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function close() {
      setOpen(false);
      setSearch("");
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      close();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }

    function handleScroll(event: Event) {
      if (popoverRef.current?.contains(event.target as Node)) {
        return;
      }
      close();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggleLabel(name: string) {
    const next = selectedNames.includes(name)
      ? selectedNames.filter((labelName) => labelName !== name)
      : [...selectedNames, name];
    saveMutation.mutate(next);
  }

  function createLabel() {
    if (!canCreate) {
      return;
    }
    saveMutation.mutate([...selectedNames, search.trim()]);
    setSearch("");
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`customer-label-cell ${open ? "is-open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        title={tx("Editar rotulos", "编辑标签")}
      >
        {customer.labels.length ? (
          <span className="tag-row compact">
            <LabelTags labels={customer.labels} />
          </span>
        ) : (
          <span className="customer-label-cell-empty">+ {tx("Rotulo", "标签")}</span>
        )}
      </button>

      {open && position
        ? createPortal(
            <div ref={popoverRef} className="customer-label-popover" style={{ top: position.top, left: position.left }}>
              <input
                autoFocus
                className="customer-label-popover-search"
                placeholder={tx("Buscar ou criar rotulo", "搜索或创建标签")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") {
                    return;
                  }
                  event.preventDefault();
                  if (canCreate) {
                    createLabel();
                  } else if (options.length === 1 && options[0]) {
                    toggleLabel(options[0].name);
                  }
                }}
              />

              <div className="customer-label-popover-list">
                {labelsQuery.isLoading ? (
                  <span className="customer-label-popover-hint">{tx("Carregando...", "加载中...")}</span>
                ) : null}
                {options.map((label) => {
                  const checked = selectedNames.includes(label.name);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      className={`customer-label-option ${checked ? "is-checked" : ""}`}
                      onClick={() => toggleLabel(label.name)}
                      disabled={saveMutation.isPending}
                    >
                      <span className="customer-label-option-dot" style={{ background: label.color }} />
                      <span className="customer-label-option-name">{label.name}</span>
                      {checked ? <Check size={14} /> : null}
                    </button>
                  );
                })}
                {!labelsQuery.isLoading && !options.length && !canCreate ? (
                  <span className="customer-label-popover-hint">{tx("Nenhum rotulo ainda.", "暂无标签。")}</span>
                ) : null}
              </div>

              {canCreate ? (
                <button
                  type="button"
                  className="customer-label-create"
                  onClick={createLabel}
                  disabled={saveMutation.isPending}
                >
                  <Plus size={14} />
                  {tx(`Criar "${search.trim()}"`, `创建 "${search.trim()}"`)}
                </button>
              ) : null}

              {saveMutation.isError ? (
                <span className="customer-label-popover-error">
                  {tx("Nao foi possivel salvar.", "保存失败。")}
                </span>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
