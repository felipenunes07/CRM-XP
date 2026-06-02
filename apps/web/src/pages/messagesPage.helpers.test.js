import { describe, expect, it } from "vitest";
import { buildMessageTimelineItems, formatMessageDayLabel } from "./messagesPage.helpers";
function message(id, createdAt) {
    return {
        id,
        dealId: "deal-1",
        direction: "INBOUND",
        senderName: "Cliente",
        senderJid: "5511999998888@s.whatsapp.net",
        senderProfilePictureUrl: null,
        content: `Mensagem ${id}`,
        createdAt,
        remoteJid: "5511999998888@s.whatsapp.net",
        isGroup: false,
        metadata: {},
        risk: null,
    };
}
describe("messagesPage helpers", () => {
    it("adds a visible date marker when the chat crosses days", () => {
        const now = new Date("2026-05-28T15:00:00-03:00");
        const items = buildMessageTimelineItems([
            message("msg-1", "2026-05-27T13:00:00-03:00"),
            message("msg-2", "2026-05-27T14:00:00-03:00"),
            message("msg-3", "2026-05-28T10:00:00-03:00"),
        ], now);
        expect(items.map((item) => item.type === "date" ? item.label : item.message.id)).toEqual([
            "Ontem, 27/05/2026",
            "msg-1",
            "msg-2",
            "Hoje, 28/05/2026",
            "msg-3",
        ]);
    });
    it("formats older message days as full dates", () => {
        expect(formatMessageDayLabel("2026-05-20T08:30:00-03:00", new Date("2026-05-28T15:00:00-03:00"))).toBe("20/05/2026");
    });
});
