import { describe, expect, it } from "vitest";
import {
  buildConversationsPrompt,
  buildTranscriptText,
  chunkArray,
  getDayWindow,
  getWindowForDate,
  maskSensitiveText,
  parseConversationAnalyses,
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
