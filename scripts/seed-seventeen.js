require('dotenv').config();

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(ROOT, 'data', 'kpop-collection.db'));
const CATALOG_PATH = path.join(ROOT, 'public', 'data', 'seventeen-catalog.json');
const VERSION_CATALOG_PATH = path.join(ROOT, 'public', 'data', 'seventeen-versions.json');
const FORCE = process.argv.includes('--force');
const CATALOG_MARKER_PREFIX = 'seventeen-catalog-v';
const VERSION_MARKER_PREFIX = 'seventeen-versions-v';

for (const required of [CATALOG_PATH, VERSION_CATALOG_PATH]) {
  if (!fs.existsSync(required)) {
    console.error(`SEVENTEEN catalog not found: ${required}`);
    process.exit(1);
  }
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const versionCatalog = JSON.parse(fs.readFileSync(VERSION_CATALOG_PATH, 'utf8'));
const catalogMarker = `${CATALOG_MARKER_PREFIX}${catalog.catalog_version}`;
const versionMarker = `${VERSION_MARKER_PREFIX}${versionCatalog.catalog_version}`;
const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
  });
}

function close() {
  return new Promise((resolve) => db.close(() => resolve()));
}

async function ensureSchema() {
  await run('PRAGMA foreign_keys = ON');
  await run(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      korean_name TEXT DEFAULT '',
      logo TEXT DEFAULT '',
      cover TEXT DEFAULT '',
      debut_date TEXT DEFAULT '',
      company TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      korean_name TEXT DEFAULT '',
      release_date TEXT DEFAULT '',
      album_type TEXT DEFAULT '',
      cover TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      UNIQUE(group_id, name, release_date)
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS album_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      album_id INTEGER NOT NULL,
      version_name TEXT NOT NULL,
      cover TEXT DEFAULT '',
      barcode TEXT DEFAULT '',
      edition_type TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
      UNIQUE(album_id, version_name)
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS collection (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      album_version_id INTEGER NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'missing' CHECK(status IN ('owned', 'wishlist', 'missing', 'preordered')),
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      purchase_date TEXT DEFAULT '',
      purchase_price REAL,
      purchase_channel TEXT DEFAULT '',
      purchase_currency TEXT DEFAULT 'CNY',
      opened INTEGER NOT NULL DEFAULT 0 CHECK(opened IN (0, 1)),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (album_version_id) REFERENCES album_versions(id) ON DELETE CASCADE
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS album_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      album_id INTEGER NOT NULL,
      disc_no INTEGER NOT NULL DEFAULT 1,
      track_no INTEGER NOT NULL,
      title TEXT NOT NULL,
      note TEXT DEFAULT '',
      source TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
      UNIQUE(album_id, disc_no, track_no)
    )
  `);
  await run('CREATE INDEX IF NOT EXISTS idx_album_tracks_album_id ON album_tracks(album_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_versions_album_id ON album_versions(album_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_collection_status ON collection(status)');
  await run(`
    CREATE TABLE IF NOT EXISTS catalog_imports (
      catalog_key TEXT PRIMARY KEY,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      item_count INTEGER NOT NULL DEFAULT 0
    )
  `);
}

async function upsertGroup() {
  const groupData = catalog.group;
  let group = await get('SELECT * FROM groups WHERE name = ? COLLATE NOCASE', [groupData.name]);
  if (!group) {
    const result = await run(`
      INSERT INTO groups (name, korean_name, debut_date, company)
      VALUES (?, ?, ?, ?)
    `, [groupData.name, groupData.korean_name || '', groupData.debut_date || '', groupData.company || '']);
    group = await get('SELECT * FROM groups WHERE id = ?', [result.id]);
  } else {
    await run(`
      UPDATE groups SET
        korean_name = CASE WHEN TRIM(COALESCE(korean_name, '')) = '' THEN ? ELSE korean_name END,
        debut_date = CASE WHEN TRIM(COALESCE(debut_date, '')) = '' THEN ? ELSE debut_date END,
        company = CASE WHEN TRIM(COALESCE(company, '')) = '' THEN ? ELSE company END
      WHERE id = ?
    `, [groupData.korean_name || '', groupData.debut_date || '', groupData.company || '', group.id]);
  }
  return group.id;
}

async function upsertAlbum(groupId, album) {
  let row = await get(
    'SELECT * FROM albums WHERE group_id = ? AND name = ? COLLATE NOCASE AND release_date = ?',
    [groupId, album.name, album.release_date],
  );

  if (!row) {
    const result = await run(`
      INSERT INTO albums (group_id, name, release_date, album_type, cover)
      VALUES (?, ?, ?, ?, ?)
    `, [groupId, album.name, album.release_date, album.album_type || '', album.cover || '']);
    row = await get('SELECT * FROM albums WHERE id = ?', [result.id]);
  } else {
    await run(`
      UPDATE albums SET
        album_type = CASE WHEN TRIM(COALESCE(album_type, '')) = '' THEN ? ELSE album_type END,
        cover = CASE WHEN TRIM(COALESCE(cover, '')) = '' THEN ? ELSE cover END
      WHERE id = ?
    `, [album.album_type || '', album.cover || '', row.id]);
  }
  return row.id;
}

async function replaceTracks(albumId, album) {
  await run("DELETE FROM album_tracks WHERE album_id = ? AND source LIKE 'seventeen-catalog-v%'", [albumId]);
  for (const disc of album.discs || []) {
    const discNo = Number(disc.disc || 1);
    for (let index = 0; index < (disc.tracks || []).length; index += 1) {
      const raw = disc.tracks[index];
      const title = typeof raw === 'string' ? raw : raw.title;
      const note = typeof raw === 'string' ? '' : (raw.note || '');
      await run(`
        INSERT INTO album_tracks (album_id, disc_no, track_no, title, note, source)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(album_id, disc_no, track_no) DO UPDATE SET
          title = excluded.title,
          note = CASE WHEN TRIM(COALESCE(album_tracks.note, '')) = '' THEN excluded.note ELSE album_tracks.note END,
          source = excluded.source
      `, [albumId, discNo, index + 1, title, note, catalogMarker]);
    }
  }
}

function decodeVersion(raw) {
  if (typeof raw === 'string') return { version_name: raw, edition_type: '', barcode: '', cover: '' };
  if (Array.isArray(raw)) {
    return {
      version_name: raw[0] || '',
      edition_type: raw[1] || '',
      barcode: raw[2] || '',
      note: raw[3] || '',
      cover: '',
    };
  }
  return {
    version_name: raw?.version_name || '',
    edition_type: raw?.edition_type || '',
    barcode: raw?.barcode || '',
    note: raw?.note || '',
    cover: raw?.cover || '',
  };
}

async function upsertVersion(albumId, rawVersion) {
  const version = decodeVersion(rawVersion);
  if (!version.version_name) throw new Error(`SEVENTEEN version is missing a name for album ${albumId}`);
  let row = await get(
    'SELECT * FROM album_versions WHERE album_id = ? AND version_name = ? COLLATE NOCASE',
    [albumId, version.version_name],
  );
  if (!row) {
    const result = await run(`
      INSERT INTO album_versions (album_id, version_name, cover, barcode, edition_type)
      VALUES (?, ?, ?, ?, ?)
    `, [albumId, version.version_name, version.cover, version.barcode, version.edition_type]);
    row = await get('SELECT * FROM album_versions WHERE id = ?', [result.id]);
  } else {
    // Catalog metadata only fills blanks. User-edited artwork/barcodes/types always win.
    await run(`
      UPDATE album_versions SET
        cover = CASE WHEN TRIM(COALESCE(cover, '')) = '' THEN ? ELSE cover END,
        barcode = CASE WHEN TRIM(COALESCE(barcode, '')) = '' THEN ? ELSE barcode END,
        edition_type = CASE WHEN TRIM(COALESCE(edition_type, '')) = '' THEN ? ELSE edition_type END
      WHERE id = ?
    `, [version.cover, version.barcode, version.edition_type, row.id]);
  }
  await run(`
    INSERT OR IGNORE INTO collection (album_version_id, status, quantity)
    VALUES (?, 'missing', 0)
  `, [row.id]);
  return row.id;
}

async function syncVersions(groupId) {
  let count = 0;
  for (const [albumName, release] of Object.entries(versionCatalog.releases || {})) {
    const album = await get(
      'SELECT id FROM albums WHERE group_id = ? AND name = ? COLLATE NOCASE ORDER BY release_date DESC LIMIT 1',
      [groupId, albumName],
    );
    if (!album) throw new Error(`SEVENTEEN version catalog references missing album: ${albumName}`);
    for (const rawVersion of release.versions || []) {
      await upsertVersion(album.id, rawVersion);
      count += 1;
    }
  }
  return count;
}

async function markImport(marker, count) {
  await run(`
    INSERT INTO catalog_imports (catalog_key, item_count)
    VALUES (?, ?)
    ON CONFLICT(catalog_key) DO UPDATE SET imported_at = CURRENT_TIMESTAMP, item_count = excluded.item_count
  `, [marker, count]);
}

async function main() {
  await ensureSchema();
  const [catalogImported, versionsImported] = await Promise.all([
    get('SELECT catalog_key FROM catalog_imports WHERE catalog_key = ?', [catalogMarker]),
    get('SELECT catalog_key FROM catalog_imports WHERE catalog_key = ?', [versionMarker]),
  ]);
  if (catalogImported && versionsImported && !FORCE) {
    console.log(`SEVENTEEN catalog ${catalogMarker} / ${versionMarker} already imported; skipping.`);
    return;
  }

  await run('BEGIN IMMEDIATE TRANSACTION');
  try {
    const groupId = await upsertGroup();
    let trackCount = 0;
    const syncAlbumCatalog = FORCE || !catalogImported;
    for (const album of catalog.albums) {
      const albumId = await upsertAlbum(groupId, album);
      if (syncAlbumCatalog) await replaceTracks(albumId, album);
      trackCount += (album.discs || []).reduce((sum, disc) => sum + (disc.tracks || []).length, 0);
    }
    if (syncAlbumCatalog) await markImport(catalogMarker, catalog.albums.length);

    let versionCount = 0;
    if (FORCE || !versionsImported) {
      versionCount = await syncVersions(groupId);
      await markImport(versionMarker, versionCount);
    }

    await run('COMMIT');
    console.log(`Imported SEVENTEEN catalog: ${catalog.albums.length} releases, ${trackCount} tracks, ${versionCount || 'existing'} physical versions -> ${DB_PATH}`);
  } catch (error) {
    await run('ROLLBACK').catch(() => {});
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('Failed to seed SEVENTEEN catalog:', error);
    process.exitCode = 1;
  })
  .finally(close);
