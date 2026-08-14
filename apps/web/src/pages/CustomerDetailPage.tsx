import { AMBASSADOR_LABEL_NAME } from "@olist-crm/shared";
import type { CustomerDetail, InsightTag } from "@olist-crm/shared";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Hash,
  LoaderCircle,
  Mail,
  MapPin,
  NotebookPen,
  PackageOpen,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { CustomerDetailNavigation } from "../components/CustomerDetailNavigation";
import { CustomerRecentOrders } from "../components/CustomerRecentOrders";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import {
  formatCurrency,
  formatDate,
  formatDaysSince,
  formatPercent,
  formatNumber,
  statusLabel,
} from "../lib/format";

type ChartMetric = "revenue" | "orders" | "pieces";
type TrendWindow = 6 | 12 | 24;

const insightLabels: Record<InsightTag, string> = {
  alto_valor: "Alto valor",
  reativacao: "Reativacao",
  recorrente: "Recorrente",
  queda_frequencia: "Queda de frequencia",
  risco_churn: "Risco de churn",
  compra_prevista_vencida: "Compra prevista vencida",
  novo_cliente: "Novo cliente",
};

function primaryInsightLabel(customer: CustomerDetail) {
  if (!customer.primaryInsight) {
    return "sem alerta";
  }

  return insightLabels[customer.primaryInsight];
}

function statusClass(status: CustomerDetail["status"]) {
  if (status === "ACTIVE") {
    return "status-active";
  }

  if (status === "ATTENTION") {
    return "status-attention";
  }

  if (status === "NEW") {
    return "status-active";
  }

  return "status-inactive";
}

function metricValueLabel(metric: ChartMetric, value: number) {
  return metric === "revenue" ? formatCurrency(value) : formatNumber(value);
}

function trendVerdict(trendData: CustomerDetail["monthlyTrend"], metric: ChartMetric) {
  if (trendData.length < 2) {
    return null;
  }

  const half = Math.floor(trendData.length / 2);
  const firstHalf = trendData.slice(0, half);
  const secondHalf = trendData.slice(half);

  const avg = (points: CustomerDetail["monthlyTrend"]) =>
    points.length ? points.reduce((sum, point) => sum + (point[metric] ?? 0), 0) / points.length : 0;

  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);

  if (firstAvg === 0) {
    return secondAvg > 0 ? "Tendencia: *Crescendo* (comecou do zero na janela)" : null;
  }

  const change = (secondAvg - firstAvg) / firstAvg;
  const percent = formatPercent(Math.abs(change));

  if (change >= 0.05) {
    return `Tendencia: *Crescendo* (+${percent} vs inicio da janela)`;
  }

  if (change <= -0.05) {
    return `Tendencia: *Caindo* (-${percent} vs inicio da janela)`;
  }

  return "Tendencia: *Estavel* (sem variacao relevante na janela)";
}

