require('dotenv').config();

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const ROOT = path.resolve(__dirname, '..');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Catalog file not found: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function decodeVersion(raw) {
  if (typeof raw === 'string') return { version_name: raw, edition_type: '', barcode: '', cover: '', note: '' };
  if (Array.isArray(raw)) {
    return {
      version_name: raw[0] || '',
      edition_type: raw[1] || '',
      barcode: raw[2] || '',
      note: raw[3] || '',
      cover: raw[4] || '',
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

async function importCatalog(options) {
  const slug = options.slug;
  const catalogPath = path.resolve(options.catalogPath);
  const versionsPath = options.versionsPath ? path.resolve(options.versionsPath) : null;
  const dbPath = path.resolve(options.dbPath || process.env.DB_PATH || path.join(ROOT, 'data', 'kpop-collection.db'));
  const force = Boolean(options.force);
  if (!slug) throw new Error('Catalog slug is required.');

  const catalog = readJson(catalogPath);
  const versionCatalog = versionsPath ? readJson(versionsPath) : null;
  const catalogMarker = `${slug}-catalog-v${catalog.catalog_version}`;
  const versionMarker = versionCatalog ? `${slug}-versions-v${versionCatalog.catalog_version}` : null;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new sqlite3.Database(dbPath);

  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function done(error) {
    if (error) reject(error); else resolve({ id: this.lastID, changes: this.changes });
  }));
  const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
  const close = () => new Promise((resolve) => db.close(resolve));

  async function ensureSchema() {
    await run('PRAGMA foreign_keys = ON');
    await run(`CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL COLLATE NOCASE UNIQUE,korean_name TEXT DEFAULT '',logo TEXT DEFAULT '',cover TEXT DEFAULT '',debut_date TEXT DEFAULT '',company TEXT DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await run(`CREATE TABLE IF NOT EXISTS albums (id INTEGER PRIMARY KEY AUTOINCREMENT,group_id INTEGER NOT NULL,name TEXT NOT NULL,korean_name TEXT DEFAULT '',release_date TEXT DEFAULT '',album_type TEXT DEFAULT '',cover TEXT DEFAULT '',notes TEXT DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,UNIQUE(group_id,name,release_date))`);
    await run(`CREATE TABLE IF NOT EXISTS album_versions (id INTEGER PRIMARY KEY AUTOINCREMENT,album_id INTEGER NOT NULL,version_name TEXT NOT NULL,cover TEXT DEFAULT '',barcode TEXT DEFAULT '',edition_type TEXT DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,UNIQUE(album_id,version_name))`);
    await run(`CREATE TABLE IF NOT EXISTS collection (id INTEGER PRIMARY KEY AUTOINCREMENT,album_version_id INTEGER NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'missing' CHECK(status IN ('owned','wishlist','missing','preordered')),quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),purchase_date TEXT DEFAULT '',purchase_price REAL,purchase_channel TEXT DEFAULT '',purchase_currency TEXT DEFAULT 'CNY',opened INTEGER NOT NULL DEFAULT 0 CHECK(opened IN (0,1)),notes TEXT DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (album_version_id) REFERENCES album_versions(id) ON DELETE CASCADE)`);
    await run(`CREATE TABLE IF NOT EXISTS album_tracks (id INTEGER PRIMARY KEY AUTOINCREMENT,album_id INTEGER NOT NULL,disc_no INTEGER NOT NULL DEFAULT 1,track_no INTEGER NOT NULL,title TEXT NOT NULL,note TEXT DEFAULT '',source TEXT DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,UNIQUE(album_id,disc_no,track_no))`);
    await run(`CREATE TABLE IF NOT EXISTS catalog_imports (catalog_key TEXT PRIMARY KEY,imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,item_count INTEGER NOT NULL DEFAULT 0)`);
    await run('CREATE INDEX IF NOT EXISTS idx_album_tracks_album_id ON album_tracks(album_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_versions_album_id ON album_versions(album_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_collection_status ON collection(status)');
  }

  async function upsertGroup() {
    const g = catalog.group;
    if (!g?.name) throw new Error('Catalog group.name is required.');
    let row = await get('SELECT * FROM groups WHERE name = ? COLLATE NOCASE', [g.name]);
    if (!row) {
      const result = await run('INSERT INTO groups (name,korean_name,debut_date,company,cover,logo) VALUES (?,?,?,?,?,?)', [g.name,g.korean_name || '',g.debut_date || '',g.company || '',g.cover || '',g.logo || '']);
      row = await get('SELECT * FROM groups WHERE id = ?', [result.id]);
    } else {
      await run(`UPDATE groups SET korean_name=CASE WHEN TRIM(COALESCE(korean_name,''))='' THEN ? ELSE korean_name END,debut_date=CASE WHEN TRIM(COALESCE(debut_date,''))='' THEN ? ELSE debut_date END,company=CASE WHEN TRIM(COALESCE(company,''))='' THEN ? ELSE company END,cover=CASE WHEN TRIM(COALESCE(cover,''))='' THEN ? ELSE cover END,logo=CASE WHEN TRIM(COALESCE(logo,''))='' THEN ? ELSE logo END WHERE id=?`, [g.korean_name || '',g.debut_date || '',g.company || '',g.cover || '',g.logo || '',row.id]);
    }
    return row.id;
  }

  async function upsertAlbum(groupId, album) {
    let row = await get('SELECT * FROM albums WHERE group_id=? AND name=? COLLATE NOCASE AND release_date=?', [groupId,album.name,album.release_date || '']);
    if (!row) {
      const result = await run('INSERT INTO albums (group_id,name,korean_name,release_date,album_type,cover,notes) VALUES (?,?,?,?,?,?,?)', [groupId,album.name,album.korean_name || '',album.release_date || '',album.album_type || '',album.cover || '',album.notes || '']);
      row = await get('SELECT * FROM albums WHERE id=?', [result.id]);
    } else {
      await run(`UPDATE albums SET korean_name=CASE WHEN TRIM(COALESCE(korean_name,''))='' THEN ? ELSE korean_name END,album_type=CASE WHEN TRIM(COALESCE(album_type,''))='' THEN ? ELSE album_type END,cover=CASE WHEN TRIM(COALESCE(cover,''))='' THEN ? ELSE cover END,notes=CASE WHEN TRIM(COALESCE(notes,''))='' THEN ? ELSE notes END WHERE id=?`, [album.korean_name || '',album.album_type || '',album.cover || '',album.notes || '',row.id]);
    }
    return row.id;
  }

  async function replaceTracks(albumId, album) {
    await run('DELETE FROM album_tracks WHERE album_id=? AND source LIKE ?', [albumId, `${slug}-catalog-v%`]);
    for (const disc of album.discs || []) {
      const discNo = Number(disc.disc || 1);
      for (let i = 0; i < (disc.tracks || []).length; i += 1) {
        const raw = disc.tracks[i];
        const title = typeof raw === 'string' ? raw : raw.title;
        const note = typeof raw === 'string' ? '' : (raw.note || '');
        await run(`INSERT INTO album_tracks (album_id,disc_no,track_no,title,note,source) VALUES (?,?,?,?,?,?) ON CONFLICT(album_id,disc_no,track_no) DO UPDATE SET title=excluded.title,note=CASE WHEN TRIM(COALESCE(album_tracks.note,''))='' THEN excluded.note ELSE album_tracks.note END,source=excluded.source`, [albumId,discNo,i + 1,title,note,catalogMarker]);
      }
    }
  }

  async function upsertVersion(albumId, rawVersion) {
    const v = decodeVersion(rawVersion);
    if (!v.version_name) throw new Error(`Version name missing for album id ${albumId}`);
    let row = await get('SELECT * FROM album_versions WHERE album_id=? AND version_name=? COLLATE NOCASE', [albumId,v.version_name]);
    if (!row) {
      const result = await run('INSERT INTO album_versions (album_id,version_name,cover,barcode,edition_type) VALUES (?,?,?,?,?)', [albumId,v.version_name,v.cover,v.barcode,v.edition_type]);
      row = await get('SELECT * FROM album_versions WHERE id=?', [result.id]);
    } else {
      await run(`UPDATE album_versions SET cover=CASE WHEN TRIM(COALESCE(cover,''))='' THEN ? ELSE cover END,barcode=CASE WHEN TRIM(COALESCE(barcode,''))='' THEN ? ELSE barcode END,edition_type=CASE WHEN TRIM(COALESCE(edition_type,''))='' THEN ? ELSE edition_type END WHERE id=?`, [v.cover,v.barcode,v.edition_type,row.id]);
    }
    await run("INSERT OR IGNORE INTO collection (album_version_id,status,quantity) VALUES (?,'missing',0)", [row.id]);
    return row.id;
  }

  async function syncVersions(groupId) {
    if (!versionCatalog) return 0;
    let count = 0;
    for (const [albumName, release] of Object.entries(versionCatalog.releases || {})) {
      const album = await get('SELECT id FROM albums WHERE group_id=? AND name=? COLLATE NOCASE ORDER BY release_date DESC LIMIT 1', [groupId,albumName]);
      if (!album) throw new Error(`Version catalog references missing album: ${albumName}`);
      for (const rawVersion of release.versions || []) { await upsertVersion(album.id, rawVersion); count += 1; }
    }
    return count;
  }

  async function markImport(marker, count) {
    await run('INSERT INTO catalog_imports (catalog_key,item_count) VALUES (?,?) ON CONFLICT(catalog_key) DO UPDATE SET imported_at=CURRENT_TIMESTAMP,item_count=excluded.item_count', [marker,count]);
  }

  try {
    await ensureSchema();
    const catalogImported = await get('SELECT catalog_key FROM catalog_imports WHERE catalog_key=?', [catalogMarker]);
    const versionsImported = versionMarker ? await get('SELECT catalog_key FROM catalog_imports WHERE catalog_key=?', [versionMarker]) : true;
    if (catalogImported && versionsImported && !force) return { skipped: true, dbPath, releases: catalog.albums.length };

    await run('BEGIN IMMEDIATE TRANSACTION');
    try {
      const groupId = await upsertGroup();
      const syncAlbums = force || !catalogImported;
      let trackCount = 0;
      for (const album of catalog.albums || []) {
        const albumId = await upsertAlbum(groupId, album);
        if (syncAlbums) await replaceTracks(albumId, album);
        trackCount += (album.discs || []).reduce((sum, d) => sum + (d.tracks || []).length, 0);
      }
      if (syncAlbums) await markImport(catalogMarker, (catalog.albums || []).length);
      let versionCount = 0;
      if (versionCatalog && (force || !versionsImported)) {
        versionCount = await syncVersions(groupId);
        await markImport(versionMarker, versionCount);
      }
      await run('COMMIT');
      return { skipped: false, dbPath, releases: (catalog.albums || []).length, tracks: trackCount, versions: versionCount };
    } catch (error) {
      await run('ROLLBACK').catch(() => {});
      throw error;
    }
  } finally {
    await close();
  }
}

function parseArgs(argv) {
  const args = { force: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') args.force = true;
    else if (arg.startsWith('--')) { args[arg.slice(2)] = argv[i + 1]; i += 1; }
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  importCatalog({
    slug: args.slug,
    catalogPath: args.catalog,
    versionsPath: args.versions,
    dbPath: args.db,
    force: args.force,
  }).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { importCatalog, decodeVersion };
