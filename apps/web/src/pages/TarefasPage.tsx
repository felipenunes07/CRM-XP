import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CalendarDays,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Clock3,
  Columns3,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  ListTodo,
  Loader2,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { API_BASE_URL, api } from "../lib/api";
import "./TarefasPage.css";

/**
 * Quadro de tarefas da equipe dentro do CRM.
 *
 * Usa a mesma sessao do CRM. A API filtra tarefas privadas pelo usuario
 * autenticado; essa regra nao depende de esconder elementos no navegador.
 */
const TAREFAS_API = "/api/tasks";
const TEAM_PERSON_ID = "team";

type Person = { id: string; name: string; photo: string | null; position: number; hidden?: boolean };
type ChecklistItem = { id: string; text: string; done: boolean };
type Task = {
  id: string;
  title: string;
  notes: string;
  checklist: ChecklistItem[];
  person_id: string;
  due_date: string;
  due_time: string | null;
  deadline: number;
  status: "todo" | "doing" | "done";
  created_at: string;
  created_by_user_id: string;
  created_by_name: string;
  completed_at: string | null;
  version: number;
  can_notify: boolean;
};
type AuditLog = {
  id: string;
  task_id: string | null;
  actor_user_id: string;
  actor_name: string;
  action: "created" | "updated" | "assigned" | "status_changed" | "completed" | "reopened" | "deleted" | "reminder_sent" | "details_updated";
  task_title: string;
  details: Record<string, unknown>;
  created_at: string;
};
type Board = {
  people: Person[];
  tasks: Task[];
  audit_logs: AuditLog[];
  role: "manager" | "team";
  current_user_id: string;
};
type Draft = {
  id?: string;
  version?: number;
  title: string;
  person_id: string;
  due_date: string;
  due_time: string;
  notes: string;
};
type DetailsDraft = { task: Task; notes: string; checklist: ChecklistItem[] };

const CRM_AVATAR_BASE =
  "https://xpcrm-crm-backend.f0dgeg.easypanel.host/api/dashboard/executive/avatar/";
const CRM_AVATARS: Record<string, string> = {
  suelen: "bdb17129-1cee-434d-b6de-07430707c658",
  amanda: "8b1f1149-4947-45c8-8dfd-e752bc2644f0",
  thais: "c57d6e20-09ef-472f-86ba-f60e9b19eb9b",
  tamires: "e408855a-74b4-4009-80f4-520ac758761c",
};
const LOCAL_AVATARS: Record<string, string> = {
  lucas: "/seller-avatars/lucas.jpg",
  camila: "/seller-avatars/camila.jpg",
  iza: "/seller-avatars/iza.jpg",
  pedro: "/seller-avatars/pedro.jpg",
};
// Cor de cada pessoa, puxada do crachá dela, para bater o olho e reconhecer.
const PERSON_COLORS: Record<string, string> = {
  thais: "#8b5cf6",
  suelen: "#ec4899",
  amanda: "#b91c1c",
  lucas: "#0891b2",
  camila: "#a16207",
  iza: "#4d7c0f",
  pedro: "#111827",
  tamires: "#0f766e",
};
function personColor(person: Person) {
  return PERSON_COLORS[firstName(person.name)] ?? "#475569";
}

/**
 * A API do quadro ainda não expõe remover/reordenar pessoas. Enquanto isso,
 * a ordem e quem aparece no quadro ficam guardadas neste navegador.
 */
const ORDER_KEY = "tarefas:ordem-pessoas";
const HIDDEN_KEY = "tarefas:pessoas-ocultas";
function readIds(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
function writeIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* navegador sem armazenamento: a ordem vale só nesta sessão */
  }
}
function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Imagem invalida"));
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem"));
    reader.readAsDataURL(file);
  });
}

function firstName(name: string) {
  return name.trim().toLowerCase().split(/\s+/)[0] ?? "";
}
function avatarUrl(person: Person) {
  if (person.photo) return person.photo;
  const first = firstName(person.name);
  if (LOCAL_AVATARS[first]) return LOCAL_AVATARS[first];
  if (CRM_AVATARS[first]) return CRM_AVATAR_BASE + CRM_AVATARS[first];
  return null;
}
function brazilDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
function isLate(t: Task) {
  return t.status !== "done" && t.deadline < Date.now();
}
// Mesma conta que o servidor faz: sem horário, vale até o fim do dia (Brasília).
function deadlineOf(date: string, time: string) {
  return Date.parse(`${date}T${time ? `${time}:00` : "23:59:59"}-03:00`);
}
function startOfToday() {
  return new Date(`${brazilDate()}T00:00:00-03:00`).getTime();
}
function weekStart() {
  const today = brazilDate();
  const d = new Date(`${today}T00:00:00-03:00`);
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  return d.getTime() - ((day + 6) % 7) * 86400000;
}
function shortDate(t: Task) {
  if (t.due_date === brazilDate()) return "Hoje";
  return t.due_date.split("-").reverse().slice(0, 2).join("/");
}
function statusLabel(s: Task["status"]) {
  return s === "done" ? "Entregue" : s === "doing" ? "Fazendo" : "A fazer";
}
function auditActionLabel(action: AuditLog["action"]) {
  return {
    created: "criou",
    updated: "editou",
    assigned: "atribuiu",
    status_changed: "alterou o status de",
    completed: "concluiu",
    reopened: "reabriu",
    deleted: "excluiu",
    reminder_sent: "enviou uma cobrança sobre",
    details_updated: "atualizou notas/checklist de",
  }[action] ?? "alterou";
}
function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function calendarDays(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: count }, (_, index) => index + 1),
  ];
}

