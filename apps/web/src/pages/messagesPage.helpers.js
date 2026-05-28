const CHAT_TIMEZONE = "America/Sao_Paulo";
function localDateKey(value) {
    return new Intl.DateTimeFormat("sv-SE", {
        timeZone: CHAT_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(value);
}
export function formatMessageDayLabel(value, now = new Date()) {
    const messageDate = new Date(value);
    const messageKey = localDateKey(messageDate);
    const todayKey = localDateKey(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = localDateKey(yesterday);
    const fullDate = new Intl.DateTimeFormat("pt-BR", {
        timeZone: CHAT_TIMEZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(messageDate);
    if (messageKey === todayKey) {
        return `Hoje, ${fullDate}`;
    }
    if (messageKey === yesterdayKey) {
        return `Ontem, ${fullDate}`;
    }
    return fullDate;
}
export function buildMessageTimelineItems(messages, now = new Date()) {
    const items = [];
    let previousDayKey = null;
    for (const message of messages) {
        const dayKey = localDateKey(new Date(message.createdAt));
        if (dayKey !== previousDayKey) {
            items.push({
                type: "date",
                key: `date-${dayKey}`,
                label: formatMessageDayLabel(message.createdAt, now),
            });
            previousDayKey = dayKey;
        }
        items.push({
            type: "message",
            key: message.id,
            message,
        });
    }
    return items;
}
