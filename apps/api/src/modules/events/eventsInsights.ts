import type {
  EventSeverity,
  EventType,
  EventsAiBatchStatus,
  EventsIntelligenceResponse,
  MessageEvent,
  MessageInsightTheme,
} from "@olist-crm/shared";

type ThemeCategory = "negative" | "positive" | "opportunity" | "risk";

interface TopicRule {
  key: string;
  title: string;
  category: ThemeCategory;
  severity: EventSeverity;
  phrases: string[];
  eventTypes?: EventType[];
}

const TOPIC_RULES: TopicRule[] = [
  {
    key: "stock_shortage",
    title: "Falta de estoque",
    category: "negative",
    severity: "HIGH",
    phrases: ["faltando estoque", "falta estoque", "sem estoque", "nao tem estoque", "acabou estoque", "produto em falta"],
    eventTypes: ["COMPLAINT", "NEGATIVE_FEEDBACK"],
  },
  {
    key: "screen_quality",
    title: "Problema em tela ou display",
    category: "negative",
    severity: "HIGH",
    phrases: ["tela", "display", "lcd", "touch", "mancha", "defeito", "quebrado", "nao funciona", "veio ruim"],
    eventTypes: ["COMPLAINT", "NEGATIVE_FEEDBACK"],
  },
  {
    key: "delivery_delay",
    title: "Atraso ou entrega",
    category: "negative",
    severity: "MODERATE",
    phrases: ["atrasou", "nao chegou", "entrega", "transportadora", "correios", "prazo", "rastreio", "demora pedido"],
    eventTypes: ["COMPLAINT", "NEGATIVE_FEEDBACK"],
  },
  {
    key: "service_delay",
    title: "Demora no atendimento",
    category: "negative",
    severity: "MODERATE",
    phrases: ["sem retorno", "sem resposta", "ninguem responde", "demora atendimento", "atendimento lento", "nao respondeu"],
    eventTypes: ["COMPLAINT", "NEGATIVE_FEEDBACK"],
  },
  {
    key: "price_objection",
    title: "Objecao de preco",
    category: "risk",
    severity: "HIGH",
    phrases: ["muito caro", "ta caro", "mais barato", "concorrente", "desconto", "cobriu o preco", "outro fornecedor"],
    eventTypes: ["CHURN_RISK", "NEGATIVE_FEEDBACK"],
  },
  {
    key: "sales_demand",
    title: "Demanda comercial",
    category: "opportunity",
    severity: "MODERATE",
    phrases: ["orcamento", "catalogo", "atacado", "frete", "valor", "preco", "tem tela", "tem peca", "disponivel"],
    eventTypes: ["SALES_OPPORTUNITY", "QUESTION"],
  },
  {
    key: "praise",
    title: "Feedback positivo",
    category: "positive",
    severity: "LOW",
    phrases: ["excelente", "perfeito", "show de bola", "obrigado", "obrigada", "muito bom", "top", "parabens", "gostei"],
    eventTypes: ["PRAISE", "POSITIVE_FEEDBACK"],
  },
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesPhrase(normalized: string, phrase: string) {
  const escaped = normalize(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, "u").test(normalized);
}

function isNegativeType(eventType: EventType) {
  return ["RISK", "ESCALATION", "COMPLAINT", "NEGATIVE_FEEDBACK", "CHURN_RISK"].includes(eventType);
}

function isPositiveType(eventType: EventType) {
  return ["PRAISE", "POSITIVE_FEEDBACK"].includes(eventType);
}

function severityRank(severity: EventSeverity) {
  return { LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 }[severity] ?? 1;
}

function strongerSeverity(a: EventSeverity, b: EventSeverity): EventSeverity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

export function detectEventTopics(event: MessageEvent): TopicRule[] {
  const normalized = normalize(event.content);
  const matched = TOPIC_RULES.filter((rule) => {
    const matchesType = rule.eventTypes?.includes(event.eventType) ?? false;
    const matchesText = rule.phrases.some((phrase) => matchesPhrase(normalized, phrase));

    if (rule.key === "screen_quality") {
      return matchesText && (isNegativeType(event.eventType) || normalized.includes("defeito") || normalized.includes("problema"));
    }

    return matchesType || matchesText;
  });

  if (matched.length > 0) {
    return matched;
  }

  if (isPositiveType(event.eventType)) {
    return [TOPIC_RULES.find((rule) => rule.key === "praise")!];
  }

  if (event.eventType === "SALES_OPPORTUNITY" || event.eventType === "QUESTION") {
    return [TOPIC_RULES.find((rule) => rule.key === "sales_demand")!];
  }

  return [{
    key: "other_attention",
    title: "Outros pontos de atencao",
    category: isNegativeType(event.eventType) ? "negative" : "risk",
    severity: event.severity,
    phrases: [],
  }];
}

function makeExample(event: MessageEvent) {
  return {
    eventId: event.id,
    dealId: event.dealId,
    content: event.content,
    contactName: event.conversationContext?.contactName ?? "Cliente desconhecido",
    agentName: event.conversationContext?.agentName ?? null,
    detectedAt: event.detectedAt,
    isGroup: Boolean(event.conversationContext?.isGroup),
  };
}

export function buildEventsIntelligence(
  events: MessageEvent[],
  options: {
    generatedAt: string;
    period: { from: string; to: string };
    aiBatch: EventsAiBatchStatus | null;
  },
): EventsIntelligenceResponse {
  const themes = new Map<string, MessageInsightTheme>();
  const maxThemeExamples = 40;

  for (const event of events) {
    for (const topic of detectEventTopics(event)) {
      const current = themes.get(topic.key);
      if (!current) {
        themes.set(topic.key, {
          key: topic.key,
          title: topic.title,
          category: topic.category,
          severity: strongerSeverity(topic.severity, event.severity),
          count: 1,
          sampleCount: 1,
          unresolvedCount: event.resolvedAt ? 0 : 1,
          groupCount: event.conversationContext?.isGroup ? 1 : 0,
          privateCount: event.conversationContext?.isGroup ? 0 : 1,
          examples: [makeExample(event)],
          lastDetectedAt: event.detectedAt,
        });
        continue;
      }

      current.count += 1;
      current.unresolvedCount += event.resolvedAt ? 0 : 1;
      current.groupCount += event.conversationContext?.isGroup ? 1 : 0;
      current.privateCount += event.conversationContext?.isGroup ? 0 : 1;
      current.severity = strongerSeverity(current.severity, event.severity);
      current.lastDetectedAt = current.lastDetectedAt > event.detectedAt ? current.lastDetectedAt : event.detectedAt;
      if (current.examples.length < maxThemeExamples) {
        current.examples.push(makeExample(event));
        current.sampleCount = current.examples.length;
      }
    }
  }

  const topThemes = Array.from(themes.values()).sort((a, b) => {
    const severityDelta = severityRank(b.severity) - severityRank(a.severity);
    return severityDelta || b.count - a.count || b.unresolvedCount - a.unresolvedCount;
  });

  const criticalAlerts = events
    .filter((event) => !event.resolvedAt && ["CRITICAL", "HIGH"].includes(event.severity))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 8)
    .map((event) => ({
      eventId: event.id,
      title: event.label,
      severity: event.severity,
      content: event.content,
      contactName: event.conversationContext?.contactName ?? "Cliente desconhecido",
      agentName: event.conversationContext?.agentName ?? null,
      detectedAt: event.detectedAt,
      isGroup: Boolean(event.conversationContext?.isGroup),
    }));

  const positiveSignals = events.filter((event) => isPositiveType(event.eventType)).length;
  const negativeSignals = events.filter((event) => isNegativeType(event.eventType)).length;
  const opportunities = events.filter((event) => event.eventType === "SALES_OPPORTUNITY").length;
  const criticalOpen = events.filter((event) => !event.resolvedAt && event.severity === "CRITICAL").length;
  const groups = events.filter((event) => event.conversationContext?.isGroup).length;
  const privateCount = events.length - groups;

  const topThemeText = topThemes[0]
    ? `Tema principal: ${topThemes[0].title} (${topThemes[0].count} ocorrencias).`
    : "Nenhum tema recorrente no periodo.";

  return {
    generatedAt: options.generatedAt,
    period: options.period,
    executiveSummary: `${events.length} eventos analisados. ${negativeSignals} sinais negativos, ${positiveSignals} sinais positivos e ${opportunities} oportunidades comerciais. ${topThemeText}`,
    summary: {
      totalEvents: events.length,
      criticalOpen,
      negativeSignals,
      positiveSignals,
      opportunities,
      unresolvedEvents: events.filter((event) => !event.resolvedAt).length,
    },
    sourceSplit: {
      groups,
      private: privateCount,
    },
    topThemes,
    criticalAlerts,
    aiBatch: options.aiBatch,
  };
}
