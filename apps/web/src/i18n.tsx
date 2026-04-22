import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { setFormattingLocale } from "./lib/format";

export type UiLanguage = "pt-BR" | "zh-CN";

type TranslationRule = {
  pattern: RegExp;
  replace: (...matches: string[]) => string;
};

type UiLanguageContextValue = {
  language: UiLanguage;
  locale: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  tx: (pt: string, zh: string) => string;
};

const STORAGE_KEY = "xp-crm-ui-language";

const exactTranslations: Record<string, string> = {
  Dashboard: "仪表盘",
  Metas: "目标",
  Atendentes: "销售团队",
  Clientes: "客户",
  Estoque: "库存",
  Embaixadores: "品牌大使",
  Segmentos: "分群",
  Agenda: "日程",
  "Clientes novos": "新客户",
  Reativacao: "唤醒",
  "Ideias/Votacao": "想法/投票",
  Mensagens: "消息模板",
  Disparador: "批量发送",
  Prospeccao: "获客开发",
  Rotulos: "标签",
  Jan: "1月",
  Fev: "2月",
  Mar: "3月",
  Abr: "4月",
  Mai: "5月",
  Jun: "6月",
  Jul: "7月",
  Ago: "8月",
  Set: "9月",
  Out: "10月",
  Nov: "11月",
  Dez: "12月",
  "Carregando tela...": "正在加载页面...",
  "Sessao interna": "内部会话",
  "Usuario interno": "内部用户",
  "Sem perfil": "未设置角色",
  "Operacao comercial": "销售运营",
  "Saude da carteira de clientes XP": "XP 客户池健康度",
  "Abrir agenda do dia": "打开今日日程",
  "Sincronizando...": "同步中...",
  "Sincronizar Agora": "立即同步",
  "Ultima sincronizacao": "最近同步",
  "Pendente...": "待处理...",
  "Meta do mes": "本月目标",
  Definir: "设置",
  "Tempo medio de compra": "平均购买周期",
  dias: "天",
  "Total de clientes": "客户总数",
  "Base comercial consolidada": "已汇总的销售客户池",
  "Clientes ativos": "活跃客户",
  "Clientes dentro da zona ativa": "处于活跃区间的客户",
  "Clientes em atencao": "关注客户",
  "Clientes pedindo monitoramento": "需要持续跟进的客户",
  "Clientes inativos": "沉默客户",
  "Clientes fora da zona ativa": "已离开活跃区间的客户",
  "LTV (Valor Vitalicio)": "LTV（生命周期价值）",
  "LTV (Valor Vitalício)": "LTV（生命周期价值）",
  "Meta mensal": "月度目标",
  "Sem meta": "未设置目标",
  meta: "目标",
  "Faixas de inatividade": "沉默区间",
  "Onde esta o risco de parada": "停购风险分布",
  "Composicao da carteira": "客户池构成",
  "Composicao diaria da base": "客户池每日构成",
  "Desempenho de vendas": "销售表现",
  "Quantidade de itens (telas) vendidas": "已售项目数量（屏）",
  "Risco de parada": "停购风险",
  "Evolucao da base": "客户池走势",
  "Telas vendidas": "已售数量",
  Ativo: "活跃",
  Atencao: "关注",
  Inativo: "沉默",
  "Ate 30 dias sem comprar": "距离上次购买不超过 30 天",
  "De 31 a 89 dias sem comprar": "距离上次购买 31 到 89 天",
  "90 dias ou mais sem comprar": "距离上次购买 90 天及以上",
  "Filtro ativo:": "当前筛选：",
  "Limpar filtro": "清除筛选",
  "Legenda do grafico de evolucao da base": "客户池走势图例",
  "Legenda do grafico de telas vendidas": "销量图例",
  "Meta (Atual)": "当前目标",
  "Clientes filtrados pelo grafico": "按图表筛选的客户",
  "Fila por prioridade": "优先级队列",
  "Clientes para o time abordar agora": "团队当前优先联系的客户",
  "Carregando dashboard...": "正在加载仪表盘...",
  "Nao foi possivel carregar o dashboard.": "无法加载仪表盘。",
  "Nao foi possivel carregar essa lista de clientes.": "无法加载该客户列表。",
  "Carregando clientes priorizados...": "正在加载优先客户...",
  "Nenhum cliente encontrado para esse filtro.": "当前筛选下没有找到客户。",
  Cliente: "客户",
  Status: "状态",
  "Ultima compra": "最近购买",
  "Tempo sem comprar": "距上次购买",
  Pedidos: "订单数",
  "Media pedidos": "平均下单间隔",
  "Ticket medio": "平均客单价",
  "Total gasto": "累计消费",
  Prioridade: "优先级",
  Insight: "洞察",
  "Sem rotulo": "无标签",
  "Sem alerta": "无提醒",
  "Redimensionar coluna": "调整列宽",
  "Performance do mes": "本月表现",
  "Performance do mês": "本月表现",
  "Ranking Mensal": "月度排名",
  "Carregando performance...": "正在加载表现数据...",
  "Nenhuma venda registrada neste mes.": "本月暂无销售记录。",
  "Nenhuma venda registrada neste mês.": "本月暂无销售记录。",
  "Desempenho corporativo com base nas vendas do periodo.": "基于当前周期销售数据的团队表现。",
  "Desempenho corporativo com base nas vendas do período.": "基于当前周期销售数据的团队表现。",
  "Top Performer": "最佳表现",
  vendas: "销售",
  pecas: "件数",
  peças: "件数",
  "Ultimo atendente:": "最近跟进人：",
  "Nenhum recente": "暂无记录",
  "Priority Score": "优先分数",
  "Ultima Compra:": "最近购买：",
  "Recencia:": "最近活跃：",
  "Prev. Prox. Compra:": "预计下次购买：",
  "Motivo do Contato": "联系原因",
  "Ciclo medio:": "平均周期：",
  "Acao Sugerida": "建议动作",
  "Ver ficha completa": "查看完整档案",
  "Copiar texto": "复制文本",
  "Chamar no WhatsApp": "在 WhatsApp 联系",
  Hoje: "今天",
  "1 dia": "1天",
  "Sem base": "无数据",
  "Sem registro": "无记录",
  "Biblioteca de mensagens": "消息模板库",
  "Criar template": "新建模板",
  "Editar template": "编辑模板",
  "Prévia": "预览",
  "Prospeccao Leads": "线索开发",
  Sugestoes: "建议",
  "Palavras prontas": "快捷词",
  "Buscas salvas": "已保存搜索",
  Busca: "搜索",
  "Pesquisar leads": "搜索线索",
  Resultados: "结果",
  "Leads priorizados para prospeccao": "优先线索列表",
  "Painel operacional": "运营面板",
  "Meta, uso e protecao da franquia": "目标、使用情况与配额保护",
  "Segmentacao inteligente": "智能分群",
  "Monte um publico acionavel": "创建可执行客群",
  Resumo: "摘要",
  "Resultado esperado": "预期结果",
  "Biblioteca compartilhada": "共享库",
  "Publicos salvos": "已保存客群",
  "Carregando publicos...": "正在加载客群...",
  "Nao foi possivel carregar os publicos salvos.": "无法加载已保存客群。",
  "Planejamento de Metas": "目标规划",
  "Registrar Nova Meta": "登记新目标",
  "Metas da Empresa (Globais)": "公司目标（全局）",
  "Metas por Vendedora": "按销售分配目标",
  "Clientes Novos": "新客户",
  "Saude do Negocio (LTV vs CAC)": "业务健康度（LTV 对 CAC）",
  "Saúde do Negócio (LTV vs CAC)": "业务健康度（LTV 对 CAC）",
  "Historico mensal": "月度历史",
  "Histórico mensal": "月度历史",
  "Recuperadoras de Ouro": "黄金唤醒榜",
  "Placar Consolidado": "综合看板",
  Ativos: "活跃",
  Inativos: "沉默",
  clientes: "客户",
};

