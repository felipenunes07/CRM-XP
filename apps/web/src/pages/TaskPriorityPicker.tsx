import { useRef, useState } from "react";
import { Check, ChevronDown, Flag, Loader2 } from "lucide-react";
import "./TaskPriorityPicker.css";

export type TaskPriority = "low" | "normal" | "high" | "urgent";
export const taskPriorityLabels = { urgent: "Urgente", high: "Alta", normal: "Normal", low: "Baixa" };
type Props = { value: TaskPriority; onChange?: (value: TaskPriority) => Promise<void> | void; disabled?: boolean; label?: string };

export function TaskPriorityPicker({ value = "normal", onChange, disabled, label = "Alterar prioridade" }: Props) {
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  function show() {
    const menu = popup.current;
    const rect = trigger.current?.getBoundingClientRect();
    if (!menu || !rect) return;
    if (open) { menu.hidePopover(); return; }
    menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 224))}px`;
    menu.style.top = `${Math.max(8, rect.bottom + 270 > innerHeight ? rect.top - 270 : rect.bottom + 6)}px`;
    menu.showPopover();
    menu.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }
  async function select(next: TaskPriority) {
    if (pending) return;
    setPending(true); setError("");
    try { await onChange?.(next); popup.current?.hidePopover(); trigger.current?.focus(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível salvar a prioridade."); }
    finally { setPending(false); }
  }
  if (!onChange) return <span className={`task-priority-value is-${value}`}><Flag size={16} fill="currentColor" />{taskPriorityLabels[value]}</span>;
  return <>
    <button ref={trigger} type="button" className={`task-priority-trigger is-${value}`} disabled={disabled || pending}
      aria-label={`${label}: ${taskPriorityLabels[value]}`} aria-haspopup="menu" aria-expanded={open} onClick={show}>
      {pending ? <Loader2 size={16} className="tarefas-spin" /> : <Flag size={16} fill="currentColor" />}
      {taskPriorityLabels[value]}<ChevronDown size={13} className="task-priority-chevron" />
    </button>
    <div ref={popup} popover="auto" className="task-priority-menu" onToggle={event => setOpen(event.newState === "open")}>
      <div className="task-priority-menu-label"><Flag size={14} /> Prioridade</div>
      <div role="menu" aria-label="Escolher prioridade" onKeyDown={event => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }}>
        {(Object.keys(taskPriorityLabels) as TaskPriority[]).map(priority => <button key={priority} type="button" role="menuitemradio" aria-checked={value === priority}
          className={`is-${priority}`} disabled={pending} onClick={() => void select(priority)}>
          <Flag size={16} fill="currentColor" /><span>{taskPriorityLabels[priority]}</span>{value === priority && <Check size={15} />}
        </button>)}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  </>;
}