function buildWhatsappSummary(
  customer: CustomerDetail,
  metric: ChartMetric,
  trendWindow: TrendWindow,
  trendData: CustomerDetail["monthlyTrend"],
) {
  const lines: string[] = [];

  lines.push(`*${customer.displayName}* (${customer.customerCode || "sem codigo"})`);
  lines.push(`Status: ${statusLabel(customer.status)} | Insight: ${primaryInsightLabel(customer)}`);
  lines.push("");
  lines.push(`Total gasto: *${formatCurrency(customer.totalSpent)}*`);
  lines.push(`Ticket medio: ${formatCurrency(customer.avgTicket)}`);
  lines.push(`Pedidos: ${formatNumber(customer.totalOrders)}`);
  lines.push(`Ultima compra: ${formatDate(customer.lastPurchaseAt)} (${formatDaysSince(customer.daysSinceLastPurchase)})`);
  lines.push(`Proxima compra prevista: ${formatDate(customer.predictedNextPurchaseAt)}`);

  if (customer.frequencyDropRatio >= 0.25) {
    lines.push(`Queda de frequencia: ${formatPercent(customer.frequencyDropRatio)}`);
  }

  if (customer.lastAttendant) {
    lines.push(`Atendente: ${customer.lastAttendant}`);
  }

  if (trendData.length) {
    const total = trendData.reduce((sum, point) => sum + (point[metric] ?? 0), 0);
    lines.push("");
    lines.push(`*${chartMetricLabel(metric)} (ultimos ${trendWindow}m): ${metricValueLabel(metric, total)}*`);

    const verdict = trendVerdict(trendData, metric);
    if (verdict) {
      lines.push(verdict);
    }

    lines.push("");
    trendData.forEach((point, index) => {
      const current = point[metric] ?? 0;
      const previous = index > 0 ? trendData[index - 1]?.[metric] ?? 0 : null;
      let marker = "";
      if (previous !== null) {
        if (current > previous) {
          marker = " (+)";
        } else if (current < previous) {
          marker = " (-)";
        } else {
          marker = " (=)";
        }
      }
      lines.push(`${formatMonthLabel(point.month)}: ${metricValueLabel(metric, current)}${marker}`);
    });
  }

  const topProducts = customer.topProducts.slice(0, 3);
  if (topProducts.length) {
    lines.push("");
    lines.push("*Mais compra:*");
    topProducts.forEach((product) => {
      lines.push(`- ${product.itemDescription} (${formatNumber(product.totalQuantity)} pcs)`);
    });
  }

  return lines.join("\n");
}

function formatMonthLabel(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  const year = match?.[1];
  const month = match?.[2];

  if (!year || !month) {
    return value;
  }

  return `${month}/${year.slice(2)}`;
}

function chartMetricLabel(metric: ChartMetric) {
  if (metric === "orders") {
    return "Pedidos";
  }

  if (metric === "pieces") {
    return "Pecas";
  }

  return "Faturamento";
}

function chartMetricColor(metric: ChartMetric) {
  if (metric === "orders") {
    return "#5f8cff";
  }

  if (metric === "pieces") {
    return "#2f9d67";
  }

  return "#2956d7";
}

