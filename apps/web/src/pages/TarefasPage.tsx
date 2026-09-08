import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Clock3,
  Columns3,
  History,
  ListTodo,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import "./TarefasPage.css";

/**
 * Quadro de tarefas da equipe dentro do CRM.
 *
 * Os dados continuam no app de tarefas (D1/R2). O navegador não fala com ele
 * direto porque aquela API não envia CORS; a chamada passa pelo rewrite
 * `/tarefas-api/*` declarado no vercel.json, que faz o proxy no servidor.
 */
const TAREFAS_API = "/tarefas-api";
const TAREFAS_TOKEN = "ec439da81db605f7bcee8f12315a1a8bd5a42fa509d3d752f4edcc8db4f324e0";

type Person = { id: string; name: string; photo: string | null; position: number };
type Task = {
  id: string;
  title: string;
  notes: string;
  person_id: string;
  due_date: string;
  due_time: string | null;
  deadline: number;
  status: "todo" | "doing" | "done";
  created_at: string;
  completed_at: string | null;
  version: number;
};
type Board = { people: Person[]; tasks: Task[]; role: "manager" | "team" };
type Draft = {
  id?: string;
  version?: number;
  title: string;
  person_id: string;
  due_date: string;
  due_time: string;
  notes: string;
};

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
 * A API do quadro não tem operação de apagar (responde "Ação inválida").
 * Para dar um apagar de verdade sem depender dela, a tarefa é movida para uma
 * pessoa oculta chamada "Lixeira", usando o `edit` que já existe. Ela some do
 * quadro para todo mundo e continua recuperável.
 */
const TRASH_NAME = "Lixeira";

