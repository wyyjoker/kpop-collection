require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const APP_VERSION = require('./package.json').version;

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, 'data', 'kpop-collection.db'));
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'public', 'uploads'));
const RESTORE_TMP_DIR = path.join(path.dirname(DB_PATH), '.restore-tmp');
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 8);
const MAX_BACKUP_MB = Number(process.env.MAX_BACKUP_MB || 100);
const STATUSES = new Set(['owned', 'wishlist', 'missing', 'preordered']);
const REQUIRED_TABLES = ['groups', 'albums', 'album_versions', 'collection'];
const PROFILE_TEXT_LIMITS = { name: 100, bio: 2000, avatar: 2048, hero_cover: 2048, diary: 20000 };
const EMPTY_PROFILE = { id: 1, name: '', bio: '', avatar: '', hero_cover: '', diary: '', favorite_group_ids: [] };

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(RESTORE_TMP_DIR, { recursive: true });

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads',express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

let db;

function initializeDatabase(database) {
  database.serialize(() => {
    database.run('PRAGMA foreign_keys = ON');
    database.run('PRAGMA journal_mode = WAL');

    database.run(`
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

    database.run(`
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

    database.run(`
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

    database.run(`
      CREATE TABLE IF NOT EXISTS collection (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_version_id INTEGER NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'missing'
          CHECK(status IN ('owned', 'wishlist', 'missing', 'preordered')),
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

    database.run(`CREATE TABLE IF NOT EXISTS album_tracks (
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
    )`);
    database.run(`CREATE TABLE IF NOT EXISTS catalog_imports (
      catalog_key TEXT PRIMARY KEY,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      item_count INTEGER NOT NULL DEFAULT 0
    )`);
    database.run(`CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      name TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT '',
      hero_cover TEXT NOT NULL DEFAULT '',
      diary TEXT NOT NULL DEFAULT '',
      favorite_group_ids TEXT NOT NULL DEFAULT '[]'
    )`);
    database.run('INSERT OR IGNORE INTO profile (id) VALUES (1)');
    database.run(`CREATE TABLE IF NOT EXISTS album_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, album_id INTEGER NOT NULL,
      src TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
      UNIQUE(album_id,src)
    )`);
    database.run(`CREATE TRIGGER IF NOT EXISTS prune_profile_favorites AFTER DELETE ON groups
      BEGIN
        UPDATE profile SET favorite_group_ids = (
          SELECT json_group_array(value) FROM json_each(profile.favorite_group_ids) WHERE value != OLD.id
        ) WHERE id = 1;
      END`);
    database.run('CREATE INDEX IF NOT EXISTS idx_album_tracks_album_id ON album_tracks(album_id)');
    database.run('CREATE INDEX IF NOT EXISTS idx_albums_group_id ON albums(group_id)');
    database.run('CREATE INDEX IF NOT EXISTS idx_albums_release_date ON albums(release_date)');
    database.run('CREATE INDEX IF NOT EXISTS idx_versions_album_id ON album_versions(album_id)');
    database.run('CREATE INDEX IF NOT EXISTS idx_collection_status ON collection(status)');
    database.all('PRAGMA table_info(collection)', [], (_error, columns = []) => {
      if (!columns.some((column) => column.name === 'purchase_currency')) {
        database.run("ALTER TABLE collection ADD COLUMN purchase_currency TEXT DEFAULT 'CNY'");
      }
    });
  });
}

function openDatabase() {
  db = new sqlite3.Database(DB_PATH);
  initializeDatabase(db);
}

openDatabase();

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

function asBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
}

function asOptionalPrice(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === '' || value === null) return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return NaN;
  return price;
}

function handleDbError(res, error) {
  if (error?.status === 400) return res.status(400).json({ error: error.message });
  console.error(error);
  if (error && error.code === 'SQLITE_CONSTRAINT') {
    return res.status(409).json({ error: '数据冲突：名称重复或关联关系无效。' });
  }
  return res.status(500).json({ error: '服务器内部错误。' });
}

function validateProfile(input, groupIds) {
  const invalid = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('profile 必须是对象。');
  if (input.id !== undefined && input.id !== 1) invalid('profile ID 必须为 1。');
  const fields = {};
  for (const [key, limit] of Object.entries(PROFILE_TEXT_LIMITS)) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'string' || input[key].length > limit) {
      invalid(`${key} 必须是长度不超过 ${limit} 的文本。`);
    }
    fields[key] = input[key].trim();
  }
  if (input.favorite_group_ids !== undefined) {
    const ids = input.favorite_group_ids;
    if (!Array.isArray(ids) || ids.length > 1000 ||
        ids.some((id) => !Number.isSafeInteger(id) || id <= 0 || !groupIds.has(id))) {
      invalid('favorite_group_ids 必须包含已存在团体的正整数 ID，最多 1000 个。');
    }
    fields.favorite_group_ids = [...new Set(ids)];
  }
  return fields;
}

