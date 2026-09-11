import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, CheckCheck, Clock3, Flag, LockKeyhole, NotebookPen, Pencil, Plus, Users, X, UserRound, FileText } from "lucide-react";
import { TaskPriorityPicker, type TaskPriority } from "./TaskPriorityPicker";
import "./TaskDetailsDialog.css";

type Item = { id: string; text: string; done: boolean };
type Content = { notes: string; checklist: Item[]; priority: TaskPriority };
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
};

// The next write uses the last acknowledged version, even while typing during a request.
export function TaskDetailsDialog({ task, assignee, creator, canWrite, onSave, onClose, onEdit }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [content, setContent] = useState<Content>({ notes: task.notes, checklist: task.checklist, priority: task.priority ?? "normal" });
  const latest = useRef(content);
  const version = useRef(task.version);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flight = useRef<Promise<boolean> | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  const clean = (value: Content): Content => ({
    notes: value.notes,
    priority: value.priority,
    checklist: value.checklist.map(item => ({ ...item, text: item.text.trim() })).filter(item => item.text),
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
        <footer className="task-detail-footer">
          <span role="status" className={error ? "is-error" : ""}>{saveState === "saved" ? <><Check size={14} /> Tudo salvo</> : saveState === "error" ? error : "Salvando alterações…"}</span>
          {saveState === "error" && <button type="button" className="task-detail-edit" onClick={() => void flush()}>Tentar novamente</button>}
          <button type="button" className="task-detail-done" disabled={closing} onClick={() => void finish()}>Pronto</button>
        </footer>
      </div>
    </dialog>
  );
}
