import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, DragEvent, SetStateAction } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import type {
  CustomerStatus,
  MessageAutomation,
  MessageAutomationRun,
  MessageAutomationSendMode,
  MessageAutomationTriggerMode,
  SegmentDefinition,
} from "@olist-crm/shared";
import {
  AlarmClock,
  Bot,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  GitBranch,
  MessageCircle,
  PauseCircle,
  Play,
  Plus,
  RadioTower,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Zap,
  Users,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDateTime, formatNumber } from "../lib/format";

type AutomationNodeKind = "schedule" | "audience" | "condition" | "agent" | "template" | "send" | "wait";
type InactivityStageId = "ATTENTION_1" | "ATTENTION_2" | "INACTIVE_1" | "INACTIVE_2";

interface InactivityStage {
  id: InactivityStageId;
  label: string;
  description: string;
  status: CustomerStatus[];
  minDaysInactive: number;
  maxDaysInactive?: number;
}

interface AutomationNodeData extends Record<string, unknown> {
  kind: AutomationNodeKind;
  title: string;
  subtitle: string;
  detail?: string;
}

interface AutomationFlowDefinition {
  nodes?: Node<AutomationNodeData>[];
  edges?: Edge[];
}

interface AutomationDraft {
  name: string;
  status: "ACTIVE" | "PAUSED";
  channel: "WHATSAPP_GROUP";
  sendMode: MessageAutomationSendMode;
  triggerMode: MessageAutomationTriggerMode;
  savedSegmentId: string | null;
  segmentDefinition: SegmentDefinition;
  flowDefinition: Record<string, unknown>;
  whatsappInstanceId: string | null;
  templateId: string | null;
  messageText: string;
  schedule: {
    frequency: "DAILY" | "WEEKLY";
    weekdays?: number[];
    time: string;
    timezone: string;
  };
  overrideRecentBlock: boolean;
  minDelaySeconds: number;
  maxDelaySeconds: number;
}

const inactivityStages: InactivityStage[] = [
  {
    id: "ATTENTION_1",
    label: "Atencao 1",
    description: "30-59 dias sem comprar",
    status: ["ATTENTION"],
    minDaysInactive: 30,
    maxDaysInactive: 59,
  },
  {
    id: "ATTENTION_2",
    label: "Atencao 2",
    description: "60-89 dias sem comprar",
    status: ["ATTENTION"],
    minDaysInactive: 60,
    maxDaysInactive: 89,
  },
  {
    id: "INACTIVE_1",
    label: "Inativo 1",
    description: "90-179 dias sem comprar",
    status: ["INACTIVE"],
    minDaysInactive: 90,
    maxDaysInactive: 179,
  },
  {
    id: "INACTIVE_2",
    label: "Inativo 2",
    description: "180+ dias sem comprar",
    status: ["INACTIVE"],
    minDaysInactive: 180,
  },
];

const defaultInactivityStage = inactivityStages[0]!;

const weekdayOptions = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
];

const paletteItems: Array<{
  kind: AutomationNodeKind;
  title: string;
  subtitle: string;
}> = [
  { kind: "schedule", title: "Agenda", subtitle: "Horario do disparo" },
  { kind: "audience", title: "Publico", subtitle: "Atencao ou Inativo" },
  { kind: "condition", title: "Condicao", subtitle: "Grupo mapeado" },
  { kind: "agent", title: "Agente", subtitle: "Conta WhatsApp" },
  { kind: "template", title: "Mensagem", subtitle: "Template ou texto" },
  { kind: "send", title: "Enviar", subtitle: "Disparo automatico" },
  { kind: "wait", title: "Esperar", subtitle: "Pausa no fluxo" },
];

const nodeTypes = {
  automation: AutomationNode,
};

function stageToSegmentDefinition(stageId: InactivityStageId): SegmentDefinition {
  const stage = inactivityStages.find((entry) => entry.id === stageId) ?? defaultInactivityStage;

  return {
    status: stage.status,
    minDaysInactive: stage.minDaysInactive,
    ...(stage.maxDaysInactive === undefined ? {} : { maxDaysInactive: stage.maxDaysInactive }),
  };
}

function stageFromSegmentDefinition(definition: SegmentDefinition): InactivityStage {
  return (
    inactivityStages.find((stage) => {
      const status = definition.status?.[0];
      return (
        status === stage.status[0] &&
        definition.minDaysInactive === stage.minDaysInactive &&
        definition.maxDaysInactive === stage.maxDaysInactive
      );
    }) ?? defaultInactivityStage
  );
}