async function tarefasRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${TAREFAS_API}${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new Error("Sem conexão com o quadro de tarefas. Vamos tentar de novo sozinhos.");
  }
  const payload = (await response.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? "Não foi possível falar com o quadro de tarefas.");
  }
  return payload as T;
}

function Avatar({ person }: { person: Person }) {
  const url = avatarUrl(person);
  return (
    <span className="tarefas-avatar">
      {url ? (
        <img src={url} alt={person.name} width={24} height={24} decoding="async" />
      ) : (
        person.name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

/**
 * Marca a tarefa que tem observação escrita. O texto aparece logo abaixo do
 * título, para não precisar abrir a tarefa só para descobrir que tem recado.
 */
function TaskNote({ task, onOpen }: { task: Task; onOpen?: () => void }) {
  const note = (task.notes ?? "").trim();
  if (!note) return null;
  if (!onOpen) {
    return (
      <span className="tarefas-note" title={note}>
        <span className="tarefas-note-tag">obs</span>
        <span className="tarefas-note-text">{note}</span>
      </span>
    );
  }
  return (
    <button type="button" className="tarefas-note" title={note} onClick={onOpen}>
      <span className="tarefas-note-tag">obs</span>
      <span className="tarefas-note-text">{note}</span>
    </button>
  );
}

function TaskCreator({ task }: { task: Task }) {
  return <span className="tarefas-creator">Atribuída por {task.created_by_name}</span>;
}

function TaskChecklistPreview({ task }: { task: Task }) {
  if (!task.checklist.length) return null;
  const done = task.checklist.filter((item) => item.done).length;
  return (
    <span className="tarefas-checklist-preview">
      <span>{done}/{task.checklist.length} concluídos</span>
      {task.checklist.slice(0, 3).map((item) => (
        <small key={item.id} className={item.done ? "is-done" : undefined}>
          {item.done ? "☑" : "☐"} {item.text}
        </small>
      ))}
    </span>
  );
}

function TaskDetailsButton({ task, onOpen }: { task: Task; onOpen?: () => void }) {
  if (!onOpen) return null;
  return (
    <button type="button" className="tarefas-details-button" onClick={onOpen} title="Adicionar notas ou checklist">
      <NotebookPen size={13} /> Notas e checklist
    </button>
  );
}

function DeleteTaskButton({
  task,
  confirming,
  onAsk,
  onCancel,
  onConfirm,
}: {
  task: Task;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <button
        type="button"
        className="tarefas-icon is-danger"
        aria-label={`Apagar a tarefa ${task.title}`}
        title="Apagar tarefa"
        onClick={onAsk}
      >
        <Trash2 size={14} />
      </button>
    );
  }
  return (
    <span className="tarefas-confirmbox">
      <button type="button" className="tarefas-confirm" onClick={onConfirm}>
        Apagar
      </button>
      <button
        type="button"
        className="tarefas-icon"
        aria-label="Cancelar"
        title="Cancelar"
        onClick={onCancel}
      >
        <X size={14} />
      </button>
    </span>
  );
}

function NotifyTaskButton({
  task,
  confirming,
  onAsk,
  onCancel,
  onConfirm,
}: {
  task: Task;
  confirming: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <button
        type="button"
        className="tarefas-icon is-notify"
        disabled={!task.can_notify || task.status === "done"}
        aria-label={`Cobrar ${task.title} pelo WhatsApp`}
        title={task.can_notify ? "Cobrar pelo WhatsApp da Lili" : "Responsável sem WhatsApp cadastrado"}
        onClick={onAsk}
      >
        <Send size={14} />
      </button>
    );
  }
  return (
    <span className="tarefas-confirmbox">
      <button type="button" className="tarefas-confirm is-notify" onClick={onConfirm}>Enviar cobrança</button>
      <button type="button" className="tarefas-icon" onClick={onCancel} aria-label="Cancelar envio">
        <X size={14} />
      </button>
    </span>
  );
}

export default function TarefasPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"tarefas" | "quadro" | "calendario" | "historico">("tarefas");
  const [adminScope, setAdminScope] = useState<"mine" | "all">("mine");
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [filter, setFilter] = useState<"all" | "today" | "late" | "empty">("all");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detailsDraft, setDetailsDraft] = useState<DetailsDraft | null>(null);
  const detailsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [confirmNotify, setConfirmNotify] = useState("");
  const [notice, setNotice] = useState("");
  const [teamOpen, setTeamOpen] = useState(false);
  const [order, setOrder] = useState<string[]>(() => readIds(ORDER_KEY));
  const [hidden, setHidden] = useState<string[]>(() => readIds(HIDDEN_KEY));
  const [uploadingTeamAvatar, setUploadingTeamAvatar] = useState(false);

  useEffect(() => writeIds(ORDER_KEY, order), [order]);
  useEffect(() => writeIds(HIDDEN_KEY, hidden), [hidden]);

  async function uploadTeamAvatar(file: File | undefined) {
    if (!file || !token) return;
    try {
      setUploadingTeamAvatar(true);
      await api.uploadTaskTeamAvatar(token, await readImage(file));
      await boardQuery.refetch();
      setNotice("Foto do Time atualizada.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Nao foi possivel enviar a foto.");
    } finally {
      setUploadingTeamAvatar(false);
    }
  }

  async function setPersonVisibility(person: Person, visible: boolean) {
    if (!token) return;
    try {
      await api.setTaskPersonVisibility(token, person.id, visible);
      await boardQuery.refetch();
      setNotice(visible ? `${person.name} voltou para Tarefas.` : `${person.name} foi removido de Tarefas.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Nao foi possivel atualizar o usuario.");
    }
  }

  // O "Apagar" volta a ser um ícone sozinho se ninguém confirmar. Assim um
  // clique sem querer não deixa o botão vermelho preso na tela.
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(""), 10000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);
  useEffect(() => {
    if (!confirmNotify) return;
    const timer = setTimeout(() => setConfirmNotify(""), 10000);
    return () => clearTimeout(timer);
  }, [confirmNotify]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const boardQuery = useQuery({
    queryKey: ["tarefas-board", adminScope],
    queryFn: () => tarefasRequest<Board>(token!, `/board?scope=${user?.appRole === "admin" ? adminScope : "mine"}`),
    enabled: Boolean(token),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tarefas-board"] });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      tarefasRequest<{ id: string }>(token!, "/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
    // Se o servidor recusar, o quadro volta a mostrar a verdade dele.
    onError: invalidate,
  });

  /**
   * Aplica a mudança na tela na hora e só depois avisa o servidor. Antes, cada
   * clique esperava a resposta e ainda um recarregamento inteiro do quadro —
   * era isso que fazia a tela parecer travada.
   */
  const patchTasks = (change: (tasks: Task[]) => Task[]) =>
    queryClient.setQueryData<Board>(["tarefas-board", adminScope], (current) =>
      current ? { ...current, tasks: change(current.tasks) } : current,
    );

  const boardPeople = boardQuery.data?.people ?? [];
  const rank = (p: Person) => {
    const i = order.indexOf(p.id);
    return i === -1 ? order.length + p.position : i;
  };
  const orderedPeople = [...boardPeople].sort((a, b) => rank(a) - rank(b));
  const people = orderedPeople.filter((p) => !hidden.includes(p.id) && !p.hidden);
  const tasks = (boardQuery.data?.tasks ?? []).filter((t) => !hidden.includes(t.person_id) && !orderedPeople.find((p) => p.id === t.person_id)?.hidden);
  const auditLogs = boardQuery.data?.audit_logs ?? [];
  const manager = boardQuery.data?.role === "manager";
  const displayPeople =
    manager && adminScope === "all"
      ? people
      : people.filter(
          (person) => person.id === TEAM_PERSON_ID || person.id === boardQuery.data?.current_user_id,
        );

  const deleteTask = (task: Task) => {
    setConfirmDelete("");
    patchTasks((current) => current.filter((t) => t.id !== task.id));
    mutation.mutate({
      action: "delete",
      id: task.id,
      version: task.version,
    });
  };
  const notifyTask = (task: Task) => {
    setConfirmNotify("");
    mutation.mutate(
      { action: "notify", id: task.id, version: task.version },
      { onSuccess: () => setNotice("Cobrança enviada pelo WhatsApp principal da Lili.") },
    );
  };

  const movePerson = (id: string, direction: -1 | 1) => {
    const ids = orderedPeople.map((p) => p.id);
    const from = ids.indexOf(id);
    const to = from + direction;
    const moved = ids[from];
    const displaced = ids[to];
    if (from < 0 || moved === undefined || displaced === undefined) return;
    ids[from] = displaced;
    ids[to] = moved;
    setOrder(ids);
    if (manager && token) {
      void api.setTaskPeopleOrder(token, ids)
        .then(() => boardQuery.refetch())
        .catch(() => setNotice("Não foi possível salvar a ordem da equipe."));
    }
  };
  const togglePerson = (id: string) =>
    setHidden((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  const pending = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const overdue = useMemo(() => pending.filter(isLate), [pending]);
  const dueToday = useMemo(
    () => pending.filter((t) => t.due_date === brazilDate()),
    [pending],
  );
  const emptyPeople = useMemo(
    () => displayPeople.filter((p) => !pending.some((t) => t.person_id === p.id)),
    [displayPeople, pending],
  );
  const deliveredThisWeek = useMemo(
    () => tasks.filter((t) => t.completed_at && Date.parse(t.completed_at) >= weekStart()),
    [tasks],
  );
  const onTime = deliveredThisWeek.filter(
    (t) => t.completed_at && Date.parse(t.completed_at) <= t.deadline,
  ).length;
  const lateDelivered = deliveredThisWeek.length - onTime;

  const matchesSearch = (task: Task, person: Person) => {
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return (
      task.title.toLowerCase().includes(needle) || person.name.toLowerCase().includes(needle)
    );
  };

  const visibleFor = (person: Person) => {
    const own = tasks.filter((t) => t.person_id === person.id);
    const open = own.filter((t) => t.status !== "done");
    const byFilter =
      filter === "today"
        ? open.filter((t) => t.due_date === brazilDate())
        : filter === "late"
          ? open.filter(isLate)
          : open;
    const pendentes = byFilter
      .filter((t) => matchesSearch(t, person))
      .sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || a.deadline - b.deadline);
    // A tarefa concluida hoje continua na lista, riscada, em vez de sumir.
    // Assim um clique sem querer no circulo nao faz nada desaparecer: basta
    // clicar de novo para reabrir. Ela sai da lista sozinha no dia seguinte.
    const concluidasHoje =
      filter === "late"
        ? []
        : own
            .filter(
              (t) =>
                t.status === "done" &&
                t.completed_at &&
                Date.parse(t.completed_at) >= startOfToday(),
            )
            .filter((t) => matchesSearch(t, person))
            .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
    return [...pendentes, ...concluidasHoje];
  };

  const toggleStatus = (task: Task) => {
    const status = task.status === "done" ? "doing" : "done";
    patchTasks((current) =>
      current.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status,
              completed_at: status === "done" ? new Date().toISOString() : null,
              version: t.version + 1,
            }
          : t,
      ),
    );
    mutation.mutate({ action: "status", id: task.id, version: task.version, status });
  };

  const openNew = (personId: string) =>
    setDraft({
      title: "",
      person_id: personId || boardQuery.data?.current_user_id || people[0]?.id || "",
      due_date: brazilDate(),
      due_time: "",
      notes: "",
    });
  const openEdit = (task: Task) =>
    setDraft({
      id: task.id,
      version: task.version,
      title: task.title,
      person_id: task.person_id,
      due_date: task.due_date,
      due_time: task.due_time ?? "",
      notes: task.notes ?? "",
    });
  const openDetails = (task: Task) =>
    setDetailsDraft({
      task,
      notes: task.notes ?? "",
      checklist: task.checklist ?? [],
    });

  const queueDetailsSave = (next: DetailsDraft) => {
    setDetailsDraft(next);
    if (detailsSaveTimer.current) clearTimeout(detailsSaveTimer.current);
    detailsSaveTimer.current = setTimeout(() => {
      const checklist = next.checklist
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text);
      setDetailsSaving(true);
      patchTasks((current) => current.map((task) => task.id === next.task.id
        ? { ...task, notes: next.notes, checklist, version: task.version + 1 } : task));
      setDetailsDraft((current) => current?.task.id === next.task.id
        ? { ...current, task: { ...current.task, version: current.task.version + 1 } }
        : current);
      mutation.mutate(
        { action: "details", id: next.task.id, version: next.task.version, notes: next.notes, checklist },
        { onSettled: () => setDetailsSaving(false) },
      );
    }, 550);
  };

  const saveDraft = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !draft.title.trim()) return;
    // Editar já aparece na hora; criar precisa do id que o servidor devolve.
    if (draft.id) {
      patchTasks((current) =>
        current.map((t) =>
          t.id === draft.id
            ? {
                ...t,
                title: draft.title.trim(),
                notes: draft.notes,
                person_id: draft.person_id,
                due_date: draft.due_date,
                due_time: draft.due_time || null,
                deadline: deadlineOf(draft.due_date, draft.due_time),
                version: t.version + 1,
              }
            : t,
        ),
      );
    }
    mutation.mutate({
      action: draft.id ? "edit" : "create",
      ...(draft.id ? { id: draft.id, version: draft.version } : {}),
      title: draft.title.trim(),
      person_id: draft.person_id,
      due_date: draft.due_date,
      due_time: draft.due_time,
      notes: draft.notes,
    });
    setDraft(null);
  };

  const historyByDay = useMemo(() => {
    const sorted = [...deliveredThisWeek].sort((a, b) =>
      (b.completed_at ?? "").localeCompare(a.completed_at ?? ""),
    );
    const groups: { key: string; items: Task[] }[] = [];
    for (const task of sorted) {
      const key = new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(task.completed_at ?? ""));
      const group = groups.find((g) => g.key === key);
      if (group) group.items.push(task);
      else groups.push({ key, items: [task] });
    }
    return groups;
  }, [deliveredThisWeek]);

  const personName = (id: string) => people.find((p) => p.id === id)?.name ?? "—";
  const personById = (id: string) =>
    people.find((p) => p.id === id) ?? { id, name: personName(id), photo: null, position: 0 };
  const viewedMonth = monthKey(calendarCursor);
  const monthTasks = tasks.filter((task) => task.due_date.startsWith(viewedMonth));
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(calendarCursor);
  const shiftMonth = (amount: number) =>
    setCalendarCursor(
      (current) => new Date(current.getFullYear(), current.getMonth() + amount, 1),
    );

  if (boardQuery.isLoading) {
    return (
      <div className="page-loading">
        <Loader2 className="tarefas-spin" size={18} /> Carregando tarefas...
      </div>
    );
  }

  return (
    <section className="tarefas-page">
      <header className="tarefas-toolbar">
        <div className="tarefas-tabs">
          <button
            type="button"
            className="tarefas-tab"
            data-on={tab === "tarefas" ? "" : undefined}
            onClick={() => setTab("tarefas")}
          >
            <ListTodo size={13} /> Tarefas
          </button>
          <button
            type="button"
            className="tarefas-tab"
            data-on={tab === "quadro" ? "" : undefined}
            onClick={() => setTab("quadro")}
          >
            <Columns3 size={13} /> Quadro
          </button>
          <button
            type="button"
            className="tarefas-tab"
            data-on={tab === "calendario" ? "" : undefined}
            onClick={() => setTab("calendario")}
          >
            <CalendarDays size={13} /> Calendário
          </button>
          <button
            type="button"
            className="tarefas-tab"
            data-on={tab === "historico" ? "" : undefined}
            onClick={() => setTab("historico")}
          >
            <History size={13} /> Histórico
          </button>
        </div>
        {manager && (
          <div className="tarefas-scope" aria-label="Escopo das tarefas">
            <button type="button" data-on={adminScope === "mine" ? "" : undefined} onClick={() => setAdminScope("mine")}>Minhas</button>
            <button type="button" data-on={adminScope === "all" ? "" : undefined} onClick={() => setAdminScope("all")}>Todas da equipe</button>
          </div>
        )}
        {tab !== "historico" && (
          <div className="tarefas-chips">
            <button
              type="button"
              className="tarefas-chip"
              data-on={filter === "all" ? "" : undefined}
              onClick={() => setFilter("all")}
            >
              Todas <b>{pending.length}</b>
            </button>
            <button
              type="button"
              className="tarefas-chip"
              data-on={filter === "today" ? "" : undefined}
              onClick={() => setFilter("today")}
            >
              Vencem hoje <b>{dueToday.length}</b>
            </button>
            <button
              type="button"
              className="tarefas-chip"
              data-on={filter === "late" ? "" : undefined}
              onClick={() => setFilter("late")}
            >
              Atrasadas <b className={overdue.length ? "warn" : undefined}>{overdue.length}</b>
            </button>
            <button
              type="button"
              className="tarefas-chip"
              data-on={filter === "empty" ? "" : undefined}
              onClick={() => setFilter("empty")}
            >
              Sem tarefas <b>{emptyPeople.length}</b>
            </button>
          </div>
        )}
        <label className="tarefas-search">
          <Search size={14} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar tarefa ou pessoa"
          />
        </label>
        <button type="button" className="tarefas-refresh" onClick={() => openNew("")}>
          <Plus size={14} /> Nova tarefa
        </button>
        <a className="tarefas-refresh tarefas-fullscreen-link" href="/tarefas/tela" target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Abrir tela
        </a>
        {manager && (
          <button type="button" className="tarefas-refresh" onClick={() => setTeamOpen(true)}>
            <Users size={14} />
            Equipe
          </button>
        )}
        <button
          type="button"
          className="tarefas-refresh"
          onClick={() => void boardQuery.refetch()}
          disabled={boardQuery.isFetching}
        >
          <RefreshCw size={14} className={boardQuery.isFetching ? "tarefas-spin" : undefined} />
          Atualizar
        </button>
      </header>

      {(boardQuery.isError || mutation.isError) && (
        <div className="tarefas-error" role="alert">
          <AlertTriangle size={16} />
          <span>
            {(boardQuery.error as Error | null)?.message ??
              (mutation.error as Error | null)?.message}
          </span>
        </div>
      )}
      {notice && (
        <div className="tarefas-notice" role="status">
          <Check size={15} /> {notice}
        </div>
      )}

      {tab === "historico" ? (
        <div className="tarefas-sheet">
          <div className="tarefas-summary">
            <span>
              <strong>{deliveredThisWeek.length}</strong> entregas nesta semana
            </span>
            <span className="ok">
              <strong>{onTime}</strong> no prazo
            </span>
            <span className="late">
              <strong>{lateDelivered}</strong> com atraso
            </span>
          </div>
          {deliveredThisWeek.length === 0 ? (
            <p className="tarefas-empty">Nenhuma entrega registrada nesta semana ainda.</p>
          ) : (
            historyByDay.map((group) => (
              <div key={group.key}>
                <div className="tarefas-dayhead">
                  {group.key} <b>· {group.items.length} entrega(s)</b>
                </div>
                {group.items.map((task) => {
                  const delivered = task.completed_at
                    ? Date.parse(task.completed_at) > task.deadline
                    : false;
                  return (
                    <div className="tarefas-row tarefas-history" key={task.id}>
                      <span className="tarefas-title">{task.title}</span>
                      <span className="tarefas-person">
                        <Avatar person={personById(task.person_id)} />
                        {personName(task.person_id)}
                      </span>
                      <span className="tarefas-due">
                        {task.due_date.split("-").reverse().slice(0, 2).join("/")}
                      </span>
                      <span className={`tarefas-pill ${delivered ? "is-late" : "is-ok"}`}>
                        {delivered ? "Com atraso" : "No prazo"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
          {manager && (
            <div className="tarefas-audit">
              <div className="tarefas-dayhead">LOG DE ATIVIDADES</div>
              {auditLogs.length === 0 ? (
                <p className="tarefas-empty">Nenhuma ação registrada ainda.</p>
              ) : (
                auditLogs.map((log) => (
                  <div className="tarefas-audit-row" key={log.id}>
                    <span>
                      <strong>{log.actor_name}</strong> {auditActionLabel(log.action)} “{log.task_title}”
                    </span>
                    <time dateTime={log.created_at}>
                      {formatAuditTime(log.created_at)}
                    </time>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ) : tab === "calendario" ? (
        <div className="tarefas-calendar-wrap">
          <div className="tarefas-calendar-toolbar">
            <button type="button" className="tarefas-icon" aria-label="Mês anterior" onClick={() => shiftMonth(-1)}>
              <ChevronLeft size={17} />
            </button>
            <strong>{monthLabel}</strong>
            <button type="button" className="tarefas-icon" aria-label="Próximo mês" onClick={() => shiftMonth(1)}>
              <ChevronRight size={17} />
            </button>
            <button type="button" className="tarefas-btn" onClick={() => {
              const now = new Date();
              setCalendarCursor(new Date(now.getFullYear(), now.getMonth(), 1));
            }}>Hoje</button>
          </div>
          <div className="tarefas-coverage">
            {displayPeople.map((person) => {
              const assigned = monthTasks.filter((task) => task.person_id === person.id);
              const dates = assigned.map((task) => task.due_date).sort();
              const lastDate = dates[dates.length - 1];
              return (
                <div key={person.id} className="tarefas-coverage-card">
                  <Avatar person={person} />
                  <span><strong>{person.name}</strong><small>{assigned.length ? `${assigned.length} tarefa(s) · última em ${lastDate?.slice(8, 10)}/${lastDate?.slice(5, 7)}` : "sem tarefas neste mês"}</small></span>
                </div>
              );
            })}
          </div>
          <div className="tarefas-calendar">
            {["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"].map((day) => <div className="tarefas-calendar-weekday" key={day}>{day}</div>)}
            {calendarDays(calendarCursor).map((day, index) => {
              if (day === null) return <div className="tarefas-calendar-day is-blank" key={`blank-${index}`} />;
              const date = `${viewedMonth}-${String(day).padStart(2, "0")}`;
              const dayTasks = monthTasks.filter((task) => task.due_date === date);
              return (
                <div className={`tarefas-calendar-day${date === brazilDate() ? " is-today" : ""}`} key={date}>
                  <span className="tarefas-calendar-number">{day}</span>
                  {dayTasks.map((task) => {
                    const person = personById(task.person_id);
                    return (
                      <button type="button" className="tarefas-calendar-task" key={task.id} style={{ borderLeftColor: personColor(person) }} onClick={() => manager && openEdit(task)}>
                        <strong>{task.due_time ? `${task.due_time} ` : ""}{task.title}</strong>
                        <small>{person.name} · por {task.created_by_name}</small>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : tab === "quadro" ? (
        <div className="tarefas-kanban">
          {displayPeople
            .filter((person) => filter !== "empty" || emptyPeople.includes(person))
            .map((person) => {
              const cards = visibleFor(person);
              const open = tasks.filter(
                (t) => t.person_id === person.id && t.status !== "done",
              );
              return (
                <article
                  className="tarefas-col"
                  key={person.id}
                  style={{ borderTop: `3px solid ${personColor(person)}` }}
                >
                  <div className="tarefas-col-head">
                    <Avatar person={person} />
                    <strong style={{ color: personColor(person) }}>{person.name}</strong>
                    {open.length > 0 && <span className="tarefas-count">{open.length}</span>}
                  </div>
                  <div className="tarefas-cards">
                    {cards.length === 0 ? (
                      <p className="tarefas-col-empty">Sem tarefas pendentes</p>
                    ) : (
                      cards.map((task) => (
                        <div
                          className={`tarefas-card${task.status === "done" ? " is-finished" : ""}`}
                          key={task.id}
                        >
                          <div className="tarefas-card-top">
                            <button
                              type="button"
                              className={`tarefas-check${task.status === "done" ? " is-done" : ""}`}
                              disabled={!manager && task.status === "done"}
                              aria-label={
                                task.status === "done"
                                  ? "Reabrir tarefa"
                                  : "Marcar como concluída"
                              }
                              onClick={() => toggleStatus(task)}
                            >
                              <Check size={12} strokeWidth={3} />
                            </button>
                            <span
                              className={`tarefas-pill ${
                                task.status === "done"
                                  ? "is-ok"
                                  : isLate(task)
                                    ? "is-late"
                                    : task.status === "doing"
                                      ? "is-doing"
                                      : "is-todo"
                              }`}
                            >
                              {task.status === "done"
                                ? "Concluída"
                                : isLate(task)
                                  ? "Atrasada"
                                  : statusLabel(task.status)}
                            </span>
                          </div>
                          <div className="tarefas-titlewrap">
                            {manager ? (
                              <button
                                type="button"
                                className="tarefas-title is-link"
                                title="Abrir para editar"
                                onClick={() => openEdit(task)}
                              >
                                {task.title}
                              </button>
                            ) : (
                              <span className="tarefas-title">{task.title}</span>
                            )}
                            <TaskNote task={task} onOpen={manager ? () => openEdit(task) : undefined} />
                            <TaskCreator task={task} />
                            <TaskChecklistPreview task={task} />
                            <TaskDetailsButton
                              task={task}
                              onOpen={manager || task.person_id === boardQuery.data?.current_user_id ? () => openDetails(task) : undefined}
                            />
                          </div>
                          <div className="tarefas-card-foot">
                            <span className={`tarefas-due${isLate(task) ? " is-late" : ""}`}>
                              {isLate(task) ? <AlertTriangle size={13} /> : <Clock3 size={13} />}
                              {shortDate(task)}
                              {task.due_time ? ` ${task.due_time}` : ""}
                            </span>
                            {manager && (
                              <>
                                <NotifyTaskButton
                                  task={task}
                                  confirming={confirmNotify === task.id}
                                  onAsk={() => setConfirmNotify(task.id)}
                                  onCancel={() => setConfirmNotify("")}
                                  onConfirm={() => notifyTask(task)}
                                />
                                <DeleteTaskButton
                                  task={task}
                                  confirming={confirmDelete === task.id}
                                  onAsk={() => setConfirmDelete(task.id)}
                                  onCancel={() => setConfirmDelete("")}
                                  onConfirm={() => void deleteTask(task)}
                                />
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="tarefas-col-add">
                    <button type="button" onClick={() => openNew(person.id)}>
                      + tarefa
                    </button>
                  </div>
                </article>
              );
            })}
        </div>
      ) : (
        <div className="tarefas-sheet">
          <div className="tarefas-row tarefas-head">
            <span>TAREFA</span>
            <span>STATUS</span>
            <span>PRAZO</span>
            <span />
          </div>
          {displayPeople
            .filter((person) => filter !== "empty" || emptyPeople.includes(person))
            .map((person) => {
              const open = tasks.filter(
                (t) => t.person_id === person.id && t.status !== "done",
              );
              const lateCount = open.filter(isLate).length;
              const visible = visibleFor(person);
              const isCollapsed = collapsed[person.id];
              return (
                <div key={person.id}>
                  <div className="tarefas-row tarefas-group">
                    <span className="tarefas-person">
                      <button
                        type="button"
                        className="tarefas-toggle"
                        aria-label={isCollapsed ? "Expandir" : "Recolher"}
                        onClick={() =>
                          setCollapsed((current) => ({
                            ...current,
                            [person.id]: !current[person.id],
                          }))
                        }
                      >
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <Avatar person={person} />
                      <strong style={{ color: personColor(person) }}>{person.name}</strong>
                      {open.length > 0 ? (
                        <span className="tarefas-count">{open.length}</span>
                      ) : (
                        <span className="tarefas-muted">sem tarefas pendentes</span>
                      )}
                      {lateCount > 0 && (
                        <span className="tarefas-count is-late">{lateCount} atrasada(s)</span>
                      )}
                    </span>
                    <span />
                    <span />
                    <span className="tarefas-actions">
                      <button
                        type="button"
                        className="tarefas-icon"
                        aria-label={`Adicionar tarefa para ${person.name}`}
                        onClick={() => {
                          openNew(person.id);
                          setCollapsed((current) => ({ ...current, [person.id]: false }));
                        }}
                      >
                        <Plus size={16} />
                      </button>
                    </span>
                  </div>
                  {!isCollapsed && (
                    <>
                      {visible.map((task) => (
                        <div
                          className={`tarefas-row${task.status === "done" ? " is-finished" : ""}`}
                          key={task.id}
                        >
                          <span className="tarefas-person">
                            <button
                              type="button"
                              className={`tarefas-check${task.status === "done" ? " is-done" : ""}`}
                              disabled={!manager && task.status === "done"}
                              aria-label={
                                task.status === "done"
                                  ? "Reabrir tarefa"
                                  : "Marcar como concluída"
                              }
                              title={
                                task.status === "done"
                                  ? "Clique para reabrir"
                                  : "Marcar como concluída"
                              }
                              onClick={() => toggleStatus(task)}
                            >
                              <Check size={12} strokeWidth={3} />
                            </button>
                            <span className="tarefas-titlewrap">
                              {manager ? (
                                <button
                                  type="button"
                                  className="tarefas-title is-link"
                                  title="Abrir para editar"
                                  onClick={() => openEdit(task)}
                                >
                                  {task.title}
                                </button>
                              ) : (
                                <span className="tarefas-title">{task.title}</span>
                              )}
                              <TaskNote task={task} onOpen={manager ? () => openEdit(task) : undefined} />
                              <TaskCreator task={task} />
                              <TaskChecklistPreview task={task} />
                              <TaskDetailsButton
                                task={task}
                                onOpen={manager || task.person_id === boardQuery.data?.current_user_id ? () => openDetails(task) : undefined}
                              />
                            </span>
                          </span>
                          <span
                            className={`tarefas-pill ${
                              task.status === "done"
                                ? "is-ok"
                                : isLate(task)
                                  ? "is-late"
                                  : task.status === "doing"
                                    ? "is-doing"
                                    : "is-todo"
                            }`}
                          >
                            {task.status === "done"
                              ? "Concluída"
                              : isLate(task)
                                ? "Atrasada"
                                : statusLabel(task.status)}
                          </span>
                          <span className={`tarefas-due${isLate(task) ? " is-late" : ""}`}>
                            {isLate(task) ? <AlertTriangle size={13} /> : <Clock3 size={13} />}
                            {shortDate(task)}
                            {task.due_time ? ` ${task.due_time}` : ""}
                          </span>
                          <span className="tarefas-actions">
                            {manager && (
                              <>
                                <NotifyTaskButton
                                  task={task}
                                  confirming={confirmNotify === task.id}
                                  onAsk={() => setConfirmNotify(task.id)}
                                  onCancel={() => setConfirmNotify("")}
                                  onConfirm={() => notifyTask(task)}
                                />
                                <DeleteTaskButton
                                  task={task}
                                  confirming={confirmDelete === task.id}
                                  onAsk={() => setConfirmDelete(task.id)}
                                  onCancel={() => setConfirmDelete("")}
                                  onConfirm={() => void deleteTask(task)}
                                />
                              </>
                            )}
                          </span>
                        </div>
                      ))}
                      {filter === "all" && !search.trim() && (
                        <div className="tarefas-addrow">
                          <button type="button" onClick={() => openNew(person.id)}>
                            <Plus size={14} /> tarefa
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          {filter === "empty" && emptyPeople.length === 0 && (
            <p className="tarefas-empty">
              <ClipboardList size={18} /> Todos têm tarefas pendentes.
            </p>
          )}
        </div>
      )}

      {teamOpen && (
        <div
          className="tarefas-modal-bg"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setTeamOpen(false);
          }}
        >
          <div className="tarefas-modal">
            <h2>Equipe no quadro</h2>
            <p className="tarefas-modal-sub">
              Escolha a ordem das colunas e quem aparece. Quem sai do quadro fica guardado — as
              tarefas dele continuam salvas e voltam ao clicar no olho de novo.
            </p>
            {user?.appRole === "admin" && (
              <label className="tarefas-team-avatar-upload">
                Foto do Time
                <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" disabled={uploadingTeamAvatar} onChange={(event) => void uploadTeamAvatar(event.target.files?.[0])} />
                <span>{uploadingTeamAvatar ? "Enviando..." : "Escolher imagem"}</span>
              </label>
            )}
            <ul className="tarefas-team">
              {orderedPeople.map((person, index) => {
                const off = hidden.includes(person.id) || Boolean(person.hidden);
                const pending = tasks.filter(
                  (t) => t.person_id === person.id && t.status !== "done",
                ).length;
                return (
                  <li key={person.id} className={off ? "is-off" : undefined}>
                    <Avatar person={person} />
                    <strong style={{ color: off ? undefined : personColor(person) }}>
                      {person.name}
                    </strong>
                    <span className="tarefas-muted">
                      {off
                        ? "fora do quadro"
                        : pending > 0
                          ? `${pending} pendente(s)`
                          : "sem pendências"}
                    </span>
                    <button
                      type="button"
                      className="tarefas-icon"
                      aria-label={`Subir ${person.name}`}
                      title="Subir"
                      disabled={index === 0}
                      onClick={() => movePerson(person.id, -1)}
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      type="button"
                      className="tarefas-icon"
                      aria-label={`Descer ${person.name}`}
                      title="Descer"
                      disabled={index === orderedPeople.length - 1}
                      onClick={() => movePerson(person.id, 1)}
                    >
                      <ChevronDown size={15} />
                    </button>
                    <button
                      type="button"
                      className={`tarefas-icon${off ? "" : " is-danger"}`}
                      aria-label={
                        off ? `Trazer ${person.name} de volta` : `Tirar ${person.name} do quadro`
                      }
                      title={off ? "Trazer de volta" : "Tirar do quadro"}
                      onClick={() => {
                        if (user?.appRole === "admin" && person.id !== TEAM_PERSON_ID) {
                          void setPersonVisibility(person, Boolean(person.hidden));
                        } else {
                          togglePerson(person.id);
                        }
                      }}
                    >
                      {off ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="tarefas-modal-note">
              Como administrador, sua ordem é salva para toda a equipe. Use as setas para definir a sequência.
            </p>
            <div className="tarefas-modal-actions">
              <button
                type="button"
                className="tarefas-btn"
                onClick={() => {
                  setOrder([]);
                  setHidden([]);
                }}
              >
                Restaurar padrão
              </button>
              <button
                type="button"
                className="tarefas-btn is-primary"
                onClick={() => setTeamOpen(false)}
              >
                Pronto
              </button>
            </div>
          </div>
        </div>
      )}

      {detailsDraft && (
        <div
          className="tarefas-modal-bg"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDetailsDraft(null);
          }}
        >
          <div className="tarefas-modal tarefas-details-modal">
            <h2>Notas e checklist</h2>
            <p className="tarefas-modal-sub">{detailsDraft.task.title}</p>
            <label className="tarefas-modal-notes">
              Suas notas e atualização
              <textarea
                rows={12}
                maxLength={10000}
                value={detailsDraft.notes}
                placeholder="Escreva aqui o andamento, resultado, impedimentos ou qualquer observação importante..."
                onChange={(event) => queueDetailsSave({ ...detailsDraft, notes: event.target.value })}
              />
              <small>{detailsDraft.notes.length}/10000 caracteres</small>
            </label>
            <div className="tarefas-checklist-editor">
              <strong>Checklist</strong>
              <p>Marque os itens concluídos ou crie seus próprios checkpoints.</p>
              {detailsDraft.checklist.map((item) => (
                <div className="tarefas-checklist-item" key={item.id}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(event) =>
                      queueDetailsSave({
                        ...detailsDraft,
                        checklist: detailsDraft.checklist.map((current) =>
                          current.id === item.id ? { ...current, done: event.target.checked } : current,
                        ),
                      })
                    }
                  />
                  <input
                    value={item.text}
                    maxLength={240}
                    aria-label="Texto do checkpoint"
                    onChange={(event) =>
                      queueDetailsSave({
                        ...detailsDraft,
                        checklist: detailsDraft.checklist.map((current) =>
                          current.id === item.id ? { ...current, text: event.target.value } : current,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="tarefas-icon is-danger"
                    aria-label="Remover checkpoint"
                    onClick={() =>
                      queueDetailsSave({
                        ...detailsDraft,
                        checklist: detailsDraft.checklist.filter((current) => current.id !== item.id),
                      })
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="tarefas-add-check"
                disabled={detailsDraft.checklist.length >= 30}
                onClick={() =>
                  queueDetailsSave({
                    ...detailsDraft,
                    checklist: [...detailsDraft.checklist, { id: crypto.randomUUID(), text: "", done: false }],
                  })
                }
              >
                <Plus size={14} /> Adicionar checkpoint
              </button>
            </div>
            <div className="tarefas-modal-actions">
              <span className="tarefas-muted">{detailsSaving ? "Salvando..." : "Salvo automaticamente"}</span>
              <button type="button" className="tarefas-btn is-primary" onClick={() => setDetailsDraft(null)}>Pronto</button>
            </div>
          </div>
        </div>
      )}

      {draft && (
        <div
          className="tarefas-modal-bg"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDraft(null);
          }}
        >
          <form className="tarefas-modal" onSubmit={saveDraft}>
            <h2>{draft.id ? "Editar tarefa" : "Nova tarefa"}</h2>
            <p className="tarefas-modal-sub">Defina o que precisa ser feito e até quando.</p>

            <label>
              O que precisa ser feito?
              <input
                autoFocus
                required
                maxLength={240}
                value={draft.title}
                placeholder="Ex.: Conferir o estoque de embalagens"
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>

            <label>
              Responsável
              <select
                value={draft.person_id}
                onChange={(event) => setDraft({ ...draft, person_id: event.target.value })}
              >
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="tarefas-modal-cols">
              <label>
                Prazo
                <input
                  type="date"
                  required
                  value={draft.due_date}
                  onChange={(event) => setDraft({ ...draft, due_date: event.target.value })}
                />
              </label>
              <label>
                Horário <span>(opcional)</span>
                <input
                  type="time"
                  value={draft.due_time}
                  onChange={(event) => setDraft({ ...draft, due_time: event.target.value })}
                />
              </label>
            </div>

            <label className="tarefas-modal-notes">
              Observação <span>(opcional)</span>
              <textarea
                rows={6}
                maxLength={3000}
                value={draft.notes}
                placeholder="Algum detalhe para ajudar na execução?"
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              />
            </label>

            <div className="tarefas-modal-actions">
              <button type="button" className="tarefas-btn" onClick={() => setDraft(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                className="tarefas-btn is-primary"
                disabled={!draft.title.trim()}
              >
                {draft.id ? "Salvar alterações" : "Criar tarefa"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