async function readProfile() {
  const row = await get('SELECT * FROM profile WHERE id = 1');
  return { ...row, favorite_group_ids: JSON.parse(row.favorite_group_ids) };
}

async function updateProfile(fields) {
  const entries = Object.entries(fields).filter(([key]) => Object.hasOwn(PROFILE_TEXT_LIMITS, key) || key === 'favorite_group_ids');
  if (entries.length) {
    await run(`UPDATE profile SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = 1`,
      entries.map(([key, value]) => key === 'favorite_group_ids' ? JSON.stringify(value) : value));
  }
}

function removeLocalAsset(assetPath) {
  if (!assetPath || !assetPath.startsWith('/uploads/')) return;
  const fileName = path.basename(assetPath);
  const absolutePath = path.join(UPLOAD_DIR, fileName);
  fs.unlink(absolutePath, () => {});
}

function removeLocalAssets(paths) {
  for (const assetPath of new Set(paths.filter(Boolean))) removeLocalAsset(assetPath);
}

async function relatedAssetsForGroup(groupId) {
  const rows = await all(`
    SELECT cover AS path FROM groups WHERE id = ?
    UNION ALL SELECT cover AS path FROM albums WHERE group_id = ?
    UNION ALL
      SELECT v.cover AS path
      FROM album_versions v
      JOIN albums a ON a.id = v.album_id
      WHERE a.group_id = ?
  `, [groupId, groupId, groupId]);
  return rows.map((row) => row.path);
}

async function relatedAssetsForAlbum(albumId) {
  const rows = await all(`
    SELECT cover AS path FROM albums WHERE id = ?
    UNION ALL SELECT cover AS path FROM album_versions WHERE album_id = ?
  `, [albumId, albumId]);
  return rows.map((row) => row.path);
}

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const upload = multer({
  storage: imageStorage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('仅支持图片文件。'));
    cb(null, true);
  },
});

const restoreStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, RESTORE_TMP_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${path.basename(file.originalname)}`),
});
const restoreUpload = multer({
  storage: restoreStorage,
  limits: { fileSize: MAX_BACKUP_MB * 1024 * 1024 },
});

function checkpointDatabase() {
  return new Promise((resolve, reject) => {
    db.run('PRAGMA wal_checkpoint(FULL)', (error) => (error ? reject(error) : resolve()));
  });
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((error) => (error ? reject(error) : resolve()));
  });
}

function validateSQLiteBackup(filePath) {
  return new Promise((resolve, reject) => {
    const header = Buffer.alloc(16);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    if (header.toString('utf8') !== 'SQLite format 3\u0000') {
      return reject(new Error('不是有效的 SQLite 数据库文件。'));
    }

    const candidate = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (openError) => {
      if (openError) return reject(openError);
      candidate.all(
        "SELECT name FROM sqlite_master WHERE type = 'table'",
        [],
        (queryError, rows) => {
          candidate.close(() => {});
          if (queryError) return reject(queryError);
          const names = new Set(rows.map((row) => row.name));
          const missing = REQUIRED_TABLES.filter((name) => !names.has(name));
          if (missing.length) return reject(new Error(`备份缺少数据表：${missing.join(', ')}`));
          resolve();
        },
      );
    });
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: APP_VERSION });
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

async function readGroups() {
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

  return rows.map((row) => ({
    ...row,
    completion: row.version_count ? Math.round((row.owned_count / row.version_count) * 100) : 0,
  }));
}

app.get('/api/profile', async (_req, res) => {
  try {
    res.json(await readProfile());
  } catch (error) {
    handleDbError(res, error);
  }
});
app.get('/api/session', (_req,res)=>res.json({can_edit:true}));
app.post('/api/albums/:id/photos', async(req,res)=>{
  try {
    const albumId=asId(req.params.id), {src,caption=''}=req.body||{};
    if(!albumId||!await get('SELECT id FROM albums WHERE id=?',[albumId]))return res.status(404).json({error:'专辑不存在。'});
    if(typeof src!=='string'||!/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(src)||!fs.existsSync(path.join(UPLOAD_DIR,path.basename(src))))return res.status(400).json({error:'请先上传实物照片。'});
    if(typeof caption!=='string'||caption.length>2000)return res.status(400).json({error:'照片描述最多 2000 字。'});
    await run('INSERT INTO album_photos (album_id,src,caption) VALUES (?,?,?) ON CONFLICT(album_id,src) DO NOTHING',[albumId,src,caption.trim()]);
    res.status(201).json(await get('SELECT * FROM album_photos WHERE album_id=? AND src=?',[albumId,src]));
  }catch(error){handleDbError(res,error);}
});
app.put('/api/photos/:id',async(req,res)=>{
  try {
    const photoId=asId(req.params.id),caption=req.body?.caption;
    if(typeof caption!=='string'||caption.length>2000)return res.status(400).json({error:'照片描述最多 2000 字。'});
    if(!await get('SELECT id FROM album_photos WHERE id=?',[photoId]))return res.status(404).json({error:'照片不存在。'});
    await run('UPDATE album_photos SET caption=? WHERE id=?',[caption.trim(),photoId]);res.json(await get('SELECT * FROM album_photos WHERE id=?',[photoId]));
  }catch(error){handleDbError(res,error);}
});
app.delete('/api/photos/:id',async(req,res)=>{
  try {const result=await run('DELETE FROM album_photos WHERE id=?',[asId(req.params.id)]);if(!result.changes)return res.status(404).json({error:'照片不存在。'});res.json({success:true});}catch(error){handleDbError(res,error);}
});

app.put('/api/profile', async (req, res) => {
  try {
    const groupIds = new Set((await all('SELECT id FROM groups')).map((group) => group.id));
    await updateProfile(validateProfile(req.body, groupIds));
    res.json(await readProfile());
  } catch (error) {
    handleDbError(res, error);
  }
});

app.get('/api/library', async (_req, res) => {
  try {
    const [groups, albums, versions, tracks, photos] = await Promise.all([
      readGroups(),
      all(`SELECT a.*, g.name AS group_name FROM albums a JOIN groups g ON g.id = a.group_id
        ORDER BY CASE WHEN a.release_date = '' THEN 1 ELSE 0 END, a.release_date DESC, a.name COLLATE NOCASE, a.id`),
      all(`SELECT v.*,
        COALESCE(c.status, 'missing') AS status,
        COALESCE(c.quantity, 0) AS quantity,
        COALESCE(c.purchase_date, '') AS purchase_date,
        c.purchase_price,
        COALESCE(c.purchase_channel, '') AS purchase_channel,
        COALESCE(c.purchase_currency, 'CNY') AS purchase_currency,
        COALESCE(c.opened, 0) AS opened,
        COALESCE(c.notes, '') AS collection_notes
        FROM album_versions v LEFT JOIN collection c ON c.album_version_id = v.id
        ORDER BY v.album_id, v.version_name COLLATE NOCASE, v.id`),
      all('SELECT * FROM album_tracks ORDER BY album_id, disc_no, track_no, id'),
      all('SELECT * FROM album_photos ORDER BY album_id,id'),
    ]);
    const albumsById = new Map(albums.map((album) => [album.id, { ...album, versions: [], tracks: [], photos: [] }]));
    for (const version of versions) albumsById.get(version.album_id)?.versions.push(version);
    for (const track of tracks) albumsById.get(track.album_id)?.tracks.push(track);
    for (const photo of photos) albumsById.get(photo.album_id)?.photos.push(photo);
    res.json({ groups, albums: [...albumsById.values()],can_edit:true });
  } catch (error) {
    handleDbError(res, error);
  }
});

app.get('/api/groups', async (_req, res) => {
  try {
    res.json(await readGroups());
  } catch (error) {
    handleDbError(res, error);
  }
});

app.get('/api/groups/:id', async (req, res) => {
  const groupId = asId(req.params.id);
  if (!groupId) return res.status(400).json({ error: '无效的团体 ID。' });

  try {
    const group = await get('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!group) return res.status(404).json({ error: '未找到团体。' });

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
      ORDER BY CASE WHEN a.release_date = '' THEN 1 ELSE 0 END, a.release_date DESC, a.name COLLATE NOCASE ASC
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
          COALESCE(c.purchase_currency, 'CNY') AS purchase_currency,
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
  if (!name) return res.status(400).json({ error: '团体名称不能为空。' });

  try {
    const result = await run(`
      INSERT INTO groups (name, korean_name, logo, cover, debut_date, company)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [name, cleanText(req.body.korean_name), cleanText(req.body.logo), cleanText(req.body.cover), cleanText(req.body.debut_date), cleanText(req.body.company)]);
    res.status(201).json(await get('SELECT * FROM groups WHERE id = ?', [result.id]));
  } catch (error) {
    handleDbError(res, error);
  }
});

