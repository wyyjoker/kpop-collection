import worker from './worker.mjs';
import { catalogStatus, syncCatalogArtist } from './catalog-sync.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});

function ownerState(request, env, url) {
  const local = env.LOCAL_PREVIEW === 'true' && ['localhost', '127.0.0.1'].includes(url.hostname);
  const user = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  const canEdit = local || Boolean(user && env.OWNER_EMAIL && email === env.OWNER_EMAIL.trim().toLowerCase());
  return { canEdit, user };
}

async function ensureInitialized(request, env, ctx) {
  const url = new URL(request.url);
  url.pathname = '/api/library';
  url.search = '';
  const headers = new Headers();
  for (const name of ['oai-authenticated-user-id', 'oai-authenticated-user-email']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const response = await worker.fetch(new Request(url, { method: 'GET', headers }), env, ctx);
  if (!response.ok) throw Object.assign(new Error('云端资料库初始化失败。'), { status: response.status });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/catalog/')) return worker.fetch(request, env, ctx);
    const { canEdit, user } = ownerState(request, env, url);
    try {
      await ensureInitialized(request, env, ctx);
      if (url.pathname === '/api/catalog/status' && request.method === 'GET') {
        const status = await catalogStatus(env.DB);
        return json({ ...status, can_edit: canEdit });
      }
      const sync = url.pathname.match(/^\/api\/catalog\/sync\/([a-z0-9-]+)$/);
      if (sync && request.method === 'POST') {
        if (!canEdit) return json({ error: '只有站点主人可以同步云端团体资料库。' }, user ? 403 : 401);
        const origin = request.headers.get('origin');
        if (request.headers.get('sec-fetch-site') === 'cross-site' || origin && origin !== url.origin) return json({ error: '不允许跨站同步资料库。' }, 403);
        if (Number(request.headers.get('content-length') || 0) > 4096) return json({ error: '同步请求过大。' }, 413);
        let body = {};
        try { body = await request.json(); } catch { body = {}; }
        const result = await syncCatalogArtist(env.DB, sync[1], { force: body?.force === true });
        return json(result);
      }
      return json({ error: '未找到资料库接口。' }, 404);
    } catch (error) {
      console.error('Catalog sync failed', error.message);
      return json({ error: error.status ? error.message : '云端资料库同步失败，请稍后重试。' }, error.status || 500);
    }
  },
};