const translationRules: TranslationRule[] = [
  {
    pattern: /^Carregando (.+)\.\.\.$/,
    replace: (_, target) => `正在加载${target}...`,
  },
  {
    pattern: /^Nao foi possivel carregar (.+)\.$/,
    replace: (_, target) => `无法加载${target}。`,
  },
  {
    pattern: /^Falha ao carregar (.+)\.$/,
    replace: (_, target) => `加载${target}失败。`,
  },
  {
    pattern: /^Filtro ativo:\s*(.+)$/,
    replace: (_, target) => `当前筛选：${target}`,
  },
  {
    pattern: /^Clientes na faixa (.+)$/,
    replace: (_, target) => `区间 ${target} 的客户`,
  },
  {
    pattern: /^Tendencia de (.+)$/,
    replace: (_, target) => `${target} 的趋势`,
  },
  {
    pattern: /^Sem historico suficiente para montar (.+)\.$/,
    replace: (_, target) => `历史数据不足，无法生成${target}。`,
  },
  {
    pattern: /^(\d+) dias$/,
    replace: (_, days) => `${days}天`,
  },
  {
    pattern: /^([0-9.,]+)% da base$/,
    replace: (_, value) => `占客户池 ${value}%`,
  },
  {
    pattern: /^Alvo ([0-9.]+)$/,
    replace: (_, value) => `目标 ${value}`,
  },
  {
    pattern: /^\+([0-9.]+) acima$/,
    replace: (_, value) => `超出 ${value}`,
  },
  {
    pattern: /^Faltam ([0-9.]+) para a meta$/,
    replace: (_, value) => `距离目标还差 ${value}`,
  },
  {
    pattern: /^Voce ja passou ([0-9.]+) telas do alvo\.$/,
    replace: (_, value) => `已超出目标 ${value} 屏。`,
  },
  {
    pattern: /^Expectativa de receita \(Estimativa vida: ([0-9.]+) meses\)$/,
    replace: (_, months) => `预计收入（预计生命周期：${months}个月）`,
  },
];

