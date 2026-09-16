import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  AlertTriangle,
  BellOff,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock3,
  CornerUpLeft,
  FileText,
  Flag,
  Hourglass,
  Loader2,
  MessageSquareText,
  PauseCircle,
  PhoneOff,
  Search,
  Send,
  Smartphone,
  Sparkles,
  ToggleRight,
  UserRound,
  XCircle,
  Zap,
} from "lucide-react";
import { TaskPriorityPicker, type TaskPriority } from "./TaskPriorityPicker";
import type { TaskStatus } from "./TaskStatusPicker";
import "./TaskAutoMessagesPanel.css";

export type AutoMessageKind = "assignment" | "review" | "return" | "overdue";

type ScheduledReminder = {
  task_id: string;
  user_id: string;
  title: string;
  due_date: string;
  due_time: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  recipient_name: string;
  recipient_photo: string | null;
  has_whatsapp: boolean;
  paused: boolean;
  is_overdue: boolean;
  sent_today: boolean;
  next_send_at: string;
  message: string;
};

type HistoryEntry = {
  id: string;
  kind: AutoMessageKind;
  status: "sent" | "failed" | "skipped";
  task_id: string | null;
  task_title: string;
  recipient_user_id: string | null;
  recipient_name: string;
  recipient_photo: string | null;
  message: string;
  error: string | null;
  created_at: string;
};

export type AutoMessagesOverview = {
  settings: Record<AutoMessageKind, boolean>;
  check_interval_minutes: number;
  lili: { active: boolean; label: string | null };
  examples: Record<AutoMessageKind, string>;
  scheduled: ScheduledReminder[];
  history: HistoryEntry[];
};

export type AutoMessagePerson = { id: string; name: string; photo: string | null };

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

type Props = {
  request: Request;
  /** Mesmo avatar do quadro (foto do perfil, proxy e fotos locais). */
  renderAvatar: (person: AutoMessagePerson) => ReactNode;
  colorFor: (person: AutoMessagePerson) => string;
  /** Posição da pessoa no quadro, para os grupos seguirem a mesma ordem. */
  rankFor?: (personId: string) => number;
  onOpenTask?: (taskId: string) => void;
};

const KINDS: Record<AutoMessageKind, { title: string; when: string; icon: typeof Sparkles; color: string }> = {
  overdue: { title: "Cobrança de atraso", when: "1x por dia, enquanto a tarefa estiver vencida", icon: AlarmClock, color: "#dc2626" },
  assignment: { title: "Nova tarefa", when: "Na hora em que a tarefa é atribuída", icon: Sparkles, color: "#2956d7" },
  review: { title: "Em revisão", when: "Quando todos entregam (vai para quem criou)", icon: CircleCheck, color: "#c98a0b" },
  return: { title: "Tarefa devolvida", when: "Quando a tarefa volta para alguém", icon: CornerUpLeft, color: "#e37b13" },
};
const KIND_ORDER: AutoMessageKind[] = ["overdue", "assignment", "review", "return"];

type View = "waiting" | "sent" | "paused";
type Range = "24h" | "7d" | "all";
const QUERY_KEY = ["tarefas-auto-messages"];
const DAY = 86_400_000;
const TZ = "America/Sao_Paulo";

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const weekdayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: TZ });
const longDayFormat = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: TZ });
const dayKey = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: TZ });

function relativeDay(date: Date, now: number, format = weekdayFormat) {
  if (dayKey(date) === dayKey(new Date(now))) return "Hoje";
  if (dayKey(date) === dayKey(new Date(now + DAY))) return "Amanhã";
  if (dayKey(date) === dayKey(new Date(now - DAY))) return "Ontem";
  return format.format(date);
}

