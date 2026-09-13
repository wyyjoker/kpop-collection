require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, 'data', 'kpop-collection.db'));
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 8);
const STATUSES = new Set(['owned', 'wishlist', 'missing', 'preordered']);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA journal_mode = WAL');

  db.run(`
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

  db.run(`
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

  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS collection (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      album_version_id INTEGER NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'missing'
        CHECK(status IN ('owned', 'wishlist', 'missing', 'preordered')),
      quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      purchase_date TEXT DEFAULT '',
      purchase_price REAL,
      purchase_channel TEXT DEFAULT '',
      opened INTEGER NOT NULL DEFAULT 0 CHECK(opened IN (0, 1)),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (album_version_id) REFERENCES album_versions(id) ON DELETE CASCADE
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_albums_group_id ON albums(group_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_albums_release_date ON albums(release_date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_versions_album_id ON album_versions(album_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_collection_status ON collection(status)');
});

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => (error ? reject(error) : resolve(row)));
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function cleanText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function asId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function handleDbError(res, error) {
  console.error(error);
  if (error && error.code === 'SQLITE_CONSTRAINT') {
    return res.status(409).json({ error: 'Data conflict or invalid relationship.' });
  }
  return res.status(500).json({ error: 'Internal server error.' });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed.'));
    cb(null, true);
  },
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '0.1.0' });
});

app.get('/api/stats', async (_req, res) => {
  try {
    const stats = await get(`
      SELECT
        (SELECT COUNT(*) FROM groups) AS groups,
        (SELECT COUNT(*) FROM albums) AS albums,
        (SELECT COUNT(*) FROM album_versions) AS versions,
        (SELECT COUNT(*) FROM collection WHERE status = 'owned') AS owned,
        (SELECT COUNT(*) FROM collection WHERE status = 'wishlist') AS wishlist,
        (SELECT COUNT(*) FROM collection WHERE status = 'preordered') AS preordered
    `);
    stats.completion = stats.versions ? Math.round((stats.owned / stats.versions) * 100) : 0;
    res.json(stats);
  } catch (error) {
    handleDbError(res, error);
  }
});

app.get('/api/groups', async (_req, res) => {
  try {
    const rows = await all(`
      SELECT
        g.*,
        COUNT(DISTINCT a.id) AS album_count,
        COUNT(DISTINCT v.id) AS version_count,
        COUNT(DISTINCT CASE WHEN c.status = 'owned' THEN v.id END) AS owned_count,
        COUNT(DISTINCT CASE WHEN c.status = 'wishlist' THEN v.id END) AS wishlist_count,
        COUNT(DISTINCT CASE WHEN c.status = 'preordered' THEN v.id END) AS preordered_count
      FROM groups g
      LEFT JOIN albums a ON a.group_id = g.id
      LEFT JOIN album_versions v ON v.album_id = a.id
      LEFT JOIN collection c ON c.album_version_id = v.id
      GROUP BY g.id
      ORDER BY g.name COLLATE NOCASE ASC
    `);

    res.json(rows.map((row) => ({
      ...row,
      completion: row.version_count ? Math.round((row.owned_count / row.version_count) * 100) : 0,
    })));
  } catch (error) {
    handleDbError(res, error);
  }
});

