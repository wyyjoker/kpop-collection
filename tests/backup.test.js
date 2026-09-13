const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');

const root = path.resolve(__dirname, '..');
const emptyProfile = { id: 1, name: '', bio: '', avatar: '', hero_cover: '', diary: '', favorite_group_ids: [] };

test('catalog configuration and backup compatibility', { timeout: 30000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kpop-regression-'));
  const env = { ...process.env, HOST: '127.0.0.1', PORT: '0',UPLOAD_DIR:path.join(dir,'uploads') };
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === 'DB_PATH') delete env[key];
  }
  fs.writeFileSync(path.join(dir, '.env'), 'DB_PATH=./configured.db\n');
  const seed = () => spawnSync(process.execPath, [path.join(root, 'scripts/seed-seventeen.js')], {
    cwd: dir, env, encoding: 'utf8', timeout: 10000,
  });
  let child;
  let exit;
  try {
    await t.test('seed reads .env and repeat startup is idempotent', () => {
      const first = seed();
      assert.equal(first.status, 0, first.stderr);
      assert.match(first.stdout, /32 releases, 291 tracks/);
      assert.ok(fs.existsSync(path.join(dir, 'configured.db')));
      const second = seed();
      assert.equal(second.status, 0, second.stderr);
      assert.match(second.stdout, /already imported; skipping/);
    });
    child = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    exit = once(child, 'exit');
    let logs = '';
    child.stderr.on('data', () => {});
    const base = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Server did not start: ${logs}`)), 10000);
      child.on('error', (error) => { clearTimeout(timeout); reject(error); });
      child.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', (chunk) => {
        logs += chunk;
        const match = logs.match(/running at (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    const read = async () => {
      const res = await fetch(`${base}/api/export`);
      assert.equal(res.status, 200);
      return res.json();
    };
    const restore = (snapshot) => fetch(`${base}/api/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot),
    });
    const api = async (url, method = 'GET', body, status = 200) => {
      const res = await fetch(`${base}/api${url}`, {
        method,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      const result = await res.json();
      assert.equal(res.status, status, `${method} ${url}: ${JSON.stringify(result)}`);
      return result;
    };
    await t.test('profile starts empty, roundtrips all fields and preserves omitted fields', async () => {
      assert.deepEqual(await api('/profile'), emptyProfile);
      const [group] = await api('/groups');
      const profile = { id: 1, name: '收藏者', bio: '我的收藏记录', avatar: '/uploads/test-avatar.png',
        hero_cover: '/uploads/test-cover.png', diary: '第一天\n收到了新专辑。', favorite_group_ids: [group.id] };
      assert.deepEqual(await api('/profile', 'PUT', { ...profile, name: ` ${profile.name} `,
        favorite_group_ids: [group.id, group.id] }), profile);
      assert.deepEqual(await api('/profile'), profile);
      profile.bio = '更新的简介';
      assert.deepEqual(await api('/profile', 'PUT', { bio: profile.bio }), profile);
      assert.deepEqual(await api('/profile', 'PUT', {}), profile);
      assert.deepEqual((await read()).data.profile, profile);
    });
    await t.test('profile rejects invalid types, excessive text and nonexistent or noninteger favorites without writes', async () => {
      const before = await api('/profile');
      const invalid = [[], { id: 2 }, { name: null }, { bio: 123 }, { diary: {} },
        { favorite_group_ids: '[]' }, { favorite_group_ids: [String(before.favorite_group_ids[0])] },
        ...[0, -1, 1.5, 999999, Number.MAX_SAFE_INTEGER + 1, null, true].map((id) => ({ favorite_group_ids: [id] })),
        { favorite_group_ids: Array(1001).fill(before.favorite_group_ids[0]) }];
      for (const [key, limit] of Object.entries({ name: 100, bio: 2000, avatar: 2048, hero_cover: 2048, diary: 20000 })) {
        invalid.push({ [key]: 'x'.repeat(limit + 1) });
        assert.equal((await api('/profile', 'PUT', { [key]: 'x'.repeat(limit) }))[key].length, limit);
      }
      await api('/profile', 'PUT', before);
      for (const body of invalid) {
        await api('/profile', 'PUT', body, 400);
        assert.deepEqual(await api('/profile'), before);
      }
      assert.deepEqual(await api('/profile', 'PUT', emptyProfile), emptyProfile);
      await api('/profile', 'PUT', before);
    });
    let snapshot;
    await t.test('export includes tracks and import markers; restore retains custom track notes', async () => {
      snapshot = await read();
      assert.equal(snapshot.schema_version, 5);
      assert.equal(snapshot.app_version, require('../package.json').version);
      assert.equal(snapshot.data.albums.length, 32);
      assert.equal(snapshot.data.album_tracks.length, 291);
      assert.ok(Array.isArray(snapshot.data.album_audios));
      assert.equal(snapshot.data.album_audios.length, 0);
      assert.equal(snapshot.data.catalog_imports.length, 1);
      snapshot.data.album_tracks[0].note = '我的曲目备注';
      snapshot.data.album_versions.push({ id: 1, album_id: snapshot.data.albums[0].id,
        version_name: 'Test Ver.', cover: '', barcode: '', edition_type: 'Photobook', created_at: '2026-09-13 00:00:00' });
      snapshot.data.album_versions.push({ id: 2, album_id: snapshot.data.albums[0].id,
        version_name: 'No collection row', cover: '', barcode: '12345', edition_type: 'Digipack', created_at: '2026-09-13 00:00:00' });
      snapshot.data.collection.push({ id: 1, album_version_id: 1, status: 'wishlist', quantity: 0,
        purchase_date: '', purchase_price: null, purchase_channel: '测试渠道', purchase_currency: 'CNY',
        opened: 0, notes: '保留收藏备注', created_at: '2026-09-13 00:00:00', updated_at: '2026-09-13 00:00:00' });
      const trackId = Math.max(...snapshot.data.album_tracks.map((track) => track.id));
      for (const [offset, trackNo] of [[1, 2], [2, 1]]) {
        snapshot.data.album_tracks.push({ id: trackId + offset, album_id: snapshot.data.albums[0].id,
          disc_no: 2, track_no: trackNo, title: `Bonus ${trackNo}`, note: '第二张碟', source: 'Test fixture',
          created_at: '2026-09-13 00:00:00' });
      }
      assert.equal((await restore(snapshot)).status, 200);
      assert.deepEqual((await read()).data, snapshot.data);
    });
    await t.test('library includes every album and ordered track, enriched versions and accurate group counts', async () => {
      const library = await api('/library');
      assert.deepEqual(library.groups, await api('/groups'));
      assert.equal(library.albums.length, snapshot.data.albums.length);
      assert.equal(library.albums.reduce((sum, album) => sum + album.tracks.length, 0), snapshot.data.album_tracks.length);
      for (const album of library.albums) {
        const expected = snapshot.data.albums.find((row) => row.id === album.id);
        for (const [key, value] of Object.entries(expected)) assert.equal(album[key], value, key);
        assert.equal(album.group_name, snapshot.data.groups.find((group) => group.id === album.group_id).name);
        assert.deepEqual(album.tracks, snapshot.data.album_tracks.filter((track) => track.album_id === album.id)
          .sort((a, b) => a.disc_no - b.disc_no || a.track_no - b.track_no || a.id - b.id));
        assert.equal(album.versions.length, snapshot.data.album_versions.filter((version) => version.album_id === album.id).length);
      }
      const album = library.albums.find((row) => row.id === snapshot.data.albums[0].id);
      assert.deepEqual(album.versions.find((version) => version.id === 1), {
        ...snapshot.data.album_versions[0], status: 'wishlist', quantity: 0, purchase_date: '', purchase_price: null,
        purchase_channel: '测试渠道', purchase_currency: 'CNY', opened: 0, collection_notes: '保留收藏备注',
      });
      assert.deepEqual(album.versions.find((version) => version.id === 2), {
        ...snapshot.data.album_versions[1], status: 'missing', quantity: 0, purchase_date: '', purchase_price: null,
        purchase_channel: '', purchase_currency: 'CNY', opened: 0, collection_notes: '',
      });
      const group = library.groups.find((row) => row.id === album.group_id);
      assert.equal(group.album_count, 32);
      assert.equal(group.version_count, 2);
      assert.equal(group.wishlist_count, 1);
      assert.equal(group.owned_count, 0);
      assert.equal(group.preordered_count, 0);
      assert.equal(group.completion, 0);
    });
    await t.test('invalid new-format backup cannot erase existing data', async () => {
      const invalid = structuredClone(snapshot);
      delete invalid.data.album_tracks;
      assert.equal((await restore(invalid)).status, 400);
      assert.deepEqual((await read()).data, snapshot.data);
    });
    await t.test('invalid track relation rolls back the entire restore', async () => {
      const invalid = structuredClone(snapshot);
      invalid.data.profile.name = 'Must roll back';
      invalid.data.profile.favorite_group_ids = [];
      invalid.data.album_tracks[0].album_id = 999999;
      assert.equal((await restore(invalid)).status, 409);
      assert.deepEqual((await read()).data, snapshot.data);
    });
    await t.test('invalid schema 3 profiles are rejected before replacing data', async () => {
      for (const profile of [undefined, null, [], { id: 2 }, { diary: 123 }, { name: 'x'.repeat(101) },
        { favorite_group_ids: [999999] }, { favorite_group_ids: ['1'] }]) {
        const invalid = structuredClone(snapshot);
        invalid.data.profile = profile;
        assert.equal((await restore(invalid)).status, 400);
        assert.deepEqual((await read()).data, snapshot.data);
      }
    });
    await t.test('profile favorites validate against imported groups, and late failures roll back profile and catalog', async () => {
      const imported = structuredClone(snapshot);
      imported.data.groups.push({ ...imported.data.groups[0], id: 999999, name: 'Imported favorite' });
      imported.data.profile.favorite_group_ids = [999999];
      const invalid = structuredClone(imported);
      invalid.data.catalog_imports.push({ ...invalid.data.catalog_imports[0] });
      assert.equal((await restore(invalid)).status, 409);
      assert.deepEqual((await read()).data, snapshot.data);
      assert.equal((await restore(imported)).status, 200);
      assert.deepEqual((await read()).data, imported.data);
      assert.deepEqual(await api('/profile'), imported.data.profile);
      assert.equal((await restore(snapshot)).status, 200);
    });
    await t.test('existing group, album, version and collection CRUD stays compatible with library and profile', async () => {
      const group = await api('/groups', 'POST', { name: 'CRUD group' }, 201);
      const album = await api('/albums', 'POST', { group_id: group.id, name: 'CRUD album', notes: 'Album note' }, 201);
      let library = await api('/library');
      assert.deepEqual(library.albums.find((row) => row.id === album.id).tracks, []);
      assert.deepEqual(library.albums.find((row) => row.id === album.id).versions, []);
      const versions = [];
      for (const status of ['owned', 'wishlist', 'preordered']) {
        const version = await api('/versions', 'POST', { album_id: album.id, version_name: status }, 201);
        versions.push(version);
        assert.equal(version.status, 'missing');
        await api(`/collection/${version.id}`, 'PUT', { status, quantity: status === 'owned' ? 2 : 0,
          purchase_price: 18.5, purchase_date: '2026-09-13', purchase_channel: 'Shop', purchase_currency: 'USD',
          opened: true, notes: 'Collection note' });
      }
      await api(`/groups/${group.id}`, 'PUT', { name: 'Renamed group' });
      await api(`/albums/${album.id}`, 'PUT', { name: 'Renamed album', release_date: '2026-09-13', album_type: 'Mini' });
      await api(`/versions/${versions[0].id}`, 'PUT', { version_name: 'Renamed version', barcode: '98765', edition_type: 'Limited' });
      library = await api('/library');
      const enriched = library.albums.find((row) => row.id === album.id);
      assert.equal(enriched.group_name, 'Renamed group');
      assert.equal(enriched.name, 'Renamed album');
      assert.equal(enriched.notes, 'Album note');
      const owned = enriched.versions.find((row) => row.id === versions[0].id);
      assert.equal(owned.version_name, 'Renamed version');
      assert.equal(owned.barcode, '98765');
      assert.equal(owned.edition_type, 'Limited');
      assert.equal(owned.status, 'owned');
      assert.equal(owned.quantity, 2);
      assert.equal(owned.purchase_price, 18.5);
      assert.equal(owned.purchase_channel, 'Shop');
      assert.equal(owned.purchase_currency, 'USD');
      assert.equal(owned.purchase_date, '2026-09-13');
      assert.equal(owned.opened, 1);
      assert.equal(owned.collection_notes, 'Collection note');
      const counts = library.groups.find((row) => row.id === group.id);
      assert.equal(counts.album_count, 1);
      assert.equal(counts.version_count, 3);
      for (const key of ['owned_count', 'wishlist_count', 'preordered_count']) assert.equal(counts[key], 1);
      assert.equal(counts.completion, 33);
      const detail = await api(`/groups/${group.id}`);
      assert.deepEqual(detail.albums[0].versions, enriched.versions);
      assert.equal((await api('/stats')).owned, 1);
      await api(`/versions/${versions[0].id}`, 'DELETE');
      await api(`/collection/${versions[0].id}`, 'PUT', { status: 'owned' }, 404);
      await api(`/albums/${album.id}`, 'DELETE');
      library = await api('/library');
      assert.equal(library.albums.some((row) => row.id === album.id), false);
      assert.equal(library.groups.find((row) => row.id === group.id).version_count, 0);
      await api('/profile', 'PUT', { favorite_group_ids: [...snapshot.data.profile.favorite_group_ids, group.id] });
      await api(`/groups/${group.id}`, 'DELETE');
      await api(`/groups/${group.id}`, 'GET', undefined, 404);
      assert.deepEqual((await read()).data, snapshot.data);
    });
    await t.test('SQLite backup restores the complete catalog and profile', async () => {
      const before = (await read()).data;
      const download = await fetch(`${base}/api/backup/database`);
      assert.equal(download.status, 200);
      const bytes = await download.arrayBuffer();
      assert.equal(Buffer.from(bytes).subarray(0, 15).toString(), 'SQLite format 3');
      await api('/profile', 'PUT', { name: 'Changed after SQLite backup' });
      const body = new FormData();
      body.append('database', new Blob([bytes]), 'roundtrip.db');
      const restored = await fetch(`${base}/api/backup/database/restore`, { method: 'POST', body });
      assert.equal(restored.status, 200, await restored.text());
      assert.deepEqual((await read()).data, before);
      const invalid = new FormData();
      invalid.append('database', new Blob(['Not a database']), 'invalid.db');
      assert.equal((await fetch(`${base}/api/backup/database/restore`, { method: 'POST', body: invalid })).status, 400);
      assert.deepEqual((await read()).data, before);
    });
    await t.test('schema 2 backups without a profile reset personal data while retaining tracks', async () => {
      const legacy = structuredClone(snapshot);
      legacy.schema_version = 2;
      delete legacy.data.profile;
      assert.equal((await restore(legacy)).status, 200);
      assert.deepEqual((await read()).data, { ...legacy.data, profile: emptyProfile });
      assert.deepEqual(await api('/profile'), emptyProfile);
      assert.equal((await restore(snapshot)).status, 200);
    });
    await t.test('old four-table backups restore and clear stale catalog markers', async () => {
      const legacy = structuredClone(snapshot);
      legacy.schema_version = 1;
      delete legacy.data.album_tracks;
      delete legacy.data.catalog_imports;
      delete legacy.data.profile;
      assert.equal((await restore(legacy)).status, 200);
      const restored = await read();
      assert.deepEqual(restored.data.albums, legacy.data.albums);
      assert.deepEqual(restored.data.album_tracks, []);
      assert.deepEqual(restored.data.catalog_imports, []);
      assert.deepEqual(restored.data.profile, emptyProfile);
      assert.equal((await api('/library')).albums.every((album) => album.tracks.length === 0), true);
    });
    await t.test('an empty backup yields an empty library and a real empty profile', async () => {
      const empty = { format: 'kpop-collection-backup', schema_version: 1,
        data: { groups: [], albums: [], album_versions: [], collection: [] } };
      assert.equal((await restore(empty)).status, 200);
      assert.deepEqual(await api('/library'), { groups: [], albums: [], can_edit:true });
      assert.deepEqual(await api('/profile'), emptyProfile);
    });
    await t.test('physical photo captions and multiple photos survive local JSON restore',async()=>{
      const group=await api('/groups','POST',{name:'Photo test'},201);
      const album=await api('/albums','POST',{group_id:group.id,name:'My physical album'},201);
      const form=new FormData();form.append('image',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'test.png');
      const uploaded=await fetch(`${base}/api/upload`,{method:'POST',body:form}).then(r=>r.json());
      const p=await api(`/albums/${album.id}/photos`,'POST',{src:uploaded.path,caption:'第一张实拍'},201);
      const second=await fetch(`${base}/api/upload`,{method:'POST',body:form}).then(r=>r.json());
      await api(`/albums/${album.id}/photos`,'POST',{src:second.path,caption:'第二张实拍'},201);
      await api(`/photos/${p.id}`,'PUT',{caption:'新描述\n第二行'});
      const backup=await read();assert.equal(backup.data.album_photos.length,2);
      await api(`/photos/${p.id}`,'DELETE');assert.equal((await restore(backup)).status,200);
      const photos=(await api('/library')).albums[0].photos;assert.equal(photos.length,2);assert.equal(photos[0].caption,'新描述\n第二行');
      const invalid=structuredClone(backup);invalid.data.album_photos[0].album_id=999;assert.equal((await restore(invalid)).status,400);assert.equal((await api('/library')).albums[0].photos.length,2);
    });
  } finally {
    if (child && child.exitCode === null) { child.kill(); await exit; }
    // Only disposable fixtures from this test's own mkdtemp are removed.
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
