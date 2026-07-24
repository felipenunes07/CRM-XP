import { describe, expect, it } from "vitest";
import {
  buildConversationsPrompt,
  buildTranscriptText,
  chunkArray,
  getDayWindow,
  getWindowForDate,
  dedupeDuplicateInstanceMessages,
  maskSensitiveText,
  normalizeProductModel,
  parseConversationAnalyses,
  parseGeneralComplaints,
  parseProductMentions,
  isProductComplaintEvidence,
  sentimentLabelFromScore,
  type TranscriptMessage,
} from "./conversationAi.js";

const TZ = "America/Sao_Paulo";

function message(partial: Partial<TranscriptMessage> & { content: string }): TranscriptMessage {
  return {
    messageId: partial.messageId ?? `msg-${Math.random()}`,
    fromMe: partial.fromMe ?? false,
    senderName: partial.senderName ?? null,
    senderJid: partial.senderJid ?? null,
    content: partial.content,
    createdAt: partial.createdAt ?? "2026-07-02T14:30:00.000Z",
  };
}

describe("maskSensitiveText", () => {
  it("masks cpf, cnpj and email but keeps names and products", () => {
    const input = "Joao da Silva comprou tela do iPhone 13, CPF 123.456.789-01, CNPJ 12.345.678/0001-99, joao@empresa.com.br";
    const output = maskSensitiveText(input);

    expect(output).toContain("Joao da Silva");
    expect(output).toContain("iPhone 13");
    expect(output).toContain("[cpf]");
    expect(output).toContain("[cnpj]");
    expect(output).toContain("[email]");
    expect(output).not.toContain("123.456.789-01");
    expect(output).not.toContain("joao@empresa.com.br");
  });
});

describe("buildTranscriptText", () => {
  it("formats customer and team sides with local time", () => {
    const transcript = buildTranscriptText([
      message({ content: "Bom dia, tem tela do 11?", senderName: "Marcos Loja", createdAt: "2026-07-02T12:05:00.000Z" }),
      message({ content: "Tem sim, 89 reais", fromMe: true, senderName: "Amanda", createdAt: "2026-07-02T12:06:00.000Z" }),
    ], { timezone: TZ, maxMessages: 10 });

    expect(transcript).toContain("CLIENTE Marcos Loja: Bom dia, tem tela do 11?");
    expect(transcript).toContain("EQUIPE Amanda: Tem sim, 89 reais");
    // 12:05 UTC = 09:05 em Sao Paulo
    expect(transcript).toContain("[09:05]");
  });

  it("keeps the END of the conversation when over budget", () => {
    const messages = Array.from({ length: 30 }, (_, index) =>
      message({ content: `mensagem numero ${index}`, createdAt: `2026-07-02T12:${String(index).padStart(2, "0")}:00.000Z` }));

    const transcript = buildTranscriptText(messages, { timezone: TZ, maxMessages: 5 });
    const lines = transcript.split("\n");

    expect(lines).toHaveLength(5);
    expect(lines[lines.length - 1]).toContain("mensagem numero 29");
    expect(lines[0]).toContain("mensagem numero 25");
  });

  it("truncates long messages and skips empty ones", () => {
    const transcript = buildTranscriptText([
      message({ content: "   " }),
      message({ content: "x".repeat(600) }),
    ], { timezone: TZ, maxMessages: 10, maxCharsPerMessage: 100 });

    const lines = transcript.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("...");
    expect(lines[0]!.length).toBeLessThan(140);
  });

  it("treats internal senders as team even when not fromMe", () => {
    const transcript = buildTranscriptText([
      message({ content: "Vou verificar", senderJid: "5511915863088@s.whatsapp.net", senderName: "Quedma" }),
    ], { timezone: TZ, maxMessages: 5 });

    expect(transcript).toContain("EQUIPE Quedma");
  });
});

describe("chunkArray", () => {
  it("splits into chunks of given size", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkArray([], 3)).toEqual([]);
  });
});