function createInitialDraft(): AutomationDraft {
  const stage = defaultInactivityStage;

  return {
    name: "Reativacao automatica",
    status: "PAUSED",
    channel: "WHATSAPP_GROUP",
    sendMode: "AUTOMATIC",
    triggerMode: "ON_STAGE_ENTRY",
    savedSegmentId: null,
    segmentDefinition: stageToSegmentDefinition(stage.id),
    flowDefinition: {},
    whatsappInstanceId: null,
    templateId: null,
    messageText: "",
    schedule: {
      frequency: "DAILY",
      time: "09:00",
      timezone: "America/Sao_Paulo",
    },
    overrideRecentBlock: false,
    minDelaySeconds: 183,
    maxDelaySeconds: 304,
  };
}

function createNode(id: string, kind: AutomationNodeKind, position: { x: number; y: number }, title?: string, subtitle?: string): Node<AutomationNodeData> {
  const item = paletteItems.find((entry) => entry.kind === kind);

  return {
    id,
    type: "automation",
    position,
    data: {
      kind,
      title: title ?? item?.title ?? "Bloco",
      subtitle: subtitle ?? item?.subtitle ?? "Configurar",
    },
  };
}

function createDefaultFlow(draft: AutomationDraft): { nodes: Node<AutomationNodeData>[]; edges: Edge[] } {
  const stage = stageFromSegmentDefinition(draft.segmentDefinition);
  const sendLabel = draft.sendMode === "AUTOMATIC" ? "Enviar automatico" : "Aguardar aprovacao";
  const triggerLabel = draft.triggerMode === "ON_STAGE_ENTRY" ? "Quando entrar" : "Todo dia";
  const triggerSubtitle =
    draft.triggerMode === "ON_STAGE_ENTRY"
      ? `Confere ${draft.schedule.time}, dispara so novos`
      : `${draft.schedule.time} em Sao Paulo`;

  const nodes: Node<AutomationNodeData>[] = [
    createNode("schedule", "schedule", { x: 40, y: 180 }, triggerLabel, triggerSubtitle),
    createNode("audience", "audience", { x: 300, y: 180 }, stage.label, stage.description),
    createNode("condition", "condition", { x: 580, y: 180 }, "Tem grupo?", "Somente grupos mapeados"),
    createNode("agent", "agent", { x: 860, y: 90 }, "Agente WhatsApp", "Instancia escolhida"),
    createNode("template", "template", { x: 860, y: 270 }, "Mensagem", "Template da automacao"),
    createNode("send", "send", { x: 1140, y: 180 }, sendLabel, "Disparo no grupo"),
  ];

  const edges: Edge[] = [
    { id: "schedule-audience", source: "schedule", target: "audience", animated: true },
    { id: "audience-condition", source: "audience", target: "condition", animated: true },
    { id: "condition-agent", source: "condition", target: "agent" },
    { id: "condition-template", source: "condition", target: "template" },
    { id: "agent-send", source: "agent", target: "send", animated: true },
    { id: "template-send", source: "template", target: "send", animated: true },
  ];

  return { nodes, edges };
}

function readFlowDefinition(value: Record<string, unknown> | null | undefined, fallback: AutomationDraft) {
  const flow = value as AutomationFlowDefinition | null | undefined;

  if (Array.isArray(flow?.nodes) && flow.nodes.length) {
    return {
      nodes: flow.nodes,
      edges: Array.isArray(flow.edges) ? flow.edges : [],
    };
  }

  return createDefaultFlow(fallback);
}

function nodeIcon(kind: AutomationNodeKind) {
  if (kind === "schedule") return <AlarmClock size={20} />;
  if (kind === "audience") return <Users size={20} />;
  if (kind === "condition") return <GitBranch size={20} />;
  if (kind === "agent") return <Bot size={20} />;
  if (kind === "template") return <MessageCircle size={20} />;
  if (kind === "wait") return <Clock3 size={20} />;
  return <Send size={20} />;
}