app.put('/api/groups/:id', async (req, res) => {
  const groupId = asId(req.params.id);
  if (!groupId) return res.status(400).json({ error: '无效的团体 ID。' });

  try {
    const current = await get('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!current) return res.status(404).json({ error: '未找到团体。' });
    const name = req.body.name === undefined ? current.name : cleanText(req.body.name);
    if (!name) return res.status(400).json({ error: '团体名称不能为空。' });
    const cover = req.body.cover === undefined ? current.cover : cleanText(req.body.cover);

    await run(`
      UPDATE groups SET name = ?, korean_name = ?, company = ?, debut_date = ?, logo = ?, cover = ? WHERE id = ?
    `, [
      name,
      req.body.korean_name === undefined ? current.korean_name : cleanText(req.body.korean_name),
      req.body.company === undefined ? current.company : cleanText(req.body.company),
      req.body.debut_date === undefined ? current.debut_date : cleanText(req.body.debut_date),
      req.body.logo === undefined ? current.logo : cleanText(req.body.logo),
      cover,
      groupId,
    ]);
    if (cover && cover !== current.cover) removeLocalAsset(current.cover);
    res.json(await get('SELECT * FROM groups WHERE id = ?', [groupId]));
  } catch (error) {
    handleDbError(res, error);
  }
});

app.delete('/api/groups/:id', async (req, res) => {
  const groupId = asId(req.params.id);
  if (!groupId) return res.status(400).json({ error: '无效的团体 ID。' });
  try {
    const current = await get('SELECT id FROM groups WHERE id = ?', [groupId]);
    if (!current) return res.status(404).json({ error: '未找到团体。' });
    const assets = await relatedAssetsForGroup(groupId);
    await run('DELETE FROM groups WHERE id = ?', [groupId]);
    removeLocalAssets(assets);
    res.json({ success: true });
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post('/api/albums', async (req, res) => {
  const groupId = asId(req.body.group_id);
  const name = cleanText(req.body.name);
  if (!groupId || !name) return res.status(400).json({ error: '团体和专辑名称不能为空。' });

  try {
    if (!await get('SELECT id FROM groups WHERE id = ?', [groupId])) return res.status(404).json({ error: '未找到团体。' });
    const result = await run(`
      INSERT INTO albums (group_id, name, korean_name, release_date, album_type, cover, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [groupId, name, cleanText(req.body.korean_name), cleanText(req.body.release_date), cleanText(req.body.album_type), cleanText(req.body.cover), cleanText(req.body.notes)]);
    res.status(201).json(await get('SELECT * FROM albums WHERE id = ?', [result.id]));
  } catch (error) {
    handleDbError(res, error);
  }
});

app.put('/api/albums/:id', async (req, res) => {
  const albumId = asId(req.params.id);
  if (!albumId) return res.status(400).json({ error: '无效的专辑 ID。' });
  try {
    const current = await get('SELECT * FROM albums WHERE id = ?', [albumId]);
    if (!current) return res.status(404).json({ error: '未找到专辑。' });
    const name = req.body.name === undefined ? current.name : cleanText(req.body.name);
    if (!name) return res.status(400).json({ error: '专辑名称不能为空。' });
    const cover = req.body.cover === undefined ? current.cover : cleanText(req.body.cover);
    await run(`
      UPDATE albums SET name = ?, korean_name = ?, release_date = ?, album_type = ?, cover = ?, notes = ? WHERE id = ?
    `, [
      name,
      req.body.korean_name === undefined ? current.korean_name : cleanText(req.body.korean_name),
      req.body.release_date === undefined ? current.release_date : cleanText(req.body.release_date),
      req.body.album_type === undefined ? current.album_type : cleanText(req.body.album_type),
      cover,
      req.body.notes === undefined ? current.notes : cleanText(req.body.notes),
      albumId,
    ]);
    if (cover && cover !== current.cover) removeLocalAsset(current.cover);
    res.json(await get('SELECT * FROM albums WHERE id = ?', [albumId]));
  } catch (error) {
    handleDbError(res, error);
  }
});

app.delete('/api/albums/:id', async (req, res) => {
  const albumId = asId(req.params.id);
  if (!albumId) return res.status(400).json({ error: '无效的专辑 ID。' });
  try {
    if (!await get('SELECT id FROM albums WHERE id = ?', [albumId])) return res.status(404).json({ error: '未找到专辑。' });
    const assets = await relatedAssetsForAlbum(albumId);
    await run('DELETE FROM albums WHERE id = ?', [albumId]);
    removeLocalAssets(assets);
    res.json({ success: true });
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post('/api/versions', async (req, res) => {
  const albumId = asId(req.body.album_id);
  const versionName = cleanText(req.body.version_name);
  if (!albumId || !versionName) return res.status(400).json({ error: '专辑和版本名称不能为空。' });

  try {
    if (!await get('SELECT id FROM albums WHERE id = ?', [albumId])) return res.status(404).json({ error: '未找到专辑。' });
    const result = await run(`
      INSERT INTO album_versions (album_id, version_name, cover, barcode, edition_type)
      VALUES (?, ?, ?, ?, ?)
    `, [albumId, versionName, cleanText(req.body.cover), cleanText(req.body.barcode), cleanText(req.body.edition_type)]);
    await run(`
      INSERT INTO collection (album_version_id, status, quantity) VALUES (?, 'missing', 0)
      ON CONFLICT(album_version_id) DO NOTHING
    `, [result.id]);
    res.status(201).json(await get(`
      SELECT v.*, c.status, c.quantity, c.purchase_date, c.purchase_price, c.purchase_channel, c.purchase_currency, c.opened, c.notes AS collection_notes
      FROM album_versions v LEFT JOIN collection c ON c.album_version_id = v.id WHERE v.id = ?
    `, [result.id]));
  } catch (error) {
    handleDbError(res, error);
  }
});

app.put('/api/versions/:id', async (req, res) => {
  const versionId = asId(req.params.id);
  if (!versionId) return res.status(400).json({ error: '无效的版本 ID。' });
  try {
    const current = await get('SELECT * FROM album_versions WHERE id = ?', [versionId]);
    if (!current) return res.status(404).json({ error: '未找到版本。' });
    const versionName = req.body.version_name === undefined ? current.version_name : cleanText(req.body.version_name);
    if (!versionName) return res.status(400).json({ error: '版本名称不能为空。' });
    const cover = req.body.cover === undefined ? current.cover : cleanText(req.body.cover);
    await run(`
      UPDATE album_versions SET version_name = ?, edition_type = ?, barcode = ?, cover = ? WHERE id = ?
    `, [
      versionName,
      req.body.edition_type === undefined ? current.edition_type : cleanText(req.body.edition_type),
      req.body.barcode === undefined ? current.barcode : cleanText(req.body.barcode),
      cover,
      versionId,
    ]);
    if (cover && cover !== current.cover) removeLocalAsset(current.cover);
    res.json(await get('SELECT * FROM album_versions WHERE id = ?', [versionId]));
  } catch (error) {
    handleDbError(res, error);
  }
});

app.delete('/api/versions/:id', async (req, res) => {
  const versionId = asId(req.params.id);
  if (!versionId) return res.status(400).json({ error: '无效的版本 ID。' });
  try {
    const current = await get('SELECT * FROM album_versions WHERE id = ?', [versionId]);
    if (!current) return res.status(404).json({ error: '未找到版本。' });
    await run('DELETE FROM album_versions WHERE id = ?', [versionId]);
    removeLocalAsset(current.cover);
    res.json({ success: true });
  } catch (error) {
    handleDbError(res, error);
  }
});

app.put('/api/collection/:versionId', async (req, res) => {
  const versionId = asId(req.params.versionId);
  if (!versionId) return res.status(400).json({ error: '无效的版本 ID。' });
  const status = cleanText(req.body.status, 'missing');
  if (!STATUSES.has(status)) return res.status(400).json({ error: '无效的收藏状态。' });

  try {
    if (!await get('SELECT id FROM album_versions WHERE id = ?', [versionId])) return res.status(404).json({ error: '未找到版本。' });
    const current = await get('SELECT * FROM collection WHERE album_version_id = ?', [versionId]);

    let quantity;
    if (req.body.quantity === undefined) {
      quantity = current ? current.quantity : (status === 'owned' ? 1 : 0);
    } else {
      const parsed = Number.parseInt(req.body.quantity, 10);
      if (!Number.isInteger(parsed) || parsed < 0) return res.status(400).json({ error: '数量必须是非负整数。' });
      quantity = parsed;
    }
    if (status === 'owned' && quantity < 1) quantity = 1;

    const price = asOptionalPrice(req.body.purchase_price, current?.purchase_price ?? null);
    if (Number.isNaN(price)) return res.status(400).json({ error: '购买价格必须是非负数字。' });

    const purchaseDate = req.body.purchase_date === undefined ? (current?.purchase_date || '') : cleanText(req.body.purchase_date);
    const purchaseChannel = req.body.purchase_channel === undefined ? (current?.purchase_channel || '') : cleanText(req.body.purchase_channel);
    const purchaseCurrency = req.body.purchase_currency === undefined ? (current?.purchase_currency || 'CNY') : cleanText(req.body.purchase_currency, 'CNY').toUpperCase();
    if (!/^[A-Z]{3}$/.test(purchaseCurrency)) return res.status(400).json({ error: '货币代码必须是 3 位字母，例如 CNY / KRW / USD。' });
    const opened = asBoolean(req.body.opened, Boolean(current?.opened));
    const notes = req.body.notes === undefined ? (current?.notes || '') : cleanText(req.body.notes);

    await run(`
      INSERT INTO collection (
        album_version_id, status, quantity, purchase_date, purchase_price, purchase_channel, purchase_currency, opened, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(album_version_id) DO UPDATE SET
        status = excluded.status,
        quantity = excluded.quantity,
        purchase_date = excluded.purchase_date,
        purchase_price = excluded.purchase_price,
        purchase_channel = excluded.purchase_channel,
        purchase_currency = excluded.purchase_currency,
        opened = excluded.opened,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
    `, [versionId, status, quantity, purchaseDate, price, purchaseChannel, purchaseCurrency, opened ? 1 : 0, notes]);

    res.json(await get('SELECT * FROM collection WHERE album_version_id = ?', [versionId]));
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post('/api/upload', (req, res) => {
  upload.single('image')(req, res, (error) => {
    if (error) return res.status(400).json({ error: error.message || '上传失败。' });
    if (!req.file) return res.status(400).json({ error: '请选择图片。' });
    res.status(201).json({ path: `/uploads/${req.file.filename}` });
  });
});

app.get('/api/export', async (_req, res) => {
  try {
    const [groups, albums, albumVersions, collection, albumTracks, catalogImports, profile, albumPhotos] = await Promise.all([
      all('SELECT * FROM groups ORDER BY id'),
      all('SELECT * FROM albums ORDER BY id'),
      all('SELECT * FROM album_versions ORDER BY id'),
      all('SELECT * FROM collection ORDER BY id'),
      all('SELECT * FROM album_tracks ORDER BY id'),
      all('SELECT * FROM catalog_imports ORDER BY catalog_key'),
      readProfile(),
      all('SELECT * FROM album_photos ORDER BY id'),
    ]);
    const snapshot = {
      format: 'kpop-collection-backup',
      schema_version: 4,
      app_version: APP_VERSION,
      exported_at: new Date().toISOString(),
      data: { groups, albums, album_versions: albumVersions, collection, album_tracks: albumTracks, catalog_imports: catalogImports, profile,album_photos:albumPhotos },
    };
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="kpop-collection-${stamp}.json"`);
    res.json(snapshot);
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post('/api/import', async (req, res) => {
  const snapshot = req.body;
  const data = snapshot?.data;
  if (snapshot?.format !== 'kpop-collection-backup' || !data) {
    return res.status(400).json({ error: '不是有效的 K-pop Collection JSON 备份。' });
  }
  for (const key of ['groups', 'albums', 'album_versions', 'collection']) {
    if (!Array.isArray(data[key])) return res.status(400).json({ error: `备份缺少 ${key} 数据。` });
  }
  for (const key of ['album_tracks', 'catalog_imports']) {
    if ((snapshot.schema_version >= 2 || data[key] !== undefined) && !Array.isArray(data[key])) {
      return res.status(400).json({ error: `备份缺少或包含无效的 ${key} 数据。` });
    }
  }

  let transactionStarted = false;
  try {
    if((snapshot.schema_version>=4||data.album_photos!==undefined)&&!Array.isArray(data.album_photos))throw Object.assign(new Error('备份缺少实物相册。'),{status:400});
    for(const p of data.album_photos||[])if(!p||!Number.isSafeInteger(p.id)||p.id<1||!data.albums.some(a=>a.id===p.album_id)||typeof p.src!=='string'||!/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(p.src)||typeof p.caption!=='string'||p.caption.length>2000)throw Object.assign(new Error('实物相册备份格式或关联无效。'),{status:400});
    // Old backups have no personal data; reset to the same defaults as a new database.
    const profile = { ...EMPTY_PROFILE, ...validateProfile(
      snapshot.schema_version >= 3 || data.profile !== undefined ? data.profile : EMPTY_PROFILE,
      new Set(data.groups.map((group) => Number(group.id))),
    ) };
    await run('BEGIN IMMEDIATE TRANSACTION');
    transactionStarted = true;
    await run('DELETE FROM album_photos');
    await run('DELETE FROM album_tracks');
    await run('DELETE FROM catalog_imports');
    await run('DELETE FROM collection');
    await run('DELETE FROM album_versions');
    await run('DELETE FROM albums');
    await run('DELETE FROM groups');

    for (const row of data.groups) {
      await run(`
        INSERT INTO groups (id, name, korean_name, logo, cover, debut_date, company, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [row.id, cleanText(row.name), cleanText(row.korean_name), cleanText(row.logo), cleanText(row.cover), cleanText(row.debut_date), cleanText(row.company), row.created_at || new Date().toISOString()]);
    }
    for (const row of data.albums) {
      await run(`
        INSERT INTO albums (id, group_id, name, korean_name, release_date, album_type, cover, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [row.id, row.group_id, cleanText(row.name), cleanText(row.korean_name), cleanText(row.release_date), cleanText(row.album_type), cleanText(row.cover), cleanText(row.notes), row.created_at || new Date().toISOString()]);
    }
    await updateProfile(profile);
    for (const row of data.album_versions) {
      await run(`
        INSERT INTO album_versions (id, album_id, version_name, cover, barcode, edition_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [row.id, row.album_id, cleanText(row.version_name), cleanText(row.cover), cleanText(row.barcode), cleanText(row.edition_type), row.created_at || new Date().toISOString()]);
    }
    for (const row of data.collection) {
      const status = STATUSES.has(row.status) ? row.status : 'missing';
      await run(`
        INSERT INTO collection (
          id, album_version_id, status, quantity, purchase_date, purchase_price,
          purchase_channel, purchase_currency, opened, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        row.id,
        row.album_version_id,
        status,
        Math.max(0, Number.parseInt(row.quantity, 10) || 0),
        cleanText(row.purchase_date),
        row.purchase_price === null || row.purchase_price === undefined ? null : Number(row.purchase_price),
        cleanText(row.purchase_channel),
        cleanText(row.purchase_currency, 'CNY').toUpperCase(),
        row.opened ? 1 : 0,
        cleanText(row.notes),
        row.created_at || new Date().toISOString(),
        row.updated_at || new Date().toISOString(),
      ]);
    }
    for (const row of data.album_tracks || []) {
      await run(`INSERT INTO album_tracks (id, album_id, disc_no, track_no, title, note, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [row.id, row.album_id, row.disc_no, row.track_no,
        cleanText(row.title), cleanText(row.note), cleanText(row.source), row.created_at || new Date().toISOString()]);
    }
    for (const row of data.catalog_imports || []) {
      await run(`INSERT INTO catalog_imports (catalog_key, imported_at, item_count) VALUES (?, ?, ?)`,
        [row.catalog_key, row.imported_at || new Date().toISOString(), row.item_count]);
    }
    for(const row of data.album_photos||[])await run('INSERT INTO album_photos (id,album_id,src,caption,created_at) VALUES (?,?,?,?,?)',[row.id,row.album_id,row.src,row.caption,row.created_at||new Date().toISOString()]);
    await run('COMMIT');
    res.json({ success: true, counts: {
      groups: data.groups.length,
      albums: data.albums.length,
      versions: data.album_versions.length,
      collection: data.collection.length,
    } });
  } catch (error) {
    if (transactionStarted) {
      try { await run('ROLLBACK'); } catch (_rollbackError) {}
    }
    handleDbError(res, error);
  }
});

app.get('/api/backup/database', async (_req, res) => {
  try {
    await checkpointDatabase();
    const stamp = new Date().toISOString().slice(0, 10);
    res.download(DB_PATH, `kpop-collection-${stamp}.db`);
  } catch (error) {
    handleDbError(res, error);
  }
});

app.post('/api/backup/database/restore', (req, res) => {
  restoreUpload.single('database')(req, res, async (uploadError) => {
    if (uploadError) return res.status(400).json({ error: uploadError.message || '数据库上传失败。' });
    if (!req.file) return res.status(400).json({ error: '请选择数据库备份文件。' });

    const tempPath = req.file.path;
    try {
      await validateSQLiteBackup(tempPath);
      await checkpointDatabase();
      const safetyPath = `${DB_PATH}.before-restore`;
      fs.copyFileSync(DB_PATH, safetyPath);
      await closeDatabase();
      for (const suffix of ['-wal', '-shm']) {
        try { fs.unlinkSync(`${DB_PATH}${suffix}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      fs.copyFileSync(tempPath, DB_PATH);
      openDatabase();
      fs.unlink(tempPath, () => {});
      res.json({ success: true, safety_backup: path.basename(safetyPath) });
    } catch (error) {
      fs.unlink(tempPath, () => {});
      if (!db || !db.open) {
        try { openDatabase(); } catch (_openError) {}
      }
      console.error(error);
      res.status(400).json({ error: error.message || '数据库恢复失败。' });
    }
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
  console.log(`K-pop Collection ${APP_VERSION} running at http://${HOST}:${server.address().port}`);
  console.log(`Database: ${DB_PATH}`);
});

function shutdown() {
  server.close(async () => {
    try { await closeDatabase(); } finally { process.exit(0); }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