describe("buildConversationsPrompt", () => {
  it("embeds conversations and the JSON contract", () => {
    const prompt = buildConversationsPrompt([{
      chave: "123@g.us",
      tipo: "grupo",
      nome: "Grupo XP - Loja do Ze",
      vendedora: "Amanda",
      vip: true,
      mensagens: "[09:00] CLIENTE Ze: cade meu pedido?",
    }]);

    expect(prompt).toContain("123@g.us");
    expect(prompt).toContain("cade meu pedido?");
    expect(prompt).toContain("\"conversas\"");
    expect(prompt).toContain("critico");
  });
});

describe("parseConversationAnalyses", () => {
  it("parses a full valid response with a single main theme", () => {
    const parsed = parseConversationAnalyses({
      conversas: [{
        chave: "abc",
        resumo: "Cliente reclamou de tela quebrada e pediu troca.",
        sentimento: -0.7,
        atencao: "alto",
        motivo_atencao: "Troca sem resposta",
        flags: { reclamacao: true, problema_produto: true, invented_flag: true },
        tema: "Tela Quebrada",
        citacoes: [{ autor: "Ze", texto: "a tela veio trincada", tipo: "reclamacao" }],
        acoes: ["Responder o cliente sobre a troca"],
      }],
    });

    const analysis = parsed.get("abc")!;
    expect(analysis.resumo).toContain("tela quebrada");
    expect(analysis.sentimento).toBe(-0.7);
    expect(analysis.atencao).toBe("high");
    expect(analysis.motivoAtencao).toBe("Troca sem resposta");
    expect(analysis.flags.reclamacao).toBe(true);
    expect(analysis.flags.problema_produto).toBe(true);
    expect(analysis.flags).not.toHaveProperty("invented_flag");
    expect(analysis.topicos).toEqual(["tela quebrada"]);
    expect(analysis.citacoes[0]!.texto).toBe("a tela veio trincada");
    expect(analysis.acoes).toHaveLength(1);
  });

  it("keeps only the first topic when the model returns a legacy topicos array", () => {
    const parsed = parseConversationAnalyses({
      conversas: [{
        chave: "abc",
        resumo: "ok",
        sentimento: 0,
        atencao: "nenhum",
        topicos: ["indicacao", "mercadoria sumida", "perda confianca"],
      }],
    });

    expect(parsed.get("abc")!.topicos).toEqual(["indicacao"]);
  });

  it("maps accented attention levels and clamps sentiment", () => {
    const parsed = parseConversationAnalyses({
      conversas: [
        { chave: "a", resumo: "ok", sentimento: 5, atencao: "crítico" },
        { chave: "b", resumo: "ok", sentimento: -9, atencao: "médio" },
        { chave: "c", resumo: "ok", sentimento: "0.3", atencao: "qualquer coisa" },
      ],
    });

    expect(parsed.get("a")!.atencao).toBe("critical");
    expect(parsed.get("a")!.sentimento).toBe(1);
    expect(parsed.get("b")!.atencao).toBe("medium");
    expect(parsed.get("b")!.sentimento).toBe(-1);
    expect(parsed.get("c")!.atencao).toBe("none");
    expect(parsed.get("c")!.sentimento).toBeCloseTo(0.3);
  });

  it("ignores entries without chave and non-object garbage", () => {
    const parsed = parseConversationAnalyses({
      conversas: [
        "texto solto",
        { resumo: "sem chave" },
        null,
        { chave: "ok", resumo: "valido", sentimento: 0, atencao: "nenhum" },
      ],
    });

    expect(parsed.size).toBe(1);
    expect(parsed.has("ok")).toBe(true);
  });

  it("returns empty map when conversas is missing", () => {
    expect(parseConversationAnalyses({}).size).toBe(0);
    expect(parseConversationAnalyses({ conversas: "nada" }).size).toBe(0);
  });
});