function AutomationNode({ data, selected }: NodeProps) {
  const nodeData = data as AutomationNodeData;

  return (
    <div className={`automation-node automation-node-${nodeData.kind} ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} className="automation-handle" />
      <div className="automation-node-icon">{nodeIcon(nodeData.kind)}</div>
      <div className="automation-node-copy">
        <strong>{nodeData.title}</strong>
        <span>{nodeData.subtitle}</span>
        {nodeData.detail ? <small>{nodeData.detail}</small> : null}
      </div>
      <Handle type="source" position={Position.Right} className="automation-handle" />
    </div>
  );
}

function automationStatusLabel(status: MessageAutomation["status"]) {
  return status === "ACTIVE" ? "Ativa" : "Pausada";
}

function automationTriggerLabel(triggerMode: MessageAutomationTriggerMode) {
  return triggerMode === "ON_STAGE_ENTRY" ? "Cliente entrou agora na faixa" : "Clientes que ja estao na faixa";
}

function runStatusLabel(run: MessageAutomationRun) {
  if (run.status === "PENDING_APPROVAL") return "Aguardando aprovacao";
  if (run.status === "ENQUEUED") return "Enfileirada";
  if (run.status === "APPROVED") return "Aprovada";
  if (run.status === "NO_MATCH") return "Sem grupos";
  if (run.status === "REJECTED") return "Rejeitada";
  return "Falhou";
}

function runTone(status: MessageAutomationRun["status"]) {
  if (status === "ENQUEUED" || status === "APPROVED") return "success";
  if (status === "FAILED" || status === "REJECTED") return "danger";
  return "warning";
}

function Inspector({
  selectedNode,
  draft,
  setDraft,
  templates,
  instances,
  preview,
  onPreview,
}: {
  selectedNode: Node<AutomationNodeData> | null;
  draft: AutomationDraft;
  setDraft: Dispatch<SetStateAction<AutomationDraft>>;
  templates: Awaited<ReturnType<typeof api.messageTemplates>> | undefined;
  instances: Awaited<ReturnType<typeof api.whatsappInstances>> | undefined;
  preview: { customers: unknown[]; summary: { totalCustomers: number } } | undefined;
  onPreview: () => void;
}) {
  const kind = selectedNode?.data.kind ?? "audience";
  const stage = stageFromSegmentDefinition(draft.segmentDefinition);

  return (
    <aside className="automation-inspector">
      <div className="automation-inspector-header">
        <span>{nodeIcon(kind)}</span>
        <div>
          <strong>{selectedNode?.data.title ?? "Publico"}</strong>
          <small>{selectedNode?.data.subtitle ?? "Selecione uma etapa no canvas"}</small>
        </div>
      </div>

      {kind === "schedule" ? (
        <div className="automation-field-stack">
          <label>
            Tipo de gatilho
            <select
              value={draft.triggerMode}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  triggerMode: event.target.value as MessageAutomationTriggerMode,
                }))
              }
            >
              <option value="ON_STAGE_ENTRY">Cliente entrou agora na faixa</option>
              <option value="SCHEDULED">Clientes que ja estao na faixa</option>
            </select>
          </label>

          <div className="automation-mini-metrics">
            <span>{draft.triggerMode === "ON_STAGE_ENTRY" ? "Como funciona" : "Modelo antigo"}</span>
            <strong>
              {draft.triggerMode === "ON_STAGE_ENTRY"
                ? "Confere no horario, mas envia so uma vez para cada cliente que acabou de entrar."
                : "Usa todos os clientes que ja estao nesse publico. Ideal para rodar manual ou aprovar antes."}
            </strong>
          </div>

          <label>
            Conferir quando
            <select
              value={draft.schedule.frequency}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  schedule: {
                    ...current.schedule,
                    frequency: event.target.value as "DAILY" | "WEEKLY",
                    weekdays: event.target.value === "WEEKLY" ? current.schedule.weekdays ?? [1] : undefined,
                  },
                }))
              }
            >
              <option value="DAILY">Diaria</option>
              <option value="WEEKLY">Semanal</option>
            </select>
          </label>

          <label>
            Horario
            <input
              type="time"
              value={draft.schedule.time}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  schedule: { ...current.schedule, time: event.target.value },
                }))
              }
            />
          </label>

          {draft.schedule.frequency === "WEEKLY" ? (
            <div className="automation-weekdays">
              {weekdayOptions.map((weekday) => {
                const active = draft.schedule.weekdays?.includes(weekday.value) ?? false;
                return (
                  <button
                    key={weekday.value}
                    type="button"
                    className={active ? "is-active" : ""}
                    onClick={() =>
                      setDraft((current) => {
                        const days = current.schedule.weekdays ?? [];
                        return {
                          ...current,
                          schedule: {
                            ...current.schedule,
                            weekdays: active
                              ? days.filter((value) => value !== weekday.value)
                              : [...days, weekday.value].sort((left, right) => left - right),
                          },
                        };
                      })
                    }
                  >
                    {weekday.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {kind === "audience" ? (
        <div className="automation-field-stack">
          <div className="automation-stage-grid">
            {inactivityStages.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === stage.id ? "is-active" : ""}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    segmentDefinition: stageToSegmentDefinition(item.id),
                    name: current.name || `${item.label} automatico`,
                  }))
                }
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>

          <button type="button" className="secondary-button" onClick={onPreview}>
            <Eye size={16} />
            Ver clientes agora
          </button>

          <div className="automation-mini-metrics">
            <span>Clientes encontrados</span>
            <strong>{preview ? formatNumber(preview.summary.totalCustomers) : "--"}</strong>
          </div>
        </div>
      ) : null}

      {kind === "agent" ? (
        <div className="automation-field-stack">
          <label>
            Agente WhatsApp
            <select
              value={draft.whatsappInstanceId ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  whatsappInstanceId: event.target.value || null,
                }))
              }
            >
              <option value="">Instancia padrao</option>
              {instances?.map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {instance.displayLabel} {instance.phoneNumber ? `- ${instance.phoneNumber}` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="automation-mini-metrics">
            <span>Agente selecionado</span>
            <strong>
              {instances?.find((instance) => instance.id === draft.whatsappInstanceId)?.displayLabel ?? "Instancia padrao"}
            </strong>
          </div>
        </div>
      ) : null}

      {kind === "template" ? (
        <div className="automation-field-stack">
          <label>
            Template
            <select
              value={draft.templateId ?? ""}
              onChange={(event) => {
                const template = templates?.find((entry) => entry.id === event.target.value);
                setDraft((current) => ({
                  ...current,
                  templateId: event.target.value || null,
                  messageText: template?.content ?? current.messageText,
                }));
              }}
            >
              <option value="">Mensagem livre</option>
              {templates?.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mensagem
            <textarea
              rows={7}
              value={draft.messageText}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  messageText: event.target.value,
                }))
              }
              placeholder="Digite a mensagem que sera enviada no grupo do cliente."
            />
          </label>
        </div>
      ) : null}

      {kind === "send" ? (
        <div className="automation-field-stack">
          <label>
            Modo do envio
            <select
              value={draft.sendMode}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  sendMode: event.target.value as MessageAutomationSendMode,
                }))
              }
            >
            <option value="AUTOMATIC">Enviar sozinho automaticamente</option>
            <option value="APPROVAL">Gerar para eu aprovar</option>
          </select>
          </label>

          <label className="automation-check-row">
            <input
              type="checkbox"
              checked={draft.overrideRecentBlock}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  overrideRecentBlock: event.target.checked,
                }))
              }
            />
            Ignorar bloqueio recente
          </label>

          <div className="automation-delay-grid">
            <label>
              Min. segundos
              <input
                type="number"
                min={1}
                value={draft.minDelaySeconds}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    minDelaySeconds: Number(event.target.value || 1),
                  }))
                }
              />
            </label>
            <label>
              Max. segundos
              <input
                type="number"
                min={1}
                value={draft.maxDelaySeconds}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    maxDelaySeconds: Number(event.target.value || 1),
                  }))
                }
              />
            </label>
          </div>
        </div>
      ) : null}

      {kind === "condition" ? (
        <div className="automation-field-stack">
          <div className="automation-mini-metrics">
            <span>Condicao ativa</span>
            <strong>Grupo AUTO ou MANUAL</strong>
          </div>
          <div className="automation-mini-metrics">
            <span>Sem grupo</span>
            <strong>{preview ? "Separado no disparo" : "--"}</strong>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function ClassicAutomationForm({
  draft,
  setDraft,
  templates,
  instances,
  preview,
  onPreview,
}: {
  draft: AutomationDraft;
  setDraft: Dispatch<SetStateAction<AutomationDraft>>;
  templates: Awaited<ReturnType<typeof api.messageTemplates>> | undefined;
  instances: Awaited<ReturnType<typeof api.whatsappInstances>> | undefined;
  preview: { customers: unknown[]; summary: { totalCustomers: number } } | undefined;
  onPreview: () => void;
}) {
  const stage = stageFromSegmentDefinition(draft.segmentDefinition);

  return (
    <section className="automation-classic-panel">
      <div className="automation-classic-intro">
        <div>
          <p className="eyebrow">Modo classico</p>
          <h3>Formulario simples da automacao</h3>
        </div>
        <span>
          Use este modo para configurar sem canvas. Ele salva a mesma automacao do modo visual.
        </span>
      </div>

      <div className="automation-classic-grid">
        <label>
          Tipo de gatilho
          <select
            value={draft.triggerMode}
            onChange={(event) =>
              setDraft((current) => ({ ...current, triggerMode: event.target.value as MessageAutomationTriggerMode }))
            }
          >
            <option value="ON_STAGE_ENTRY">Cliente entrou agora na faixa</option>
            <option value="SCHEDULED">Clientes que ja estao na faixa</option>
          </select>
        </label>

        <label>
          Publico
          <select
            value={stage.id}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                segmentDefinition: stageToSegmentDefinition(event.target.value as InactivityStageId),
              }))
            }
          >
            {inactivityStages.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} - {item.description}
              </option>
            ))}
          </select>
        </label>

        <label>
          Frequencia da verificacao
          <select
            value={draft.schedule.frequency}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                schedule: {
                  ...current.schedule,
                  frequency: event.target.value as "DAILY" | "WEEKLY",
                  weekdays: event.target.value === "WEEKLY" ? current.schedule.weekdays ?? [1] : undefined,
                },
              }))
            }
          >
            <option value="DAILY">Diaria</option>
            <option value="WEEKLY">Semanal</option>
          </select>
        </label>

        <label>
          Horario
          <input
            type="time"
            value={draft.schedule.time}
            onChange={(event) =>
              setDraft((current) => ({ ...current, schedule: { ...current.schedule, time: event.target.value } }))
            }
          />
        </label>

        <label>
          Agente WhatsApp
          <select
            value={draft.whatsappInstanceId ?? ""}
            onChange={(event) => setDraft((current) => ({ ...current, whatsappInstanceId: event.target.value || null }))}
          >
            <option value="">Instancia padrao</option>
            {instances?.map((instance) => (
              <option key={instance.id} value={instance.id}>
                {instance.displayLabel} {instance.phoneNumber ? `- ${instance.phoneNumber}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label>
          Modo do envio
          <select
            value={draft.sendMode}
            onChange={(event) => setDraft((current) => ({ ...current, sendMode: event.target.value as MessageAutomationSendMode }))}
          >
            <option value="AUTOMATIC">Enviar sozinho automaticamente</option>
            <option value="APPROVAL">Gerar para eu aprovar</option>
          </select>
        </label>

        <label>
          Template
          <select
            value={draft.templateId ?? ""}
            onChange={(event) => {
              const template = templates?.find((entry) => entry.id === event.target.value);
              setDraft((current) => ({
                ...current,
                templateId: event.target.value || null,
                messageText: template?.content ?? current.messageText,
              }));
            }}
          >
            <option value="">Mensagem livre</option>
            {templates?.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
        </label>

        <label className="automation-check-row automation-classic-check">
          <input
            type="checkbox"
            checked={draft.overrideRecentBlock}
            onChange={(event) => setDraft((current) => ({ ...current, overrideRecentBlock: event.target.checked }))}
          />
          Ignorar bloqueio recente
        </label>
      </div>

      <label className="automation-classic-message">
        Mensagem
        <textarea
          rows={7}
          value={draft.messageText}
          onChange={(event) => setDraft((current) => ({ ...current, messageText: event.target.value }))}
          placeholder="Digite a mensagem que sera enviada no grupo do cliente."
        />
      </label>

      <div className="automation-classic-footer">
        <button type="button" className="secondary-button" onClick={onPreview}>
          <Eye size={16} />
          Ver clientes agora
        </button>
        <div className="automation-mini-metrics">
          <span>Clientes encontrados</span>
          <strong>{preview ? formatNumber(preview.summary.totalCustomers) : "--"}</strong>
        </div>
        <div className="automation-mini-metrics">
          <span>Regra do gatilho</span>
          <strong>
            {draft.triggerMode === "ON_STAGE_ENTRY"
              ? "Envia uma vez quando entrar nessa faixa."
              : "Repete para o publico no horario configurado."}
          </strong>
        </div>
      </div>
    </section>
  );
}

function automationToDraft(automation: MessageAutomation): AutomationDraft {
  return {
    name: automation.name,
    status: automation.status,
    channel: automation.channel,
    sendMode: automation.sendMode ?? "APPROVAL",
    triggerMode: automation.triggerMode ?? "SCHEDULED",
    savedSegmentId: automation.savedSegmentId,
    segmentDefinition: automation.segmentDefinition,
    flowDefinition: automation.flowDefinition ?? {},
    whatsappInstanceId: automation.whatsappInstanceId,
    templateId: automation.templateId,
    messageText: automation.messageText,
    schedule: automation.schedule,
    overrideRecentBlock: automation.overrideRecentBlock,
    minDelaySeconds: automation.minDelaySeconds,
    maxDelaySeconds: automation.maxDelaySeconds,
  };
}

function AutomationsPageInner() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [draft, setDraft] = useState<AutomationDraft>(createInitialDraft);
  const [activeAutomationId, setActiveAutomationId] = useState<string | null>(null);
  const [builderMode, setBuilderMode] = useState<"visual" | "classic">("visual");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("audience");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const initialFlow = useMemo(() => createDefaultFlow(draft), []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow.edges);

  const templatesQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => api.messageTemplates(token!),
    enabled: Boolean(token),
  });

  const instancesQuery = useQuery({
    queryKey: ["whatsapp-instances"],
    queryFn: () => api.whatsappInstances(token!),
    enabled: Boolean(token),
  });

  const savedSegmentsQuery = useQuery({
    queryKey: ["saved-segments"],
    queryFn: () => api.savedSegments(token!),
    enabled: Boolean(token),
  });

  const automationsQuery = useQuery({
    queryKey: ["automations"],
    queryFn: () => api.automations(token!),
    enabled: Boolean(token),
  });

  const runsQuery = useQuery({
    queryKey: ["automation-runs"],
    queryFn: () => api.automationRuns(token!, 100),
    enabled: Boolean(token),
    refetchInterval: 15000,
  });

  const previewMutation = useMutation({
    mutationFn: (definition: SegmentDefinition) => api.previewSegment(token!, definition),
  });

  const saveAutomationMutation = useMutation({
    mutationFn: (input: AutomationDraft) =>
      activeAutomationId ? api.updateAutomation(token!, activeAutomationId, input) : api.createAutomation(token!, input),
    onSuccess: async (automation) => {
      openAutomation(automation);
      setFeedbackMessage(activeAutomationId ? "Automacao atualizada." : "Automacao criada.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["automations"] }),
        queryClient.invalidateQueries({ queryKey: ["automation-runs"] }),
      ]);
    },
  });

  const deleteAutomationMutation = useMutation({
    mutationFn: (id: string) => api.deleteAutomation(token!, id),
    onSuccess: async () => {
      resetForm();
      setFeedbackMessage("Automacao excluida.");
      await queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });

  const toggleAutomationMutation = useMutation({
    mutationFn: (automation: MessageAutomation) =>
      api.updateAutomation(token!, automation.id, {
        ...automationToDraft(automation),
        status: automation.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
      }),
    onSuccess: async (automation) => {
      if (automation.id === activeAutomationId) {
        openAutomation(automation);
      }
      setFeedbackMessage(automation.status === "ACTIVE" ? "Automacao ativada." : "Automacao pausada.");
      await queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });

  const runNowMutation = useMutation({
    mutationFn: ({ id, sendMode }: { id: string; sendMode?: MessageAutomationSendMode }) =>
      api.runAutomationNow(token!, id, sendMode),
    onSuccess: async (run) => {
      setFeedbackMessage(
        run.status === "PENDING_APPROVAL"
          ? "Execucao criada para sua aprovacao."
          : run.status === "ENQUEUED"
            ? "Execucao rodada agora e campanha enfileirada."
            : "Execucao rodada agora.",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["automation-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
      ]);
    },
  });

  const approveRunMutation = useMutation({
    mutationFn: (id: string) => api.approveAutomationRun(token!, id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["automation-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
      ]);
    },
  });

  const rejectRunMutation = useMutation({
    mutationFn: (id: string) => api.rejectAutomationRun(token!, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["automation-runs"] });
    },
  });

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const pendingRuns = useMemo(
    () => (runsQuery.data ?? []).filter((run) => run.status === "PENDING_APPROVAL"),
    [runsQuery.data],
  );

  useEffect(() => {
    const stage = stageFromSegmentDefinition(draft.segmentDefinition);
    const selectedInstance = instancesQuery.data?.find((instance) => instance.id === draft.whatsappInstanceId);
    const selectedTemplate = templatesQuery.data?.find((template) => template.id === draft.templateId);

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.data.kind === "schedule") {
          return {
            ...node,
            data: {
              ...node.data,
              title: draft.triggerMode === "ON_STAGE_ENTRY" ? "Quando entrar" : draft.schedule.frequency === "DAILY" ? "Todo dia" : "Semanal",
              subtitle:
                draft.triggerMode === "ON_STAGE_ENTRY"
                  ? `Confere ${draft.schedule.time}, envia so novos`
                  : draft.schedule.time,
            },
          };
        }
        if (node.data.kind === "audience") {
          return { ...node, data: { ...node.data, title: stage.label, subtitle: stage.description } };
        }
        if (node.data.kind === "agent") {
          return { ...node, data: { ...node.data, title: selectedInstance?.displayLabel ?? "Instancia padrao", subtitle: selectedInstance?.phoneNumber ?? "WhatsApp" } };
        }
        if (node.data.kind === "template") {
          return { ...node, data: { ...node.data, title: selectedTemplate?.title ?? "Mensagem livre", subtitle: draft.messageText ? "Texto configurado" : "Sem mensagem" } };
        }
        if (node.data.kind === "send") {
          return {
            ...node,
            data: {
              ...node.data,
              title: draft.sendMode === "AUTOMATIC" ? "Enviar automatico" : "Aguardar aprovacao",
              subtitle: draft.overrideRecentBlock ? "Sem trava recente" : "Com trava recente",
            },
          };
        }
        return node;
      }),
    );
  }, [draft, instancesQuery.data, templatesQuery.data, setNodes]);

  function buildPayload(): AutomationDraft {
    return {
      ...draft,
      flowDefinition: { nodes, edges },
    };
  }

  function openAutomation(automation: MessageAutomation) {
    const nextDraft = automationToDraft(automation);
    const flow = readFlowDefinition(automation.flowDefinition, nextDraft);
    setActiveAutomationId(automation.id);
    setDraft(nextDraft);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setSelectedNodeId(flow.nodes[0]?.id ?? null);
  }

  function resetForm() {
    const nextDraft = createInitialDraft();
    const flow = createDefaultFlow(nextDraft);
    setDraft(nextDraft);
    setActiveAutomationId(null);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setSelectedNodeId("audience");
    setFeedbackMessage("");
  }

  const onConnect = useCallback(
    (connection: Connection) => setEdges((currentEdges) => addEdge({ ...connection, animated: true }, currentEdges)),
    [setEdges],
  );

  const onDragStart = (event: DragEvent, kind: AutomationNodeKind) => {
    event.dataTransfer.setData("application/automation-node", kind);
    event.dataTransfer.effectAllowed = "move";
  };

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/automation-node") as AutomationNodeKind;
      if (!kind) return;

      const bounds = event.currentTarget.getBoundingClientRect();
      const id = `${kind}-${Date.now()}`;
      setNodes((currentNodes) => [
        ...currentNodes,
        createNode(id, kind, {
          x: event.clientX - bounds.left - 90,
          y: event.clientY - bounds.top - 40,
        }),
      ]);
      setSelectedNodeId(id);
    },
    [setNodes],
  );

  return (
    <div className="automation-page">
      <header className="automation-topbar">
        <div>
          <p className="eyebrow">Automacoes</p>
          <h2>{builderMode === "visual" ? "Construtor visual" : "Formulario classico"}</h2>
        </div>
        <div className="automation-name-box">
          <input
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder="Nome da automacao"
          />
          <button
            type="button"
            className={`automation-status-toggle ${draft.status === "ACTIVE" ? "is-active" : ""}`}
            onClick={() =>
              setDraft((current) => ({
                ...current,
                status: current.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
              }))
            }
          >
            <span />
            {draft.status === "ACTIVE" ? "Ativa" : "Pausada"}
          </button>
        </div>
        <div className="automation-topbar-actions">
          <div className="automation-mode-toggle" aria-label="Modo de criacao">
            <button
              type="button"
              className={builderMode === "visual" ? "is-active" : ""}
              onClick={() => setBuilderMode("visual")}
            >
              Visual
            </button>
            <button
              type="button"
              className={builderMode === "classic" ? "is-active" : ""}
              onClick={() => setBuilderMode("classic")}
            >
              Classico
            </button>
          </div>
          <button type="button" className="secondary-button" onClick={() => previewMutation.mutate(draft.segmentDefinition)}>
            <Eye size={16} />
            Testar
          </button>
          {activeAutomationId ? (
            <button
              type="button"
              className="secondary-button"
              disabled={!canManage || runNowMutation.isPending}
              onClick={() => runNowMutation.mutate({ id: activeAutomationId, sendMode: "APPROVAL" })}
            >
              <Zap size={16} />
              Rodar agora
            </button>
          ) : null}
          <button
            type="button"
            className="primary-button"
            disabled={!canManage || saveAutomationMutation.isPending || !draft.messageText.trim()}
            onClick={() => saveAutomationMutation.mutate(buildPayload())}
          >
            <Save size={16} />
            {saveAutomationMutation.isPending ? "Salvando..." : "Salvar"}
          </button>
          {activeAutomationId ? (
            <button
              type="button"
              className="ghost-button danger"
              disabled={!canManage || deleteAutomationMutation.isPending}
              onClick={() => deleteAutomationMutation.mutate(activeAutomationId)}
            >
              <Trash2 size={16} />
            </button>
          ) : null}
        </div>
      </header>

      {feedbackMessage ? <div className="save-ok automation-feedback">{feedbackMessage}</div> : null}

      <section className="automation-explain-strip">
        <div>
          <strong>Cliente entrou agora</strong>
          <span>Dispara uma vez quando ele cruza para Atenção/Inativo. Bom para automação contínua.</span>
        </div>
        <div>
          <strong>Cliente já está na faixa</strong>
          <span>Pega a carteira atual inteira. Bom para campanha pontual ou para gerar aprovação diária.</span>
        </div>
        <div>
          <strong>Rodar agora</strong>
          <span>Cria uma execução na hora para testar. Por padrão, gera para aprovação antes do envio.</span>
        </div>
      </section>

      {builderMode === "visual" ? (
      <section className="automation-workbench">
        <aside className="automation-library">
          <div className="automation-library-header">
            <strong>Blocos</strong>
            <button type="button" className="ghost-button" onClick={resetForm}>
              <Plus size={15} />
              Novo
            </button>
          </div>
          {paletteItems.map((item) => (
            <button
              key={item.kind}
              type="button"
              draggable
              className="automation-palette-item"
              onDragStart={(event) => onDragStart(event, item.kind)}
              onClick={() => {
                const id = `${item.kind}-${Date.now()}`;
                setNodes((currentNodes) => [
                  ...currentNodes,
                  createNode(id, item.kind, { x: 120 + currentNodes.length * 34, y: 90 + currentNodes.length * 22 }),
                ]);
                setSelectedNodeId(id);
              }}
            >
              <span>{nodeIcon(item.kind)}</span>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </button>
          ))}

          <div className="automation-library-section">
            <strong>Modelos rapidos</strong>
            {inactivityStages.map((stage) => (
              <button
                key={stage.id}
                type="button"
                className="automation-template-button"
                onClick={() => {
                  setDraft((current) => ({
                    ...current,
                    name: `${stage.label} automatico`,
                    segmentDefinition: stageToSegmentDefinition(stage.id),
                  }));
                  setSelectedNodeId("audience");
                }}
              >
                <span>{stage.label}</span>
                <small>{stage.description}</small>
              </button>
            ))}
          </div>
        </aside>

        <main className="automation-canvas-shell" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
          >
            <Background color="#d4d8de" gap={24} size={1.5} />
            <Controls />
            <MiniMap pannable zoomable nodeStrokeWidth={3} />
          </ReactFlow>
        </main>

        <Inspector
          selectedNode={selectedNode}
          draft={draft}
          setDraft={setDraft}
          templates={templatesQuery.data}
          instances={instancesQuery.data}
          preview={previewMutation.data}
          onPreview={() => previewMutation.mutate(draft.segmentDefinition)}
        />
      </section>
      ) : (
        <ClassicAutomationForm
          draft={draft}
          setDraft={setDraft}
          templates={templatesQuery.data}
          instances={instancesQuery.data}
          preview={previewMutation.data}
          onPreview={() => previewMutation.mutate(draft.segmentDefinition)}
        />
      )}

      <section className="automation-bottom-grid">
        <article className="automation-run-panel">
          <div className="automation-section-title">
            <ShieldCheck size={18} />
            <strong>Aguardando aprovacao</strong>
          </div>
          {!pendingRuns.length ? <div className="empty-state">Nenhuma execucao pendente.</div> : null}
          {pendingRuns.map((run) => (
            <div key={run.id} className="automation-run-card">
              <strong>{run.automationName}</strong>
              <span>{formatDateTime(run.scheduledFor)}</span>
              <small>
                {formatNumber(run.mappedGroupCount)} grupos | {formatNumber(run.unmappedCustomerCount)} sem grupo |{" "}
                {formatNumber(run.blockedRecentCount)} bloqueados
              </small>
              <div className="inline-actions">
                <button type="button" className="primary-button" disabled={!canManage} onClick={() => approveRunMutation.mutate(run.id)}>
                  Aprovar
                </button>
                <button type="button" className="ghost-button danger" disabled={!canManage} onClick={() => rejectRunMutation.mutate(run.id)}>
                  Rejeitar
                </button>
              </div>
            </div>
          ))}
        </article>

        <article className="automation-run-panel">
          <div className="automation-section-title">
            <Copy size={18} />
            <strong>Automacoes salvas</strong>
          </div>
          {automationsQuery.data?.map((automation) => (
            <div key={automation.id} className="automation-saved-row">
              <button
                type="button"
                className={`automation-row-toggle ${automation.status === "ACTIVE" ? "is-active" : ""}`}
                disabled={!canManage || toggleAutomationMutation.isPending}
                onClick={() => toggleAutomationMutation.mutate(automation)}
                aria-label={automation.status === "ACTIVE" ? "Pausar automacao" : "Ativar automacao"}
              >
                <span />
              </button>
              <button type="button" className="automation-saved-main" onClick={() => openAutomation(automation)}>
                <strong>{automation.name}</strong>
                <small>
                  {automationStatusLabel(automation.status)} | {automationTriggerLabel(automation.triggerMode)} |{" "}
                  {automation.sendMode === "AUTOMATIC" ? "envia sozinho" : "pede aprovacao"} |{" "}
                  {automation.nextRunAt ? formatDateTime(automation.nextRunAt) : "sem agenda"}
                </small>
              </button>
              <button
                type="button"
                className="automation-run-now"
                disabled={!canManage || runNowMutation.isPending}
                onClick={() => runNowMutation.mutate({ id: automation.id, sendMode: "APPROVAL" })}
              >
                <Zap size={14} />
                Rodar
              </button>
            </div>
          ))}
        </article>

        <article className="automation-run-panel">
          <div className="automation-section-title">
            <RadioTower size={18} />
            <strong>Ultimas execucoes</strong>
          </div>
          {runsQuery.data?.slice(0, 8).map((run) => (
            <div key={run.id} className="automation-history-row">
              <span className={`status-badge status-${runTone(run.status)}`}>{runStatusLabel(run)}</span>
              <strong>{run.automationName}</strong>
              <small>
                {formatDateTime(run.scheduledFor)} | {formatNumber(run.mappedGroupCount)} grupos
              </small>
              {run.errorMessage ? <small>{run.errorMessage}</small> : null}
            </div>
          ))}
        </article>
      </section>
    </div>
  );
}

export function AutomationsPage() {
  return (
    <ReactFlowProvider>
      <AutomationsPageInner />
    </ReactFlowProvider>
  );
}