function firstName(name: string) {
  return name.trim().toLowerCase().split(/\s+/)[0] ?? "";
}
function avatarUrl(person: Person) {
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

async function tarefasRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${TAREFAS_TOKEN}`);
  let response: Response;
  try {
    response = await fetch(`${TAREFAS_API}${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new Error("Sem conexão com o quadro de tarefas. Vamos tentar de novo sozinhos.");
  }
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Não foi possível falar com o quadro de tarefas.");
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

export default function TarefasPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"tarefas" | "quadro" | "historico">("tarefas");
  const [filter, setFilter] = useState<"all" | "today" | "late" | "empty">("all");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");

  const boardQuery = useQuery({
    queryKey: ["tarefas-board"],
    queryFn: () => tarefasRequest<Board>("/board"),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tarefas-board"] });
  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      tarefasRequest<{ id: string }>("/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
  });

  const allPeople = boardQuery.data?.people ?? [];
  const trash = allPeople.find((p) => p.name.trim().toLowerCase() === TRASH_NAME.toLowerCase());
  // A Lixeira e o que esta dentro dela nao aparecem no quadro nem nas contagens.
  const people = allPeople.filter((p) => p.id !== trash?.id);
  const tasks = (boardQuery.data?.tasks ?? []).filter((t) => t.person_id !== trash?.id);
  const manager = boardQuery.data?.role === "manager";

  const deleteTask = async (task: Task) => {
    let trashId = trash?.id;
    if (!trashId) {
      const created = await tarefasRequest<{ id: string }>("/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "person", name: TRASH_NAME }),
      });
      trashId = created.id;
    }
    mutation.mutate({
      action: "edit",
      id: task.id,
      version: task.version,
      title: task.title,
      notes: task.notes ?? "",
      person_id: trashId,
      due_date: task.due_date,
      due_time: task.due_time ?? "",
    });
  };

  const pending = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const overdue = useMemo(() => pending.filter(isLate), [pending]);
  const dueToday = useMemo(
    () => pending.filter((t) => t.due_date === brazilDate()),
    [pending],
  );
  const emptyPeople = useMemo(
    () => people.filter((p) => !pending.some((t) => t.person_id === p.id)),
    [people, pending],
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

  const toggleStatus = (task: Task) =>
    mutation.mutate({
      action: "status",
      id: task.id,
      version: task.version,
      status: task.status === "done" ? "doing" : "done",
    });

  const openNew = (personId: string) =>
    setDraft({
      title: "",
      person_id: personId || people[0]?.id || "",
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

  const saveDraft = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !draft.title.trim()) return;
    mutation.mutate(
      {
        action: draft.id ? "edit" : "create",
        ...(draft.id ? { id: draft.id, version: draft.version } : {}),
        title: draft.title.trim(),
        person_id: draft.person_id,
        due_date: draft.due_date,
        due_time: draft.due_time,
        notes: draft.notes,
      },
      { onSuccess: () => setDraft(null) },
    );
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
            data-on={tab === "historico" ? "" : undefined}
            onClick={() => setTab("historico")}
          >
            <History size={13} /> Histórico
          </button>
        </div>
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
        </div>
      ) : tab === "quadro" ? (
        <div className="tarefas-kanban">
          {people
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
                              aria-label={
                                task.status === "done"
                                  ? "Reabrir tarefa"
                                  : "Marcar como concluída"
                              }
                              disabled={mutation.isPending}
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
                          <button
                            type="button"
                            className="tarefas-title is-link"
                            title="Abrir para editar"
                            onClick={() => openEdit(task)}
                          >
                            {task.title}
                          </button>
                          <div className="tarefas-card-foot">
                            <span className={`tarefas-due${isLate(task) ? " is-late" : ""}`}>
                              {isLate(task) ? <AlertTriangle size={13} /> : <Clock3 size={13} />}
                              {shortDate(task)}
                              {task.due_time ? ` ${task.due_time}` : ""}
                            </span>
                            {manager &&
                              (confirmDelete === task.id ? (
                                <button
                                  type="button"
                                  className="tarefas-confirm"
                                  disabled={mutation.isPending}
                                  onClick={() => {
                                    void deleteTask(task);
                                    setConfirmDelete("");
                                  }}
                                >
                                  Apagar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="tarefas-icon is-danger"
                                  aria-label="Apagar tarefa"
                                  title="Apagar tarefa"
                                  onClick={() => setConfirmDelete(task.id)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {manager && (
                    <div className="tarefas-col-add">
                      <button type="button" onClick={() => openNew(person.id)}>
                        + tarefa
                      </button>
                    </div>
                  )}
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
          {people
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
                      {manager && (
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
                      )}
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
                              disabled={mutation.isPending}
                              onClick={() => toggleStatus(task)}
                            >
                              <Check size={12} strokeWidth={3} />
                            </button>
                            <button
                              type="button"
                              className="tarefas-title is-link"
                              title="Abrir para editar"
                              onClick={() => openEdit(task)}
                            >
                              {task.title}
                            </button>
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
                            {manager &&
                              (confirmDelete === task.id ? (
                                <button
                                  type="button"
                                  className="tarefas-confirm"
                                  disabled={mutation.isPending}
                                  onClick={() => {
                                    void deleteTask(task);
                                    setConfirmDelete("");
                                  }}
                                >
                                  Apagar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="tarefas-icon is-danger"
                                  aria-label="Apagar tarefa"
                                  title="Apagar tarefa"
                                  onClick={() => setConfirmDelete(task.id)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              ))}
                          </span>
                        </div>
                      ))}
                      {manager && filter === "all" && !search.trim() && (
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

      {draft && (
        <div
          className="tarefas-modal-bg"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !mutation.isPending) setDraft(null);
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

            <label>
              Observação <span>(opcional)</span>
              <textarea
                rows={3}
                maxLength={3000}
                value={draft.notes}
                placeholder="Algum detalhe para ajudar na execução?"
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              />
            </label>

            <div className="tarefas-modal-actions">
              <button
                type="button"
                className="tarefas-btn"
                disabled={mutation.isPending}
                onClick={() => setDraft(null)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="tarefas-btn is-primary"
                disabled={mutation.isPending || !draft.title.trim()}
              >
                {mutation.isPending
                  ? "Salvando..."
                  : draft.id
                    ? "Salvar alterações"
                    : "Criar tarefa"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
