import { describe, expect, it } from "vitest";
import { parseCsvRows } from "./whatsappGroupService.js";

describe("CSV de grupos do Sheets", () => {
  it("preserva nomes com virgulas, acentos, aspas e quebras de linha sem deslocar o JID", () => {
    const rows = parseCsvRows('Name,Group ID (JID),Telefone\n"CL123 - João, loja ""Centro""",120363001@g.us,5511999999999\n"KH42 - Paulo\nXP Display",120363002@g.us,5511999999999');
    expect(rows).toMatchObject([
      { sourceName: 'CL123 - João, loja "Centro"', jid: '120363001@g.us', sourceCode: 'CL123' },
      { sourceName: 'KH42 - Paulo\nXP Display', jid: '120363002@g.us', sourceCode: 'KH42' },
    ]);
  });
});