describe("dedupeDuplicateInstanceMessages", () => {
  it("collapses the same text from the same side arriving via multiple instances within the window", () => {
    const messages = dedupeDuplicateInstanceMessages([
      message({ content: "Bom dia", createdAt: "2026-07-17T12:00:00.000Z" }),
      message({ content: "Bom dia", createdAt: "2026-07-17T12:00:01.000Z" }),
      message({ content: "Bom dia", createdAt: "2026-07-17T12:00:02.000Z" }),
      message({ content: "Tudo bem?", createdAt: "2026-07-17T12:00:05.000Z" }),
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]!.content).toBe("Bom dia");
    expect(messages[1]!.content).toBe("Tudo bem?");
  });

  it("keeps repeats of the same text if they are far apart in time (real repetition, not instance echo)", () => {
    const messages = dedupeDuplicateInstanceMessages([
      message({ content: "Ok", createdAt: "2026-07-17T12:00:00.000Z" }),
      message({ content: "Ok", createdAt: "2026-07-17T12:10:00.000Z" }),
    ]);

    expect(messages).toHaveLength(2);
  });

  it("does not collapse the same text from different sides (customer vs team)", () => {
    const messages = dedupeDuplicateInstanceMessages([
      message({ content: "Obrigado", fromMe: false, createdAt: "2026-07-17T12:00:00.000Z" }),
      message({ content: "Obrigado", fromMe: true, createdAt: "2026-07-17T12:00:01.000Z" }),
    ]);

    expect(messages).toHaveLength(2);
  });
});

describe("normalizeProductModel", () => {
  it("uppercases, strips accents and collapses whitespace", () => {
    expect(normalizeProductModel("  a15  ")).toBe("A15");
    expect(normalizeProductModel("sm-a15 4g/a15 5g")).toBe("SM-A15 4G/A15 5G");
    expect(normalizeProductModel("Redmi Nôte 12")).toBe("REDMI NOTE 12");
    expect(normalizeProductModel("iphone   11 * com aro *")).toBe("IPHONE 11 COM ARO");
  });
});

describe("parseProductMentions", () => {
  it("parses valid mentions and normalizes the model", () => {
    const mentions = parseProductMentions([
      { modelo: "a15", tipo: "defeito", detalhe: "Tela veio trincada segundo o cliente Ze" },
      { modelo: "IPHONE 11", tipo: "reclamacao", detalhe: "Cliente insatisfeito com a qualidade" },
    ]);

    expect(mentions).toHaveLength(2);
    expect(mentions[0]!.modeloNormalizado).toBe("A15");
    expect(mentions[0]!.tipo).toBe("defeito");
    expect(mentions[1]!.modeloNormalizado).toBe("IPHONE 11");
  });

  it("drops mentions whose tipo is not reclamacao/defeito (troca/duvida/unknown) and garbage entries", () => {
    const mentions = parseProductMentions([
      { modelo: "A32", tipo: "explodiu" },
      { modelo: "A50", tipo: "duvida", detalhe: "pergunta de disponibilidade" },
      { modelo: "IPHONE 11", tipo: "troca", detalhe: "Devolucao de rotina sem reclamar de qualidade" },
      { modelo: "", tipo: "defeito" },
      "texto solto",
      null,
      { modelo: "A16", tipo: "defeito", detalhe: "tela nao liga" },
    ]);

    expect(mentions).toHaveLength(1);
    expect(mentions[0]!.modeloNormalizado).toBe("A16");
    expect(mentions[0]!.tipo).toBe("defeito");
  });

  it("returns empty list for missing or non-array input", () => {
    expect(parseProductMentions(undefined)).toEqual([]);
    expect(parseProductMentions("nada")).toEqual([]);
  });

  it("drops normal quotes and order additions mislabeled by the AI as product complaints", () => {
    const mentions = parseProductMentions([
      {
        modelo: "A15",
        tipo: "reclamacao",
        detalhe: "Cliente solicitou cotação para diversos modelos, incluindo A15, mas a resposta da equipe foi incompleta.",
      },
      {
        modelo: "IPHONE XR",
        tipo: "defeito",
        detalhe: "Cliente solicitou a adição de 10 baterias para iPhone XR.",
      },
    ]);

    expect(mentions).toEqual([]);
  });
});

