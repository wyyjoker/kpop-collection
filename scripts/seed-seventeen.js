require('dotenv').config();

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(ROOT, 'data', 'kpop-collection.db'));
const CATALOG_PATH = path.join(ROOT, 'public', 'data', 'seventeen-catalog.json');
const FORCE = process.argv.includes('--force');
const MARKER_PREFIX = 'seventeen-catalog-v';

if (!fs.existsSync(CATALOG_PATH)) {
  console.error(`SEVENTEEN catalog not found: ${CATALOG_PATH}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const marker = `${MARKER_PREFIX}${catalog.catalog_version}`;
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
      `, [albumId, discNo, index + 1, title, note, marker]);
    }
  }
}

async function main() {
  await ensureSchema();
  const imported = await get('SELECT catalog_key FROM catalog_imports WHERE catalog_key = ?', [marker]);
  if (imported && !FORCE) {
    console.log(`SEVENTEEN catalog ${marker} already imported; skipping.`);
    return;
  }

  await run('BEGIN IMMEDIATE TRANSACTION');
  try {
    const groupId = await upsertGroup();
    let trackCount = 0;
    for (const album of catalog.albums) {
      const albumId = await upsertAlbum(groupId, album);
      await replaceTracks(albumId, album);
      trackCount += (album.discs || []).reduce((sum, disc) => sum + (disc.tracks || []).length, 0);
    }
    await run(`
      INSERT INTO catalog_imports (catalog_key, item_count)
      VALUES (?, ?)
      ON CONFLICT(catalog_key) DO UPDATE SET imported_at = CURRENT_TIMESTAMP, item_count = excluded.item_count
    `, [marker, catalog.albums.length]);
    await run('COMMIT');
    console.log(`Imported SEVENTEEN catalog: ${catalog.albums.length} releases, ${trackCount} tracks -> ${DB_PATH}`);
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