app.get('/api/groups/:id', async (req, res) => {
  const groupId = asId(req.params.id);
  if (!groupId) return res.status(400).json({ error: 'Invalid group id.' });

  try {
    const group = await get('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    const albums = await all(`
      SELECT
        a.*,
        COUNT(DISTINCT v.id) AS version_count,
        COUNT(DISTINCT CASE WHEN c.status = 'owned' THEN v.id END) AS owned_count,
        COUNT(DISTINCT CASE WHEN c.status = 'wishlist' THEN v.id END) AS wishlist_count,
        COUNT(DISTINCT CASE WHEN c.status = 'preordered' THEN v.id END) AS preordered_count
      FROM albums a
      LEFT JOIN album_versions v ON v.album_id = a.id
      LEFT JOIN collection c ON c.album_version_id = v.id
      WHERE a.group_id = ?
      GROUP BY a.id
      ORDER BY
        CASE WHEN a.release_date = '' THEN 1 ELSE 0 END,
        a.release_date DESC,
        a.name COLLATE NOCASE ASC
    `, [groupId]);

    const albumIds = albums.map((album) => album.id);
    let versions = [];
    if (albumIds.length) {
      const placeholders = albumIds.map(() => '?').join(',');
      versions = await all(`
        SELECT
          v.*,
          COALESCE(c.status, 'missing') AS status,
          COALESCE(c.quantity, 0) AS quantity,
          COALESCE(c.purchase_date, '') AS purchase_date,
          c.purchase_price,
          COALESCE(c.purchase_channel, '') AS purchase_channel,
          COALESCE(c.opened, 0) AS opened,
          COALESCE(c.notes, '') AS collection_notes
        FROM album_versions v
        LEFT JOIN collection c ON c.album_version_id = v.id
        WHERE v.album_id IN (${placeholders})
        ORDER BY v.album_id, v.version_name COLLATE NOCASE ASC
      `, albumIds);
    }

    const versionsByAlbum = new Map();
    for (const version of versions) {
      const bucket = versionsByAlbum.get(version.album_id) || [];
      bucket.push(version);
      versionsByAlbum.set(version.album_id, bucket);
    }

    const enrichedAlbums = albums.map((album) => ({
      ...album,
      completion: album.version_count ? Math.round((album.owned_count / album.version_count) * 100) : 0,
      versions: versionsByAlbum.get(album.id) || [],
    }));

    const summary = {
      albums: enrichedAlbums.length,
      versions: enrichedAlbums.reduce((sum, album) => sum + album.version_count, 0),
      owned: enrichedAlbums.reduce((sum, album) => sum + album.owned_count, 0),
    };
    summary.completion = summary.versions ? Math.round((summary.owned / summary.versions) * 100) : 0;

    res.json({ group, summary, albums: enrichedAlbums });
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post('/api/groups', async (req, res) => {
  const name = cleanText(req.body.name);
  if (!name) return res.status(400).json({ error: 'Group name is required.' });

  try {
    const result = await run(`
      INSERT INTO groups (name, korean_name, logo, cover, debut_date, company)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      name,
      cleanText(req.body.korean_name),
      cleanText(req.body.logo),
      cleanText(req.body.cover),
      cleanText(req.body.debut_date),
      cleanText(req.body.company),
    ]);

    const row = await get('SELECT * FROM groups WHERE id = ?', [result.id]);
    res.status(201).json(row);
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post('/api/albums', async (req, res) => {
  const groupId = asId(req.body.group_id);
  const name = cleanText(req.body.name);
  if (!groupId || !name) return res.status(400).json({ error: 'group_id and album name are required.' });

  try {
    const group = await get('SELECT id FROM groups WHERE id = ?', [groupId]);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    const result = await run(`
      INSERT INTO albums (group_id, name, korean_name, release_date, album_type, cover, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      groupId,
      name,
      cleanText(req.body.korean_name),
      cleanText(req.body.release_date),
      cleanText(req.body.album_type),
      cleanText(req.body.cover),
      cleanText(req.body.notes),
    ]);

    const row = await get('SELECT * FROM albums WHERE id = ?', [result.id]);
    res.status(201).json(row);
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post('/api/versions', async (req, res) => {
  const albumId = asId(req.body.album_id);
  const versionName = cleanText(req.body.version_name);
  if (!albumId || !versionName) {
    return res.status(400).json({ error: 'album_id and version_name are required.' });
  }

  try {
    const album = await get('SELECT id FROM albums WHERE id = ?', [albumId]);
    if (!album) return res.status(404).json({ error: 'Album not found.' });

    const result = await run(`
      INSERT INTO album_versions (album_id, version_name, cover, barcode, edition_type)
      VALUES (?, ?, ?, ?, ?)
    `, [
      albumId,
      versionName,
      cleanText(req.body.cover),
      cleanText(req.body.barcode),
      cleanText(req.body.edition_type),
    ]);

    await run(`
      INSERT INTO collection (album_version_id, status, quantity)
      VALUES (?, 'missing', 0)
      ON CONFLICT(album_version_id) DO NOTHING
    `, [result.id]);

    const row = await get(`
      SELECT v.*, c.status, c.quantity
      FROM album_versions v
      LEFT JOIN collection c ON c.album_version_id = v.id
      WHERE v.id = ?
    `, [result.id]);

    res.status(201).json(row);
  } catch (error) {
    handleDbError(res, error);
  }
});

app.put('/api/collection/:versionId', async (req, res) => {
  const versionId = asId(req.params.versionId);
  const status = cleanText(req.body.status, 'missing');
  if (!versionId) return res.status(400).json({ error: 'Invalid version id.' });
  if (!STATUSES.has(status)) return res.status(400).json({ error: 'Invalid collection status.' });

  const requestedQuantity = Number.parseInt(req.body.quantity, 10);
  const quantity = Number.isInteger(requestedQuantity)
    ? Math.max(0, requestedQuantity)
    : status === 'owned'
      ? 1
      : 0;

  try {
    const version = await get('SELECT id FROM album_versions WHERE id = ?', [versionId]);
    if (!version) return res.status(404).json({ error: 'Album version not found.' });

    await run(`
      INSERT INTO collection (
        album_version_id, status, quantity, purchase_date, purchase_price,
        purchase_channel, opened, notes, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(album_version_id) DO UPDATE SET
        status = excluded.status,
        quantity = excluded.quantity,
        purchase_date = excluded.purchase_date,
        purchase_price = excluded.purchase_price,
        purchase_channel = excluded.purchase_channel,
        opened = excluded.opened,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
    `, [
      versionId,
      status,
      quantity,
      cleanText(req.body.purchase_date),
      req.body.purchase_price === '' || req.body.purchase_price === undefined
        ? null
        : Number(req.body.purchase_price),
      cleanText(req.body.purchase_channel),
      req.body.opened ? 1 : 0,
      cleanText(req.body.notes),
    ]);

    const row = await get('SELECT * FROM collection WHERE album_version_id = ?', [versionId]);
    res.json(row);
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post('/api/upload', (req, res) => {
  upload.single('image')(req, res, (error) => {
    if (error) return res.status(400).json({ error: error.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'Image is required.' });
    res.status(201).json({ path: `/uploads/${req.file.filename}` });
  });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Unexpected server error.' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`K-pop Collection V0.1 running at http://${HOST}:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});

function shutdown() {
  server.close(() => {
    db.close(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
