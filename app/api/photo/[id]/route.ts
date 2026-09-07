import { bindings, manager, safely, json, ApiError } from '@/lib/server';
export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return safely(async () => {
    manager(request);
    const { id } = await context.params;
    const { DB, FILES } = bindings();
    if (
      !(await DB.prepare('SELECT id FROM people WHERE id=?').bind(id).first())
    )
      throw new ApiError('Pessoa não encontrada.', 404);
    if (Number(request.headers.get('Content-Length')) > 2100000)
      throw new ApiError('A foto deve ter até 2 MB.', 413);
    const data = new Uint8Array(await request.arrayBuffer());
    if (data.byteLength > 2100000)
      throw new ApiError('A foto deve ter até 2 MB.', 413);
    const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
    const png = data.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
    const webp =
      new TextDecoder().decode(data.slice(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(data.slice(8, 12)) === 'WEBP';
    if (!jpeg && !png && !webp)
      throw new ApiError('Escolha uma foto JPG, PNG ou WebP.');
    const key = crypto.randomUUID();
    await FILES.put(key, data, {
      httpMetadata: {
        contentType: jpeg ? 'image/jpeg' : png ? 'image/png' : 'image/webp',
      },
    });
    await DB.prepare('UPDATE people SET photo=? WHERE id=?')
      .bind(key, id)
      .run();
    return json({ photo: key });
  });
}
export function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return safely(async () => {
    const { id } = await context.params;
    if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 404 });
    const item = await bindings().FILES.get(id);
    if (!item) return new Response(null, { status: 404 });
    return new Response(item.body, {
      headers: {
        'Content-Type': item.httpMetadata?.contentType ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  });
}
