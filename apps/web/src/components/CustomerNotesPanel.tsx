import { CUSTOMER_NOTE_OUTCOME_LABELS, CUSTOMER_NOTE_OUTCOMES } from "@olist-crm/shared";
import type { CustomerNote, CustomerNoteOutcome } from "@olist-crm/shared";
import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, LoaderCircle, MessageSquareText, Trash2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import "./customerNotes.css";

const VISIBLE_NOTES = 5;

export function CustomerNoteOutcomeBadge({ outcome }: { outcome: CustomerNoteOutcome | null }) {
  if (!outcome) {
    return null;
  }

  return <span className={`customer-note-outcome is-${outcome}`}>{CUSTOMER_NOTE_OUTCOME_LABELS[outcome]}</span>;
}

interface CustomerNotesViewProps {
  notes: CustomerNote[];
  loading: boolean;
  loadError: boolean;
  draft: string;
  outcome: CustomerNoteOutcome | null;
  saving: boolean;
  saveError: string;
  savedMessage: string;
  deletingId: string | null;
  showAll: boolean;
  canDelete: (note: CustomerNote) => boolean;
  onDraftChange: (value: string) => void;
  onOutcomeChange: (value: CustomerNoteOutcome | null) => void;
  onSubmit: (event: FormEvent) => void;
  onDelete: (note: CustomerNote) => void;
  onToggleShowAll: () => void;
}