/** Quando a próxima cobrança sai, em texto curto. */
function describeWhen(item: ScheduledReminder, intervalMinutes: number, now: number) {
  const at = new Date(item.next_send_at);
  if (at.getTime() <= now) return { label: "Em instantes", hint: `na próxima verificação (até ${intervalMinutes} min)` };
  return { label: `${relativeDay(at, now)}, ${timeFormat.format(at)}`, hint: item.sent_today ? "hoje já foi enviada · repete" : item.is_overdue ? "próxima cobrança diária" : "quando a tarefa vencer" };
}

function shortDue(item: ScheduledReminder) {
  const date = item.due_date.split("-").reverse().slice(0, 2).join("/");
  return item.due_time ? `${date} ${item.due_time.slice(0, 5)}` : date;
}

const matchesTerm = (text: string, term: string) => !term || text.toLocaleLowerCase("pt-BR").includes(term);

const reminderKey = (item: { task_id: string | null; user_id?: string; recipient_user_id?: string | null }) =>
  `${item.task_id}:${item.user_id ?? item.recipient_user_id}`;

function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      className="automsg-switch"
      data-on={on ? "" : undefined}
      disabled={disabled}
      onClick={(event) => { event.stopPropagation(); onChange(!on); }}
    >
      <span />
    </button>
  );
}

function KindTag({ kind }: { kind: AutoMessageKind }) {
  const { title, icon: Icon, color } = KINDS[kind];
  return (
    <span className="automsg-kindtag" style={{ "--kind": color } as CSSProperties}>
      <Icon size={12} /> {title}
    </span>
  );
}

function WhatsappPreview({ from, to, text, renderAvatar }: { from: string; to: AutoMessagePerson | null; text: string; renderAvatar: Props["renderAvatar"] }) {
  return (
    <div className="automsg-chat">
      <div className="automsg-chat-head">
        {to ? renderAvatar(to) : <span className="automsg-chat-dot"><Smartphone size={12} /></span>}
        <span><strong>{to ? to.name : "Exemplo de mensagem"}</strong><small>enviado pelo WhatsApp {from}</small></span>
      </div>
      <pre className="automsg-bubble">{text}</pre>
    </div>
  );
}

