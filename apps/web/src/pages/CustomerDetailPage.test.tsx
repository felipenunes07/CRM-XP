import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomerRecordWorkspace } from "./CustomerDetailPage";

const baseProps = {
  selectedLabels: ["VIP", "Reativação"],
  availableLabels: ["Atacado", "Retorno agendado"],
  labelSearch: "",
  labelMessage: "",
  canCreateLabel: false,
  labelsSaving: false,
  labelsError: false,
  onLabelSearchChange: vi.fn(),
  onAddExistingLabel: vi.fn(),
  onCreateLabel: vi.fn(),
  onRemoveLabel: vi.fn(),
};

describe("CustomerRecordWorkspace", () => {
  it("keeps labels visible in the commercial workspace", () => {
    const markup = renderToStaticMarkup(<CustomerRecordWorkspace {...baseProps} />);

    expect(markup).toContain("Organização comercial");
    expect(markup).toContain("Rótulos do cliente");
    expect(markup).toContain("VIP");
    expect(markup).toContain("Reativação");
    expect(markup).toContain("Adicionar rótulo");
    expect(markup).toContain("Atacado");
    expect(markup).toContain('aria-label="Remover rótulo VIP"');
  });

  it("offers a clear create action for a new label", () => {
    const markup = renderToStaticMarkup(
      <CustomerRecordWorkspace
        {...baseProps}
        availableLabels={[]}
        labelSearch="Cliente estratégico"
        canCreateLabel
      />,
    );

    expect(markup).toContain("Criar e aplicar");
    expect(markup).toContain("Cliente estratégico");
  });
});
