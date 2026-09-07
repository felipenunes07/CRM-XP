import {
  bindings,
  json,
  role,
  manager,
  safely,
  body,
  clean,
  due,
  ApiError,
} from '@/lib/server';
import { names, type Task } from '@/lib/model';
export function GET(request: Request) {
  return safely(async () => {
    const access = role(request);
    const db = bindings().DB;
    await db.batch(
      names.map((name, i) =>
        db
          .prepare(
            'INSERT OR IGNORE INTO people (id,name,position) VALUES (?,?,?)',
          )
          .bind('initial-' + i, name, i),
      ),
    );
    const [people, tasks] = await db.batch([
      db.prepare('SELECT * FROM people ORDER BY position, name'),
      db.prepare('SELECT * FROM tasks ORDER BY deadline ASC'),
    ]);
    return json({
      people: people.results,
      tasks: tasks.results,
      role: access,
      ...(access === 'manager' ? { teamKey: bindings().TEAM_TOKEN } : {}),
    });
  });
}
export function POST(request: Request) {
  return safely(async () => {
    const access = role(request);
    const b = await body(request);
    const db = bindings().DB;
    if (b.action === 'person') {
      manager(request);
      const name = clean(b.name, 70);
      const id =
        typeof b.id === 'string' ? clean(b.id, 80) : crypto.randomUUID();
      if (b.id) {
        const result = await db
          .prepare('UPDATE people SET name=? WHERE id=?')
          .bind(name, id)
          .run();
        if (!result.meta.changes)
          throw new ApiError('Pessoa não encontrada.', 404);
      } else
        await db
          .prepare(
            'INSERT INTO people (id,name,position) VALUES (?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM people))',
          )
          .bind(id, name)
          .run();
      return json({ id });
    }
    if (b.action === 'create') {
      manager(request);
      const title = clean(b.title, 240),
        notes = clean(b.notes ?? '', 3000, false),
        person = clean(b.person_id, 80),
        d = due(b.due_date, b.due_time);
      if (
        !(await db
          .prepare('SELECT id FROM people WHERE id=?')
          .bind(person)
          .first())
      )
        throw new ApiError('Escolha uma pessoa da equipe.');
      const id = crypto.randomUUID();
      await db
        .prepare(
          'INSERT INTO tasks (id,title,notes,person_id,due_date,due_time,deadline,status,created_at,version) VALUES (?,?,?,?,?,?,?,?,?,1)',
        )
        .bind(
          id,
          title,
          notes,
          person,
          d.date,
          d.time,
          d.deadline,
          'todo',
          new Date().toISOString(),
        )
        .run();
      return json({ id });
    }
    const id = clean(b.id, 80);
    const current = await db
      .prepare('SELECT * FROM tasks WHERE id=?')
      .bind(id)
      .first<Task>();
    if (!current) throw new ApiError('Tarefa não encontrada.', 404);
    if (b.version !== current.version)
      throw new ApiError(
        'Essa tarefa mudou em outra tela. Atualize o quadro e tente novamente.',
        409,
      );
    let statement: D1PreparedStatement;
    if (b.action === 'status') {
      const status = clean(b.status, 10);
      if (!['todo', 'doing', 'done'].includes(status))
        throw new ApiError('Situação inválida.');
      if (
        access === 'team' &&
        !(
          (current.status === 'todo' &&
            (status === 'doing' || status === 'done')) ||
          (current.status === 'doing' && status === 'done')
        )
      )
        throw new ApiError('Essa alteração precisa do acesso de gestão.', 403);
      statement = db
        .prepare(
          'UPDATE tasks SET status=?,completed_at=?,version=version+1 WHERE id=? AND version=?',
        )
        .bind(
          status,
          status === 'done'
            ? (current.completed_at ?? new Date().toISOString())
            : null,
          id,
          current.version,
        );
    } else if (b.action === 'edit') {
      manager(request);
      const title = clean(b.title, 240),
        notes = clean(b.notes ?? '', 3000, false),
        person = clean(b.person_id, 80),
        d = due(b.due_date, b.due_time);
      if (
        !(await db
          .prepare('SELECT id FROM people WHERE id=?')
          .bind(person)
          .first())
      )
        throw new ApiError('Pessoa não encontrada.');
      statement = db
        .prepare(
          'UPDATE tasks SET title=?,notes=?,person_id=?,due_date=?,due_time=?,deadline=?,version=version+1 WHERE id=? AND version=?',
        )
        .bind(
          title,
          notes,
          person,
          d.date,
          d.time,
          d.deadline,
          id,
          current.version,
        );
    } else if (b.action === 'move') {
      manager(request);
      const person = clean(b.person_id, 80);
      if (
        !(await db
          .prepare('SELECT id FROM people WHERE id=?')
          .bind(person)
          .first())
      )
        throw new ApiError('Pessoa não encontrada.');
      statement = db
        .prepare(
          'UPDATE tasks SET person_id=?,version=version+1 WHERE id=? AND version=?',
        )
        .bind(person, id, current.version);
    } else throw new ApiError('Ação inválida.');
    const result = await statement.run();
    if (!result.meta.changes)
      throw new ApiError(
        'Essa tarefa mudou em outra tela. Tente novamente.',
        409,
      );
    return json({ id });
  });
}
