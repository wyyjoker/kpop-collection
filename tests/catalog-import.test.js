const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { importCatalog } = require('../scripts/import-catalog');

const ROOT = path.resolve(__dirname, '..');
const catalogPath = path.join(ROOT, 'public', 'data', 'seventeen-catalog.json');
const versionsPath = path.join(ROOT, 'public', 'data', 'seventeen-versions.json');
const versionCatalog = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
const expectedVersions = Object.values(versionCatalog.releases).reduce((sum, release) => sum + (release.versions || []).length, 0);

function open(dbPath) {
  const db = new sqlite3.Database(dbPath);
  const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) { if (error) reject(error); else resolve(this.changes); }));
  const close = () => new Promise((resolve) => db.close(resolve));
  return { get, run, close };
}

test('generic catalog importer seeds SEVENTEEN physical versions safely and idempotently', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpop-catalog-'));
  const dbPath = path.join(dir, 'catalog.db');
  const options = { slug: 'seventeen', catalogPath, versionsPath, dbPath };

  const first = await importCatalog(options);
  assert.equal(first.releases, 32);
  assert.equal(first.versions, expectedVersions);

  let db = open(dbPath);
  assert.equal((await db.get('SELECT COUNT(*) n FROM albums')).n, 32);
  assert.equal((await db.get('SELECT COUNT(*) n FROM album_versions')).n, expectedVersions);
  assert.equal((await db.get("SELECT COUNT(*) n FROM collection WHERE status='missing' AND quantity=0")).n, expectedVersions);
  assert.equal((await db.get('SELECT COUNT(*) n FROM collection')).n, expectedVersions);

  const fml = await db.get("SELECT v.id FROM album_versions v JOIN albums a ON a.id=v.album_id WHERE a.name='FML' AND v.version_name='CARAT Ver.'");
  assert.ok(fml?.id);
  await db.run("UPDATE album_versions SET cover='/uploads/my-fml-carat.jpg', barcode='USER-BARCODE' WHERE id=?", [fml.id]);
  await db.run("UPDATE collection SET status='owned', quantity=1, notes='my copy' WHERE album_version_id=?", [fml.id]);
  await db.close();

  const second = await importCatalog({ ...options, force: true });
  assert.equal(second.versions, expectedVersions);
  db = open(dbPath);
  assert.equal((await db.get('SELECT COUNT(*) n FROM album_versions')).n, expectedVersions);
  const preserved = await db.get('SELECT v.cover,v.barcode,c.status,c.quantity,c.notes FROM album_versions v JOIN collection c ON c.album_version_id=v.id WHERE v.id=?', [fml.id]);
  assert.deepEqual(preserved, { cover: '/uploads/my-fml-carat.jpg', barcode: 'USER-BARCODE', status: 'owned', quantity: 1, notes: 'my copy' });
  await db.close();

  const third = await importCatalog(options);
  assert.equal(third.skipped, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('generic importer attaches same-title physical versions to the exact release date', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpop-duplicate-title-'));
  const dbPath = path.join(dir, 'catalog.db');
  const catalogFile = path.join(dir, 'catalog.json');
  const versionsFile = path.join(dir, 'versions.json');
  fs.writeFileSync(catalogFile, JSON.stringify({
    catalog_version: 1,
    group: { name: 'DUPLICATE TEST' },
    albums: [
      { name: 'SAME NAME', release_date: '2025-01-01', album_type: 'EP', cover: '', discs: [{ disc: 1, tracks: ['EP Song'] }] },
      { name: 'SAME NAME', release_date: '2026-02-02', album_type: 'Single', cover: '', discs: [{ disc: 1, tracks: ['Single Song'] }] },
    ],
  }));
  fs.writeFileSync(versionsFile, JSON.stringify({
    catalog_version: 1,
    releases: {
      'SAME NAME@@2025-01-01@@ep': { album_name: 'SAME NAME', release_date: '2025-01-01', versions: [{ version_name: 'EP Pink', edition_type: 'CD · KR' }] },
      'SAME NAME@@2026-02-02@@single': { album_name: 'SAME NAME', release_date: '2026-02-02', versions: [{ version_name: 'Single Blue', edition_type: 'CD · KR' }] },
    },
  }));

  await importCatalog({ slug: 'duplicate-test', catalogPath: catalogFile, versionsPath: versionsFile, dbPath });
  const db = open(dbPath);
  const rows = await new Promise((resolve, reject) => {
    const raw = new sqlite3.Database(dbPath);
    raw.all(`SELECT a.release_date,v.version_name FROM albums a JOIN album_versions v ON v.album_id=a.id ORDER BY a.release_date`, (error, values) => {
      raw.close();
      if (error) reject(error); else resolve(values);
    });
  });
  assert.deepEqual(rows, [
    { release_date: '2025-01-01', version_name: 'EP Pink' },
    { release_date: '2026-02-02', version_name: 'Single Blue' },
  ]);
  await db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