const UiLanguageContext = createContext<UiLanguageContextValue | null>(null);

function withOriginalSpacing(current: string, translated: string) {
  const leading = current.match(/^\s*/)?.[0] ?? "";
  const trailing = current.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

function translateTemplate(text: string) {
  const greetingMatch = text.match(/^Ola, (.+)! Passando para retomar nosso contato comercial\.$/);
  if (greetingMatch) {
    return `您好，${greetingMatch[1]}！我们来继续之前的商务沟通。`;
  }

  return null;
}

function translateToChinese(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return text;
  }

  const templateTranslation = translateTemplate(trimmed);
  if (templateTranslation) {
    return withOriginalSpacing(text, templateTranslation);
  }

  const exactTranslation = exactTranslations[trimmed];
  if (exactTranslation) {
    return withOriginalSpacing(text, exactTranslation);
  }

  for (const rule of translationRules) {
    const matched = trimmed.match(rule.pattern);
    if (matched) {
      return withOriginalSpacing(text, rule.replace(...matched));
    }
  }

  return text;
}

function translateText(text: string, language: UiLanguage) {
  return language === "zh-CN" ? translateToChinese(text) : text;
}

function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

function getStoredValue<T extends object>(storage: WeakMap<T, string>, key: T, currentValue: string) {
  const storedValue = storage.get(key);
  const translatedStoredValue = storedValue ? translateToChinese(storedValue) : null;

  if (storedValue === undefined) {
    storage.set(key, currentValue);
    return currentValue;
  }

  if (currentValue !== storedValue && currentValue !== translatedStoredValue) {
    storage.set(key, currentValue);
    return currentValue;
  }

  return storedValue;
}

export function UiLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<UiLanguage>(() => {
    if (typeof window === "undefined") {
      return "pt-BR";
    }

    const storedLanguage = window.localStorage.getItem(STORAGE_KEY);
    return storedLanguage === "zh-CN" ? "zh-CN" : "pt-BR";
  });
  const textNodeStore = useRef(new WeakMap<Text, string>());
  const attributeStore = useRef(new WeakMap<Element, Map<string, string>>());
  const isTranslatingRef = useRef(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
    setFormattingLocale(language);
  }, [language]);

  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) {
      return;
    }
    const appRoot = root;

    const translatableAttributes = ["placeholder", "title", "aria-label"];

    function applyToTextNode(node: Text) {
      const currentText = node.textContent ?? "";
      const originalText = getStoredValue(textNodeStore.current, node, currentText);
      const nextText = translateText(originalText, language);

      if (node.textContent !== nextText) {
        node.textContent = nextText;
      }
    }

    function applyToElement(element: Element) {
      if (element instanceof HTMLScriptElement || element instanceof HTMLStyleElement) {
        return;
      }

      const attributeMap = attributeStore.current.get(element) ?? new Map<string, string>();
      attributeStore.current.set(element, attributeMap);

      for (const attributeName of translatableAttributes) {
        const currentValue = element.getAttribute(attributeName);
        if (!currentValue) {
          continue;
        }

        const storedValue = attributeMap.get(attributeName);
        const translatedStoredValue = storedValue ? translateToChinese(storedValue) : null;

        if (!storedValue || (currentValue !== storedValue && currentValue !== translatedStoredValue)) {
          attributeMap.set(attributeName, currentValue);
        }

        const nextValue = translateText(attributeMap.get(attributeName) ?? currentValue, language);
        if (currentValue !== nextValue) {
          element.setAttribute(attributeName, nextValue);
        }
      }

      element.childNodes.forEach(applyNode);
    }

    function applyNode(node: Node) {
      if (isTextNode(node)) {
        applyToTextNode(node);
        return;
      }

      if (isElementNode(node)) {
        applyToElement(node);
      }
    }

    function translateTree() {
      isTranslatingRef.current = true;
      applyNode(appRoot);
      isTranslatingRef.current = false;
    }

    translateTree();

    const observer = new MutationObserver((mutations) => {
      if (isTranslatingRef.current) {
        return;
      }

      isTranslatingRef.current = true;
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          applyNode(mutation.target);
          continue;
        }

        mutation.addedNodes.forEach(applyNode);
      }
      isTranslatingRef.current = false;
    });

    observer.observe(appRoot, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [language]);

  const value = useMemo<UiLanguageContextValue>(
    () => ({
      language,
      locale: language,
      setLanguage,
      tx: (pt, zh) => (language === "zh-CN" ? zh : pt),
    }),
    [language],
  );

  return <UiLanguageContext.Provider value={value}>{children}</UiLanguageContext.Provider>;
}

export function useUiLanguage() {
  const context = useContext(UiLanguageContext);
  if (!context) {
    throw new Error("useUiLanguage must be used within UiLanguageProvider.");
  }

  return context;
}