function CustomerTrendTooltip({
  active,
  payload,
  label,
  metric,
  subjectLabel,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  metric: ChartMetric;
  subjectLabel: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  const value = payload[0]?.value ?? 0;

  return (
    <div className="chart-tooltip">
      <strong>{formatMonthLabel(label)}</strong>
      <div className="chart-tooltip-count">
        <strong>{metric === "revenue" ? formatCurrency(value) : formatNumber(value)}</strong>
        <span>
          {chartMetricLabel(metric)} de {subjectLabel}
        </span>
      </div>
      <p>Historico mensal de compra desse cliente. Troque a metrica ou a janela acima.</p>
    </div>
  );
}

function phoneHref(phone: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits ? `tel:+${digits}` : undefined;
}

function CustomerProfileCard({ customer }: { customer: CustomerDetail }) {
  const location = [customer.city, customer.state].filter(Boolean).join(" / ") || "Não informado";
  const profileRows = [
    { icon: Phone, label: "Telefone", value: customer.phone || "Não informado", href: phoneHref(customer.phone) },
    { icon: Mail, label: "E-mail", value: customer.email || "Não informado", href: customer.email ? `mailto:${customer.email}` : undefined },
    { icon: MapPin, label: "Localização", value: location },
    { icon: UserRound, label: "Última vendedora", value: customer.lastAttendant || "Não informado" },
    { icon: Hash, label: "Código do cliente", value: customer.customerCode || "Não informado" },
    { icon: CalendarDays, label: "Cliente desde", value: formatDate(customer.customerSince) },
  ];

  return (
    <section className="customer-profile-card" aria-labelledby="customer-profile-title">
      <header>
        <span className="customer-profile-card-icon"><UserRound size={19} /></span>
        <div><p className="eyebrow">Perfil</p><h2 id="customer-profile-title">Informações do cliente</h2></div>
      </header>
      <div className="customer-profile-rows">
        {profileRows.map(({ icon: Icon, label, value, href }) => (
          <div key={label} className="customer-profile-row">
            <Icon size={16} aria-hidden="true" />
            <div><span>{label}</span>{href ? <a href={href}>{value}</a> : <strong>{value}</strong>}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface CustomerRecordWorkspaceProps {
  selectedLabels: string[];
  availableLabels: string[];
  labelSearch: string;
  labelMessage: string;
  canCreateLabel: boolean;
  internalNotes: string;
  notesMessage: string;
  notesDirty: boolean;
  labelsSaving: boolean;
  labelsError: boolean;
  notesSaving: boolean;
  notesError: boolean;
  onLabelSearchChange: (value: string) => void;
  onAddExistingLabel: (labelName: string) => void;
  onCreateLabel: () => void;
  onRemoveLabel: (labelName: string) => void;
  onNotesChange: (value: string) => void;
  onSaveNotes: (event: FormEvent) => void;
}

export function CustomerRecordWorkspace({
  selectedLabels,
  availableLabels,
  labelSearch,
  labelMessage,
  canCreateLabel,
  internalNotes,
  notesMessage,
  notesDirty,
  labelsSaving,
  labelsError,
  notesSaving,
  notesError,
  onLabelSearchChange,
  onAddExistingLabel,
  onCreateLabel,
  onRemoveLabel,
  onNotesChange,
  onSaveNotes,
}: CustomerRecordWorkspaceProps) {
  return (
    <aside className="customer-record-card" aria-label="Organização comercial do cliente">
      <header className="customer-record-header">
        <div className="customer-record-icon" aria-hidden="true">
          <NotebookPen size={20} />
        </div>
        <div>
          <p className="eyebrow">Organização comercial</p>
          <h2>Rótulos e observação</h2>
          <p>Deixe aqui o contexto que a equipe precisa encontrar rapidamente.</p>
        </div>
      </header>

      <section className="customer-record-section" aria-labelledby="customer-labels-title">
        <div className="customer-record-section-title">
          <div>
            <span className="customer-record-kicker"><Tag size={15} /> Classificação</span>
            <h3 id="customer-labels-title">Rótulos do cliente</h3>
          </div>
          <span className="customer-record-count">{selectedLabels.length}</span>
        </div>

        <div className="customer-labels-current" aria-label="Rótulos aplicados">
          {selectedLabels.length ? (
            selectedLabels.map((labelName) => (
              <span
                key={labelName}
                className={`customer-label-chip ${labelName === AMBASSADOR_LABEL_NAME ? "is-ambassador" : ""}`}
              >
                <span>{labelName}</span>
                {labelName !== AMBASSADOR_LABEL_NAME ? (
                  <button
                    type="button"
                    onClick={() => onRemoveLabel(labelName)}
                    disabled={labelsSaving}
                    aria-label={`Remover rótulo ${labelName}`}
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </span>
            ))
          ) : (
            <div className="customer-record-empty">
              <Tag size={18} />
              <span>Nenhum rótulo aplicado ainda.</span>
            </div>
          )}
        </div>

        <div className="customer-label-picker">
          <label htmlFor="customer-label-search">Adicionar rótulo</label>
          <div className="customer-label-search">
            <Search size={17} aria-hidden="true" />
            <input
              id="customer-label-search"
              value={labelSearch}
              onChange={(event) => onLabelSearchChange(event.target.value)}
              placeholder="Busque um rótulo ou crie um novo"
              autoComplete="off"
            />
          </div>

          {availableLabels.length ? (
            <div className="customer-label-options" aria-label="Rótulos disponíveis">
              {availableLabels.slice(0, 8).map((labelName) => (
                <button
                  key={labelName}
                  type="button"
                  onClick={() => onAddExistingLabel(labelName)}
                  disabled={labelsSaving}
                >
                  <Plus size={14} /> {labelName}
                </button>
              ))}
            </div>
          ) : labelSearch.trim() && !canCreateLabel ? (
            <span className="customer-record-helper">Esse rótulo já está aplicado.</span>
          ) : null}

          {canCreateLabel ? (
            <button type="button" className="customer-create-label" onClick={onCreateLabel} disabled={labelsSaving}>
              <Plus size={16} /> Criar e aplicar “{labelSearch.trim()}”
            </button>
          ) : null}
        </div>

        <div className="customer-record-status" aria-live="polite">
          {labelsSaving ? (
            <><LoaderCircle className="spinner-small" size={15} /> Salvando rótulos...</>
          ) : labelsError ? (
            <span className="is-error">{labelMessage || "Não foi possível salvar os rótulos."}</span>
          ) : (
            <><CheckCircle2 size={15} /> {labelMessage || "Alterações salvas automaticamente."}</>
          )}
        </div>
      </section>

      <form className="customer-record-section customer-note-form" onSubmit={onSaveNotes}>
        <div className="customer-record-section-title">
          <div>
            <span className="customer-record-kicker"><NotebookPen size={15} /> Contexto da equipe</span>
            <h3>Observação interna</h3>
          </div>
          {notesDirty ? <span className="customer-unsaved-badge">Não salvo</span> : null}
        </div>

        <label htmlFor="customer-internal-notes" className="sr-only">Observação interna do cliente</label>
        <textarea
          id="customer-internal-notes"
          rows={7}
          value={internalNotes}
          onChange={(event) => onNotesChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && notesDirty && !notesSaving) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ex.: prefere contato à tarde, pediu retorno sobre um modelo, condição combinada ou contexto importante para a próxima conversa."
        />
        <div className="customer-note-footer">
          <span className="customer-record-helper">Ctrl + Enter para salvar</span>
          <button type="submit" className="primary-button" disabled={notesSaving || !notesDirty}>
            {notesSaving ? <LoaderCircle className="spinner-small" size={16} /> : <Check size={16} />}
            {notesSaving ? "Salvando..." : notesDirty ? "Salvar observação" : "Observação salva"}
          </button>
        </div>
        <div className="customer-record-status" aria-live="polite">
          {notesError ? (
            <span className="is-error">Não foi possível salvar a observação.</span>
          ) : notesMessage ? (
            <><CheckCircle2 size={15} /> {notesMessage}</>
          ) : null}
        </div>
      </form>
    </aside>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [labelSearch, setLabelSearch] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [labelMessage, setLabelMessage] = useState("");
  const [notesMessage, setNotesMessage] = useState("");
  const [ambassadorMessage, setAmbassadorMessage] = useState("");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("revenue");
  const [trendWindow, setTrendWindow] = useState<TrendWindow>(12);
  const [copied, setCopied] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.customer(token!, id!),
    enabled: Boolean(token && id),
  });
  const labelsQuery = useQuery({
    queryKey: ["customer-labels"],
    queryFn: () => api.customerLabels(token!),
    enabled: Boolean(token),
  });

  const customer = detailQuery.data ?? null;
  const knownLabels = useMemo(() => labelsQuery.data?.map((label) => label.name) ?? [], [labelsQuery.data]);
  const availableLabels = useMemo(
    () =>
      knownLabels.filter((labelName) => {
        if (labelName === AMBASSADOR_LABEL_NAME || selectedLabels.includes(labelName)) {
          return false;
        }

        return labelName.toLowerCase().includes(labelSearch.trim().toLowerCase());
      }),
    [knownLabels, selectedLabels, labelSearch],
  );

  useEffect(() => {
    if (!customer) {
      return;
    }

    setSelectedLabels(customer.labels.map((label) => label.name));
    setInternalNotes(customer.internalNotes);
  }, [customer]);

  const saveLabelsMutation = useMutation({
    mutationFn: (input: { labels: string[] }) => api.updateCustomerLabels(token!, id!, input),
    onSuccess: (updatedCustomer) => {
      queryClient.setQueryData(["customer", updatedCustomer.id], updatedCustomer);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["ambassadors"] });
      setLabelMessage("Rotulos salvos com sucesso.");
    },
    onError: () => {
      setSelectedLabels(customer?.labels.map((label) => label.name) ?? []);
      setLabelMessage("Nao foi possivel salvar. Os rotulos anteriores foram restaurados.");
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: (input: { internalNotes: string }) => api.updateCustomerLabels(token!, id!, input),
    onSuccess: (updatedCustomer) => {
      queryClient.setQueryData(["customer", updatedCustomer.id], updatedCustomer);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      setNotesMessage("Observacao salva com sucesso.");
    },
  });

  const ambassadorMutation = useMutation({
    mutationFn: (isAmbassador: boolean) => api.updateCustomerAmbassador(token!, id!, isAmbassador),
    onSuccess: (updatedCustomer) => {
      queryClient.setQueryData(["customer", updatedCustomer.id], updatedCustomer);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["ambassadors"] });
      setAmbassadorMessage(
        updatedCustomer.isAmbassador ? "Cliente marcado como embaixador." : "Cliente removido da aba de embaixadores.",
      );
    },
  });

  if (detailQuery.isLoading) {
    return <div className="page-loading">Carregando ficha do cliente...</div>;
  }

  if (detailQuery.isError || !customer) {
    return <div className="page-error">Nao foi possivel carregar a ficha do cliente.</div>;
  }

  function addExistingLabel(labelName: string) {
    if (selectedLabels.includes(labelName) || labelName === AMBASSADOR_LABEL_NAME) {
      return;
    }

    const nextLabels = [...selectedLabels, labelName];
    setSelectedLabels(nextLabels);
    saveLabelsMutation.mutate({ labels: nextLabels });
    setLabelSearch("");
    setLabelMessage("");
  }

  function addNewLabel() {
    const cleaned = labelSearch.trim();
    const alreadySelected = selectedLabels.some(
      (labelName) => labelName.toLocaleLowerCase("pt-BR") === cleaned.toLocaleLowerCase("pt-BR"),
    );
    if (!cleaned || alreadySelected) {
      return;
    }

    if (cleaned.toLowerCase() === AMBASSADOR_LABEL_NAME.toLowerCase()) {
      setLabelMessage(`Use o botao dedicado para marcar ${AMBASSADOR_LABEL_NAME}.`);
      return;
    }

    const nextLabels = [...selectedLabels, cleaned];
    setSelectedLabels(nextLabels);
    saveLabelsMutation.mutate({ labels: nextLabels });
    setLabelSearch("");
    setLabelMessage("");
  }

  function removeLabel(labelName: string) {
    if (labelName === AMBASSADOR_LABEL_NAME) {
      return;
    }

    const nextLabels = selectedLabels.filter((item) => item !== labelName);
    setSelectedLabels(nextLabels);
    saveLabelsMutation.mutate({ labels: nextLabels });
    setLabelMessage("");
  }

  function handleSaveNotes(event: FormEvent) {
    event.preventDefault();
    saveNotesMutation.mutate({
      internalNotes,
    });
  }

  async function handleCopySummary() {
    if (!customer) {
      return;
    }

    const summary = buildWhatsappSummary(
      customer,
      chartMetric,
      trendWindow,
      (customer.monthlyTrend ?? []).slice(-trendWindow),
    );

    try {
      await navigator.clipboard.writeText(summary);
    } catch {
      // Fallback para navegadores sem clipboard API ou contexto nao seguro.
      const textarea = document.createElement("textarea");
      textarea.value = summary;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand("copy");
      } finally {
        document.body.removeChild(textarea);
      }
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  const trendData = (customer.monthlyTrend ?? []).slice(-trendWindow);
  const normalizedLabelSearch = labelSearch.trim().toLocaleLowerCase("pt-BR");
  const canCreateLabel = Boolean(
    normalizedLabelSearch &&
      normalizedLabelSearch !== AMBASSADOR_LABEL_NAME.toLocaleLowerCase("pt-BR") &&
      !knownLabels.some((labelName) => labelName.toLocaleLowerCase("pt-BR") === normalizedLabelSearch) &&
      !selectedLabels.some((labelName) => labelName.toLocaleLowerCase("pt-BR") === normalizedLabelSearch),
  );
  const notesDirty = internalNotes !== customer.internalNotes;
  const locationLabel = [customer.city, customer.state].filter(Boolean).join(" / ") || "Não informado";
  const topProducts = customer.topProducts.slice(0, 5);
  const analysisMetrics = [
    {
      label: "Ticket médio",
      value: formatCurrency(customer.avgTicket),
      detail: `${formatNumber(customer.totalOrders)} pedidos no histórico.`,
    },
    {
      label: "Frequência em 90 dias",
      value: customer.purchaseFrequency90d.toFixed(1),
      detail: "Pedidos registrados nos últimos 90 dias.",
    },
    {
      label: "Queda de frequência",
      value: formatPercent(customer.frequencyDropRatio),
      detail: customer.frequencyDropRatio >= 0.5 ? "Queda relevante; priorize contato." : "Ritmo sob controle.",
    },
    {
      label: "Prioridade comercial",
      value: customer.priorityScore.toFixed(1),
      detail: "Score calculado por recência, valor e frequência.",
    },
  ];

  return (
    <div className="page-stack customer-detail-page">
      <Link to="/clientes" className="customer-back-link">
        <ArrowLeft size={16} /> Voltar para clientes
      </Link>

      <section className="customer-detail-hero">
        <div className="customer-identity">
          <div className="customer-avatar" aria-hidden="true">
            <UserRound size={24} />
          </div>
          <div>
            <p className="eyebrow">Ficha do cliente</p>
            <h1>{customer.displayName}</h1>
            <div className="customer-identity-meta">
              <span className={`status-badge ${statusClass(customer.status)}`}>{statusLabel(customer.status)}</span>
              <span>{customer.customerCode || "Sem código"}</span>
              <span><MapPin size={14} /> {locationLabel}</span>
              <span><CalendarDays size={14} /> Última compra em {formatDate(customer.lastPurchaseAt)}</span>
            </div>
          </div>
        </div>

        <div className="customer-hero-actions">
          <button type="button" className="ghost-button" onClick={handleCopySummary}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Resumo copiado" : "Copiar resumo para WhatsApp"}
          </button>
          <button
            type="button"
            className={customer.isAmbassador ? "ghost-button" : "primary-button"}
            disabled={ambassadorMutation.isPending}
            onClick={() => {
              setAmbassadorMessage("");
              ambassadorMutation.mutate(!customer.isAmbassador);
            }}
          >
            {ambassadorMutation.isPending
              ? "Salvando..."
              : customer.isAmbassador
                ? "Remover de embaixadores"
                : "Marcar como embaixador"}
          </button>
          {ambassadorMessage ? <span className="customer-action-feedback">{ambassadorMessage}</span> : null}
        </div>
      </section>

      <CustomerDetailNavigation customerId={customer.id} />

      <section className="customer-summary-strip" aria-label="Resumo de compras do cliente">
        <article><span><ShoppingBag size={17} /></span><div><small>Total comprado</small><strong>{formatCurrency(customer.totalSpent)}</strong></div></article>
        <article><span><PackageOpen size={17} /></span><div><small>Pedidos no histórico</small><strong>{formatNumber(customer.totalOrders)}</strong></div></article>
        <article><span><ShoppingBag size={17} /></span><div><small>Ticket médio</small><strong>{formatCurrency(customer.avgTicket)}</strong></div></article>
        <article><span><CalendarDays size={17} /></span><div><small>Última compra</small><strong>{formatDate(customer.lastPurchaseAt)}</strong><em>{formatDaysSince(customer.daysSinceLastPurchase)}</em></div></article>
      </section>

      <section className="customer-profile-orders-layout">
        <div className="customer-orders-main">
          <CustomerRecentOrders orders={customer.recentOrders} initialLimit={4} />

          <details className="customer-analysis-panel">
            <summary>
              <div>
                <span className="customer-analysis-icon"><CalendarDays size={18} /></span>
                <div><strong>Análises e preferências</strong><span>Consulte somente quando precisar aprofundar o atendimento.</span></div>
              </div>
              <ChevronDown size={20} className="customer-analysis-chevron" />
            </summary>

            <div className="customer-analysis-content">
              <section className="customer-analysis-section">
                <div className="customer-analysis-heading">
                  <div><p className="eyebrow">Histórico mensal</p><h3>Tendência de compras</h3></div>
                  <div className="ambassador-chart-controls">
                    <div className="ambassador-chart-toggle" role="tablist" aria-label="Métrica do gráfico">
                      {(["revenue", "orders", "pieces"] as ChartMetric[]).map((metric) => (
                        <button key={metric} type="button" className={`ambassador-chart-button ${chartMetric === metric ? "active" : ""}`} onClick={() => setChartMetric(metric)}>
                          {chartMetricLabel(metric)}
                        </button>
                      ))}
                    </div>
                    <div className="ambassador-range-toggle" role="tablist" aria-label="Período do gráfico">
                      {([6, 12, 24] as TrendWindow[]).map((windowSize) => (
                        <button key={windowSize} type="button" className={`ambassador-range-button ${trendWindow === windowSize ? "active" : ""}`} onClick={() => setTrendWindow(windowSize)}>
                          {windowSize}m
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {trendData.length ? (
                  <div className="trend-chart-wrap">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={trendData} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                        <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                        <XAxis dataKey="month" tickFormatter={(value) => formatMonthLabel(String(value))} stroke="#5f6f95" minTickGap={trendWindow === 24 ? 18 : 8} />
                        <YAxis stroke="#5f6f95" tickFormatter={(value) => formatNumber(Number(value))} />
                        <Tooltip content={<CustomerTrendTooltip metric={chartMetric} subjectLabel={customer.displayName} />} cursor={{ fill: "rgba(41, 86, 215, 0.04)" }} />
                        <Bar dataKey={chartMetric} fill={chartMetricColor(chartMetric)} radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <div className="customer-list-empty">Ainda não há histórico suficiente para montar a tendência.</div>}
              </section>

              <section className="customer-secondary-insights">
                <article>
                  <div className="customer-column-title"><PackageOpen size={17} /><h3>Indicadores comerciais</h3></div>
                  <div className="customer-analysis-metrics">
                    {analysisMetrics.map((metric) => (
                      <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></div>
                    ))}
                  </div>
                </article>
                <article>
                  <div className="customer-column-title"><ShoppingBag size={17} /><h3>Preferências resumidas</h3></div>
                  <div className="customer-preference-list">
                    {topProducts.length ? topProducts.map((product) => (
                      <div key={product.sku ?? product.itemDescription}>
                        <span>{product.itemDescription}</span>
                        <strong>{formatNumber(product.totalQuantity)} peças</strong>
                      </div>
                    )) : <div className="customer-list-empty">Sem produtos suficientes para identificar preferências.</div>}
                  </div>
                  <div className="customer-insight-chips">
                    <span>Insight: <strong>{primaryInsightLabel(customer)}</strong></span>
                    {customer.isAmbassador ? <span className="is-ambassador">{AMBASSADOR_LABEL_NAME}</span> : null}
                  </div>
                </article>
              </section>
            </div>
          </details>
        </div>

        <div className="customer-profile-sidebar">
          <CustomerProfileCard customer={customer} />
          <CustomerRecordWorkspace
            selectedLabels={selectedLabels}
            availableLabels={availableLabels}
            labelSearch={labelSearch}
            labelMessage={labelMessage}
            canCreateLabel={canCreateLabel}
            internalNotes={internalNotes}
            notesMessage={notesMessage}
            notesDirty={notesDirty}
            labelsSaving={saveLabelsMutation.isPending}
            labelsError={saveLabelsMutation.isError}
            notesSaving={saveNotesMutation.isPending}
            notesError={saveNotesMutation.isError}
            onLabelSearchChange={(value) => { setLabelSearch(value); setLabelMessage(""); }}
            onAddExistingLabel={addExistingLabel}
            onCreateLabel={addNewLabel}
            onRemoveLabel={removeLabel}
            onNotesChange={(value) => { setInternalNotes(value); setNotesMessage(""); }}
            onSaveNotes={handleSaveNotes}
          />
        </div>
      </section>
    </div>
  );
}
