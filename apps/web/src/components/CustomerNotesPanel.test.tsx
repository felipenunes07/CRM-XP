import type { CustomerNote } from "@olist-crm/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomerNotesView } from "./CustomerNotesPanel";

function buildNote(index: number, overrides: Partial<CustomerNote> = {}): CustomerNote {
  return {
    id: `note-${index}`,
    customerId: "customer-1",
    body: `Observação ${index}`,
    outcome: null,
    authorUserId: "user-1",
    authorName: "Ana",
    createdAt: "2026-10-02T13:00:00.000Z",
    ...overrides,
  };
}

const baseProps = {
  notes: [] as CustomerNote[],
  loading: false,
  loadError: false,
  draft: "",
  outcome: null,
  saving: false,
  saveError: "",
  savedMessage: "",
  deletingId: null,
  showAll: false,
  canDelete: () => false,
  onDraftChange: vi.fn(),
  onOutcomeChange: vi.fn(),
  onSubmit: vi.fn(),
  onDelete: vi.fn(),
  onToggleShowAll: vi.fn(),
};

describe("CustomerNotesView", () => {
  it("shows the history with author, outcome and delete only where allowed", () => {
    const markup = renderToStaticMarkup(
      <CustomerNotesView
        {...baseProps}
        notes={[
          buildNote(1, { body: "Pediu retorno na sexta", outcome: "callback" }),
          buildNote(2, { authorUserId: "user-2", authorName: "Bia" }),
        ]}
        canDelete={(note) => note.authorUserId === "user-1"}
      />,
    );

    expect(markup).toContain("Observações do cliente");
    expect(markup).toContain("Pediu retorno na sexta");
    expect(markup).toContain("Pediu retorno</span>");
    expect(markup).toContain("Bia");
    expect(markup.match(/aria-label="Apagar observação"/g)).toHaveLength(1);
  });

  it("keeps the save button disabled until something is written", () => {
    const empty = renderToStaticMarkup(<CustomerNotesView {...baseProps} />);
    const filled = renderToStaticMarkup(<CustomerNotesView {...baseProps} draft="Não atendeu" />);

    expect(empty).toMatch(/<button type="submit" class="primary-button" disabled=""/);
    expect(filled).not.toMatch(/<button type="submit" class="primary-button" disabled=""/);
    expect(empty).toContain("Nenhuma observação ainda");
  });

  it("collapses long histories to the most recent notes", () => {
    const notes = Array.from({ length: 7 }, (_, index) => buildNote(index + 1));
    const markup = renderToStaticMarkup(<CustomerNotesView {...baseProps} notes={notes} />);

    expect(markup).toContain("Observação 5");
    expect(markup).not.toContain("Observação 6");
    expect(markup).toContain("Ver todas as 7 observações");
  });
});
