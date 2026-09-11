import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CalendarDays,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Columns3,
  ExternalLink,
  Eye,
  EyeOff,
  Flag,
  FileText,
  CircleCheck,
  UserRound,
  GripVertical,
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
import { TaskDetailsDialog } from "./TaskDetailsDialog";
import { TaskPriorityPicker } from "./TaskPriorityPicker";
import { TaskStatusPicker } from "./TaskStatusPicker";
import "./TarefasWorkspace.css";

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
  priority: "low" | "normal" | "high" | "urgent";
  created_at: string;
  created_by_user_id: string;
  created_by_name: string;
  created_by_photo: string | null;
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
  priority: Task["priority"];
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
const PRIORITY_LABEL: Record<Task["priority"], string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

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
    ...Array.from({ length: (7 - (firstWeekday + count) % 7) % 7 }, () => null),
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
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className="tarefas-avatar" title={person.name}>
      {url && url !== failedUrl ? (
        <img src={url} alt={person.name} width={24} height={24} decoding="async" onError={() => setFailedUrl(url)} />
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
      <NotebookPen size={14} />
      <span className="tarefas-note-tag">obs</span>
      <span className="tarefas-note-text">{note}</span>
    </button>
  );
}

function TaskCreator({ task }: { task: Task }) {
  return <span className="tarefas-creator">Atribuída por {task.created_by_name}</span>;
}