export function CustomerNotesView({
  notes,
  loading,
  loadError,
  draft,
  outcome,
  saving,
  saveError,
  savedMessage,
  deletingId,
  showAll,
  canDelete,
  onDraftChange,
  onOutcomeChange,
  onSubmit,
  onDelete,
  onToggleShowAll,
}: CustomerNotesViewProps) {
  const visibleNotes = showAll ? notes : notes.slice(0, VISIBLE_NOTES);
  const canSave = Boolean(draft.trim()) && !saving;

  return (
    <section className="customer-notes-card" aria-labelledby="customer-notes-title">
      <header className="customer-notes-header">
        <span className="customer-notes-icon" aria-hidden="true"><MessageSquareText size={20} /></span>
        <div>
          <p className="eyebrow">Retorno dos contatos</p>
          <h2 id="customer-notes-title">Observações do cliente</h2>
          <p>Registre o que o cliente falou em cada contato. Fica salvo com seu nome e a data.</p>
        </div>
        <span className="customer-notes-count" title="Observações registradas">{notes.length}</span>
      </header>

      <form className="customer-notes-form" onSubmit={onSubmit}>
        <fieldset className="customer-notes-outcomes">
          <legend>Como foi o contato? <small>(opcional)</small></legend>
          {CUSTOMER_NOTE_OUTCOMES.map((option) => (
            <button
              key={option}
              type="button"
              className={`customer-note-outcome is-${option} ${outcome === option ? "is-selected" : ""}`}
              aria-pressed={outcome === option}
              onClick={() => onOutcomeChange(outcome === option ? null : option)}
            >
              {CUSTOMER_NOTE_OUTCOME_LABELS[option]}
            </button>
          ))}
        </fieldset>

        <label htmlFor="customer-note-draft" className="sr-only">Nova observação</label>
        <textarea
          id="customer-note-draft"
          rows={3}
          maxLength={4000}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && canSave) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ex.: disse que está com estoque cheio e pediu para chamar de novo em 15 dias."
        />

        <div className="customer-notes-footer">
          <span className="customer-notes-status" aria-live="polite">
            {saveError ? (
              <span className="is-error">{saveError}</span>
            ) : savedMessage ? (
              <><CheckCircle2 size={15} /> {savedMessage}</>
            ) : (
              <span className="customer-notes-hint">Ctrl + Enter para salvar</span>
            )}
          </span>
          <button type="submit" className="primary-button" disabled={!canSave}>
            {saving ? <LoaderCircle className="spinner-small" size={16} /> : <Check size={16} />}
            {saving ? "Salvando..." : "Registrar observação"}
          </button>
        </div>
      </form>

      <div className="customer-notes-history">
        <h3>Histórico</h3>
        {loading ? (
          <div className="customer-record-empty"><LoaderCircle className="spinner-small" size={16} /> Carregando observações...</div>
        ) : loadError ? (
          <div className="customer-record-empty is-error">Não foi possível carregar as observações.</div>
        ) : notes.length ? (
          <ol className="customer-notes-list">
            {visibleNotes.map((note) => (
              <li key={note.id} className="customer-note-item">
                <div className="customer-note-item-head">
                  <CustomerNoteOutcomeBadge outcome={note.outcome} />
                  <span className="customer-note-meta">
                    <strong>{note.authorName}</strong> · {formatDateTime(note.createdAt)}
                  </span>
                  {canDelete(note) ? (
                    <button
                      type="button"
                      className="customer-note-delete"
                      onClick={() => onDelete(note)}
                      disabled={deletingId === note.id}
                      aria-label="Apagar observação"
                      title="Apagar observação"
                    >
                      {deletingId === note.id ? <LoaderCircle className="spinner-small" size={14} /> : <Trash2 size={14} />}
                    </button>
                  ) : null}
                </div>
                <p>{note.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="customer-record-empty">Nenhuma observação ainda. A primeira que você registrar aparece aqui.</div>
        )}

        {notes.length > VISIBLE_NOTES ? (
          <button type="button" className="customer-notes-more" onClick={onToggleShowAll}>
            {showAll ? "Mostrar só as mais recentes" : `Ver todas as ${notes.length} observações`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function CustomerNotesPanel({ customerId }: { customerId: string }) {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [outcome, setOutcome] = useState<CustomerNoteOutcome | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [showAll, setShowAll] = useState(false);

  const notesQuery = useQuery({
    queryKey: ["customer-notes", customerId],
    queryFn: () => api.customerNotes(token!, customerId),
    enabled: Boolean(token && customerId),
  });

  function refreshRelated() {
    void queryClient.invalidateQueries({ queryKey: ["customer-notes", customerId] });
    void queryClient.invalidateQueries({ queryKey: ["customer-notes-latest"] });
    void queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
  }

  const createMutation = useMutation({
    mutationFn: () => api.createCustomerNote(token!, customerId, { body: draft.trim(), outcome }),
    onSuccess: () => {
      setDraft("");
      setOutcome(null);
      setSavedMessage("Observação registrada.");
      refreshRelated();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => api.deleteCustomerNote(token!, customerId, noteId),
    onSuccess: refreshRelated,
  });

  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";
  const saveError = createMutation.isError
    ? "Não foi possível salvar. Tente de novo."
    : deleteMutation.isError
      ? "Não foi possível apagar a observação."
      : "";

  return (
    <CustomerNotesView
      notes={notesQuery.data ?? []}
      loading={notesQuery.isLoading}
      loadError={notesQuery.isError}
      draft={draft}
      outcome={outcome}
      saving={createMutation.isPending}
      saveError={saveError}
      savedMessage={savedMessage}
      deletingId={deleteMutation.isPending ? deleteMutation.variables ?? null : null}
      showAll={showAll}
      canDelete={(note) => isManager || note.authorUserId === user?.id}
      onDraftChange={(value) => {
        setDraft(value);
        setSavedMessage("");
        createMutation.reset();
      }}
      onOutcomeChange={setOutcome}
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() && !createMutation.isPending) {
          createMutation.mutate();
        }
      }}
      onDelete={(note) => {
        if (window.confirm("Apagar esta observação do histórico?")) {
          setSavedMessage("");
          deleteMutation.mutate(note.id);
        }
      }}
      onToggleShowAll={() => setShowAll((current) => !current)}
    />
  );
}
