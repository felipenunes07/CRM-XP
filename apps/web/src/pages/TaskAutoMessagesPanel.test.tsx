import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { TaskAutoMessagesPanel, type AutoMessagesOverview } from "./TaskAutoMessagesPanel";

const now = Date.now();
const reminder = {
  task_id: "33333333-3333-4333-8333-333333333333",
  user_id: "11111111-1111-4111-8111-111111111111",
  title: "Conferir estoque",
  due_date: "2026-09-15",
  due_time: null,
  priority: "high" as const,
  status: "doing" as const,
  recipient_name: "Pedro",
  recipient_photo: "https://example.com/pedro.jpg",
  has_whatsapp: true,
  paused: false,
  is_overdue: true,
  sent_today: false,
  next_send_at: new Date(now - 60_000).toISOString(),
  message: "Olá, Pedro! ⏰ A tarefa *Conferir estoque* venceu",
};

function render(overview: AutoMessagesOverview) {
  const client = new QueryClient();
  client.setQueryData(["tarefas-auto-messages"], overview);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <TaskAutoMessagesPanel
        request={vi.fn()}
        renderAvatar={(person) => <img className="avatar" alt={person.name} src={person.photo ?? ""} />}
        colorFor={() => "#0891b2"}
      />
    </QueryClientProvider>,
  );
}

const base: AutoMessagesOverview = {
  settings: { assignment: true, review: true, return: false, overdue: true },
  check_interval_minutes: 30,
  lili: { active: true, label: "Lili" },
  examples: { assignment: "a", review: "b", return: "c", overdue: "d" },
  scheduled: [
    reminder,
    { ...reminder, user_id: "44444444-4444-4444-8444-444444444444", recipient_name: "Ana", paused: true },
    { ...reminder, task_id: "55555555-5555-4555-8555-555555555555", title: "Tarefa distante", next_send_at: new Date(now + 30 * 86_400_000).toISOString() },
    { ...reminder, task_id: "66666666-6666-4666-8666-666666666666", title: "Cobrada hoje", sent_today: true },
  ],
  history: [
    {
      id: "h1",
      kind: "overdue",
      status: "sent",
      task_id: "66666666-6666-4666-8666-666666666666",
      task_title: "Cobrada hoje",
      recipient_user_id: reminder.user_id,
      recipient_name: "Pedro",
      recipient_photo: null,
      message: "m",
      error: null,
      created_at: new Date(now - 60_000).toISOString(),
    },
  ],
};

describe("TaskAutoMessagesPanel", () => {
  it("lists every automation on its own line with its on/off state", () => {
    const html = render(base);
    for (const title of ["Cobrança de atraso", "Nova tarefa", "Em revisão", "Tarefa devolvida"]) {
      expect(html).toContain(title);
    }
    expect(html).toContain('aria-label="Ligar: Tarefa devolvida"');
    expect(html).toContain('aria-label="Desligar: Nova tarefa"');
    expect(html).toContain("</svg> 1 hoje");
  });

  it("separates waiting, sent and paused counts", () => {
    const html = render(base);
    expect(html).toMatch(/Aguardando envio.{0,20}<b class="automsg-tabcount is-waiting">2<\/b>/);
    expect(html).toMatch(/Enviadas.{0,20}<b class="automsg-tabcount is-sent">1<\/b>/);
    expect(html).toMatch(/Pausadas.{0,20}<b class="automsg-tabcount is-paused">1<\/b>/);
  });

  it("shows only what is still waiting in the first tab, with photo and pause control", () => {
    const html = render(base);
    expect(html).toContain("Em instantes");
    expect(html).toContain('aria-label="Pausar cobrança de Pedro: Conferir estoque"');
    expect(html).toContain('alt="Pedro" src="https://example.com/pedro.jpg"');
    expect(html).not.toContain("Tarefa distante");
    expect(html).not.toContain("Pausar cobrança de Pedro: Cobrada hoje");
    expect(html).not.toContain("Pausar cobrança de Ana");
  });

  it("warns when overdue reminders or the Lili WhatsApp are off", () => {
    const html = render({ ...base, settings: { ...base.settings, overdue: false }, lili: { active: false, label: null } });
    expect(html).toContain("A cobrança de atraso está desligada");
    expect(html).toContain("WhatsApp da Lili desconectado");
  });
});
