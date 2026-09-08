'use client';
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- Drag-and-drop supplements the keyboard-accessible Editar dialog and responsible-person selector. */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SubmitEvent,
} from 'react';
import {
  Plus,
  Users,
  CircleCheck,
  Check,
  Clock3,
  AlertCircle,
  AlertTriangle,
  Link2,
  ListTodo,
  History,
  Search,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Pencil,
  UserCog,
  Copy,
  Trash2,
  Camera,
  RefreshCw,
  Undo2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster, toast as notifications } from '@/components/ui/toast';
const toast = {
  success: (title: string) => notifications.add({ title, type: 'success' }),
  error: (title: string) => notifications.add({ title, type: 'error' }),
};
import {
  type BoardData,
  type Person,
  type Task,
  brazilDate,
  late,
  weekStart,
} from '@/lib/model';

type Draft = {
  id?: string;
  version?: number;
  title: string;
  notes: string;
  person_id: string;
  due_date: string;
  due_time: string;
};
function PersonAvatar({
  person,
  index = 0,
  big = false,
}: {
  person: Person;
  index?: number;
  big?: boolean;
}) {
  return (
    <span className={'avatar color-' + (index % 8) + (big ? ' big' : '')}>
      {person.photo ? (
        <Image
          unoptimized
          width={big ? 34 : 24}
          height={big ? 34 : 24}
          src={'/api/photo/' + person.photo}
          alt={person.name}
        />
      ) : (
        person.name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
function SelectPerson({
  value,
  people,
  onChange,
}: {
  value: string;
  people: Person[];
  onChange: (s: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger id="task-person" className="person-select" aria-label="Responsável">
        <SelectValue>
          {people.find((p) => p.id === value)?.name ?? 'Selecione uma pessoa'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {people.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function shortDate(t: Task) {
  if (t.due_date === brazilDate()) return 'Hoje';
  return t.due_date.split('-').reverse().slice(0, 2).join('/');
}
function statusLabel(s: Task['status']) {
  return s === 'done' ? 'Entregue' : s === 'doing' ? 'Fazendo' : 'A fazer';
}
export default function Board({ mode: _mode = 'team' }: { mode?: 'manager' | 'team' }) {
  const [key, setKey] = useState(''),
    [ready, setReady] = useState(false),
    [data, setData] = useState<BoardData | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState<'tarefas' | 'historico'>('tarefas'),
    [filter, setFilter] = useState('all'),
    [q, setQ] = useState(''),
    [draft, setDraft] = useState<Draft | null>(null),
    [detail, setDetail] = useState<Task | null>(null),
    [menuFor, setMenuFor] = useState(''),
    [addingFor, setAddingFor] = useState(''),
    [addTitle, setAddTitle] = useState(''),
    [collapsed, setCollapsed] = useState<Record<string, boolean>>({}),
    [teamOpen, setTeamOpen] = useState(false),
    [personEdit, setPersonEdit] = useState<Person | null>(null),
    [personName, setPersonName] = useState(''),
    [photo, setPhoto] = useState<File | null>(null),
    [dragOver, setDragOver] = useState(''),
    [updated, setUpdated] = useState('');
  const sequence = useRef(0),
    mutating = useRef(false),
    photoInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const apply = () => {
      setKey(location.hash.slice(1));
      setData(null);
      setReady(true);
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);
  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', 'Bearer ' + key);
      const r = await fetch(path, { ...init, headers, cache: 'no-store' });
      const result = (await r.json()) as BoardData & { error?: string; id: string };
      if (!r.ok)
        throw new Error(result.error ?? 'Não foi possível conectar. Tente novamente.');
      return result;
    },
    [key],
  );
  const refresh = useCallback(async () => {
    if (!key) return;
    const n = ++sequence.current;
    try {
      const b = await api('/api/board');
      if (n === sequence.current) {
        setData(b);
        setError('');
        setUpdated(
          new Intl.DateTimeFormat('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo',
          }).format(new Date()),
        );
      }
    } catch (e) {
      if (n === sequence.current)
        setError(e instanceof Error ? e.message : 'Sem conexão. Tente novamente.');
    }
  }, [api, key]);
  useEffect(() => {
    queueMicrotask(() => void refresh());
    const timer = setInterval(() => {
      if (!document.hidden && !mutating.current) void refresh();
    }, 8000);
    const focus = () => {
      if (!mutating.current) void refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, [refresh]);
  const mutate = useCallback(
    async (payload: Record<string, unknown>) => {
      if (mutating.current) throw new Error('Aguarde a alteração em andamento.');
      mutating.current = true;
      setBusy(true);
      ++sequence.current;
      try {
        const result = await api('/api/board', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        await refresh();
        return result;
      } catch (e) {
        await refresh();
        throw e;
      } finally {
        mutating.current = false;
        setBusy(false);
      }
    },
    [api, refresh],
  );
  const report = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.');
  const manager = data?.role === 'manager';
  const tasks = data?.tasks ?? [],
    people = data?.people ?? [];
  const pending = tasks.filter((t) => t.status !== 'done'),
    overdue = pending.filter(late),
    todayPending = pending.filter((t) => t.due_date === brazilDate()),
    doneWeek = tasks.filter(
      (t) => t.completed_at && Date.parse(t.completed_at) >= weekStart(),
    ),
    emptyPeople = people.filter((p) => !pending.some((t) => t.person_id === p.id));
  const create = (id: string) => {
    setDetail(null);
    setMenuFor('');
    setDraft({
      title: '',
      notes: '',
      person_id: id || people[0]?.id || '',
      due_date: brazilDate(),
      due_time: '',
    });
  };
  const edit = (t: Task) => {
    setDetail(null);
    setMenuFor('');
    setDraft({ ...t, due_time: t.due_time ?? '' });
  };
  async function saveTask(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft) return;
    try {
      await mutate({ action: draft.id ? 'edit' : 'create', ...draft });
      setDraft(null);
      toast.success(draft.id ? 'Tarefa atualizada.' : 'Tarefa criada.');
    } catch (e) {
      report(e);
    }
  }
  async function quickAdd(personId: string) {
    const title = addTitle.trim();
    if (!title) {
      setAddingFor('');
      return;
    }
    try {
      await mutate({
        action: 'create',
        title,
        person_id: personId,
        due_date: brazilDate(),
        notes: '',
      });
      setAddTitle('');
      toast.success('Tarefa criada.');
    } catch (e) {
      report(e);
    }
  }
  async function status(t: Task, s: string) {
    try {
      await mutate({ action: 'status', id: t.id, version: t.version, status: s });
      setDetail(null);
      toast.success(
        s === 'done'
          ? 'Entrega registrada!'
          : s === 'doing'
            ? 'Tarefa iniciada.'
            : 'Tarefa reaberta.',
      );
    } catch (e) {
      report(e);
      setDetail(null);
    }
  }
  async function move(id: string, personId: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.person_id === personId) return;
    try {
      await mutate({ action: 'move', id, version: task.version, person_id: personId });
      toast.success('Responsável alterado.');
    } catch (e) {
      report(e);
    }
  }
  async function duplicate(t: Task) {
    setMenuFor('');
    try {
      await mutate({
        action: 'create',
        title: t.title,
        person_id: t.person_id,
        due_date: t.due_date,
        due_time: t.due_time ?? '',
        notes: t.notes,
      });
      toast.success('Tarefa duplicada.');
    } catch (e) {
      report(e);
    }
  }
  async function remove(t: Task) {
    setMenuFor('');
    try {
      await mutate({ action: 'delete', id: t.id, version: t.version });
      toast.success('Tarefa excluída.');
    } catch (e) {
      report(e);
    }
  }
  async function resized(file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw new Error('Escolha uma foto JPG, PNG ou WebP.');
    if (file.size > 15 * 1024 * 1024)
      throw new Error('Escolha uma foto com até 15 MB.');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível preparar a foto.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Não foi possível preparar a foto.'))),
        'image/jpeg',
        0.86,
      ),
    );
  }
  async function savePerson(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    ++sequence.current;
    let saved = false;
    try {
      const image = photo ? await resized(photo) : null;
      const p = await api('/api/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'person',
          name: personName,
          ...(personEdit ? { id: personEdit.id } : {}),
        }),
      });
      saved = true;
      if (image) {
        try {
          await api('/api/photo/' + p.id, {
            method: 'POST',
            headers: { 'Content-Type': 'image/jpeg' },
            body: image,
          });
        } catch {
          setPersonEdit({
            id: p.id,
            name: personName,
            photo: personEdit?.photo ?? null,
            position: personEdit?.position ?? people.length,
          });
          throw new Error(
            'O nome foi salvo, mas a foto não foi enviada. Clique em Salvar para tentar novamente.',
          );
        }
      }
      setPersonEdit(null);
      setPersonName('');
      setPhoto(null);
      if (photoInput.current) photoInput.current.value = '';
      toast.success('Pessoa salva na equipe.');
    } catch (e) {
      report(e);
    } finally {
      if (saved) await refresh();
      mutating.current = false;
      setBusy(false);
    }
  }
  async function copyTeam() {
    if (!data?.teamKey) return;
    const url = location.origin + '/equipe#' + data.teamKey;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link da equipe copiado.');
    } catch {
      toast.error('Não foi possível copiar. Use o link entregue nesta conversa.');
    }
  }
  useEffect(() => {
    type Tool = {
      name: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (input: unknown) => unknown;
    };
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (tool: Tool, options: { signal: AbortSignal }) => Promise<void> | void;
        };
      }
    ).modelContext;
    if (!context || !data) return;
    const controller = new AbortController();
    const register = (tool: Tool) => {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: controller.signal })).catch(
          () => {},
        );
      } catch {}
    };
    register({
      name: 'read_team_board',
      description: 'Consulta pessoas, tarefas e prazos do quadro aberto.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({ people: data.people, tasks: data.tasks }),
    });
    if (manager)
      register({
        name: 'create_team_task',
        description: 'Cria uma tarefa com responsável e prazo no quadro e atualiza a tela.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            person_id: { type: 'string' },
            due_date: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['title', 'person_id', 'due_date'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: async (input) => {
          if (!input || typeof input !== 'object') throw new Error('Dados inválidos.');
          const v = input as Record<string, unknown>;
          if (
            typeof v.title !== 'string' ||
            typeof v.person_id !== 'string' ||
            typeof v.due_date !== 'string'
          )
            throw new Error('Informe tarefa, responsável e prazo.');
          return await mutate({
            action: 'create',
            title: v.title,
            person_id: v.person_id,
            due_date: v.due_date,
            notes: v.notes ?? '',
          });
        },
      });
    return () => controller.abort();
  }, [data, manager, mutate]);

  const matches = (t: Task, personName: string) =>
    !q ||
    t.title.toLowerCase().includes(q.toLowerCase()) ||
    personName.toLowerCase().includes(q.toLowerCase());

  function taskRow(t: Task) {
    const isLate = late(t);
    return (
      <div
        className={'row task' + (t.status === 'done' ? ' done' : '')}
        key={t.id}
        draggable={!!manager && !busy && t.status !== 'done'}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', t.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
      >
        <div className="cell">
          <button
            className={'check' + (isLate ? ' late' : '') + (t.status === 'done' ? ' checked' : '')}
            aria-label={t.status === 'done' ? 'Reabrir tarefa' : 'Marcar como entregue'}
            disabled={busy}
            onClick={() => status(t, t.status === 'done' ? 'doing' : 'done')}
          >
            <Check size={12} strokeWidth={3} />
          </button>
          <button className="title" onClick={() => setDetail(t)}>
            {t.title}
          </button>
        </div>
        <div className="cell col-status">
          <span
            className={
              'pill ' + (isLate ? 'p-late' : t.status === 'doing' ? 'p-doing' : 'p-todo')
            }
          >
            {isLate ? 'Atrasada' : statusLabel(t.status)}
          </span>
        </div>
        <div className={'due' + (isLate ? ' red' : '')}>
          {isLate ? <AlertTriangle size={13} /> : <Clock3 size={13} />}
          {shortDate(t)}
          {t.due_time ? ' ' + t.due_time : ''}
        </div>
        <div className="acts">
          {manager ? (
            <>
              <button className="iconbtn" aria-label="Editar" onClick={() => edit(t)}>
                <Pencil size={14} />
              </button>
              <button
                className="iconbtn"
                aria-label="Mais ações"
                onClick={() => setMenuFor(menuFor === t.id ? '' : t.id)}
              >
                <MoreVertical size={15} />
              </button>
            </>
          ) : (
            t.status !== 'done' && (
              <button className="deliver-chip" disabled={busy} onClick={() => status(t, 'done')}>
                <CircleCheck size={13} /> Entregar
              </button>
            )
          )}
        </div>
        {menuFor === t.id && (
          <>
            <button
              type="button"
              aria-label="Fechar menu"
              style={{ position: 'fixed', inset: 0, zIndex: 4, border: 0, background: 'transparent' }}
              onClick={() => setMenuFor('')}
            />
            <div className="menu">
              <button onClick={() => edit(t)}>
                <Pencil /> Editar
              </button>
              <button
                onClick={() => {
                  edit(t);
                }}
              >
                <UserCog /> Mudar responsável
              </button>
              <button onClick={() => void duplicate(t)}>
                <Copy /> Duplicar
              </button>
              <div className="msep" />
              <button className="danger" onClick={() => void remove(t)}>
                <Trash2 /> Excluir
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const filtered = (own: Task[]) => {
    const open = own.filter((t) => t.status !== 'done');
    if (filter === 'today') return open.filter((t) => t.due_date === brazilDate());
    if (filter === 'late') return open.filter(late);
    return open;
  };

  const dayKey = (iso: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(iso));
  const historyDays = (() => {
    const sorted = [...doneWeek].sort((a, b) =>
      (b.completed_at ?? '').localeCompare(a.completed_at ?? ''),
    );
    const groups: { key: string; items: Task[] }[] = [];
    for (const t of sorted) {
      const k = dayKey(t.completed_at ?? '');
      const g = groups.find((x) => x.key === k);
      if (g) g.items.push(t);
      else groups.push({ key: k, items: [t] });
    }
    return groups;
  })();
  const onTime = doneWeek.filter(
    (t) => t.completed_at && Date.parse(t.completed_at) <= t.deadline,
  ).length;
  const lateDone = doneWeek.length - onTime;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '—';
  const personIndex = (id: string) => Math.max(0, people.findIndex((p) => p.id === id));

  return (
    <main className="workspace">
      <Toaster />
      <header className="topbar">
        <a className="brand" href={location.hash ? '#' + location.hash.slice(1) : '#'}>
          <Image unoptimized width={104} height={26} src="/xp-factory-logo.png" alt="XP Factory" />
          <span className="sep" />
          <span className="page-name">Tarefas</span>
        </a>
        {manager && (
          <div className="top-actions">
            <button className="secondary" onClick={copyTeam}>
              <Link2 size={15} /> Copiar link
            </button>
            <button className="secondary" onClick={() => setTeamOpen(true)}>
              <Users size={15} /> Equipe
            </button>
            <button className="primary" onClick={() => create(people[0]?.id ?? '')}>
              <Plus size={16} /> Nova tarefa
            </button>
          </div>
        )}
      </header>

      {ready && !key ? (
        <section className="access-message">
          <Link2 size={28} />
          <h2>Você precisa do link do quadro</h2>
          <p>Abra o link completo enviado pela Lili. Não é necessário fazer login.</p>
        </section>
      ) : (
        <>
          <div className="viewbar">
            <div className="tabs">
              <button className="tab" data-on={tab === 'tarefas' ? '' : undefined} onClick={() => setTab('tarefas')}>
                <ListTodo size={13} /> Tarefas
              </button>
              <button className="tab" data-on={tab === 'historico' ? '' : undefined} onClick={() => setTab('historico')}>
                <History size={13} /> Histórico
              </button>
            </div>
            <div className="bar-sep" />
            {tab === 'tarefas' && (
              <div className="chips">
                <button className="chip" data-on={filter === 'all' ? '' : undefined} onClick={() => setFilter('all')}>
                  Todas <b>{pending.length}</b>
                </button>
                <button className="chip" data-on={filter === 'today' ? '' : undefined} onClick={() => setFilter('today')}>
                  Vencem hoje <b>{todayPending.length}</b>
                </button>
                <button className="chip" data-on={filter === 'late' ? '' : undefined} onClick={() => setFilter('late')}>
                  Atrasadas <b className={overdue.length ? 'warn' : ''}>{overdue.length}</b>
                </button>
                <button className="chip" data-on={filter === 'empty' ? '' : undefined} onClick={() => setFilter('empty')}>
                  Sem tarefas <b>{emptyPeople.length}</b>
                </button>
              </div>
            )}
            <label className="search">
              <Search size={14} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar tarefa ou pessoa"
              />
            </label>
            <span className="sync">
              <span className="dot" />
              {busy ? 'Salvando…' : updated ? 'Atualizado às ' + updated : 'Carregando…'}
            </span>
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <span>
                {error}
                {data ? ' As informações abaixo podem estar desatualizadas.' : ''}
              </span>
              <button onClick={() => void refresh()}>
                <RefreshCw size={16} /> Tentar novamente
              </button>
            </div>
          )}

          {!data && !error ? (
            <div className="loading" aria-label="Carregando quadro">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            data &&
            (tab === 'historico' ? (
              <div className="board">
                <div className="sheet">
                  <div className="summary">
                    <div className="stat">
                      <strong>{doneWeek.length}</strong>
                      <span>entregas nesta semana</span>
                    </div>
                    <div className="stat green">
                      <strong>{onTime}</strong>
                      <span>no prazo</span>
                    </div>
                    <div className="stat late">
                      <strong>{lateDone}</strong>
                      <span>com atraso</span>
                    </div>
                    {doneWeek.length > 0 && (
                      <>
                        <div className="bar">
                          <i style={{ width: (onTime / doneWeek.length) * 100 + '%', background: 'var(--done)' }} />
                          <i style={{ width: (lateDone / doneWeek.length) * 100 + '%', background: 'var(--late)' }} />
                        </div>
                        <span className="muted">
                          {Math.round((onTime / doneWeek.length) * 100)}% no prazo
                        </span>
                      </>
                    )}
                  </div>
                  {doneWeek.length === 0 ? (
                    <div className="empty-sheet">
                      <History size={26} />
                      <p>Nenhuma entrega registrada nesta semana ainda.</p>
                    </div>
                  ) : (
                    <>
                      <div className="row thead rec">
                        <span>TAREFA</span>
                        <span>RESPONSÁVEL</span>
                        <span>PRAZO</span>
                        <span>ENTREGUE</span>
                      </div>
                      {historyDays.map((g) => (
                        <div key={g.key}>
                          <div className="dhead">
                            {g.key} <b>· {g.items.length} entrega{g.items.length > 1 ? 's' : ''}</b>
                          </div>
                          {g.items.map((t) => {
                            const lateDelivery =
                              t.completed_at && Date.parse(t.completed_at) > t.deadline;
                            return (
                              <div className="row rec" key={t.id}>
                                <div className="cell">
                                  <CircleCheck size={15} color={lateDelivery ? 'var(--late)' : 'var(--done)'} />
                                  <button className="title" onClick={() => setDetail(t)}>
                                    {t.title}
                                  </button>
                                </div>
                                <div className="cell">
                                  <PersonAvatar
                                    person={people[personIndex(t.person_id)] ?? { id: '', name: nameOf(t.person_id), photo: null, position: 0 }}
                                    index={personIndex(t.person_id)}
                                  />
                                  <span className="muted" style={{ color: 'var(--ink)' }}>
                                    {nameOf(t.person_id)}
                                  </span>
                                </div>
                                <div className="due">{t.due_date.split('-').reverse().slice(0, 2).join('/')}</div>
                                <div className="cell">
                                  <span className={'pill ' + (lateDelivery ? 'p-latedone' : 'p-ok')}>
                                    {lateDelivery ? 'Com atraso' : 'No prazo'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="board">
                <div className="sheet">
                  <div className="row thead">
                    <span>TAREFA</span>
                    <span>STATUS</span>
                    <span>PRAZO</span>
                    <span className="rt">AÇÕES</span>
                  </div>
                  {people
                    .filter((p) => filter !== 'empty' || emptyPeople.includes(p))
                    .map((p, i) => {
                      const own = tasks.filter((t) => t.person_id === p.id);
                      const open = own.filter((t) => t.status !== 'done');
                      const lateCount = open.filter(late).length;
                      const visible = filtered(own)
                        .filter((t) => matches(t, p.name))
                        .sort(
                          (a, b) => Number(late(b)) - Number(late(a)) || a.deadline - b.deadline,
                        );
                      const isCollapsed = collapsed[p.id];
                      return (
                        <div key={p.id}>
                          <div
                            className={'row ghead' + (dragOver === p.id ? ' drop-target' : '')}
                            onDragOver={(e) => {
                              if (manager && !busy) {
                                e.preventDefault();
                                setDragOver(p.id);
                              }
                            }}
                            onDragLeave={(e) => {
                              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver('');
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              setDragOver('');
                              if (manager && !busy) void move(e.dataTransfer.getData('text/plain'), p.id);
                            }}
                          >
                            <div className="cell">
                              <button
                                className="group-toggle"
                                aria-label={isCollapsed ? 'Expandir' : 'Recolher'}
                                onClick={() =>
                                  setCollapsed((c) => ({ ...c, [p.id]: !c[p.id] }))
                                }
                              >
                                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                              </button>
                              <PersonAvatar person={p} index={i} />
                              <span className="gname">{p.name}</span>
                              {open.length > 0 ? (
                                <span className="count">{open.length}</span>
                              ) : (
                                <span className="muted">sem tarefas pendentes</span>
                              )}
                              {lateCount > 0 && (
                                <span className="count count-warn">{lateCount} atrasada{lateCount > 1 ? 's' : ''}</span>
                              )}
                            </div>
                            <span />
                            <span />
                            <div className="acts">
                              {manager && (
                                <button
                                  className="iconbtn"
                                  aria-label={'Adicionar tarefa para ' + p.name}
                                  onClick={() => {
                                    setAddingFor(p.id);
                                    setAddTitle('');
                                    setCollapsed((c) => ({ ...c, [p.id]: false }));
                                  }}
                                >
                                  <Plus size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                          {!isCollapsed && (
                            <>
                              {visible.map((t) => taskRow(t))}
                              {manager &&
                                (addingFor === p.id ? (
                                  <div className="addrow">
                                    <input
                                      ref={(el) => el?.focus()}
                                      value={addTitle}
                                      placeholder="Escreva a tarefa e aperte Enter"
                                      onChange={(e) => setAddTitle(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') void quickAdd(p.id);
                                        if (e.key === 'Escape') {
                                          setAddingFor('');
                                          setAddTitle('');
                                        }
                                      }}
                                      onBlur={() => void quickAdd(p.id)}
                                    />
                                  </div>
                                ) : (
                                  filter === 'all' &&
                                  !q && (
                                    <div className="addrow">
                                      <button onClick={() => setAddingFor(p.id)}>
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
                  {filter === 'empty' && emptyPeople.length === 0 && (
                    <div className="empty-sheet">
                      <CircleCheck size={26} />
                      <p>Todos têm tarefas pendentes.</p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </>
      )}

      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !busy) setDraft(null);
        }}
      >
        <DialogContent className="form-dialog" showCloseButton={false}>
          <DialogTitle>{draft?.id ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
          <DialogDescription>Defina o que precisa ser feito e até quando.</DialogDescription>
          {draft && (
            <form onSubmit={saveTask} className="form-stack">
              <label>
                O que precisa ser feito?
                <input
                  required
                  maxLength={240}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Ex.: Conferir o estoque de embalagens"
                />
              </label>
              <div className="field">
                <label htmlFor="task-person">Responsável</label>
                <SelectPerson
                  people={people}
                  value={draft.person_id}
                  onChange={(id) => setDraft({ ...draft, person_id: id })}
                />
              </div>
              <div className="date-fields">
                <label>
                  Prazo
                  <input
                    type="date"
                    required
                    value={draft.due_date}
                    onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
                  />
                </label>
                <label>
                  Horário <span>(opcional)</span>
                  <input
                    type="time"
                    value={draft.due_time}
                    onChange={(e) => setDraft({ ...draft, due_time: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Observação <span>(opcional)</span>
                <textarea
                  rows={3}
                  maxLength={3000}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="Algum detalhe para ajudar na execução?"
                />
              </label>
              <div className="dialog-actions">
                <button type="button" className="secondary" disabled={busy} onClick={() => setDraft(null)}>
                  Cancelar
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? 'Salvando…' : draft.id ? 'Salvar alterações' : 'Criar tarefa'}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open && !busy) setDetail(null);
        }}
      >
        <DialogContent className="form-dialog" showCloseButton={false}>
          <DialogTitle>{detail?.title}</DialogTitle>
          <DialogDescription>
            {people.find((p) => p.id === detail?.person_id)?.name} · {detail ? statusLabel(detail.status) : ''}
          </DialogDescription>
          {detail && (
            <>
              <p>
                <strong>Prazo: </strong>
                {detail.due_date.split('-').reverse().join('/')}
                {detail.due_time ? ' às ' + detail.due_time : ' até o fim do dia'}
              </p>
              {detail.notes && <p className="task-notes">{detail.notes}</p>}
              {detail.completed_at && (
                <p className="delivery-note">
                  Entregue em{' '}
                  {new Date(detail.completed_at).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                  })}{' '}
                  —{' '}
                  {Date.parse(detail.completed_at) > detail.deadline ? 'com atraso' : 'no prazo'}.
                </p>
              )}
              <div className="dialog-actions">
                <button className="secondary" disabled={busy} onClick={() => setDetail(null)}>
                  Fechar
                </button>
                {manager && (
                  <button className="secondary" disabled={busy} onClick={() => edit(detail)}>
                    Editar
                  </button>
                )}
                {detail.status === 'todo' && (
                  <button className="secondary" disabled={busy} onClick={() => status(detail, 'doing')}>
                    Começar
                  </button>
                )}
                {detail.status !== 'done' ? (
                  <button className="primary" disabled={busy} onClick={() => status(detail, 'done')}>
                    Entregar
                  </button>
                ) : (
                  <button className="secondary" disabled={busy} onClick={() => status(detail, 'doing')}>
                    <Undo2 size={15} /> Voltar para fazendo
                  </button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={teamOpen}
        onOpenChange={(open) => {
          if (!busy) {
            setTeamOpen(open);
            if (!open) {
              setPersonEdit(null);
              setPersonName('');
              setPhoto(null);
            }
          }
        }}
      >
        <DialogContent className="form-dialog team-dialog" showCloseButton={false}>
          <DialogTitle>Gerenciar equipe</DialogTitle>
          <DialogDescription>
            Adicione pessoas ou clique no lápis para atualizar nome e foto.
          </DialogDescription>
          <div className="team-grid">
            {people.map((p, i) => (
              <button
                className={'team-person ' + (personEdit?.id === p.id ? 'selected' : '')}
                key={p.id}
                onClick={() => {
                  setPersonEdit(p);
                  setPersonName(p.name);
                  setPhoto(null);
                  if (photoInput.current) photoInput.current.value = '';
                }}
              >
                <PersonAvatar person={p} index={i} />
                <span>{p.name}</span>
                <Pencil size={14} />
              </button>
            ))}
          </div>
          <form className="form-stack" onSubmit={savePerson}>
            <div className="team-form-heading">
              <h3>{personEdit ? 'Editar ' + personEdit.name : 'Adicionar pessoa'}</h3>
              {personEdit && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setPersonEdit(null);
                    setPersonName('');
                    setPhoto(null);
                    if (photoInput.current) photoInput.current.value = '';
                  }}
                >
                  <Plus size={15} /> Nova pessoa
                </button>
              )}
            </div>
            <label>
              Nome
              <input
                required
                maxLength={70}
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="Nome da pessoa"
              />
            </label>
            <label className="photo-field">
              <span>
                <Camera size={18} /> Foto <span>(opcional)</span>
              </span>
              <input
                ref={photoInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
              <small>JPG, PNG ou WebP. Sem foto, aparecem as iniciais.</small>
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setTeamOpen(false);
                  setPersonEdit(null);
                  setPersonName('');
                  setPhoto(null);
                }}
              >
                Fechar
              </button>
              <button className="primary" disabled={busy || !personName.trim()}>
                {busy ? 'Salvando…' : personEdit ? 'Salvar pessoa' : 'Adicionar à equipe'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
