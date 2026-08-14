import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomerRecordWorkspace } from "./CustomerDetailPage";

const baseProps = {
  selectedLabels: ["VIP", "Reativação"],
  availableLabels: ["Atacado", "Retorno agendado"],
  labelSearch: "",
  labelMessage: "",
  canCreateLabel: false,
  internalNotes: "Prefere contato no período da tarde.",
  notesMessage: "",
  notesDirty: false,
  labelsSaving: false,
  labelsError: false,
  notesSaving: false,
  notesError: false,
  onLabelSearchChange: vi.fn(),
  onAddExistingLabel: vi.fn(),
  onCreateLabel: vi.fn(),
  onRemoveLabel: vi.fn(),
  onNotesChange: vi.fn(),
  onSaveNotes: vi.fn(),
};

describe("CustomerRecordWorkspace", () => {
  it("keeps labels and the internal note visible in the main commercial workspace", () => {
    const markup = renderToStaticMarkup(<CustomerRecordWorkspace {...baseProps} />);

    expect(markup).toContain("Organização comercial");
    expect(markup).toContain("Rótulos do cliente");
    expect(markup).toContain("VIP");
    expect(markup).toContain("Reativação");
    expect(markup).toContain("Adicionar rótulo");
    expect(markup).toContain("Atacado");
    expect(markup).toContain("Observação interna");
    expect(markup).toContain("Prefere contato no período da tarde.");
    expect(markup).toContain("Observação salva");
    expect(markup).toContain('aria-label="Remover rótulo VIP"');
  });

  it("offers a clear create action and marks edited notes as unsaved", () => {
    const markup = renderToStaticMarkup(
      <CustomerRecordWorkspace
        {...baseProps}
        availableLabels={[]}
        labelSearch="Cliente estratégico"
        canCreateLabel
        notesDirty
      />,
    );

    expect(markup).toContain("Criar e aplicar");
    expect(markup).toContain("Cliente estratégico");
    expect(markup).toContain("Não salvo");
    expect(markup).toContain("Salvar observação");
  });
});