describe("isProductComplaintEvidence", () => {
  it("keeps a commercial follow-up when the same evidence contains a real quality problem", () => {
    expect(isProductComplaintEvidence(
      "Cliente pediu para adicionar outra tela A15 porque a anterior apresentou problema no touch.",
    )).toBe(true);
  });

  it("rejects the exact non-complaint examples reported in the product model dashboard", () => {
    expect(isProductComplaintEvidence(
      "Cliente solicitou cotação para diversos modelos, incluindo A15, mas a resposta da equipe foi incompleta.",
      "Boa tarde colocar PREÇO por favor",
    )).toBe(false);
    expect(isProductComplaintEvidence(
      "Cliente solicitou a adição de 10 baterias para iPhone XR.",
      "Asim que terminar voce feira a caixa",
    )).toBe(false);
    expect(isProductComplaintEvidence(
      "Cliente solicitou cotação para a linha A15.",
    )).toBe(false);
  });

  it("rejects stock, quantity, wrong-item and wrong-variant occurrences", () => {
    const nonProductComplaints = [
      "Produto indisponível no momento.",
      "Cliente informou que vieram apenas 5 baterias do modelo NOTE 8 em vez da quantidade esperada.",
      "Cliente recebeu telas InCell quando a nota fiscal indicava OLED.",
      "Cliente recebeu unidades trocadas de S21 FE LCD em vez de A12 WF PREMIER MAX.",
      "Cliente reclamou que foram enviadas 2 caixas a mais do que o solicitado.",
      "Tela enviada não corresponde ao modelo solicitado.",
      "Enviaram LCD em vez de tela OLED.",
      "A15 chegou sem aro, cliente insatisfeito.",
      "Cliente prefere crédito pois as telas VV não tiveram boa aceitação na região.",
      "iPhone X não responde corretamente após uma atualização de sistema.",
    ];

    expect(nonProductComplaints.every((detail) => !isProductComplaintEvidence(detail))).toBe(true);
  });

  it("keeps real display, touch, fit and electrical defects", () => {
    const realDefects = [
      "Imagem tremida relatada pelo cliente.",
      "As telas G34 voltaram com listras.",
      "Nenhuma das telas está funcionando.",
      "Tela G52 OLED fica com interferência e chuviscada.",
      "Nenhuma tela M30 encaixa no aparelho.",
      "Flex curto, não encaixa na base.",
    ];

    expect(realDefects.every((detail) => isProductComplaintEvidence(detail))).toBe(true);
  });
});

describe("parseConversationAnalyses produtos", () => {
  it("exposes produtos from the AI response and defaults to empty", () => {
    const parsed = parseConversationAnalyses({
      conversas: [
        {
          chave: "com-produto",
          resumo: "Cliente reclamou do A15.",
          sentimento: -0.5,
          atencao: "alto",
          produtos: [{ modelo: "A15", tipo: "reclamacao", detalhe: "Cliente Josias reclamou do retorno de telas" }],
        },
        { chave: "sem-produto", resumo: "ok", sentimento: 0, atencao: "nenhum" },
      ],
    });

    expect(parsed.get("com-produto")!.produtos).toHaveLength(1);
    expect(parsed.get("com-produto")!.produtos[0]!.modeloNormalizado).toBe("A15");
    expect(parsed.get("sem-produto")!.produtos).toEqual([]);
  });
});

