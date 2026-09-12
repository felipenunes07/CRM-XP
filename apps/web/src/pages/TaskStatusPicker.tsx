import { useRef, useState } from "react";
import { Check, ChevronDown, Circle, CircleCheck, Loader2, PlayCircle } from "lucide-react";
import "./TaskStatusPicker.css";

export type TaskStatus = "todo" | "doing" | "review" | "done";
const options: { value: TaskStatus; label: string; Icon: typeof Circle }[] = [
  { value: "todo", label: "A fazer", Icon: Circle },
  { value: "doing", label: "Em andamento", Icon: PlayCircle },
  { value: "review", label: "Em revisão", Icon: CircleCheck },
  { value: "done", label: "Concluída", Icon: CircleCheck },
];
const defaultOption = { value: "todo" as const, label: "A fazer", Icon: Circle };
const optionFor = (status: TaskStatus) => options.find(option => option.value === status) ?? defaultOption;

export function TaskStatusPicker({ taskTitle, value, onChange, allowedStatuses }: { taskTitle: string; value: TaskStatus; onChange?: (status: TaskStatus) => Promise<void> | void; allowedStatuses?: TaskStatus[] }) {
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const current = optionFor(value);
  function show() {
    const menu = popup.current;
    const rect = trigger.current?.getBoundingClientRect();
    if (!menu || !rect) return;
    if (open) return menu.hidePopover();
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 210))}px`;
    menu.style.top = `${Math.max(8, rect.bottom + 190 > innerHeight ? rect.top - 190 : rect.bottom + 6)}px`;
    menu.showPopover();
    menu.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }
  async function choose(status: TaskStatus) {
    if (status === value || pending) { popup.current?.hidePopover(); return; }
    setPending(true); setError("");
    try { await onChange?.(status); popup.current?.hidePopover(); trigger.current?.focus(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o status."); }
    finally { setPending(false); }
  }
  if (!onChange) return <span className={`task-status-value is-${value}`}><current.Icon size={14} />{current.label}</span>;
  return <>
    <button ref={trigger} type="button" className={`task-status-trigger is-${value}`} onClick={show} disabled={pending}
      aria-label={`Status de ${taskTitle}: ${current.label}`} aria-haspopup="menu" aria-expanded={open}>
      {pending ? <Loader2 className="tarefas-spin" size={14} /> : <current.Icon size={14} />}{current.label}<ChevronDown size={13} />
    </button>
    <div ref={popup} popover="auto" className="task-status-menu" onToggle={event => setOpen(event.newState === "open")}>
      <div className="task-status-menu-label">Status</div>
      <div role="menu" aria-label="Escolher status">
        {options.filter(option => !allowedStatuses || option.value === value || allowedStatuses.includes(option.value)).map(option => <button key={option.value} type="button" role="menuitemradio" aria-checked={option.value === value}
          className={`is-${option.value}`} onClick={() => void choose(option.value)} disabled={pending}>
          <option.Icon size={16} /><span>{option.label}</span>{option.value === value && <Check size={15} />}
        </button>)}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  </>;
}
