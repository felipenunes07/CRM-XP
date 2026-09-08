import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8')
    .trim()
    .split('\n')
    .map((l) => l.split('=')),
);
const base = 'http://localhost:3000';
async function request(key, body, path = '/api/board', extra = {}) {
  const r = await fetch(base + path, {
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    headers: {
      ...(key ? { Authorization: 'Bearer ' + key } : {}),
      'Content-Type': 'application/json',
    },
    ...extra,
  });
  const result = await r.json();
  return { status: r.status, ...result };
}
const admin = env.ADMIN_TOKEN,
  team = env.TEAM_TOKEN;
assert.equal((await request(null)).status, 401);
const board = await request(admin);
assert.equal(board.status, 200, JSON.stringify(board));
assert.equal(board.people.length, 6);
assert.equal(board.role, 'manager');
const publicBoard = await request(team);
assert.equal(publicBoard.role, 'team');
assert.ok(!publicBoard.teamKey);
assert.equal(
  (await request(team, { action: 'person', name: 'Unauthorized' })).status,
  403,
);
assert.equal(
  (
    await request(admin, {
      action: 'create',
      title: 'Invalid date',
      person_id: board.people[0].id,
      due_date: '2026-02-30',
    })
  ).status,
  400,
);
const test = await request(admin, {
  action: 'create',
  title: 'TESTE LOCAL — conferir estoque',
  notes: 'Verificar a entrega',
  person_id: board.people[0].id,
  due_date: '2026-09-08',
  due_time: '15:00',
});
assert.equal(test.status, 200, JSON.stringify(test));
let t = (await request(team)).tasks.find((t) => t.id === test.id);
assert.equal(t.title, 'TESTE LOCAL — conferir estoque');
assert.equal(t.deadline, Date.parse('2026-09-08T15:00:00-03:00'));
assert.equal(
  (
    await request(team, {
      action: 'move',
      id: t.id,
      version: t.version,
      person_id: board.people[1].id,
    })
  ).status,
  403,
);
assert.equal(
  (
    await request(admin, {
      action: 'move',
      id: t.id,
      version: t.version,
      person_id: board.people[1].id,
    })
  ).status,
  200,
);
assert.equal(
  (
    await request(team, {
      action: 'status',
      id: t.id,
      version: t.version,
      status: 'doing',
    })
  ).status,
  409,
);
t = (await request(team)).tasks.find((x) => x.id === t.id);
assert.equal(t.person_id, board.people[1].id);
assert.equal(
  (
    await request(team, {
      action: 'status',
      id: t.id,
      version: t.version,
      status: 'doing',
    })
  ).status,
  200,
);
t = (await request(admin)).tasks.find((x) => x.id === t.id);
assert.equal(
  (
    await request(team, {
      action: 'status',
      id: t.id,
      version: t.version,
      status: 'done',
    })
  ).status,
  200,
);
t = (await request(admin)).tasks.find((x) => x.id === t.id);
assert.ok(t.completed_at);
assert.equal(t.status, 'done');
assert.equal(
  (
    await request(team, {
      action: 'status',
      id: t.id,
      version: t.version,
      status: 'todo',
    })
  ).status,
  403,
);
assert.equal(
  (
    await request(admin, {
      action: 'status',
      id: t.id,
      version: t.version,
      status: 'todo',
    })
  ).status,
  200,
);
const photo = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);
assert.equal(
  (
    await request(team, null, '/api/photo/' + board.people[0].id, {
      method: 'POST',
      body: photo,
      headers: { Authorization: 'Bearer ' + team },
    })
  ).status,
  403,
);
const upload = await request(admin, null, '/api/photo/' + board.people[0].id, {
  method: 'POST',
  body: photo,
  headers: { Authorization: 'Bearer ' + admin },
});
assert.equal(upload.status, 200, JSON.stringify(upload));
const image = await fetch(base + '/api/photo/' + upload.photo);
assert.equal(image.status, 200);
assert.equal(image.headers.get('content-type'), 'image/png');
assert.equal((await image.arrayBuffer()).byteLength, photo.length);
assert.equal(
  (
    await request(admin, null, '/api/photo/' + board.people[0].id, {
      method: 'POST',
      body: '<svg>bad</svg>',
      headers: { Authorization: 'Bearer ' + admin },
    })
  ).status,
  400,
);
console.log(
  'PASS: seis pessoas, dois acessos, criação, prazo, transferência, conflito simultâneo, início, entrega, reabertura e foto persistida.',
);

const person = await request(admin, {
  action: 'person',
  name: 'TESTE LOCAL nova pessoa',
});
assert.equal(person.status, 200);
assert.equal(
  (
    await request(admin, {
      action: 'person',
      id: person.id,
      name: 'TESTE LOCAL pessoa atualizada',
    })
  ).status,
  200,
);
assert.ok(
  (await request(team)).people.some(
    (p) => p.id === person.id && p.name === 'TESTE LOCAL pessoa atualizada',
  ),
);
console.log('PASS: cadastro e edição de pessoa sincronizados.');
