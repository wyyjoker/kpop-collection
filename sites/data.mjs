export const EMPTY_PROFILE = { id: 1, name: '', bio: '', avatar: '', hero_cover: '', diary: '', favorite_group_ids: [] };
export const STATUSES = new Set(['owned', 'wishlist', 'missing', 'preordered']);
export const PROFILE_LIMITS = { name: 100, bio: 2000, avatar: 2048, hero_cover: 2048, diary: 20000 };
export const COLUMNS = {
  groups: ['id','name','korean_name','logo','cover','debut_date','company','created_at'],
  albums: ['id','group_id','name','korean_name','release_date','album_type','cover','notes','created_at'],
  album_versions: ['id','album_id','version_name','cover','barcode','edition_type','created_at'],
  collection: ['id','album_version_id','status','quantity','purchase_date','purchase_price','purchase_channel','purchase_currency','opened','notes','created_at','updated_at'],
  album_tracks: ['id','album_id','disc_no','track_no','title','note','source','created_at'],
  catalog_imports: ['catalog_key','imported_at','item_count'],
};
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export const id = value => { const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) fail('无效的记录 ID。'); return n; };
export function text(value, max = 20000) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' || value.length > max) fail(`文本格式无效或超过 ${max} 个字符。`);
  return value.trim();
}
export function validateProfile(input, groupIds) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('个人资料格式无效。');
  if (input.id !== undefined && input.id !== 1) fail('个人资料 ID 必须为 1。');
  const fields = {};
  for (const [key, max] of Object.entries(PROFILE_LIMITS)) if (input[key] !== undefined) {
    if (typeof input[key] !== 'string') fail(`${key} 必须是文本。`);
    fields[key] = text(input[key], max);
  }
  if (input.favorite_group_ids !== undefined) {
    const ids = input.favorite_group_ids;
    if (!Array.isArray(ids) || ids.length > 1000 || ids.some(n => !Number.isSafeInteger(n) || !groupIds.has(n))) fail('本命团必须是已录入的团体。');
    fields.favorite_group_ids = [...new Set(ids)];
  }
  return fields;
}
export const statement = (db, sql, values = []) => db.prepare(sql).bind(...values);
export const all = async (db, sql, values = []) => (await statement(db,sql,values).all()).results;
export const first = (db, sql, values = []) => statement(db,sql,values).first();
export async function profile(db) {
  const row = await first(db, 'SELECT * FROM profile WHERE id=1');
  return row ? { ...row, favorite_group_ids: JSON.parse(row.favorite_group_ids) } : { ...EMPTY_PROFILE };
}
export function profileStatement(db, p) {
  const fields = Object.keys(EMPTY_PROFILE);
  return statement(db, `INSERT INTO profile (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${fields.slice(1).map(k=>`${k}=excluded.${k}`).join(',')}`,
    fields.map(k=>k === 'favorite_group_ids' ? JSON.stringify(p[k]) : p[k]));
}
export function validateSnapshot(snapshot) {
  if (snapshot?.format !== 'kpop-collection-backup' || !snapshot.data) fail('不是有效的收藏备份。');
  if (snapshot.schema_version !== undefined && ![1,2,3].includes(snapshot.schema_version)) fail('不支持此备份版本。');
  const data = {};
  for (const [table, fields] of Object.entries(COLUMNS)) {
    const optional = ['album_tracks','catalog_imports'].includes(table) && !(snapshot.schema_version >= 2);
    const rows = snapshot.data[table] ?? (optional ? [] : null);
    if (!Array.isArray(rows) || rows.length > 15000) fail(`备份 ${table} 数据无效或过大。`);
    data[table] = rows.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) fail('备份记录无效。');
      const out = {};
      for (const key of fields) {
        const value = row[key];
        if (['id','group_id','album_id','album_version_id','disc_no','track_no'].includes(key)) out[key] = id(value ?? (key==='disc_no'?1:undefined));
        else if (['quantity','item_count'].includes(key)) { out[key] = Number(value ?? 0); if (!Number.isSafeInteger(out[key]) || out[key] < 0) fail('备份数量无效。'); }
        else if (key === 'opened') { if (![0,1,false,true,undefined].includes(value)) fail('拆封状态无效。'); out[key] = value ? 1 : 0; }
        else if (key === 'purchase_price') { out[key] = value == null || value === '' ? null : Number(value); if (out[key] !== null && (!Number.isFinite(out[key]) || out[key] < 0)) fail('备份价格无效。'); }
        else if (key === 'status') { out[key] = value ?? 'missing'; if (!STATUSES.has(out[key])) fail('备份收藏状态无效。'); }
        else out[key] = text(value ?? (key.endsWith('_at') ? new Date().toISOString() : key==='purchase_currency'?'CNY':''));
      }
      if (['groups','albums'].includes(table) && !out.name || table==='album_versions' && !out.version_name || table==='album_tracks' && !out.title || table==='catalog_imports' && !out.catalog_key) fail('备份记录缺少名称。');
      if (table === 'collection' && out.status === 'owned') out.quantity = Math.max(1,out.quantity);
      return out;
    });
    const ids = new Set();
    for (const row of data[table]) { const key = table==='catalog_imports'?row.catalog_key:row.id; if (ids.has(key)) fail('备份存在重复 ID。'); ids.add(key); }
  }
  const groupIds = new Set(data.groups.map(r=>r.id)), albumIds = new Set(data.albums.map(r=>r.id)), versionIds = new Set(data.album_versions.map(r=>r.id));
  if (data.albums.some(r=>!groupIds.has(r.group_id)) || data.album_versions.some(r=>!albumIds.has(r.album_id)) || data.album_tracks.some(r=>!albumIds.has(r.album_id)) || data.collection.some(r=>!versionIds.has(r.album_version_id))) fail('备份中的团体、专辑或版本关联无效。');
  data.profile = { ...EMPTY_PROFILE, ...validateProfile(snapshot.data.profile ?? (snapshot.schema_version>=3 ? null : EMPTY_PROFILE),groupIds) };
  return data;
}
export function insertStatements(db, data) {
  const stmts = [];
  for (const [table, fields] of Object.entries(COLUMNS)) {
    const size = Math.floor(90 / fields.length);
    for (let i=0;i<data[table].length;i+=size) {
      const rows = data[table].slice(i,i+size);
      stmts.push(statement(db,`INSERT INTO ${table} (${fields.join(',')}) VALUES ${rows.map(()=>`(${fields.map(()=>'?').join(',')})`).join(',')}`,rows.flatMap(row=>fields.map(k=>row[k]))));
    }
  }
  stmts.push(profileStatement(db,data.profile));
  return stmts;
}
export async function exportData(db) {
  const queries = Object.keys(COLUMNS).map(table=>statement(db,`SELECT * FROM ${table} ORDER BY ${table==='catalog_imports'?'catalog_key':'id'}`));
  queries.push(statement(db,'SELECT * FROM profile WHERE id=1'));
  const results = await db.batch(queries), data = {};
  Object.keys(COLUMNS).forEach((table,i)=>data[table]=results[i].results);
  const p = results.at(-1).results[0];
  data.profile = p ? {...p,favorite_group_ids:JSON.parse(p.favorite_group_ids)} : {...EMPTY_PROFILE};
  return { format:'kpop-collection-backup',schema_version:3,app_version:'0.6-sites',exported_at:new Date().toISOString(),data };
}
export function assetReferences(data) {
  return new Set([...data.groups.flatMap(r=>[r.cover,r.logo]),...data.albums.map(r=>r.cover),...data.album_versions.map(r=>r.cover),data.profile.avatar,data.profile.hero_cover].filter(v=>v?.startsWith('/uploads/')));
}
