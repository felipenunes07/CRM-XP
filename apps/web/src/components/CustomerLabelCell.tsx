import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AMBASSADOR_LABEL_NAME } from "@olist-crm/shared";
import type { CustomerLabel, CustomerListItem } from "@olist-crm/shared";
import { Link } from "react-router-dom";
import { Check, Plus, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
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

const LABEL_COLORS = ["#2956d7", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#334155"];

function NewLabelModal({
  initialName,
  existingNames,
  isSaving,
  error,
  onCancel,
  onCreate,
}: {
  initialName: string;
  existingNames: string[];
  isSaving: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (name: string, color: string) => void;
}) {
  const { tx } = useUiLanguage();
  const { canAccess } = usePermissions();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(LABEL_COLORS[0]!);
  const trimmed = name.trim();
  const normalized = trimmed.toLocaleLowerCase("pt-BR");
  const isDuplicate = existingNames.some((existing) => existing.toLocaleLowerCase("pt-BR") === normalized);
  const isReserved = normalized === AMBASSADOR_LABEL_NAME.toLocaleLowerCase("pt-BR");
  const canSubmit = trimmed.length > 0 && !isDuplicate && !isReserved && !isSaving;

  function submit() {
    if (canSubmit) {
      onCreate(trimmed, color);
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal-container customer-label-modal"
        role="dialog"
        aria-modal="true"
        aria-label={tx("Novo rotulo", "新标签")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{tx("Novo rotulo", "新标签")}</h3>
          <button type="button" className="modal-close" onClick={onCancel} aria-label={tx("Fechar", "关闭")}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <label>
            {tx("Nome", "名称")}
            <input
              autoFocus
              value={name}
              maxLength={40}
              placeholder={tx("Ex.: Cliente VIP", "例如：VIP 客户")}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
                if (event.key === "Escape") {
                  onCancel();
                }
              }}
            />
          </label>
          {isDuplicate ? (
            <span className="customer-label-modal-warning">{tx("Ja existe um rotulo com esse nome.", "已存在同名标签。")}</span>
          ) : null}
          {isReserved ? (
            <span className="customer-label-modal-warning">{tx("Esse nome e reservado.", "该名称已保留。")}</span>
          ) : null}

          <div className="customer-label-modal-field">
            <span>{tx("Cor", "颜色")}</span>
            <div className="customer-label-modal-colors" role="radiogroup" aria-label={tx("Cor", "颜色")}>
              {LABEL_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={color === option}
                  className={`customer-label-modal-swatch ${color === option ? "is-selected" : ""}`}
                  style={{ background: option }}
                  onClick={() => setColor(option)}
                >
                  {color === option ? <Check size={14} /> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="customer-label-modal-field">
            <span>{tx("Previa", "预览")}</span>
            <span
              className="tag customer-label-modal-preview"
              style={{ background: `${color}14`, color, borderColor: `${color}33` }}
            >
              {trimmed || tx("Nome do rotulo", "标签名称")}
            </span>
          </div>

          {error ? <span className="customer-label-popover-error">{error}</span> : null}
        </div>

        <div className="modal-footer">
          {canAccess("commercial.labels.view") ? (
            <Link className="customer-label-modal-manage" to="/rotulos">
              {tx("Gerenciar rotulos", "管理标签")}
            </Link>
          ) : null}
          <button type="button" className="ghost-button small" onClick={onCancel}>
            {tx("Cancelar", "取消")}
          </button>
          <button type="button" className="primary-button small" onClick={submit} disabled={!canSubmit}>
            {isSaving ? tx("Criando...", "创建中...") : tx("Criar e aplicar", "创建并应用")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
  const [newLabelName, setNewLabelName] = useState<string | null>(null);
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

  const existingNames = useMemo(() => (labelsQuery.data ?? []).map((label) => label.name), [labelsQuery.data]);

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

  // Cria o rotulo com a cor escolhida e ja aplica no cliente.
  const createMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const created = await api.createCustomerLabel(token!, name);
      if (created.color !== color) {
        await api.updateCustomerLabel(token!, created.id, color);
      }
      return name;
    },
    onSuccess: (name) => {
      saveMutation.mutate([...selectedNames, name]);
      setNewLabelName(null);
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

  function openNewLabel() {
    createMutation.reset();
    setNewLabelName(canCreate ? search.trim() : "");
    setOpen(false);
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
                    openNewLabel();
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

              <button type="button" className="customer-label-create" onClick={openNewLabel}>
                <Plus size={14} />
                {canCreate ? tx(`Criar "${search.trim()}"`, `创建 "${search.trim()}"`) : tx("Novo rotulo", "新标签")}
              </button>

              {saveMutation.isError ? (
                <span className="customer-label-popover-error">
                  {tx("Nao foi possivel salvar.", "保存失败。")}
                </span>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {newLabelName !== null ? (
        <NewLabelModal
          initialName={newLabelName}
          existingNames={existingNames}
          isSaving={createMutation.isPending || saveMutation.isPending}
          error={createMutation.isError ? tx("Nao foi possivel criar o rotulo.", "无法创建标签。") : null}
          onCancel={() => setNewLabelName(null)}
          onCreate={(name, color) => createMutation.mutate({ name, color })}
        />
      ) : null}
    </>
  );
}
