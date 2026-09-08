'use client';
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- Drag-and-drop supplements the keyboard-accessible Editar dialog and responsible-person selector. */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type SubmitEvent,
} from 'react';
import {
  Plus,
  Users,
  CircleCheck,
  LayoutGrid,
  Clock3,
  AlertCircle,
  Link2,
  GripVertical,
  ArrowRight,
  Camera,
  Pencil,
  RefreshCw,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Avatar as AvatarRoot,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
}: {
  person: Person;
  index?: number;
}) {
  return (
    <AvatarRoot className={'avatar color-' + (index % 6)}>
      {person.photo ? (
        <AvatarImage src={'/api/photo/' + person.photo} alt={person.name} />
      ) : (
        <AvatarFallback>{person.name.slice(0, 2).toUpperCase()}</AvatarFallback>
      )}
    </AvatarRoot>
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
      <SelectTrigger
        id="task-person"
        className="person-select"
        aria-label="Responsável"
      >
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
export default function Board({
  mode = 'team',
}: {
  mode?: 'manager' | 'team';
}) {
  const [key, setKey] = useState(''),
    [ready, setReady] = useState(false),
    [data, setData] = useState<BoardData | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState('all'),
    [draft, setDraft] = useState<Draft | null>(null),
    [detail, setDetail] = useState<Task | null>(null),
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
      const result = (await r.json()) as BoardData & {
        error?: string;
        id: string;
      };
      if (!r.ok)
        throw new Error(
          result.error ?? 'Não foi possível conectar. Tente novamente.',
        );
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
        setError(
          e instanceof Error ? e.message : 'Sem conexão. Tente novamente.',
        );
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
      if (mutating.current)
        throw new Error('Aguarde a alteração em andamento.');
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
  const managerView = manager || mode === 'manager';
  const tasks = data?.tasks ?? [],
    people = data?.people ?? [];
  const pending = tasks.filter((t) => t.status !== 'done'),
    overdue = pending.filter(late),
    doneWeek = tasks.filter(
      (t) => t.completed_at && Date.parse(t.completed_at) >= weekStart(),
    ),
    emptyPeople = people.filter(
      (p) => !pending.some((t) => t.person_id === p.id),
    );
  const create = (id: string) => {
    setDetail(null);
    setDraft({
      title: '',
      notes: '',
      person_id: id,
      due_date: brazilDate(),
      due_time: '',
    });
  };
  const edit = (t: Task) => {
    setDetail(null);
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
  async function status(t: Task, s: string) {
    try {
      await mutate({
        action: 'status',
        id: t.id,
        version: t.version,
        status: s,
      });
      setDetail(null);
      toast.success(
        s === 'done'
          ? 'Entrega registrada!'
          : s === 'doing'
            ? t.status === 'done'
              ? 'Entrega desfeita. A tarefa voltou para fazendo.'
              : 'Tarefa iniciada.'
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
      await mutate({
        action: 'move',
        id,
        version: task.version,
        person_id: personId,
      });
      toast.success('Responsável alterado.');
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
        (b) =>
          b
            ? resolve(b)
            : reject(new Error('Não foi possível preparar a foto.')),
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
      toast.error(
        'Não foi possível copiar. Use o link da equipe entregue nesta conversa.',
      );
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
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => Promise<void> | void;
        };
      }
    ).modelContext;
    if (!context || !data) return;
    const controller = new AbortController();
    const register = (tool: Tool) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: controller.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: 'read_team_board',
      description: 'Consulta pessoas, tarefas e prazos do quadro aberto.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => ({ people: data.people, tasks: data.tasks }),
    });
    if (manager)
      register({
        name: 'create_team_task',
        description:
          'Cria uma tarefa com responsável e prazo no quadro e atualiza a tela.',
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
          if (!input || typeof input !== 'object')
            throw new Error('Dados inválidos.');
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
  function card(t: Task) {
    const isLate = late(t);
    return (
      <Card
        size="sm"
        key={t.id}
        className={
          'task-card ' +
          (isLate ? 'late ' : '') +
          (t.status === 'done' ? 'done' : '')
        }
        draggable={!!manager && !busy && t.status !== 'done'}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', t.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
      >
        <div className="card-top">
          <Badge variant="secondary" className={'status status-' + t.status}>
            {t.status === 'done'
              ? 'Entregue'
              : t.status === 'doing'
                ? 'Fazendo'
                : 'A fazer'}
          </Badge>
          {manager && t.status !== 'done' && (
            <GripVertical size={16} aria-label="Arraste para outra pessoa" />
          )}
        </div>
        <button className="task-title" onClick={() => setDetail(t)}>
          {t.title}
        </button>
        <p className={'due ' + (isLate ? 'red' : '')}>
          <Clock3 size={14} />
          {isLate ? 'Atrasada · ' : ''}
          {t.due_date === brazilDate()
            ? 'Hoje'
            : t.due_date.split('-').reverse().slice(0, 2).join('/')}
          {t.due_time ? ' às ' + t.due_time : ''}
        </p>
        {t.status === 'done' ? (
          <div className="delivered-block">
            <p className="delivered">
              {t.completed_at &&
                new Intl.DateTimeFormat('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'America/Sao_Paulo',
                }).format(new Date(t.completed_at))}
              <br />
              {Date.parse(t.completed_at ?? '') > t.deadline
                ? 'Entregue com atraso'
                : 'Entregue no prazo'}
            </p>
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              className="undo-delivery"
              onClick={() => status(t, 'doing')}
            >
              <Undo2 /> Desfazer entrega
            </Button>
          </div>
        ) : (
          <div className="card-actions">
            {t.status === 'todo' && (
              <Button
                variant="ghost"
                size="xs"
                disabled={busy}
                onClick={() => status(t, 'doing')}
              >
                Começar <ArrowRight size={14} />
              </Button>
            )}
            <Button
              variant="outline"
              size="xs"
              disabled={busy}
              className="deliver"
              onClick={() => status(t, 'done')}
            >
              <CircleCheck size={15} /> Entregar
            </Button>
          </div>
        )}
      </Card>
    );
  }
  return (
    <main className={`workspace ${managerView ? 'is-manager' : 'is-team'}`}>
      <Toaster />
      <header className="topbar">
        <div className="brand">
          <Image
            unoptimized
            width={146}
            height={34}
            src="/xp-factory-logo.png"
            alt="XP Factory"
          />
          <span>Tarefas</span>
        </div>
        <span className="access-label">
          {managerView ? 'MODO GESTÃO · LILI' : 'VISÃO DA EQUIPE'}
        </span>
      </header>
      <section className="heading">
        <div>
          <p className="eyebrow">EQUIPE XP</p>
          <h1>{managerView ? 'Gestão de tarefas' : 'Tarefas da equipe'}</h1>
          <p>
            {managerView
              ? 'Crie, distribua e acompanhe o trabalho do time.'
              : 'Acompanhe e atualize o andamento das tarefas.'}
          </p>
        </div>
        {manager && (
          <div className="heading-actions">
            <Button variant="outline" className="secondary" onClick={copyTeam}>
              <Link2 size={18} /> Link da equipe
            </Button>
            <Button className="primary" onClick={() => setTeamOpen(true)}>
              <Users size={18} /> Gerenciar equipe
            </Button>
          </div>
        )}
      </section>
      {ready && !key ? (
        <section className="access-message">
          <Link2 size={28} />
          <h2>Você precisa do link do quadro</h2>
          <p>
            Abra o link completo enviado pela Lili. Não é necessário fazer
            login.
          </p>
        </section>
      ) : (
        <>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <span>
                {error}
                {data
                  ? ' As informações abaixo podem estar desatualizadas.'
                  : ''}
              </span>
              <button onClick={() => void refresh()}>
                <RefreshCw size={16} /> Tentar novamente
              </button>
            </div>
          )}
          {!data && !error ? (
            <div className="loading" aria-label="Carregando quadro">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            data && (
              <>
                <div className="overview">
                  <div>
                    <LayoutGrid />
                    <strong>{pending.length}</strong>
                    <span>pendentes</span>
                  </div>
                  <div className={overdue.length ? 'red' : ''}>
                    <AlertCircle />
                    <strong>{overdue.length}</strong>
                    <span>atrasadas</span>
                  </div>
                  <div>
                    <CircleCheck />
                    <strong>{doneWeek.length}</strong>
                    <span>entregues nesta semana</span>
                  </div>
                  <div>
                    <Users />
                    <strong>{emptyPeople.length}</strong>
                    <span>sem tarefas</span>
                  </div>
                </div>
                <div className="toolbar">
                  <Tabs value={filter} onValueChange={setFilter}>
                    <TabsList className="filter-list">
                      <TabsTrigger value="all">Todas</TabsTrigger>
                      <TabsTrigger value="today">Vencem hoje</TabsTrigger>
                      <TabsTrigger value="late">Atrasadas</TabsTrigger>
                      <TabsTrigger value="done">
                        Entregues na semana
                      </TabsTrigger>
                      <TabsTrigger value="empty">
                        Pessoas sem tarefas
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <span className="sync">
                    <span />
                    {busy ? 'Salvando…' : 'Atualizado às ' + updated}
                  </span>
                </div>
                <section
                  className={`kanban ${people.length > 6 ? 'kanban-dense' : ''} ${people.length > 12 ? 'kanban-super-dense' : ''}`}
                  style={
                    {
                      '--board-columns': Math.max(
                        1,
                        people.length <= 6
                          ? people.length
                          : people.length <= 10
                            ? Math.ceil(people.length / 2)
                            : 6,
                      ),
                    } as CSSProperties
                  }
                  aria-label="Tarefas por pessoa"
                >
                  {people
                    .filter(
                      (p) => filter !== 'empty' || emptyPeople.includes(p),
                    )
                    .map((p, i) => {
                      const own = tasks.filter((t) => t.person_id === p.id),
                        open = own.filter((t) => t.status !== 'done'),
                        completed = own
                          .filter((t) => t.status === 'done')
                          .sort((a, b) =>
                            (b.completed_at ?? '').localeCompare(
                              a.completed_at ?? '',
                            ),
                          );
                      const visible = (
                        filter === 'done'
                          ? completed.filter(
                              (t) =>
                                t.completed_at &&
                                Date.parse(t.completed_at) >= weekStart(),
                            )
                          : open.filter((t) =>
                              filter === 'today'
                                ? t.due_date === brazilDate()
                                : filter === 'late'
                                  ? late(t)
                                  : true,
                            )
                      ).sort(
                        (a, b) =>
                          Number(late(b)) - Number(late(a)) ||
                          a.deadline - b.deadline,
                      );
                      return (
                        <article
                          className={
                            'person-column ' +
                            (dragOver === p.id ? 'drop-target' : '')
                          }
                          key={p.id}
                          onDragOver={(e) => {
                            if (manager && !busy) {
                              e.preventDefault();
                              setDragOver(p.id);
                            }
                          }}
                          onDragLeave={(e) => {
                            if (
                              !e.currentTarget.contains(e.relatedTarget as Node)
                            )
                              setDragOver('');
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOver('');
                            if (manager && !busy)
                              void move(
                                e.dataTransfer.getData('text/plain'),
                                p.id,
                              );
                          }}
                        >
                          <div className="person-heading">
                            <PersonAvatar person={p} index={i} />
                            <div>
                              <h2>{p.name}</h2>
                              <span>
                                {open.length}{' '}
                                {open.length === 1 ? 'pendente' : 'pendentes'}
                              </span>
                            </div>
                            {manager && (
                              <button
                                className="icon-button edit-person"
                                aria-label={'Editar ' + p.name + ' e foto'}
                                onClick={() => {
                                  setPersonEdit(p);
                                  setPersonName(p.name);
                                  setPhoto(null);
                                  setTeamOpen(true);
                                }}
                              >
                                <Pencil size={15} />
                              </button>
                            )}
                          </div>
                          {manager && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="add-task"
                              onClick={() => create(p.id)}
                            >
                              <Plus size={18} /> Adicionar tarefa
                            </Button>
                          )}
                          <div className="task-list">{visible.map(card)}</div>
                          {!visible.length && (
                            <div className="empty-column">
                              <CircleCheck />
                              <p>
                                {filter === 'all' || filter === 'empty'
                                  ? 'Sem tarefas pendentes'
                                  : 'Nenhuma tarefa neste filtro'}
                              </p>
                            </div>
                          )}
                          {filter === 'all' &&
                            completed.some(
                              (t) =>
                                t.completed_at &&
                                Date.parse(t.completed_at) >= weekStart(),
                            ) && (
                              <section className="completed-list">
                                <h3>
                                  <CircleCheck size={15} /> Entregues nesta
                                  semana
                                </h3>
                                <div className="task-list">
                                  {completed
                                    .filter(
                                      (t) =>
                                        t.completed_at &&
                                        Date.parse(t.completed_at) >=
                                          weekStart(),
                                    )
                                    .map(card)}
                                </div>
                              </section>
                            )}
                        </article>
                      );
                    })}
                  {filter === 'empty' && emptyPeople.length === 0 && (
                    <p className="board-empty">Todos têm tarefas pendentes.</p>
                  )}
                </section>
                <footer className="board-footer">
                  Prazos no horário de Brasília.
                  {manager
                    ? ' Para trocar o responsável, arraste o cartão ou abra a tarefa e clique em Editar.'
                    : ''}
                </footer>
              </>
            )
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
          <DialogTitle>
            {draft?.id ? 'Editar tarefa' : 'Nova tarefa'}
          </DialogTitle>
          <DialogDescription>
            Defina o que precisa ser feito e até quando.
          </DialogDescription>
          {draft && (
            <form onSubmit={saveTask} className="form-stack">
              <label>
                O que precisa ser feito?
                <input
                  required
                  maxLength={240}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
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
                    onChange={(e) =>
                      setDraft({ ...draft, due_date: e.target.value })
                    }
                  />
                </label>
                <label>
                  Horário <span>(opcional)</span>
                  <input
                    type="time"
                    value={draft.due_time}
                    onChange={(e) =>
                      setDraft({ ...draft, due_time: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                Observação <span>(opcional)</span>
                <textarea
                  rows={3}
                  maxLength={3000}
                  value={draft.notes}
                  onChange={(e) =>
                    setDraft({ ...draft, notes: e.target.value })
                  }
                  placeholder="Algum detalhe para ajudar na execução?"
                />
              </label>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  Cancelar
                </button>
                <button className="primary" disabled={busy}>
                  {busy
                    ? 'Salvando…'
                    : draft.id
                      ? 'Salvar alterações'
                      : 'Criar tarefa'}
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
            {people.find((p) => p.id === detail?.person_id)?.name} ·{' '}
            {detail?.status === 'done'
              ? 'Entregue'
              : detail?.status === 'doing'
                ? 'Fazendo'
                : 'A fazer'}
          </DialogDescription>
          {detail && (
            <>
              <p>
                <strong>Prazo: </strong>
                {detail.due_date.split('-').reverse().join('/')}
                {detail.due_time
                  ? ' às ' + detail.due_time
                  : ' até o fim do dia'}
              </p>
              {detail.notes && <p className="task-notes">{detail.notes}</p>}
              {detail.completed_at && (
                <p className="delivery-note">
                  Entregue em{' '}
                  {new Date(detail.completed_at).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                  })}{' '}
                  —{' '}
                  {Date.parse(detail.completed_at) > detail.deadline
                    ? 'com atraso'
                    : 'no prazo'}
                  .
                </p>
              )}
              <div className="dialog-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setDetail(null)}
                >
                  Fechar
                </button>
                {manager && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => edit(detail)}
                  >
                    Editar
                  </button>
                )}
                {detail.status === 'todo' && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => status(detail, 'doing')}
                  >
                    Começar
                  </button>
                )}
                {detail.status !== 'done' ? (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => status(detail, 'done')}
                  >
                    Entregar
                  </button>
                ) : (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => status(detail, 'doing')}
                  >
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
        <DialogContent
          className="form-dialog team-dialog"
          showCloseButton={false}
        >
          <DialogTitle>Gerenciar equipe</DialogTitle>
          <DialogDescription>
            Adicione pessoas ou clique no lápis para atualizar nome e foto.
          </DialogDescription>
          <div className="team-grid">
            {people.map((p, i) => (
              <button
                className={
                  'team-person ' + (personEdit?.id === p.id ? 'selected' : '')
                }
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
              <h3>
                {personEdit ? 'Editar ' + personEdit.name : 'Adicionar pessoa'}
              </h3>
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
                {busy
                  ? 'Salvando…'
                  : personEdit
                    ? 'Salvar pessoa'
                    : 'Adicionar à equipe'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