function TaskChecklistPreview({ task, compact = false }: { task: Task; compact?: boolean }) {
  if (!task.checklist.length) return null;
  const done = task.checklist.filter((item) => item.done).length;
  return (
    <span className="tarefas-checklist-preview">
      <span>{compact && <CircleCheck size={13} />}{done}/{task.checklist.length} concluídos</span>
      {!compact && task.checklist.slice(0, 3).map((item) => (
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
    <button type="button" className="tarefas-details-button" onClick={onOpen} aria-label={`Abrir detalhes de ${task.title}`} title="Abrir tarefa">
      <NotebookPen size={13} /> Detalhes
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
  const [listScope, setListScope] = useState<"received" | "created">("received");
  const [assignedPeopleFilter, setAssignedPeopleFilter] = useState<"all" | "with_tasks">("all");
  const [adminScope, setAdminScope] = useState<"mine" | "all">("mine");
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarPersonId, setCalendarPersonId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "today" | "late">("all");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detailsDraft, setDetailsDraft] = useState<DetailsDraft | null>(null);
  const kanbanRef = useRef<HTMLDivElement | null>(null);
  const kanbanDrag = useRef<{ pointerId: number; startX: number; startScrollLeft: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [confirmNotify, setConfirmNotify] = useState("");
  const [notice, setNotice] = useState("");
  const [teamOpen, setTeamOpen] = useState(false);
  const [order, setOrder] = useState<string[]>(() => readIds(ORDER_KEY));
  const [hidden, setHidden] = useState<string[]>(() => readIds(HIDDEN_KEY));
  const [uploadingTeamAvatar, setUploadingTeamAvatar] = useState(false);
  const [draggingPersonId, setDraggingPersonId] = useState<string | null>(null);

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
    // Mantém as atribuições chegando para cada pessoa sem recarregar a página.
    refetchInterval: 3000,
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

  // Versões anteriores guardavam "fora do quadro" apenas neste navegador.
  // Ao abrir como administrador, migra essa escolha uma única vez para a
  // configuração compartilhada, inclusive para o Time.
  useEffect(() => {
    if (!token || user?.appRole !== "admin" || !boardQuery.data) return;
    const legacyHidden = boardQuery.data.people.filter(
      (person) => hidden.includes(person.id) && !person.hidden,
    );
    if (legacyHidden.length === 0) return;
    void Promise.all(
      legacyHidden.map((person) => api.setTaskPersonVisibility(token, person.id, false)),
    ).then(() => boardQuery.refetch()).catch(() => undefined);
  }, [boardQuery.data, hidden, token, user?.appRole]);

  /**
   * Aplica a mudança na tela na hora e só depois avisa o servidor. Antes, cada
   * clique esperava a resposta e ainda um recarregamento inteiro do quadro —
   * era isso que fazia a tela parecer travada.
   */
  const patchTasks = (change: (tasks: Task[]) => Task[]) =>
    queryClient.setQueryData<Board>(["tarefas-board", adminScope], (current) =>
      current ? { ...current, tasks: change(current.tasks) } : current,
    );

  const changePriority = async (task: Task, priority: Task["priority"]) => {
    try {
      await tarefasRequest(token!, "/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "priority", id: task.id, version: task.version, priority }),
      });
      patchTasks(current => current.map(item => item.id === task.id ? { ...item, priority, version: task.version + 1 } : item));
    } finally {
      void invalidate();
    }
  };

  const boardPeople = boardQuery.data?.people ?? [];
  const rank = (p: Person) => {
    const i = order.indexOf(p.id);
    return i === -1 ? order.length + p.position : i;
  };
  const orderedPeople = [...boardPeople].sort((a, b) => rank(a) - rank(b));
  const tasks = (boardQuery.data?.tasks ?? []).filter((t) => !hidden.includes(t.person_id) && !orderedPeople.find((p) => p.id === t.person_id)?.hidden);
  const auditLogs = boardQuery.data?.audit_logs ?? [];
  const manager = boardQuery.data?.role === "manager";
  // O Time só ocupa espaço para funcionários quando houver uma tarefa pública.
  // Se foi removido pelo administrador (inclusive na configuração antiga), ele
  // não fica aparecendo vazio nas tarefas pessoais.
  const people = orderedPeople.filter(
    (person) =>
      !hidden.includes(person.id) &&
      !person.hidden &&
      (person.id !== TEAM_PERSON_ID || manager || tasks.some((task) => task.person_id === TEAM_PERSON_ID)),
  );
  // A lista de responsáveis não deve depender das colunas visíveis: qualquer
  // usuário ativo pode receber uma tarefa criada por uma vendedora.
  const assignablePeople = orderedPeople;
  const currentUserId = boardQuery.data?.current_user_id;
  const isTaskAssignedByMe = (person: Person) =>
    tasks.some((task) => task.person_id === person.id && task.created_by_user_id === currentUserId);
  const groupScope = (person: Person) => {
    if (manager) return null;
    if (person.id === currentUserId) return "Minhas tarefas";
    if (isTaskAssignedByMe(person)) return "Atribuídas por mim";
    return person.id === TEAM_PERSON_ID ? "Tarefas do Time" : null;
  };
  const displayPeople =
    manager && adminScope === "all"
      ? people
      : people
          .filter(
            (person) =>
              person.id === TEAM_PERSON_ID ||
              person.id === currentUserId ||
              isTaskAssignedByMe(person),
          )
          .sort((left, right) => {
            const weight = (person: Person) =>
              person.id === currentUserId ? 0 : person.id === TEAM_PERSON_ID ? 1 : 2;
            return weight(left) - weight(right);
          });

  const deleteTask = (task: Task) => {
    setConfirmDelete("");
    patchTasks((current) => current.filter((t) => t.id !== task.id));
    mutation.mutate({
      action: "delete",
      id: task.id,
      version: task.version,
    });
  };
  const notifyTask = async (task: Task) => {
    setConfirmNotify("");
    await mutation.mutateAsync({ action: "notify", id: task.id, version: task.version });
    setNotice("Cobrança enviada pelo WhatsApp principal da Lili.");
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

  const reorderPeople = (draggedId: string, targetId: string) => {
    if (!manager || draggedId === targetId) return;
    const ids = orderedPeople.map((person) => person.id);
    if (!ids.includes(draggedId) || !ids.includes(targetId)) return;

    ids.splice(ids.indexOf(draggedId), 1);
    ids.splice(ids.indexOf(targetId), 0, draggedId);
    setOrder(ids);
    if (token) {
      void api.setTaskPeopleOrder(token, ids)
        .then(() => boardQuery.refetch())
        .catch(() => setNotice("Não foi possível salvar a ordem da equipe."));
    }
  };
  const togglePerson = (id: string) =>
    setHidden((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  const startKanbanDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a, .tarefas-column-drag-handle")) return;
    const board = kanbanRef.current;
    if (!board) return;
    kanbanDrag.current = { pointerId: event.pointerId, startX: event.clientX, startScrollLeft: board.scrollLeft };
    board.setPointerCapture(event.pointerId);
    board.classList.add("is-dragging");
  };
  const moveKanbanDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = kanbanDrag.current;
    const board = kanbanRef.current;
    if (!drag || !board || drag.pointerId !== event.pointerId) return;
    board.scrollLeft = drag.startScrollLeft - (event.clientX - drag.startX);
  };
  const endKanbanDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (kanbanDrag.current?.pointerId !== event.pointerId) return;
    kanbanDrag.current = null;
    kanbanRef.current?.classList.remove("is-dragging");
  };

  const listTasks = useMemo(() => {
    if (manager && adminScope === "all") return tasks;
    return tasks.filter((task) =>
      listScope === "received"
        ? task.person_id === currentUserId
        : task.person_id !== currentUserId && task.created_by_user_id === currentUserId,
    );
  }, [adminScope, currentUserId, listScope, manager, tasks]);
  const listPeople = useMemo(() => {
    if (manager && adminScope === "all") return displayPeople;
    if (listScope === "received") return displayPeople.filter((person) => person.id === currentUserId);
    const coworkers = assignablePeople.filter(
      (person) => person.id !== TEAM_PERSON_ID && person.id !== currentUserId,
    );
    return assignedPeopleFilter === "with_tasks"
      ? coworkers.filter((person) => listTasks.some((task) => task.person_id === person.id))
      : coworkers;
  }, [adminScope, assignedPeopleFilter, assignablePeople, currentUserId, displayPeople, listScope, listTasks, manager]);
  const pending = useMemo(() => listTasks.filter((t) => t.status !== "done"), [listTasks]);
  const overdue = useMemo(() => pending.filter(isLate), [pending]);
  const dueToday = useMemo(
    () => pending.filter((t) => t.due_date === brazilDate()),
    [pending],
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

  const changeStatus = async (task: Task, status: Task["status"]) => {
    if (status === task.status) return;
    await tarefasRequest(token!, "/board", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", id: task.id, version: task.version, status }),
    });
    patchTasks(current => current.map(item => item.id === task.id ? {
      ...item, status, completed_at: status === "done" ? new Date().toISOString() : null, version: task.version + 1,
    } : item));
    void invalidate();
  };
  const toggleStatus = (task: Task) => void changeStatus(task, task.status === "done" ? "doing" : "done");
  const canChangeStatus = (task: Task) =>
    manager ||
    (task.status !== "done" &&
      (task.person_id === TEAM_PERSON_ID || task.person_id === boardQuery.data?.current_user_id));

  const openNew = (personId: string) =>
    setDraft({
      title: "",
      person_id: personId || boardQuery.data?.current_user_id || people[0]?.id || "",
      due_date: brazilDate(),
      due_time: "",
      notes: "",
      priority: "normal",
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
      priority: task.priority ?? "normal",
    });
  const openDetails = (task: Task) =>
    setDetailsDraft({
      task,
      notes: task.notes ?? "",
      checklist: task.checklist ?? [],
    });
  const openTaskFromRow = (event: ReactMouseEvent<HTMLDivElement>, task: Task) => {
    if ((event.target as HTMLElement).closest("button, input, select, a, label")) return;
    openDetails(task);
  };

  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !draft.title.trim() || mutation.isPending) return;
    try {
      await mutation.mutateAsync({
        action: draft.id ? "edit" : "create",
        ...(draft.id ? { id: draft.id, version: draft.version } : {}),
        title: draft.title.trim(),
        person_id: draft.person_id,
        due_date: draft.due_date,
        due_time: draft.due_time,
        notes: draft.notes,
        priority: draft.priority,
      });
      setDraft(null);
    } catch {
      // Keep the form and its contents available when saving fails.
    }
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
  const creatorFor = (task: Task): Person => ({
    id: task.created_by_user_id,
    name: task.created_by_name,
    photo: task.created_by_photo ?? personById(task.created_by_user_id).photo,
    position: 0,
  });
  const viewedMonth = monthKey(calendarCursor);
  const monthTasks = tasks.filter((task) => task.due_date.startsWith(viewedMonth));
  const selectedCalendarPerson = displayPeople.find(person => person.id === calendarPersonId);
  const calendarTasks = monthTasks.filter(task =>
    (!selectedCalendarPerson || task.person_id === selectedCalendarPerson.id) &&
    matchesSearch(task, personById(task.person_id)) &&
    (filter === "all" || (task.status !== "done" && (filter === "today" ? task.due_date === brazilDate() : isLate(task)))),
  );
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
      <div className="tarefas-page-heading">
        <div className="tarefas-page-mark"><ListTodo size={24} /></div>
        <div><p>Workspace <ChevronRight size={13} /> Tarefas</p><h1>{manager && adminScope === "all" ? "Tarefas da equipe" : listScope === "received" ? "Tarefas atribuídas a mim" : "Tarefas atribuídas por mim"}</h1></div>
        <span className="tarefas-page-caption"><Users size={16} /> {manager && adminScope === "all" ? "Visão da equipe" : listScope === "received" ? "Somente suas tarefas" : "Tarefas que você criou para outras pessoas"}</span>
      </div>
      <header className="tarefas-toolbar">
        <div className="tarefas-tabs">
          <button
            type="button"
            className="tarefas-tab"
            data-on={tab === "tarefas" && listScope === "received" ? "" : undefined}
            onClick={() => { setTab("tarefas"); setListScope("received"); }}
          >
            <ListTodo size={13} /> Atribuídas a mim
          </button>
          <button
            type="button"
            className="tarefas-tab"
            data-on={tab === "tarefas" && listScope === "created" ? "" : undefined}
            onClick={() => { setTab("tarefas"); setListScope("created"); }}
          >
            <Send size={13} /> Atribuídas por mim
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
        {tab === "tarefas" && listScope === "created" && !(manager && adminScope === "all") && (
          <div className="tarefas-scope" aria-label="Funcionários exibidos">
            <button type="button" data-on={assignedPeopleFilter === "all" ? "" : undefined} onClick={() => setAssignedPeopleFilter("all")}>Todos os funcionários</button>
            <button type="button" data-on={assignedPeopleFilter === "with_tasks" ? "" : undefined} onClick={() => setAssignedPeopleFilter("with_tasks")}>Com tarefas</button>
          </div>
        )}
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
                      <button type="button" className="tarefas-title is-link" onClick={() => openDetails(task)}>{task.title}</button>
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
              <div className="tarefas-audit-heading">
                <div><span>ATIVIDADES RECENTES</span><strong>Histórico do time</strong></div>
                <small>{auditLogs.length} registro(s)</small>
              </div>
              {auditLogs.length === 0 ? (
                <p className="tarefas-empty">Nenhuma ação registrada ainda.</p>
              ) : (
                auditLogs.map((log) => (
                  <div className="tarefas-audit-row" key={log.id}>
                    <span className="tarefas-audit-avatar">{log.actor_name.slice(0, 2).toUpperCase()}</span>
                    <span><strong>{log.actor_name}</strong><small>{auditActionLabel(log.action)} “{log.task_title}”</small></span>
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
            <div className="tarefas-calendar-heading">
              <span className="tarefas-calendar-eyebrow"><CalendarDays size={14} /> Planejamento</span>
              <h2>{monthLabel}</h2>
              <p>{selectedCalendarPerson ? selectedCalendarPerson.name : "Todos os responsáveis"} <span>·</span> {calendarTasks.length} {calendarTasks.length === 1 ? "tarefa" : "tarefas"} nesta visualização</p>
            </div>
            <div className="tarefas-calendar-navigation">
              <button type="button" className="tarefas-btn" onClick={() => {
                const now = new Date();
                setCalendarCursor(new Date(now.getFullYear(), now.getMonth(), 1));
              }}>Hoje</button>
              <div>
                <button type="button" className="tarefas-icon" aria-label="Mês anterior" onClick={() => shiftMonth(-1)}><ChevronLeft size={18} /></button>
                <button type="button" className="tarefas-icon" aria-label="Próximo mês" onClick={() => shiftMonth(1)}><ChevronRight size={18} /></button>
              </div>
            </div>
          </div>
          <div className="tarefas-calendar-filterbar">
            <span className="tarefas-calendar-filterlabel">Responsáveis</span>
            <div className="tarefas-coverage" aria-label="Filtrar calendário por responsável">
              <button type="button" className={`tarefas-coverage-card tarefas-coverage-all${!selectedCalendarPerson ? " is-selected" : ""}`}
                aria-pressed={!selectedCalendarPerson} onClick={() => setCalendarPersonId(null)}>
                <Users size={15} /><strong>Todos</strong><span className="tarefas-coverage-total">{monthTasks.length}</span>
              </button>
              {displayPeople.map((person) => {
                const count = monthTasks.filter(task => task.person_id === person.id).length;
                return (
                  <button type="button" key={person.id}
                    title={`${person.name} · ${count ? `${count} tarefa(s) neste mês` : "Sem tarefas neste mês"}`}
                    aria-pressed={selectedCalendarPerson?.id === person.id}
                    className={`tarefas-coverage-card${selectedCalendarPerson?.id === person.id ? " is-selected" : ""}`}
                    onClick={() => setCalendarPersonId(calendarPersonId === person.id ? null : person.id)}>
                    <Avatar person={person} /><strong>{person.name}</strong><span className="tarefas-coverage-total">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {calendarTasks.length === 0 && <p className="tarefas-calendar-empty"><CalendarDays size={16} /> Nenhuma tarefa neste mês com os filtros selecionados.</p>}
          <div className="tarefas-calendar-scroll" role="region" aria-label="Calendário mensal de tarefas" tabIndex={0}>
            <div className="tarefas-calendar">
              {["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"].map((day) => <div className="tarefas-calendar-weekday" key={day}>{day}</div>)}
              {calendarDays(calendarCursor).map((day, index) => {
                if (day === null) return <div className="tarefas-calendar-day is-blank" key={`blank-${index}`} />;
                const date = `${viewedMonth}-${String(day).padStart(2, "0")}`;
                const dayTasks = calendarTasks.filter(task => task.due_date === date).sort((a, b) => a.deadline - b.deadline);
                const today = date === brazilDate();
                return (
                  <div className={`tarefas-calendar-day${today ? " is-today" : ""}${index % 7 >= 5 ? " is-weekend" : ""}`} key={date}>
                    <div className="tarefas-calendar-dayhead">
                      <time dateTime={date} className="tarefas-calendar-number" aria-current={today ? "date" : undefined}>{day}</time>
                      {today && <span>Hoje</span>}
                      {dayTasks.length > 0 && <small>{dayTasks.length}</small>}
                    </div>
                    {dayTasks.map((task) => {
                      const person = personById(task.person_id);
                      const late = isLate(task) && task.status !== "done";
                      return (
                        <button type="button" className={`tarefas-calendar-task${task.status === "done" ? " is-done" : ""}`}
                          key={task.id} style={{ borderLeftColor: personColor(person) }}
                          title={`${task.title} · ${person.name} · Atribuída por ${task.created_by_name}`}
                          onClick={() => openDetails(task)}>
                          <span className="tarefas-calendar-task-top">
                            <span className={late ? "is-late" : ""}>{task.status === "done" ? <><Check size={11} /> Concluída</> : late ? <><Clock3 size={11} /> Atrasada</> : task.due_time || "Sem horário"}</span>
                            {(task.priority === "high" || task.priority === "urgent") && <Flag size={12} fill="currentColor" className={`tarefas-priority is-${task.priority}`} aria-label={`Prioridade ${PRIORITY_LABEL[task.priority]}`} />}
                          </span>
                          <strong>{task.title}</strong>
                          <span className="tarefas-calendar-task-person"><Avatar person={person} /><span>{person.name}</span>{late && task.due_time && <time>{task.due_time}</time>}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : tab === "quadro" ? (
        <div ref={kanbanRef} className="tarefas-kanban" onPointerDown={startKanbanDrag} onPointerMove={moveKanbanDrag} onPointerUp={endKanbanDrag} onPointerCancel={endKanbanDrag}>
          {displayPeople
            .map((person) => {
              const cards = visibleFor(person);
              const open = tasks.filter(
                (t) => t.person_id === person.id && t.status !== "done",
              );
              return (
                <article
                  className={`tarefas-col${draggingPersonId === person.id ? " is-reordering" : ""}`}
                  key={person.id}
                  style={{ borderTop: `3px solid ${personColor(person)}` }}
                  onDragOver={(event) => {
                    if (!manager || !draggingPersonId || draggingPersonId === person.id) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedId = event.dataTransfer.getData("text/plain") || draggingPersonId;
                    if (draggedId) reorderPeople(draggedId, person.id);
                    setDraggingPersonId(null);
                  }}
                >
                  <div className="tarefas-col-head">
                    {manager && (
                      <span
                        className="tarefas-column-drag-handle"
                        draggable
                        role="button"
                        tabIndex={0}
                        aria-label={`Arrastar ${person.name} para mudar a posição`}
                        title="Arraste para mudar a posição no quadro"
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", person.id);
                          setDraggingPersonId(person.id);
                        }}
                        onDragEnd={() => setDraggingPersonId(null)}
                      >
                        <GripVertical size={16} aria-hidden="true" />
                      </span>
                    )}
                    <Avatar person={person} />
                    <strong style={{ color: personColor(person) }}>{person.name}</strong>
                    {groupScope(person) && <span className="tarefas-group-scope">{groupScope(person)}</span>}
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
                              disabled={!canChangeStatus(task)}
                              aria-label={
                                task.status === "done"
                                  ? "Reabrir tarefa"
                                  : "Marcar como concluída"
                              }
                              onClick={() => toggleStatus(task)}
                            >
                              <Check size={12} strokeWidth={3} />
                            </button>
                            <TaskStatusPicker taskTitle={task.title} value={task.status} onChange={canChangeStatus(task) ? status => changeStatus(task, status) : undefined} />
                          </div>
                          <div className="tarefas-titlewrap">
                            {manager ? (
                              <button
                                type="button"
                                className="tarefas-title is-link"
                                title="Abrir tarefa"
                                onClick={() => openDetails(task)}
                              >
                                {task.title}
                              </button>
                            ) : (
                              <button type="button" className="tarefas-title is-link" onClick={() => openDetails(task)}>{task.title}</button>
                            )}
                            <TaskNote task={task} onOpen={() => openDetails(task)} />
                            <TaskCreator task={task} />
                            <TaskChecklistPreview task={task} />
                            <TaskDetailsButton
                              task={task}
                              onOpen={() => openDetails(task)}
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
            <span><FileText size={16} /> Nome da tarefa</span>
            <span><UserRound size={16} /> Atribuída por</span>
            <span><Flag size={16} /> Prioridade</span>
            <span><CircleCheck size={16} /> Status</span>
            <span><CalendarDays size={16} /> Vencimento</span>
            <span />
          </div>
          {listPeople
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
                          className={`tarefas-row is-openable${task.status === "done" ? " is-finished" : ""}`}
                          key={task.id}
                          role="button"
                          tabIndex={0}
                          onClick={(event) => openTaskFromRow(event, task)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openDetails(task);
                            }
                          }}
                        >
                          <span className="tarefas-person">
                            <button
                              type="button"
                              className={`tarefas-check${task.status === "done" ? " is-done" : ""}`}
                              disabled={!canChangeStatus(task)}
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
                                  title="Abrir tarefa"
                                  onClick={() => openDetails(task)}
                                >
                                  {task.title}
                                </button>
                              ) : (
                                <button type="button" className="tarefas-title is-link" onClick={() => openDetails(task)}>{task.title}</button>
                              )}
                              <span className="tarefas-task-meta">
                                <TaskCreator task={task} />
                                <TaskNote task={task} onOpen={() => openDetails(task)} />
                                <TaskChecklistPreview task={task} compact />
                                <TaskDetailsButton
                                  task={task}
                                  onOpen={() => openDetails(task)}
                                />
                              </span>
                            </span>
                          </span>
                          <span className="tarefas-assignee" title={`Atribuída por ${task.created_by_name}`}>
                            <Avatar person={creatorFor(task)} />
                            <span>{task.created_by_name}</span>
                          </span>
                          <TaskPriorityPicker value={task.priority ?? "normal"} label={`Prioridade de ${task.title}`}
                            onChange={manager ? priority => changePriority(task, priority) : undefined} />
                          <TaskStatusPicker taskTitle={task.title} value={task.status} onChange={canChangeStatus(task) ? status => changeStatus(task, status) : undefined} />
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
                            <Plus size={17} /> Adicionar tarefa
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
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
                        if (user?.appRole === "admin") {
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
        <TaskDetailsDialog
          key={detailsDraft.task.id}
          task={detailsDraft.task}
          canWrite={manager || detailsDraft.task.person_id === boardQuery.data?.current_user_id}
          assignee={<span className="tarefas-assignee"><Avatar person={personById(detailsDraft.task.person_id)} /><span>{personById(detailsDraft.task.person_id).name}</span></span>}
          creator={<span className="tarefas-assignee"><Avatar person={creatorFor(detailsDraft.task)} /><span>{detailsDraft.task.created_by_name}</span></span>}
          onSave={async (content, version) => {
            await tarefasRequest(token!, "/board", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "details", id: detailsDraft.task.id, version, ...content }),
            });
            patchTasks(current => current.map(task => task.id === detailsDraft.task.id ? { ...task, ...content, version: version + 1 } : task));
            void invalidate();
          }}
          onClose={() => setDetailsDraft(null)}
          onEdit={manager ? (content, version) => {
            openEdit({ ...detailsDraft.task, ...content, version });
            setDetailsDraft(null);
          } : undefined}
          canNotify={manager && detailsDraft.task.can_notify && detailsDraft.task.status !== "done"}
          onNotify={manager ? () => notifyTask(detailsDraft.task) : undefined}
        />
      )}

      {draft && (
        <div
          className="tarefas-modal-bg"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !mutation.isPending) setDraft(null);
          }}
        >
          <form className="tarefas-modal tarefas-compose" onSubmit={saveDraft}>
            <div className="tarefas-compose-heading"><span><FileText size={22} /></span><div><h2>{draft.id ? "Editar tarefa" : "Nova tarefa"}</h2><p>Organize o próximo passo.</p></div><button type="button" className="tarefas-icon" aria-label="Fechar formulário" disabled={mutation.isPending} onClick={() => setDraft(null)}><X size={20} /></button></div>

            <label>
              <span className="tarefas-field-label"><FileText size={16} /> Nome da tarefa</span>
              <input
                autoFocus
                disabled={mutation.isPending}
                required
                maxLength={240}
                value={draft.title}
                placeholder="Ex.: Conferir o estoque de embalagens"
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>

            <label>
              <span className="tarefas-field-label"><Users size={16} /> Responsável</span>
              <select
                disabled={mutation.isPending}
                value={draft.person_id}
                onChange={(event) => setDraft({ ...draft, person_id: event.target.value })}
              >
                {assignablePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
              <small className="tarefas-field-help">Você pode atribuir esta tarefa para qualquer pessoa ativa.</small>
            </label>

            <div className="tarefas-modal-cols">
              <div className="tarefas-compose-priority">
                <span className="tarefas-field-label"><Flag size={16} /> Prioridade</span>
                <TaskPriorityPicker value={draft.priority} disabled={mutation.isPending} onChange={priority => setDraft({ ...draft, priority })} />
              </div>
              <label>
                <span className="tarefas-field-label"><CalendarDays size={16} /> Vencimento</span>
                <input
                  type="date"
                  disabled={mutation.isPending}
                  required
                  value={draft.due_date}
                  onChange={(event) => setDraft({ ...draft, due_date: event.target.value })}
                />
              </label>
              <label>
                <span className="tarefas-field-label"><Clock3 size={16} /> Horário <small>opcional</small></span>
                <input
                  type="time"
                  disabled={mutation.isPending}
                  value={draft.due_time}
                  onChange={(event) => setDraft({ ...draft, due_time: event.target.value })}
                />
              </label>
            </div>

            <label className="tarefas-modal-notes">
              <span className="tarefas-field-label"><NotebookPen size={16} /> Descrição <small>opcional</small></span>
              <textarea
                rows={4}
                disabled={mutation.isPending}
                maxLength={10000}
                value={draft.notes}
                placeholder="Algum detalhe para ajudar na execução?"
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              />
            </label>

            {mutation.isError && <p className="tarefas-compose-error" role="alert">{(mutation.error as Error).message}</p>}
            <div className="tarefas-modal-actions">
              <button type="button" className="tarefas-btn" disabled={mutation.isPending} onClick={() => setDraft(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                className="tarefas-btn is-primary"
                disabled={!draft.title.trim() || mutation.isPending}
              >
                {mutation.isPending ? "Salvando…" : draft.id ? "Salvar alterações" : "Criar tarefa"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