export function TaskAutoMessagesPanel({ request, renderAvatar, colorFor, rankFor, onOpenTask }: Props) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("waiting");
  const [range, setRange] = useState<Range>("7d");
  const [search, setSearch] = useState("");
  const [openMessage, setOpenMessage] = useState<string | null>(null);
  const [openExample, setOpenExample] = useState<AutoMessageKind | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const overview = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => request<AutoMessagesOverview>("/auto-messages"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const patch = (change: (data: AutoMessagesOverview) => AutoMessagesOverview) =>
    queryClient.setQueryData<AutoMessagesOverview>(QUERY_KEY, (current) => (current ? change(current) : current));
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  const post = (path: string, body: unknown) =>
    request<unknown>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const toggleKind = useMutation({
    mutationFn: ({ kind, enabled }: { kind: AutoMessageKind; enabled: boolean }) => post("/auto-messages/settings", { kind, enabled }),
    onMutate: ({ kind, enabled }) => patch((data) => ({ ...data, settings: { ...data.settings, [kind]: enabled } })),
    onSettled: refresh,
  });

  const togglePause = useMutation({
    mutationFn: async ({ items, paused }: { items: ScheduledReminder[]; paused: boolean }) => {
      for (const item of items) await post("/auto-messages/pause", { taskId: item.task_id, userId: item.user_id, paused });
    },
    onMutate: ({ items, paused }) => {
      const keys = new Set(items.map(reminderKey));
      patch((data) => ({
        ...data,
        scheduled: data.scheduled.map((row) => (keys.has(reminderKey(row)) ? { ...row, paused } : row)),
      }));
    },
    onSettled: refresh,
  });

  const data = overview.data;
  const now = overview.dataUpdatedAt || Date.now();
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const matches = (text: string) => matchesTerm(text, term);

  const buckets = useMemo(() => {
    const scheduled = data?.scheduled ?? [];
    return {
      // Aguardando: a próxima cobrança ainda vai sair (inclui quem já recebeu a de hoje).
      waiting: scheduled.filter((item) => !item.paused && item.has_whatsapp),
      paused: scheduled.filter((item) => item.paused || !item.has_whatsapp),
      sent: data?.history ?? [],
      byKey: new Map(scheduled.map((item) => [reminderKey(item), item])),
    };
  }, [data]);

  const waitingGroups = useMemo(() => {
    const limit = range === "24h" ? now + DAY : range === "7d" ? now + 7 * DAY : Infinity;
    const byPerson = new Map<string, { person: AutoMessagePerson; items: ScheduledReminder[] }>();
    for (const item of buckets.waiting) {
      if (Date.parse(item.next_send_at) > limit || !matchesTerm(`${item.title} ${item.recipient_name}`, term)) continue;
      const group = byPerson.get(item.user_id) ?? {
        person: { id: item.user_id, name: item.recipient_name, photo: item.recipient_photo },
        items: [],
      };
      group.items.push(item);
      byPerson.set(item.user_id, group);
    }
    return [...byPerson.values()].sort((a, b) =>
      (rankFor?.(a.person.id) ?? 0) - (rankFor?.(b.person.id) ?? 0) || a.person.name.localeCompare(b.person.name, "pt-BR"),
    );
  }, [buckets, range, term, now, rankFor]);

  const sentByDay = useMemo(() => {
    const days = new Map<string, HistoryEntry[]>();
    for (const entry of buckets.sent) {
      if (!matchesTerm(`${entry.task_title} ${entry.recipient_name}`, term)) continue;
      const key = dayKey(new Date(entry.created_at));
      days.set(key, [...(days.get(key) ?? []), entry]);
    }
    return [...days.entries()];
  }, [buckets, term]);

  if (overview.isLoading) {
    return <div className="tarefas-empty"><Loader2 className="tarefas-spin" size={16} /> Carregando mensagens automáticas...</div>;
  }
  if (overview.isError || !data) {
    return (
      <div className="tarefas-error" role="alert">
        <AlertTriangle size={16} /> {(overview.error as Error | null)?.message ?? "Não foi possível carregar as mensagens automáticas."}
      </div>
    );
  }

  const sender = data.lili.label ?? "Lili";
  const overdueOn = data.settings.overdue;
  const today = dayKey(new Date(now));
  const sentToday = buckets.sent.filter((entry) => entry.status === "sent" && dayKey(new Date(entry.created_at)) === today);
  const sentTodayByKind = (kind: AutoMessageKind) => sentToday.filter((entry) => entry.kind === kind).length;
  const actionError = (toggleKind.error ?? togglePause.error) as Error | null;
  const personOf = (item: ScheduledReminder | HistoryEntry): AutoMessagePerson => ({
    id: "user_id" in item ? item.user_id : item.recipient_user_id ?? item.recipient_name,
    name: item.recipient_name,
    photo: item.recipient_photo,
  });
  const taskTitle = (taskId: string | null, title: string) =>
    onOpenTask && taskId ? (
      <button type="button" className="tarefas-title is-link" title="Abrir tarefa" onClick={() => onOpenTask(taskId)}>{title}</button>
    ) : (
      <span className="tarefas-title">{title}</span>
    );
  const messageToggle = (key: string) => (
    <button type="button" className="automsg-link" onClick={() => setOpenMessage(openMessage === key ? null : key)}>
      <MessageSquareText size={12} /> {openMessage === key ? "Ocultar" : "Ver mensagem"}
    </button>
  );

  const views: { value: View; label: string; count: number; icon: typeof Hourglass }[] = [
    { value: "waiting", label: "Aguardando envio", count: buckets.waiting.length, icon: Hourglass },
    { value: "sent", label: "Enviadas", count: buckets.sent.length, icon: CheckCheck },
    { value: "paused", label: "Pausadas", count: buckets.paused.length, icon: PauseCircle },
  ];

  return (
    <div className="automsg">
      {!data.lili.active && (
        <div className="tarefas-error" role="alert"><Smartphone size={16} /> WhatsApp da Lili desconectado — nenhuma mensagem automática está saindo.</div>
      )}
      {actionError && (
        <div className="tarefas-error" role="alert"><AlertTriangle size={16} /> {actionError.message}</div>
      )}

      {/* Automações: uma linha por tipo */}
      <div className="automsg-rules">
        <div className="automsg-sheet-title">
          <span><Zap size={15} /> Automações</span>
          <small>
            {data.lili.active ? <>Enviadas pelo WhatsApp <b>{sender}</b></> : "WhatsApp desconectado"} · atrasos verificados a cada {data.check_interval_minutes} min
          </small>
        </div>
        {KIND_ORDER.map((kind) => {
          const { title, when, icon: Icon, color } = KINDS[kind];
          const on = data.settings[kind];
          const sentCount = sentTodayByKind(kind);
          const waitingCount = kind === "overdue" ? buckets.waiting.length : 0;
          return (
            <Fragment key={kind}>
              <div className="automsg-rule" data-off={on ? undefined : ""} style={{ "--kind": color } as CSSProperties}>
                <span className="automsg-rule-icon"><Icon size={15} /></span>
                <span className="automsg-rule-name">
                  <strong>{title}</strong>
                  <small>{when}</small>
                </span>
                <span className="automsg-rule-stats">
                  <span title="Enviadas hoje"><CheckCheck size={13} /> {sentCount} hoje</span>
                  {kind === "overdue" ? (
                    <span title="Aguardando envio"><Hourglass size={13} /> {waitingCount} aguardando</span>
                  ) : (
                    <span className="is-soft">sai na hora do evento</span>
                  )}
                </span>
                <button type="button" className="automsg-link" onClick={() => setOpenExample(openExample === kind ? null : kind)}>
                  <MessageSquareText size={12} /> {openExample === kind ? "Ocultar" : "Exemplo"}
                </button>
                <span className={`automsg-onoff ${on ? "is-on" : "is-off"}`}>{on ? "Ligada" : "Desligada"}</span>
                <Switch
                  on={on}
                  label={on ? `Desligar: ${title}` : `Ligar: ${title}`}
                  disabled={toggleKind.isPending}
                  onChange={(enabled) => toggleKind.mutate({ kind, enabled })}
                />
              </div>
              {openExample === kind && (
                <div className="automsg-preview-row">
                  <WhatsappPreview from={sender} to={null} text={data.examples[kind]} renderAvatar={renderAvatar} />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      {/* Abas: o que falta sair, o que já saiu e o que foi pausado */}
      <header className="tarefas-toolbar automsg-toolbar">
        <div className="tarefas-tabs" role="tablist">
          {views.map(({ value, label, count, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              className="tarefas-tab"
              data-on={view === value ? "" : undefined}
              onClick={() => { setView(value); setOpenMessage(null); }}
            >
              <Icon size={13} /> {label} <b className={`automsg-tabcount is-${value}`}>{count}</b>
            </button>
          ))}
        </div>
        {view === "waiting" && (
          <div className="tarefas-scope" aria-label="Período">
            {([["24h", "Próximas 24h"], ["7d", "7 dias"], ["all", "Todas"]] as [Range, string][]).map(([value, label]) => (
              <button key={value} type="button" data-on={range === value ? "" : undefined} onClick={() => setRange(value)}>{label}</button>
            ))}
          </div>
        )}
        <label className="tarefas-search">
          <Search size={14} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarefa ou pessoa" />
        </label>
      </header>

      {view === "waiting" && (
        <div className="tarefas-sheet">
          {!overdueOn && (
            <div className="automsg-banner"><BellOff size={15} /> A cobrança de atraso está desligada: nada abaixo será enviado até você religá-la.</div>
          )}
          <div className="tarefas-row tarefas-head automsg-waiting">
            <span><FileText size={16} /> Tarefa</span>
            <span><Flag size={16} /> Prioridade</span>
            <span><CalendarDays size={16} /> Vencimento</span>
            <span><Send size={16} /> Envio previsto</span>
            <span><ToggleRight size={16} /> Enviar</span>
          </div>
          {waitingGroups.length === 0 && <p className="tarefas-empty">Nenhuma cobrança aguardando envio neste período.</p>}
          {waitingGroups.map(({ person, items }) => {
            const isCollapsed = collapsed[person.id];
            const color = colorFor(person);
            return (
              <div key={person.id}>
                <div className="tarefas-row tarefas-group automsg-waiting" style={{ "--person-color": color } as CSSProperties}>
                  <span className="tarefas-person">
                    <button
                      type="button"
                      className="tarefas-toggle"
                      aria-label={isCollapsed ? `Expandir ${person.name}` : `Recolher ${person.name}`}
                      onClick={() => setCollapsed((current) => ({ ...current, [person.id]: !current[person.id] }))}
                    >
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {renderAvatar(person)}
                    <strong style={{ color }}>{person.name}</strong>
                    <span className="tarefas-count">{items.length}</span>
                  </span>
                  <span /><span /><span />
                  <Switch
                    on
                    disabled={togglePause.isPending}
                    label={`Pausar todas as cobranças de ${person.name}`}
                    onChange={() => togglePause.mutate({ items, paused: true })}
                  />
                </div>
                {!isCollapsed && items.map((item) => {
                  const key = `w:${reminderKey(item)}`;
                  const when = describeWhen(item, data.check_interval_minutes, now);
                  return (
                    <Fragment key={key}>
                      <div className="tarefas-row automsg-waiting" data-muted={overdueOn ? undefined : ""}>
                        <span className="tarefas-person automsg-task">
                          <span className="automsg-task-dot" style={{ background: color }} />
                          <span className="tarefas-titlewrap">
                            {taskTitle(item.task_id, item.title)}
                            <span className="tarefas-task-meta">{messageToggle(key)}</span>
                          </span>
                        </span>
                        <TaskPriorityPicker value={item.priority ?? "normal"} label={`Prioridade de ${item.title}`} />
                        <span className={`tarefas-due${item.is_overdue ? " is-late" : ""}`}>
                          {item.is_overdue ? <AlertTriangle size={13} /> : <Clock3 size={13} />}
                          {shortDue(item)}{item.is_overdue ? " · vencida" : ""}
                        </span>
                        <span className="automsg-when">
                          <strong><Hourglass size={12} /> {when.label}</strong>
                          <small>{when.hint}</small>
                        </span>
                        <Switch
                          on
                          label={`Pausar cobrança de ${item.recipient_name}: ${item.title}`}
                          onChange={() => togglePause.mutate({ items: [item], paused: true })}
                        />
                      </div>
                      {openMessage === key && (
                        <div className="automsg-preview-row"><WhatsappPreview from={sender} to={person} text={item.message} renderAvatar={renderAvatar} /></div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {view === "sent" && (
        <div className="tarefas-sheet">
          <div className="tarefas-row tarefas-head automsg-sent">
            <span><Clock3 size={16} /> Horário</span>
            <span><Zap size={16} /> Automação</span>
            <span><UserRound size={16} /> Para</span>
            <span><FileText size={16} /> Tarefa</span>
            <span><CircleCheck size={16} /> Resultado</span>
          </div>
          {sentByDay.length === 0 && <p className="tarefas-empty">Nenhuma mensagem automática registrada nos últimos 7 dias.</p>}
          {sentByDay.map(([day, entries]) => (
            <div key={day}>
              <div className="tarefas-dayhead">
                {relativeDay(new Date(`${day}T12:00:00-03:00`), now, longDayFormat)} <b>· {entries.length} mensagem(ns)</b>
              </div>
              {entries.map((entry) => {
                const key = `s:${entry.id}`;
                const repeat = entry.kind === "overdue" && entry.status === "sent" ? buckets.byKey.get(reminderKey(entry)) : undefined;
                const result = entry.status === "sent"
                  ? { label: "Enviada", tone: "is-sent", icon: <CheckCheck size={12} /> }
                  : entry.status === "failed"
                    ? { label: "Falhou", tone: "is-failed", icon: <XCircle size={12} /> }
                    : { label: "Não enviada", tone: "is-muted", icon: <BellOff size={12} /> };
                return (
                  <Fragment key={key}>
                    <div className="tarefas-row automsg-sent">
                      <span className="automsg-time">{timeFormat.format(new Date(entry.created_at))}</span>
                      <KindTag kind={entry.kind} />
                      <span className="tarefas-assignee">{renderAvatar(personOf(entry))}<span>{entry.recipient_name}</span></span>
                      <span className="tarefas-titlewrap">
                        {taskTitle(entry.task_id, entry.task_title)}
                        <span className="tarefas-task-meta">
                          {messageToggle(key)}
                          {repeat && !repeat.paused && (
                            <span className="automsg-repeat">
                              <Hourglass size={11} /> repete {relativeDay(new Date(repeat.next_send_at), now).toLowerCase()}
                              <Switch on label={`Parar de cobrar ${entry.recipient_name}: ${entry.task_title}`} onChange={() => togglePause.mutate({ items: [repeat], paused: true })} />
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="automsg-result">
                        <span className={`automsg-state ${result.tone}`}>{result.icon} {result.label}</span>
                        {entry.status !== "sent" && entry.error && <small>{entry.error}</small>}
                      </span>
                    </div>
                    {openMessage === key && (
                      <div className="automsg-preview-row"><WhatsappPreview from={sender} to={personOf(entry)} text={entry.message} renderAvatar={renderAvatar} /></div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {view === "paused" && (
        <div className="tarefas-sheet">
          <div className="tarefas-row tarefas-head automsg-paused">
            <span><UserRound size={16} /> Para</span>
            <span><FileText size={16} /> Tarefa</span>
            <span><CalendarDays size={16} /> Vencimento</span>
            <span><PauseCircle size={16} /> Motivo</span>
            <span><ToggleRight size={16} /> Religar</span>
          </div>
          {buckets.paused.filter((item) => matches(`${item.title} ${item.recipient_name}`)).length === 0 && (
            <p className="tarefas-empty">Nenhuma cobrança pausada.</p>
          )}
          {buckets.paused
            .filter((item) => matches(`${item.title} ${item.recipient_name}`))
            .map((item) => {
              const key = `p:${reminderKey(item)}`;
              return (
                <Fragment key={key}>
                  <div className="tarefas-row automsg-paused">
                    <span className="tarefas-assignee">{renderAvatar(personOf(item))}<span>{item.recipient_name}</span></span>
                    <span className="tarefas-titlewrap">
                      {taskTitle(item.task_id, item.title)}
                      <span className="tarefas-task-meta">{messageToggle(key)}</span>
                    </span>
                    <span className={`tarefas-due${item.is_overdue ? " is-late" : ""}`}>
                      {item.is_overdue ? <AlertTriangle size={13} /> : <Clock3 size={13} />}
                      {shortDue(item)}
                    </span>
                    {item.has_whatsapp ? (
                      <span className="automsg-state is-paused"><PauseCircle size={12} /> Pausada por você</span>
                    ) : (
                      <span className="automsg-state is-muted"><PhoneOff size={12} /> Sem WhatsApp cadastrado</span>
                    )}
                    <Switch
                      on={false}
                      disabled={!item.has_whatsapp}
                      label={`Religar cobrança de ${item.recipient_name}: ${item.title}`}
                      onChange={() => togglePause.mutate({ items: [item], paused: false })}
                    />
                  </div>
                  {openMessage === key && (
                    <div className="automsg-preview-row"><WhatsappPreview from={sender} to={personOf(item)} text={item.message} renderAvatar={renderAvatar} /></div>
                  )}
                </Fragment>
              );
            })}
        </div>
      )}
    </div>
  );
}
