import { env } from 'cloudflare:workers';
export function bindings() {
  return env as unknown as Cloudflare.Env;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function equal(a: string, b: string) {
  if (!b || a.length !== b.length) return false;
  let n = 0;
  for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return n === 0;
}
export function role(request: Request) {
  const token =
    request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  const e = bindings();
  if (equal(token, e.ADMIN_TOKEN ?? '')) return 'manager';
  if (equal(token, e.TEAM_TOKEN ?? '')) return 'team';
  throw new ApiError(
    'Abra o link completo enviado pela Lili para acessar o quadro.',
    401,
  );
}
export function manager(request: Request) {
  if (role(request) !== 'manager')
    throw new ApiError(
      'Somente o acesso de gestão pode fazer essa alteração.',
      403,
    );
}
export async function safely(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    console.error(
      'Board operation failed',
      e instanceof Error ? e.message : 'unknown',
    );
    return json(
      { error: 'Não foi possível salvar agora. Tente novamente.' },
      500,
    );
  }
}
export function clean(value: unknown, max: number, required = true) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new ApiError('Confira os campos preenchidos.');
  return value.trim();
}
export async function body(request: Request) {
  if (Number(request.headers.get('Content-Length')) > 20000)
    throw new ApiError('Conteúdo muito grande.', 413);
  const text = await request.text();
  if (text.length > 20000) throw new ApiError('Conteúdo muito grande.', 413);
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw 0;
    return data as Record<string, unknown>;
  } catch {
    throw new ApiError('Dados inválidos.');
  }
}
export function due(date: unknown, time: unknown) {
  const d = clean(date, 10);
  const t =
    time === null || time === '' || time === undefined ? null : clean(time, 5);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(d) ||
    !Number.isFinite(Date.parse(d + 'T12:00:00Z')) ||
    new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) !== d ||
    (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))
  )
    throw new ApiError('Escolha uma data e um horário válidos.');
  const deadline = Date.parse(`${d}T${t ? t + ':00' : '23:59:59'}-03:00`);
  if (!Number.isFinite(deadline)) throw new ApiError('Prazo inválido.');
  return { date: d, time: t, deadline };
}
