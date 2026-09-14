import { Miniflare, Request as MiniflareRequest } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const clientRoot = path.join(root, 'dist/client');
const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.webmanifest', 'application/manifest+json'],
]);

async function assetBinding(request) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Keep the test asset binding strict: only exact files under dist/client are served.
  // The Worker itself owns SPA fallback routing by requesting /index.html when needed.
  const absolute = path.resolve(clientRoot, `.${pathname}`);
  const rootPrefix = `${clientRoot}${path.sep}`;
  if (absolute !== clientRoot && !absolute.startsWith(rootPrefix)) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const body = await readFile(absolute);
    const headers = new Headers({
      'Content-Type': MIME.get(path.extname(absolute).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}

function normalizeDispatch(mf) {
  const dispatch = mf.dispatchFetch.bind(mf);
  // Build multipart requests with Miniflare's Request implementation so its
  // HTTP bridge keeps the generated boundary and Content-Type intact.
  mf.dispatchFetch = (input, init) => {
    if (init?.body instanceof FormData) {
      return dispatch(new MiniflareRequest(input, init));
    }
    return dispatch(input, init);
  };
  return mf;
}

export async function createRuntime({ port = 0, persist = false } = {}) {
  if (process.env.SITES_TEST_RUNTIME === 'node') {
    console.warn('Using Node/SQLite compatibility harness; not native Workers validation. Images are temporary.');
    return (await import('./sites-node-runtime.mjs')).createNodeRuntime({ port, persist });
  }

  // Miniflare's programmatic static-assets router can short-circuit /api/* before
  // the Worker when used directly. Bind ASSETS explicitly instead so every incoming
  // request exercises the real Worker routing, matching the production worker code.
  const mf = new Miniflare({
    name: 'kpop-collection',
    modules: true,
    scriptPath: path.join(root, 'dist/server/index.js'),
    compatibilityDate: '2026-07-30',
    host: '127.0.0.1',
    port,
    bindings: { LOCAL_PREVIEW: 'true', OWNER_EMAIL: 'owner@example.test' },
    serviceBindings: { ASSETS: assetBinding },
    d1Databases: ['DB'],
    r2Buckets: ['BUCKET'],
    d1Persist: persist ? path.join(root, '.sites-runtime/d1') : false,
    r2Persist: persist ? path.join(root, '.sites-runtime/r2') : false,
  });

  try {
    const db = await mf.getD1Database('DB');
    await db.prepare('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)').run();
    for (const name of (await readdir(path.join(root, 'drizzle'))).filter((name) => name.endsWith('.sql')).sort()) {
      if (await db.prepare('SELECT name FROM local_migrations WHERE name=?').bind(name).first()) continue;
      const sql = await readFile(path.join(root, 'drizzle', name), 'utf8');
      await db.batch([
        ...sql
          .split('--> statement-breakpoint')
          .map((statement) => statement.trim())
          .filter(Boolean)
          .map((statement) => db.prepare(statement)),
        db.prepare('INSERT INTO local_migrations VALUES (?)').bind(name),
      ]);
    }
    return normalizeDispatch(mf);
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}
