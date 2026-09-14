const test = require('node:test');
const assert = require('node:assert/strict');

test('native Sites worker exposes cloud catalog status and protects sync writes', { timeout: 120000 }, async t => {
  process.env.SITES_TEST_RUNTIME = 'workers';
  const { createRuntime } = await import('../scripts/sites-runtime.mjs');
  const mf = await createRuntime();
  t.after(() => mf.dispose());

  const statusResponse = await mf.dispatchFetch('https://example.test/api/catalog/status');
  assert.equal(statusResponse.status, 200, await statusResponse.clone().text());
  const status = await statusResponse.json();
  assert.equal(status.artists.length, 14);
  assert.equal(status.can_edit, false);
  assert.ok(status.artists.some(artist => artist.slug === 'aespa'));
  assert.ok(status.artists.every(artist => typeof artist.synced === 'boolean'));

  const blocked = await mf.dispatchFetch('https://example.test/api/catalog/sync/aespa', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ force: true }),
  });
  assert.equal(blocked.status, 401);

  const invalid = await mf.dispatchFetch('http://localhost/api/catalog/sync/not-a-group', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ force: true }),
  });
  assert.equal(invalid.status, 404);
});
