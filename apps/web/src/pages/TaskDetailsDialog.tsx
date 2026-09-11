import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, CheckCheck, ChevronLeft, ChevronRight, Clock3, Flag, LockKeyhole, NotebookPen, Paperclip, Pencil, Plus, Send, Trash2, Users, X, UserRound, FileText } from "lucide-react";
import { TaskPriorityPicker, type TaskPriority } from "./TaskPriorityPicker";
import "./TaskDetailsDialog.css";

type Item = { id: string; text: string; done: boolean };
type Content = { notes: string; checklist: Item[]; priority: TaskPriority; images: string[] };
type TaskInfo = Content & {
  id: string; title: string; version: number; status: string;
  person_id: string; due_date: string; due_time: string | null;
};
type Props = {
  task: TaskInfo;
  assignee: ReactNode;
  creator: ReactNode;
  canWrite: boolean;
  onSave: (content: Content, version: number) => Promise<void>;
  onClose: () => void;
  onEdit?: (content: Content, version: number) => void;
  canNotify?: boolean;
  onNotify?: () => Promise<void>;
  canDelete?: boolean;
  onDelete?: () => Promise<void>;
};

// The next write uses the last acknowledged version, even while typing during a request.
export function TaskDetailsDialog({ task, assignee, creator, canWrite, onSave, onClose, onEdit, canNotify = false, onNotify, canDelete = false, onDelete }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [content, setContent] = useState<Content>({ notes: task.notes, checklist: task.checklist, images: task.images ?? [], priority: task.priority ?? "normal" });
  const latest = useRef(content);
  const version = useRef(task.version);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flight = useRef<Promise<boolean> | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  const [confirmNotify, setConfirmNotify] = useState(false);
  const [sendingNotify, setSendingNotify] = useState(false);
  const [previewImageIndex, setPreviewImageIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const clean = (value: Content): Content => ({
    notes: value.notes,
    priority: value.priority,
    checklist: value.checklist.map(item => ({ ...item, text: item.text.trim() })).filter(item => item.text),
    images: value.images,
  });

  async function flush(): Promise<boolean> {
    clearTimeout(timer.current);
    if (flight.current) return flight.current;
    const run = async () => {
      try {
        while (savedRevision.current < revision.current) {
          const sendingRevision = revision.current;
          setSaveState("saving");
          await onSave(clean(latest.current), version.current);
          version.current += 1;
          savedRevision.current = sendingRevision;
        }
        setSaveState("saved");
        setError("");
        return true;
      } catch (failure) {
        setSaveState("error");
        setError(failure instanceof Error ? failure.message : "Não foi possível salvar. Suas anotações continuam aqui.");
        return false;
      }
    };
    flight.current = run();
    const result = await flight.current;
    flight.current = null;
    return result;
  }

  function change(next: Content) {
    latest.current = next;
    revision.current += 1;
    setContent(next);
    setSaveState("pending");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 550);
  }

  async function finish(edit = false) {
    setClosing(true);
    if (await flush()) {
      if (edit) onEdit?.(clean(latest.current), version.current);
      else onClose();
    }
    setClosing(false);
  }

  async function notify() {
    if (!onNotify) return;
    setSendingNotify(true);
    try {
      await onNotify();
      setConfirmNotify(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível enviar a cobrança.");
    } finally {
      setSendingNotify(false);
    }
  }

  async function removeTask() {
    if (!onDelete) return;
    setClosing(true);
    try {
      await onDelete();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível excluir a tarefa.");
      setClosing(false);
    }
  }

  useEffect(() => {
    dialog.current?.showModal();
    const guard = (event: BeforeUnloadEvent) => {
      if (revision.current > savedRevision.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", guard);
    return () => { clearTimeout(timer.current); window.removeEventListener("beforeunload", guard); };
  }, []);

  const done = content.checklist.filter(item => item.done).length;
  const progress = content.checklist.length ? done / content.checklist.length * 100 : 0;
  const status = task.status === "done" ? "Concluída" : task.status === "doing" ? "Em andamento" : "A fazer";

  return (
    <dialog ref={dialog} className="task-detail" aria-labelledby="task-detail-title"
      onCancel={event => { event.preventDefault(); void finish(); }}
      onClick={event => { if (event.target === event.currentTarget) void finish(); }}>
      <div className="task-detail-shell">
        <header className="task-detail-topbar">
          <span><NotebookPen size={16} /> Tarefas <span className="task-detail-slash">/</span> Detalhes</span>
          <button type="button" className="task-detail-icon" aria-label="Fechar tarefa" disabled={closing} onClick={() => void finish()}><X size={19} /></button>
        </header>
        <div className="task-detail-body">
          <div className="task-detail-eyebrow">
            {task.person_id === "team" ? <><Users size={13} /> Compartilhada com o time</> : <><LockKeyhole size={13} /> Particular · responsável e administradores</>}
          </div>
          <div className="task-detail-type"><FileText size={16} /> Tarefa</div>
          <h2 id="task-detail-title">{task.title}</h2>
          <div className="task-detail-properties">
            <div><span><CheckCheck size={15} /> Status</span><b className={`task-detail-status is-${task.status}`}>{status}</b></div>
            <div><span><Users size={15} /> Responsável</span>{assignee}</div>
            <div><span><Clock3 size={15} /> Prazo</span><strong>{task.due_date.split("-").reverse().join("/")}{task.due_time ? ` · ${task.due_time}` : ""}</strong></div>
            <div><span><Flag size={18} /> Prioridade</span><TaskPriorityPicker value={content.priority} disabled={closing}
              onChange={onEdit ? async priority => { change({ ...latest.current, priority }); if (!await flush()) throw new Error("Não foi possível salvar. Tente novamente."); } : undefined} /></div>
            <div className="task-detail-created"><span><UserRound size={18} /> Atribuída por</span>{creator}</div>
            {onEdit && <button type="button" className="task-detail-edit" disabled={closing} onClick={() => void finish(true)}><Pencil size={13} /> Editar dados da tarefa</button>}
          </div>
          {onNotify && (
            <div className="task-detail-notify">
              {!confirmNotify ? (
                <button type="button" disabled={!canNotify || sendingNotify} onClick={() => setConfirmNotify(true)}>
                  <Send size={16} /> Cobrar no WhatsApp
                </button>
              ) : (
                <span>
                  <b>Enviar cobrança privada pelo WhatsApp da Lili?</b>
                  <button type="button" className="is-confirm" disabled={sendingNotify} onClick={() => void notify()}>{sendingNotify ? "Enviando..." : "Enviar cobrança"}</button>
                  <button type="button" className="is-cancel" disabled={sendingNotify} onClick={() => setConfirmNotify(false)}>Cancelar</button>
                </span>
              )}
              {!canNotify && <small>Cadastre o WhatsApp do responsável para liberar a cobrança.</small>}
            </div>
          )}
          <section className="task-detail-section">
            <label><Paperclip size={17} /> Imagens{content.images.length > 0 && <small>{content.images.length}</small>}</label>
            <div className="task-detail-images">
              {content.images.map((image, index) => (
                <span key={`${index}-${image.slice(-24)}`}>
                  <button type="button" className="task-detail-image-preview" onClick={() => setPreviewImageIndex(index)} aria-label={`Abrir imagem ${index + 1}`}>
                    <img src={image} alt={`Anexo ${index + 1}`} />
                  </button>
                  {canWrite && <button type="button" className="task-detail-image-remove" aria-label={`Remover imagem ${index + 1}`} onClick={() => change({ ...latest.current, images: latest.current.images.filter((_, itemIndex) => itemIndex !== index) })}><X size={13} /></button>}
                </span>
              ))}
            </div>
            {canWrite && content.images.length < 5 && <label className="task-detail-add" style={{ cursor: "pointer" }}><Paperclip size={15} /> Anexar imagem<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={event => { const file = event.target.files?.[0]; if (!file || file.size > 800 * 1024) return; const reader = new FileReader(); reader.onload = () => typeof reader.result === "string" && change({ ...latest.current, images: [...latest.current.images, reader.result] }); reader.readAsDataURL(file); event.currentTarget.value = ""; }} /></label>}
          </section>
          <fieldset disabled={!canWrite || closing}>
            <section className="task-detail-section">
              <label htmlFor="task-detail-notes"><NotebookPen size={17} /> Observações</label>
              <textarea id="task-detail-notes" value={content.notes} maxLength={10000} rows={6}
                placeholder="Adicione os detalhes, atualizações ou o que falta para concluir…"
                onChange={event => change({ ...latest.current, notes: event.target.value })} />
            </section>
            <section className="task-detail-section">
              <div className="task-detail-check-title"><h3><CheckCheck size={17} /> Checklist</h3><span>{done} de {content.checklist.length}</span></div>
              {content.checklist.length > 0 && <progress max={100} value={progress} aria-label="Progresso do checklist" />}
              {content.checklist.length === 0 && <p className="task-detail-empty">Divida a tarefa em pequenos passos.</p>}
              <div className="task-detail-items">
                {content.checklist.map((item, index) => (
                  <div key={item.id} className={`task-detail-item${item.done ? " is-done" : ""}`}>
                    <input type="checkbox" checked={item.done} aria-label={`Concluir ${item.text || `item ${index + 1}`}`}
                      onChange={event => change({ ...latest.current, checklist: latest.current.checklist.map(current => current.id === item.id ? { ...current, done: event.target.checked } : current) })} />
                    <input type="text" value={item.text} maxLength={240} placeholder="O que precisa ser feito?" aria-label={`Texto do item ${index + 1}`}
                      onChange={event => change({ ...latest.current, checklist: latest.current.checklist.map(current => current.id === item.id ? { ...current, text: event.target.value } : current) })} />
                    <button type="button" className="task-detail-icon" aria-label={`Remover item ${index + 1}`} onClick={() => change({ ...latest.current, checklist: latest.current.checklist.filter(current => current.id !== item.id) })}><X size={14} /></button>
                  </div>
                ))}
              </div>
              {canWrite && <button type="button" className="task-detail-add" disabled={content.checklist.length >= 30} onClick={() => change({ ...latest.current, checklist: [...latest.current.checklist, { id: crypto.randomUUID(), text: "", done: false }] })}><Plus size={15} /> Adicionar item</button>}
            </section>
          </fieldset>
        </div>
        {previewImageIndex !== null && content.images[previewImageIndex] && (
          <div className="task-image-lightbox" role="dialog" aria-modal="true" aria-label={`Imagem ${previewImageIndex + 1} de ${content.images.length}`} onClick={event => { if (event.target === event.currentTarget) setPreviewImageIndex(null); }}>
            <button type="button" className="task-image-lightbox-close" aria-label="Fechar imagem" onClick={() => setPreviewImageIndex(null)}><X size={20} /></button>
            {content.images.length > 1 && <button type="button" className="task-image-lightbox-nav is-previous" aria-label="Imagem anterior" onClick={() => setPreviewImageIndex(index => index === null ? 0 : (index - 1 + content.images.length) % content.images.length)}><ChevronLeft size={25} /></button>}
            <img src={content.images[previewImageIndex]} alt={`Imagem ampliada ${previewImageIndex + 1}`} />
            {content.images.length > 1 && <button type="button" className="task-image-lightbox-nav is-next" aria-label="Próxima imagem" onClick={() => setPreviewImageIndex(index => index === null ? 0 : (index + 1) % content.images.length)}><ChevronRight size={25} /></button>}
            {content.images.length > 1 && <span className="task-image-lightbox-count">{previewImageIndex + 1} de {content.images.length}</span>}
          </div>
        )}
        <footer className="task-detail-footer">
          {canDelete && onDelete && (confirmDelete ? (
            <span className="task-detail-delete-confirm">
              <b>Excluir esta tarefa?</b>
              <button type="button" className="is-confirm" disabled={closing} onClick={() => void removeTask()}>{closing ? "Excluindo..." : "Excluir"}</button>
              <button type="button" className="is-cancel" disabled={closing} onClick={() => setConfirmDelete(false)}>Cancelar</button>
            </span>
          ) : (
            <button type="button" className="task-detail-delete" disabled={closing} onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Excluir tarefa</button>
          ))}
          <span role="status" className={error ? "is-error" : ""}>{saveState === "saved" ? <><Check size={14} /> Tudo salvo</> : saveState === "error" ? error : "Salvando alterações…"}</span>
          {saveState === "error" && <button type="button" className="task-detail-edit" onClick={() => void flush()}>Tentar novamente</button>}
          <button type="button" className="task-detail-done" disabled={closing} onClick={() => void finish()}>Pronto</button>
        </footer>
      </div>
    </dialog>
  );
}
