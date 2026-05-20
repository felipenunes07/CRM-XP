import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addEdge, Background, Controls, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, } from "@xyflow/react";
import { AlarmClock, Bot, Clock3, Copy, Eye, GitBranch, MessageCircle, Plus, RadioTower, Save, Send, ShieldCheck, Trash2, Zap, Users, } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDateTime, formatNumber } from "../lib/format";
const inactivityStages = [
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
const defaultInactivityStage = inactivityStages[0];
const weekdayOptions = [
    { value: 1, label: "Seg" },
    { value: 2, label: "Ter" },
    { value: 3, label: "Qua" },
    { value: 4, label: "Qui" },
    { value: 5, label: "Sex" },
    { value: 6, label: "Sab" },
    { value: 0, label: "Dom" },
];
const paletteItems = [
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
function stageToSegmentDefinition(stageId) {
    const stage = inactivityStages.find((entry) => entry.id === stageId) ?? defaultInactivityStage;
    return {
        status: stage.status,
        minDaysInactive: stage.minDaysInactive,
        ...(stage.maxDaysInactive === undefined ? {} : { maxDaysInactive: stage.maxDaysInactive }),
    };
}
function stageFromSegmentDefinition(definition) {
    return (inactivityStages.find((stage) => {
        const status = definition.status?.[0];
        return (status === stage.status[0] &&
            definition.minDaysInactive === stage.minDaysInactive &&
            definition.maxDaysInactive === stage.maxDaysInactive);
    }) ?? defaultInactivityStage);
}
function createInitialDraft() {
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
function createNode(id, kind, position, title, subtitle) {
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
function createDefaultFlow(draft) {
    const stage = stageFromSegmentDefinition(draft.segmentDefinition);
    const sendLabel = draft.sendMode === "AUTOMATIC" ? "Enviar automatico" : "Aguardar aprovacao";
    const triggerLabel = draft.triggerMode === "ON_STAGE_ENTRY" ? "Quando entrar" : "Todo dia";
    const triggerSubtitle = draft.triggerMode === "ON_STAGE_ENTRY"
        ? `Confere ${draft.schedule.time}, dispara so novos`
        : `${draft.schedule.time} em Sao Paulo`;
    const nodes = [
        createNode("schedule", "schedule", { x: 40, y: 180 }, triggerLabel, triggerSubtitle),
        createNode("audience", "audience", { x: 300, y: 180 }, stage.label, stage.description),
        createNode("condition", "condition", { x: 580, y: 180 }, "Tem grupo?", "Somente grupos mapeados"),
        createNode("agent", "agent", { x: 860, y: 90 }, "Agente WhatsApp", "Instancia escolhida"),
        createNode("template", "template", { x: 860, y: 270 }, "Mensagem", "Template da automacao"),
        createNode("send", "send", { x: 1140, y: 180 }, sendLabel, "Disparo no grupo"),
    ];
    const edges = [
        { id: "schedule-audience", source: "schedule", target: "audience", animated: true },
        { id: "audience-condition", source: "audience", target: "condition", animated: true },
        { id: "condition-agent", source: "condition", target: "agent" },
        { id: "condition-template", source: "condition", target: "template" },
        { id: "agent-send", source: "agent", target: "send", animated: true },
        { id: "template-send", source: "template", target: "send", animated: true },
    ];
    return { nodes, edges };
}
function readFlowDefinition(value, fallback) {
    const flow = value;
    if (Array.isArray(flow?.nodes) && flow.nodes.length) {
        return {
            nodes: flow.nodes,
            edges: Array.isArray(flow.edges) ? flow.edges : [],
        };
    }
    return createDefaultFlow(fallback);
}
function nodeIcon(kind) {
    if (kind === "schedule")
        return _jsx(AlarmClock, { size: 20 });
    if (kind === "audience")
        return _jsx(Users, { size: 20 });
    if (kind === "condition")
        return _jsx(GitBranch, { size: 20 });
    if (kind === "agent")
        return _jsx(Bot, { size: 20 });
    if (kind === "template")
        return _jsx(MessageCircle, { size: 20 });
    if (kind === "wait")
        return _jsx(Clock3, { size: 20 });
    return _jsx(Send, { size: 20 });
}
function AutomationNode({ data, selected }) {
    const nodeData = data;
    return (_jsxs("div", { className: `automation-node automation-node-${nodeData.kind} ${selected ? "is-selected" : ""}`, children: [_jsx(Handle, { type: "target", position: Position.Left, className: "automation-handle" }), _jsx("div", { className: "automation-node-icon", children: nodeIcon(nodeData.kind) }), _jsxs("div", { className: "automation-node-copy", children: [_jsx("strong", { children: nodeData.title }), _jsx("span", { children: nodeData.subtitle }), nodeData.detail ? _jsx("small", { children: nodeData.detail }) : null] }), _jsx(Handle, { type: "source", position: Position.Right, className: "automation-handle" })] }));
}
function automationStatusLabel(status) {
    return status === "ACTIVE" ? "Ativa" : "Pausada";
}
function automationTriggerLabel(triggerMode) {
    return triggerMode === "ON_STAGE_ENTRY" ? "Cliente entrou agora na faixa" : "Clientes que ja estao na faixa";
}
function runStatusLabel(run) {
    if (run.status === "PENDING_APPROVAL")
        return "Aguardando aprovacao";
    if (run.status === "ENQUEUED")
        return "Enfileirada";
    if (run.status === "APPROVED")
        return "Aprovada";
    if (run.status === "NO_MATCH")
        return "Sem grupos";
    if (run.status === "REJECTED")
        return "Rejeitada";
    return "Falhou";
}
function runTone(status) {
    if (status === "ENQUEUED" || status === "APPROVED")
        return "success";
    if (status === "FAILED" || status === "REJECTED")
        return "danger";
    return "warning";
}
function Inspector({ selectedNode, draft, setDraft, templates, instances, preview, onPreview, }) {
    const kind = selectedNode?.data.kind ?? "audience";
    const stage = stageFromSegmentDefinition(draft.segmentDefinition);
    return (_jsxs("aside", { className: "automation-inspector", children: [_jsxs("div", { className: "automation-inspector-header", children: [_jsx("span", { children: nodeIcon(kind) }), _jsxs("div", { children: [_jsx("strong", { children: selectedNode?.data.title ?? "Publico" }), _jsx("small", { children: selectedNode?.data.subtitle ?? "Selecione uma etapa no canvas" })] })] }), kind === "schedule" ? (_jsxs("div", { className: "automation-field-stack", children: [_jsxs("label", { children: ["Tipo de gatilho", _jsxs("select", { value: draft.triggerMode, onChange: (event) => setDraft((current) => ({
                                    ...current,
                                    triggerMode: event.target.value,
                                })), children: [_jsx("option", { value: "ON_STAGE_ENTRY", children: "Cliente entrou agora na faixa" }), _jsx("option", { value: "SCHEDULED", children: "Clientes que ja estao na faixa" })] })] }), _jsxs("div", { className: "automation-mini-metrics", children: [_jsx("span", { children: draft.triggerMode === "ON_STAGE_ENTRY" ? "Como funciona" : "Modelo antigo" }), _jsx("strong", { children: draft.triggerMode === "ON_STAGE_ENTRY"
                                    ? "Confere no horario, mas envia so uma vez para cada cliente que acabou de entrar."
                                    : "Usa todos os clientes que ja estao nesse publico. Ideal para rodar manual ou aprovar antes." })] }), _jsxs("label", { children: ["Conferir quando", _jsxs("select", { value: draft.schedule.frequency, onChange: (event) => setDraft((current) => ({
                                    ...current,
                                    schedule: {
                                        ...current.schedule,
                                        frequency: event.target.value,
                                        weekdays: event.target.value === "WEEKLY" ? current.schedule.weekdays ?? [1] : undefined,
                                    },
                                })), children: [_jsx("option", { value: "DAILY", children: "Diaria" }), _jsx("option", { value: "WEEKLY", children: "Semanal" })] })] }), _jsxs("label", { children: ["Horario", _jsx("input", { type: "time", value: draft.schedule.time, onChange: (event) => setDraft((current) => ({
                                    ...current,
                                    schedule: { ...current.schedule, time: event.target.value },
                                })) })] }), draft.schedule.frequency === "WEEKLY" ? (_jsx("div", { className: "automation-weekdays", children: weekdayOptions.map((weekday) => {
                            const active = draft.schedule.weekdays?.includes(weekday.value) ?? false;
                            return (_jsx("button", { type: "button", className: active ? "is-active" : "", onClick: () => setDraft((current) => {
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
                                }), children: weekday.label }, weekday.value));
                        }) })) : null] })) : null, kind === "audience" ? (_jsxs("div", { className: "automation-field-stack", children: [_jsx("div", { className: "automation-stage-grid", children: inactivityStages.map((item) => (_jsxs("button", { type: "button", className: item.id === stage.id ? "is-active" : "", onClick: () => setDraft((current) => ({
                                ...current,
                                segmentDefinition: stageToSegmentDefinition(item.id),
                                name: current.name || `${item.label} automatico`,
                            })), children: [_jsx("strong", { children: item.label }), _jsx("span", { children: item.description })] }, item.id))) }), _jsxs("button", { type: "button", className: "secondary-button", onClick: onPreview, children: [_jsx(Eye, { size: 16 }), "Ver clientes agora"] }), _jsxs("div", { className: "automation-mini-metrics", children: [_jsx("span", { children: "Clientes encontrados" }), _jsx("strong", { children: preview ? formatNumber(preview.summary.totalCustomers) : "--" })] })] })) : null, kind === "agent" ? (_jsxs("div", { className: "automation-field-stack", children: [_jsxs("label", { children: ["Agente WhatsApp", _jsxs("select", { value: draft.whatsappInstanceId ?? "", onChange: (event) => setDraft((current) => ({
                                    ...current,
                                    whatsappInstanceId: event.target.value || null,
                                })), children: [_jsx("option", { value: "", children: "Instancia padrao" }), instances?.map((instance) => (_jsxs("option", { value: instance.id, children: [instance.displayLabel, " ", instance.phoneNumber ? `- ${instance.phoneNumber}` : ""] }, instance.id)))] })] }), _jsxs("div", { className: "automation-mini-metrics", children: [_jsx("span", { children: "Agente selecionado" }), _jsx("strong", { children: instances?.find((instance) => instance.id === draft.whatsappInstanceId)?.displayLabel ?? "Instancia padrao" })] })] })) : null, kind === "template" ? (_jsxs("div", { className: "automation-field-stack", children: [_jsxs("label", { children: ["Template", _jsxs("select", { value: draft.templateId ?? "", onChange: (event) => {
                                    const template = templates?.find((entry) => entry.id === event.target.value);
                                    setDraft((current) => ({
                                        ...current,
                                        templateId: event.target.value || null,
                                        messageText: template?.content ?? current.messageText,
                                    }));
                                }, children: [_jsx("option", { value: "", children: "Mensagem livre" }), templates?.map((template) => (_jsx("option", { value: template.id, children: template.title }, template.id)))] })] }), _jsxs("label", { children: ["Mensagem", _jsx("textarea", { rows: 7, value: draft.messageText, onChange: (event) => setDraft((current) => ({
                                    ...current,
                                    messageText: event.target.value,
                                })), placeholder: "Digite a mensagem que sera enviada no grupo do cliente." })] })] })) : null, kind === "send" ? (_jsxs("div", { className: "automation-field-stack", children: [_jsxs("label", { children: ["Modo do envio", _jsxs("select", { value: draft.sendMode, onChange: (event) => setDraft((current) => ({
                                    ...current,
                                    sendMode: event.target.value,
                                })), children: [_jsx("option", { value: "AUTOMATIC", children: "Enviar sozinho automaticamente" }), _jsx("option", { value: "APPROVAL", children: "Gerar para eu aprovar" })] })] }), _jsxs("label", { className: "automation-check-row", children: [_jsx("input", { type: "checkbox", checked: draft.overrideRecentBlock, onChange: (event) => setDraft((current) => ({
                                    ...current,
                                    overrideRecentBlock: event.target.checked,
                                })) }), "Ignorar bloqueio recente"] }), _jsxs("div", { className: "automation-delay-grid", children: [_jsxs("label", { children: ["Min. segundos", _jsx("input", { type: "number", min: 1, value: draft.minDelaySeconds, onChange: (event) => setDraft((current) => ({
                                            ...current,
                                            minDelaySeconds: Number(event.target.value || 1),
                                        })) })] }), _jsxs("label", { children: ["Max. segundos", _jsx("input", { type: "number", min: 1, value: draft.maxDelaySeconds, onChange: (event) => setDraft((current) => ({
                                            ...current,
                                            maxDelaySeconds: Number(event.target.value || 1),
                                        })) })] })] })] })) : null, kind === "condition" ? (_jsxs("div", { className: "automation-field-stack", children: [_jsxs("div", { className: "automation-mini-metrics", children: [_jsx("span", { children: "Condicao ativa" }), _jsx("strong", { children: "Grupo AUTO ou MANUAL" })] }), _jsxs("div", { className: "automation-mini-metrics", children: [_jsx("span", { children: "Sem grupo" }), _jsx("strong", { children: preview ? "Separado no disparo" : "--" })] })] })) : null] }));
}
function ClassicAutomationForm({ draft, setDraft, templates, instances, preview, onPreview, }) {
    const stage = stageFromSegmentDefinition(draft.segmentDefinition);
    return (_jsxs("section", { className: "automation-classic-panel", children: [_jsxs("div", { className: "automation-classic-intro", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Modo classico" }), _jsx("h3", { children: "Formulario simples da automacao" })] }), _jsx("span", { children: "Use este modo para configurar sem canvas. Ele salva a mesma automacao do modo visual." })] }), _jsxs("div", { className: "automation-classic-grid", children: [_jsxs("label", { children: ["Tipo de gatilho", _jsxs("select", { value: draft.triggerMode, onChange: (event) => setDraft((current) => ({ ...current, triggerMode: event.target.value })), children: [_jsx("option", { value: "ON_STAGE_ENTRY", children: "Cliente entrou agora na faixa" }), _jsx("option", { value: "SCHEDULED", children: "Clientes que ja estao na faixa" })] })] }), _jsxs("label", { children: ["Publico", _jsx("select", { value: stage.id, onChange: (event) => setDraft((current) => ({
                                    ...current,
                                    segmentDefinition: stageToSegmentDefinition(event.target.value),
                                })), children: inactivityStages.map((item) => (_jsxs("option", { value: item.id, children: [item.label, " - ", item.description] }, item.id))) })] }), _jsxs("label", { children: ["Frequencia da verificacao", _jsxs("select", { value: draft.schedule.frequency, onChange: (event) => setDraft((current) => ({
                                    ...current,
                                    schedule: {
                                        ...current.schedule,
                                        frequency: event.target.value,
                                        weekdays: event.target.value === "WEEKLY" ? current.schedule.weekdays ?? [1] : undefined,
                                    },
                                })), children: [_jsx("option", { value: "DAILY", children: "Diaria" }), _jsx("option", { value: "WEEKLY", children: "Semanal" })] })] }), _jsxs("label", { children: ["Horario", _jsx("input", { type: "time", value: draft.schedule.time, onChange: (event) => setDraft((current) => ({ ...current, schedule: { ...current.schedule, time: event.target.value } })) })] }), _jsxs("label", { children: ["Agente WhatsApp", _jsxs("select", { value: draft.whatsappInstanceId ?? "", onChange: (event) => setDraft((current) => ({ ...current, whatsappInstanceId: event.target.value || null })), children: [_jsx("option", { value: "", children: "Instancia padrao" }), instances?.map((instance) => (_jsxs("option", { value: instance.id, children: [instance.displayLabel, " ", instance.phoneNumber ? `- ${instance.phoneNumber}` : ""] }, instance.id)))] })] }), _jsxs("label", { children: ["Modo do envio", _jsxs("select", { value: draft.sendMode, onChange: (event) => setDraft((current) => ({ ...current, sendMode: event.target.value })), children: [_jsx("option", { value: "AUTOMATIC", children: "Enviar sozinho automaticamente" }), _jsx("option", { value: "APPROVAL", children: "Gerar para eu aprovar" })] })] }), _jsxs("label", { children: ["Template", _jsxs("select", { value: draft.templateId ?? "", onChange: (event) => {
                                    const template = templates?.find((entry) => entry.id === event.target.value);
                                    setDraft((current) => ({
                                        ...current,
                                        templateId: event.target.value || null,
                                        messageText: template?.content ?? current.messageText,
                                    }));
                                }, children: [_jsx("option", { value: "", children: "Mensagem livre" }), templates?.map((template) => (_jsx("option", { value: template.id, children: template.title }, template.id)))] })] }), _jsxs("label", { className: "automation-check-row automation-classic-check", children: [_jsx("input", { type: "checkbox", checked: draft.overrideRecentBlock, onChange: (event) => setDraft((current) => ({ ...current, overrideRecentBlock: event.target.checked })) }), "Ignorar bloqueio recente"] })] }), _jsxs("label", { className: "automation-classic-message", children: ["Mensagem", _jsx("textarea", { rows: 7, value: draft.messageText, onChange: (event) => setDraft((current) => ({ ...current, messageText: event.target.value })), placeholder: "Digite a mensagem que sera enviada no grupo do cliente." })] }), _jsxs("div", { className: "automation-classic-footer", children: [_jsxs("button", { type: "button", className: "secondary-button", onClick: onPreview, children: [_jsx(Eye, { size: 16 }), "Ver clientes agora"] }), _jsxs("div", { className: "automation-mini-metrics", children: [_jsx("span", { children: "Clientes encontrados" }), _jsx("strong", { children: preview ? formatNumber(preview.summary.totalCustomers) : "--" })] }), _jsxs("div", { className: "automation-mini-metrics", children: [_jsx("span", { children: "Regra do gatilho" }), _jsx("strong", { children: draft.triggerMode === "ON_STAGE_ENTRY"
                                    ? "Envia uma vez quando entrar nessa faixa."
                                    : "Repete para o publico no horario configurado." })] })] })] }));
}
function automationToDraft(automation) {
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
    const [draft, setDraft] = useState(createInitialDraft);
    const [activeAutomationId, setActiveAutomationId] = useState(null);
    const [builderMode, setBuilderMode] = useState("visual");
    const [selectedNodeId, setSelectedNodeId] = useState("audience");
    const [feedbackMessage, setFeedbackMessage] = useState("");
    const initialFlow = useMemo(() => createDefaultFlow(draft), []);
    const [nodes, setNodes, onNodesChange] = useNodesState(initialFlow.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow.edges);
    const templatesQuery = useQuery({
        queryKey: ["message-templates"],
        queryFn: () => api.messageTemplates(token),
        enabled: Boolean(token),
    });
    const instancesQuery = useQuery({
        queryKey: ["whatsapp-instances"],
        queryFn: () => api.whatsappInstances(token),
        enabled: Boolean(token),
    });
    const automationsQuery = useQuery({
        queryKey: ["automations"],
        queryFn: () => api.automations(token),
        enabled: Boolean(token),
    });
    const runsQuery = useQuery({
        queryKey: ["automation-runs"],
        queryFn: () => api.automationRuns(token, 100),
        enabled: Boolean(token),
        refetchInterval: 15000,
    });
    const previewMutation = useMutation({
        mutationFn: (definition) => api.previewSegment(token, definition),
    });
    const saveAutomationMutation = useMutation({
        mutationFn: (input) => activeAutomationId ? api.updateAutomation(token, activeAutomationId, input) : api.createAutomation(token, input),
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
        mutationFn: (id) => api.deleteAutomation(token, id),
        onSuccess: async () => {
            resetForm();
            setFeedbackMessage("Automacao excluida.");
            await queryClient.invalidateQueries({ queryKey: ["automations"] });
        },
    });
    const toggleAutomationMutation = useMutation({
        mutationFn: (automation) => api.updateAutomation(token, automation.id, {
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
        mutationFn: ({ id, sendMode }) => api.runAutomationNow(token, id, sendMode),
        onSuccess: async (run) => {
            setFeedbackMessage(run.status === "PENDING_APPROVAL"
                ? "Execucao criada para sua aprovacao."
                : run.status === "ENQUEUED"
                    ? "Execucao rodada agora e campanha enfileirada."
                    : "Execucao rodada agora.");
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["automation-runs"] }),
                queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
            ]);
        },
    });
    const approveRunMutation = useMutation({
        mutationFn: (id) => api.approveAutomationRun(token, id),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["automation-runs"] }),
                queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
            ]);
        },
    });
    const rejectRunMutation = useMutation({
        mutationFn: (id) => api.rejectAutomationRun(token, id),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["automation-runs"] });
        },
    });
    const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
    const pendingRuns = useMemo(() => (runsQuery.data ?? []).filter((run) => run.status === "PENDING_APPROVAL"), [runsQuery.data]);
    useEffect(() => {
        const stage = stageFromSegmentDefinition(draft.segmentDefinition);
        const selectedInstance = instancesQuery.data?.find((instance) => instance.id === draft.whatsappInstanceId);
        const selectedTemplate = templatesQuery.data?.find((template) => template.id === draft.templateId);
        setNodes((currentNodes) => currentNodes.map((node) => {
            if (node.data.kind === "schedule") {
                return {
                    ...node,
                    data: {
                        ...node.data,
                        title: draft.triggerMode === "ON_STAGE_ENTRY" ? "Quando entrar" : draft.schedule.frequency === "DAILY" ? "Todo dia" : "Semanal",
                        subtitle: draft.triggerMode === "ON_STAGE_ENTRY"
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
        }));
    }, [draft, instancesQuery.data, templatesQuery.data, setNodes]);
    function buildPayload() {
        return {
            ...draft,
            flowDefinition: { nodes, edges },
        };
    }
    function openAutomation(automation) {
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
    const onConnect = useCallback((connection) => setEdges((currentEdges) => addEdge({ ...connection, animated: true }, currentEdges)), [setEdges]);
    const onDragStart = (event, kind) => {
        event.dataTransfer.setData("application/automation-node", kind);
        event.dataTransfer.effectAllowed = "move";
    };
    const onDrop = useCallback((event) => {
        event.preventDefault();
        const kind = event.dataTransfer.getData("application/automation-node");
        if (!kind)
            return;
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
    }, [setNodes]);
    return (_jsxs("div", { className: "automation-page", children: [_jsxs("header", { className: "automation-topbar", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Automacoes" }), _jsx("h2", { children: builderMode === "visual" ? "Construtor visual" : "Formulario classico" })] }), _jsxs("div", { className: "automation-name-box", children: [_jsx("input", { value: draft.name, onChange: (event) => setDraft((current) => ({ ...current, name: event.target.value })), placeholder: "Nome da automacao" }), _jsxs("button", { type: "button", className: `automation-status-toggle ${draft.status === "ACTIVE" ? "is-active" : ""}`, onClick: () => setDraft((current) => ({
                                    ...current,
                                    status: current.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                                })), children: [_jsx("span", {}), draft.status === "ACTIVE" ? "Ativa" : "Pausada"] })] }), _jsxs("div", { className: "automation-topbar-actions", children: [_jsxs("div", { className: "automation-mode-toggle", "aria-label": "Modo de criacao", children: [_jsx("button", { type: "button", className: builderMode === "visual" ? "is-active" : "", onClick: () => setBuilderMode("visual"), children: "Visual" }), _jsx("button", { type: "button", className: builderMode === "classic" ? "is-active" : "", onClick: () => setBuilderMode("classic"), children: "Classico" })] }), _jsxs("button", { type: "button", className: "secondary-button", onClick: () => previewMutation.mutate(draft.segmentDefinition), children: [_jsx(Eye, { size: 16 }), "Testar"] }), activeAutomationId ? (_jsxs("button", { type: "button", className: "secondary-button", disabled: !canManage || runNowMutation.isPending, onClick: () => runNowMutation.mutate({ id: activeAutomationId, sendMode: "APPROVAL" }), children: [_jsx(Zap, { size: 16 }), "Rodar agora"] })) : null, _jsxs("button", { type: "button", className: "primary-button", disabled: !canManage || saveAutomationMutation.isPending || !draft.messageText.trim(), onClick: () => saveAutomationMutation.mutate(buildPayload()), children: [_jsx(Save, { size: 16 }), saveAutomationMutation.isPending ? "Salvando..." : "Salvar"] }), activeAutomationId ? (_jsx("button", { type: "button", className: "ghost-button danger", disabled: !canManage || deleteAutomationMutation.isPending, onClick: () => deleteAutomationMutation.mutate(activeAutomationId), children: _jsx(Trash2, { size: 16 }) })) : null] })] }), feedbackMessage ? _jsx("div", { className: "save-ok automation-feedback", children: feedbackMessage }) : null, _jsxs("section", { className: "automation-explain-strip", children: [_jsxs("div", { children: [_jsx("strong", { children: "Cliente entrou agora" }), _jsx("span", { children: "Dispara uma vez quando ele cruza para Aten\u00E7\u00E3o/Inativo. Bom para automa\u00E7\u00E3o cont\u00EDnua." })] }), _jsxs("div", { children: [_jsx("strong", { children: "Cliente j\u00E1 est\u00E1 na faixa" }), _jsx("span", { children: "Pega a carteira atual inteira. Bom para campanha pontual ou para gerar aprova\u00E7\u00E3o di\u00E1ria." })] }), _jsxs("div", { children: [_jsx("strong", { children: "Rodar agora" }), _jsx("span", { children: "Cria uma execu\u00E7\u00E3o na hora para testar. Por padr\u00E3o, gera para aprova\u00E7\u00E3o antes do envio." })] })] }), builderMode === "visual" ? (_jsxs("section", { className: "automation-workbench", children: [_jsxs("aside", { className: "automation-library", children: [_jsxs("div", { className: "automation-library-header", children: [_jsx("strong", { children: "Blocos" }), _jsxs("button", { type: "button", className: "ghost-button", onClick: resetForm, children: [_jsx(Plus, { size: 15 }), "Novo"] })] }), paletteItems.map((item) => (_jsxs("button", { type: "button", draggable: true, className: "automation-palette-item", onDragStart: (event) => onDragStart(event, item.kind), onClick: () => {
                                    const id = `${item.kind}-${Date.now()}`;
                                    setNodes((currentNodes) => [
                                        ...currentNodes,
                                        createNode(id, item.kind, { x: 120 + currentNodes.length * 34, y: 90 + currentNodes.length * 22 }),
                                    ]);
                                    setSelectedNodeId(id);
                                }, children: [_jsx("span", { children: nodeIcon(item.kind) }), _jsx("strong", { children: item.title }), _jsx("small", { children: item.subtitle })] }, item.kind))), _jsxs("div", { className: "automation-library-section", children: [_jsx("strong", { children: "Modelos rapidos" }), inactivityStages.map((stage) => (_jsxs("button", { type: "button", className: "automation-template-button", onClick: () => {
                                            setDraft((current) => ({
                                                ...current,
                                                name: `${stage.label} automatico`,
                                                segmentDefinition: stageToSegmentDefinition(stage.id),
                                            }));
                                            setSelectedNodeId("audience");
                                        }, children: [_jsx("span", { children: stage.label }), _jsx("small", { children: stage.description })] }, stage.id)))] })] }), _jsx("main", { className: "automation-canvas-shell", onDrop: onDrop, onDragOver: (event) => event.preventDefault(), children: _jsxs(ReactFlow, { nodes: nodes, edges: edges, onNodesChange: onNodesChange, onEdgesChange: onEdgesChange, onConnect: onConnect, nodeTypes: nodeTypes, fitView: true, onNodeClick: (_, node) => setSelectedNodeId(node.id), onPaneClick: () => setSelectedNodeId(null), children: [_jsx(Background, { color: "#d4d8de", gap: 24, size: 1.5 }), _jsx(Controls, {}), _jsx(MiniMap, { pannable: true, zoomable: true, nodeStrokeWidth: 3 })] }) }), _jsx(Inspector, { selectedNode: selectedNode, draft: draft, setDraft: setDraft, templates: templatesQuery.data, instances: instancesQuery.data, preview: previewMutation.data, onPreview: () => previewMutation.mutate(draft.segmentDefinition) })] })) : (_jsx(ClassicAutomationForm, { draft: draft, setDraft: setDraft, templates: templatesQuery.data, instances: instancesQuery.data, preview: previewMutation.data, onPreview: () => previewMutation.mutate(draft.segmentDefinition) })), _jsxs("section", { className: "automation-bottom-grid", children: [_jsxs("article", { className: "automation-run-panel", children: [_jsxs("div", { className: "automation-section-title", children: [_jsx(ShieldCheck, { size: 18 }), _jsx("strong", { children: "Aguardando aprovacao" })] }), !pendingRuns.length ? _jsx("div", { className: "empty-state", children: "Nenhuma execucao pendente." }) : null, pendingRuns.map((run) => (_jsxs("div", { className: "automation-run-card", children: [_jsx("strong", { children: run.automationName }), _jsx("span", { children: formatDateTime(run.scheduledFor) }), _jsxs("small", { children: [formatNumber(run.mappedGroupCount), " grupos | ", formatNumber(run.unmappedCustomerCount), " sem grupo |", " ", formatNumber(run.blockedRecentCount), " bloqueados"] }), _jsxs("div", { className: "inline-actions", children: [_jsx("button", { type: "button", className: "primary-button", disabled: !canManage, onClick: () => approveRunMutation.mutate(run.id), children: "Aprovar" }), _jsx("button", { type: "button", className: "ghost-button danger", disabled: !canManage, onClick: () => rejectRunMutation.mutate(run.id), children: "Rejeitar" })] })] }, run.id)))] }), _jsxs("article", { className: "automation-run-panel", children: [_jsxs("div", { className: "automation-section-title", children: [_jsx(Copy, { size: 18 }), _jsx("strong", { children: "Automacoes salvas" })] }), automationsQuery.data?.map((automation) => (_jsxs("div", { className: "automation-saved-row", children: [_jsx("button", { type: "button", className: `automation-row-toggle ${automation.status === "ACTIVE" ? "is-active" : ""}`, disabled: !canManage || toggleAutomationMutation.isPending, onClick: () => toggleAutomationMutation.mutate(automation), "aria-label": automation.status === "ACTIVE" ? "Pausar automacao" : "Ativar automacao", children: _jsx("span", {}) }), _jsxs("button", { type: "button", className: "automation-saved-main", onClick: () => openAutomation(automation), children: [_jsx("strong", { children: automation.name }), _jsxs("small", { children: [automationStatusLabel(automation.status), " | ", automationTriggerLabel(automation.triggerMode), " |", " ", automation.sendMode === "AUTOMATIC" ? "envia sozinho" : "pede aprovacao", " |", " ", automation.nextRunAt ? formatDateTime(automation.nextRunAt) : "sem agenda"] })] }), _jsxs("button", { type: "button", className: "automation-run-now", disabled: !canManage || runNowMutation.isPending, onClick: () => runNowMutation.mutate({ id: automation.id, sendMode: "APPROVAL" }), children: [_jsx(Zap, { size: 14 }), "Rodar"] })] }, automation.id)))] }), _jsxs("article", { className: "automation-run-panel", children: [_jsxs("div", { className: "automation-section-title", children: [_jsx(RadioTower, { size: 18 }), _jsx("strong", { children: "Ultimas execucoes" })] }), runsQuery.data?.slice(0, 8).map((run) => (_jsxs("div", { className: "automation-history-row", children: [_jsx("span", { className: `status-badge status-${runTone(run.status)}`, children: runStatusLabel(run) }), _jsx("strong", { children: run.automationName }), _jsxs("small", { children: [formatDateTime(run.scheduledFor), " | ", formatNumber(run.mappedGroupCount), " grupos"] }), run.errorMessage ? _jsx("small", { children: run.errorMessage }) : null] }, run.id)))] })] })] }));
}
export function AutomationsPage() {
    return (_jsx(ReactFlowProvider, { children: _jsx(AutomationsPageInner, {}) }));
}