describe("parseGeneralComplaints", () => {
  it("parses valid complaints and defaults unknown categoria to outro", () => {
    const complaints = parseGeneralComplaints([
      { categoria: "vendedora", vendedora: "Thais", detalhe: "Cliente reclamou de grosseria no atendimento" },
      { categoria: "cobranca_estranha", detalhe: "Cliente reclamou de cobranca duplicada" },
    ]);

    expect(complaints).toHaveLength(2);
    expect(complaints[0]!.categoria).toBe("vendedora");
    expect(complaints[0]!.vendedora).toBe("Thais");
    expect(complaints[1]!.categoria).toBe("outro");
    expect(complaints[1]!.vendedora).toBeNull();
  });

  it("drops entries without detalhe and garbage entries", () => {
    const complaints = parseGeneralComplaints([
      { categoria: "atendimento" },
      "texto solto",
      null,
      { categoria: "entrega", detalhe: "Atraso de 5 dias sem aviso" },
    ]);

    expect(complaints).toHaveLength(1);
    expect(complaints[0]!.categoria).toBe("entrega");
  });

  it("returns empty list for missing or non-array input", () => {
    expect(parseGeneralComplaints(undefined)).toEqual([]);
    expect(parseGeneralComplaints("nada")).toEqual([]);
  });
});

describe("parseConversationAnalyses reclamacoesGerais", () => {
  it("exposes reclamacoesGerais from the AI response and defaults to empty", () => {
    const parsed = parseConversationAnalyses({
      conversas: [
        {
          chave: "com-reclamacao",
          resumo: "Cliente reclamou do atendimento.",
          sentimento: -0.4,
          atencao: "medio",
          reclamacoes_gerais: [{ categoria: "atendimento", vendedora: "Amanda", detalhe: "Demorou 3 dias para responder" }],
        },
        { chave: "sem-reclamacao", resumo: "ok", sentimento: 0, atencao: "nenhum" },
      ],
    });

    expect(parsed.get("com-reclamacao")!.reclamacoesGerais).toHaveLength(1);
    expect(parsed.get("com-reclamacao")!.reclamacoesGerais[0]!.vendedora).toBe("Amanda");
    expect(parsed.get("sem-reclamacao")!.reclamacoesGerais).toEqual([]);
  });
});

describe("sentimentLabelFromScore", () => {
  it("maps scores to labels", () => {
    expect(sentimentLabelFromScore(-0.9)).toBe("muito negativo");
    expect(sentimentLabelFromScore(-0.3)).toBe("negativo");
    expect(sentimentLabelFromScore(0)).toBe("neutro");
    expect(sentimentLabelFromScore(0.4)).toBe("positivo");
    expect(sentimentLabelFromScore(0.9)).toBe("muito positivo");
  });
});

describe("getDayWindow", () => {
  it("computes the Sao Paulo day window in UTC", () => {
    // 2026-07-02T02:00Z = 2026-07-01 23:00 em SP (UTC-3): dia local ainda e 01/07
    const window = getDayWindow(new Date("2026-07-02T02:00:00.000Z"), TZ);
    expect(window.windowDate).toBe("2026-07-01");
    expect(window.windowStart.toISOString()).toBe("2026-07-01T03:00:00.000Z");
    expect(window.windowEnd.toISOString()).toBe("2026-07-02T03:00:00.000Z");
  });

  it("uses the local date during the afternoon", () => {
    const window = getDayWindow(new Date("2026-07-02T18:00:00.000Z"), TZ);
    expect(window.windowDate).toBe("2026-07-02");
  });
});

describe("getWindowForDate", () => {
  it("builds the full-day window for a specific past date (retro analysis)", () => {
    const window = getWindowForDate("2026-07-01", TZ);
    expect(window.windowDate).toBe("2026-07-01");
    // Meia-noite de 01/07 em SP (UTC-3) = 03:00Z
    expect(window.windowStart.toISOString()).toBe("2026-07-01T03:00:00.000Z");
    expect(window.windowEnd.toISOString()).toBe("2026-07-02T03:00:00.000Z");
  });
});
