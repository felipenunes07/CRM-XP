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
  const [tab, setTab] = useState<"tarefas" | "historico">("tarefas");
  const [filter, setFilter] = useState<"all" | "today" | "late" | "empty">("all");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingFor, setAddingFor] = useState("");
  const [addTitle, setAddTitle] = useState("");
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

  const people = boardQuery.data?.people ?? [];
  const tasks = boardQuery.data?.tasks ?? [];
  const manager = boardQuery.data?.role === "manager";

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
    const own = tasks.filter((t) => t.person_id === person.id && t.status !== "done");
    const byFilter =
      filter === "today"
        ? own.filter((t) => t.due_date === brazilDate())
        : filter === "late"
          ? own.filter(isLate)
          : own;
    return byFilter
      .filter((t) => matchesSearch(t, person))
      .sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || a.deadline - b.deadline);
  };

  const toggleStatus = (task: Task) =>
    mutation.mutate({
      action: "status",
      id: task.id,
      version: task.version,
      status: task.status === "done" ? "doing" : "done",
    });

  const quickAdd = (personId: string) => {
    const title = addTitle.trim();
    if (!title) {
      setAddingFor("");
      return;
    }
    mutation.mutate({
      action: "create",
      title,
      person_id: personId,
      due_date: brazilDate(),
      notes: "",
    });
    setAddTitle("");
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
            data-on={tab === "historico" ? "" : undefined}
            onClick={() => setTab("historico")}
          >
            <History size={13} /> Histórico
          </button>
        </div>
        {tab === "tarefas" && (
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
                      <strong>{person.name}</strong>
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
                            setAddingFor(person.id);
                            setAddTitle("");
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
                        <div className="tarefas-row" key={task.id}>
                          <span className="tarefas-person">
                            <button
                              type="button"
                              className={`tarefas-check${task.status === "done" ? " is-done" : ""}`}
                              aria-label="Marcar como entregue"
                              disabled={mutation.isPending}
                              onClick={() => toggleStatus(task)}
                            >
                              <Check size={12} strokeWidth={3} />
                            </button>
                            <span className="tarefas-title">{task.title}</span>
                          </span>
                          <span
                            className={`tarefas-pill ${
                              isLate(task)
                                ? "is-late"
                                : task.status === "doing"
                                  ? "is-doing"
                                  : "is-todo"
                            }`}
                          >
                            {isLate(task) ? "Atrasada" : statusLabel(task.status)}
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
                                    mutation.mutate({
                                      action: "delete",
                                      id: task.id,
                                      version: task.version,
                                    });
                                    setConfirmDelete("");
                                  }}
                                >
                                  Confirmar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="tarefas-icon is-danger"
                                  aria-label="Excluir tarefa"
                                  onClick={() => setConfirmDelete(task.id)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              ))}
                          </span>
                        </div>
                      ))}
                      {manager &&
                        (addingFor === person.id ? (
                          <div className="tarefas-addrow">
                            <input
                              autoFocus
                              value={addTitle}
                              placeholder="Escreva a tarefa e aperte Enter"
                              onChange={(event) => setAddTitle(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") quickAdd(person.id);
                                if (event.key === "Escape") {
                                  setAddingFor("");
                                  setAddTitle("");
                                }
                              }}
                              onBlur={() => quickAdd(person.id)}
                            />
                          </div>
                        ) : (
                          filter === "all" &&
                          !search.trim() && (
                            <div className="tarefas-addrow">
                              <button type="button" onClick={() => setAddingFor(person.id)}>
                                <Plus size={14} /> tarefa
                              </button>
                            </div>
                          )
                        ))}
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
    </section>
  );
}
