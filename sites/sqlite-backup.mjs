import initSqlJs from 'sql.js/dist/sql-asm.js';
import schema from '../drizzle/0000_lovely_tyger_tiger.sql';
import photosSchema from '../drizzle/0001_big_nitro.sql';
import audiosSchema from '../drizzle/0002_album_audios.sql';
import { COLUMNS, EMPTY_PROFILE, fail, validateSnapshot } from './data.mjs';

let engine;
const getEngine = () => engine ??= initSqlJs();
function rows(db, table) {
  const result = db.exec(`SELECT * FROM ${table} LIMIT 15001`)[0];
  return result ? result.values.map(values => Object.fromEntries(result.columns.map((column,i)=>[column,values[i]]))) : [];
}
export async function sqliteExport(snapshot) {
  const SQL = await getEngine(), db = new SQL.Database();
  try {
    db.run(schema);
    db.run(photosSchema);
    db.run(audiosSchema);
    db.run('BEGIN');
    for (const [table,fields] of Object.entries(COLUMNS)) {
      const insert = db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`);
      try { for (const row of snapshot.data[table]) insert.run(fields.map(key=>row[key]??null)); } finally { insert.free(); }
    }
    const p=snapshot.data.profile, fields=Object.keys(EMPTY_PROFILE);
    db.run(`INSERT INTO profile (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,fields.map(key=>key==='favorite_group_ids'?JSON.stringify(p[key]):p[key]));
    db.run('CREATE TABLE backup_assets (key TEXT PRIMARY KEY, type TEXT NOT NULL, base64 TEXT NOT NULL)');
    for (const asset of snapshot.assets??[]) db.run('INSERT INTO backup_assets VALUES (?,?,?)',[asset.key,asset.type,asset.base64]);
    db.run('COMMIT');
    return db.export();
  } finally { db.close(); }
}
export async function sqliteImport(bytes) {
  if (new TextDecoder().decode(bytes.subarray(0,16))!=='SQLite format 3\0') fail('不是有效的 SQLite 数据库。');
  const SQL=await getEngine();let db;
  try {
    db=new SQL.Database(bytes);
    db.run('PRAGMA query_only=ON');
    if (db.exec('PRAGMA quick_check')[0]?.values[0]?.[0]!=='ok') fail('SQLite 备份已损坏。');
    const tables=new Set((db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values??[]).map(row=>row[0]));
    if (['groups','albums','album_versions','collection'].some(table=>!tables.has(table))) fail('数据库缺少收藏数据表。');
    const data={};
    for (const table of Object.keys(COLUMNS)) data[table]=tables.has(table)?rows(db,table):[];
    const p=tables.has('profile')?rows(db,'profile')[0]:null;
    data.profile=p?{...p,favorite_group_ids:JSON.parse(p.favorite_group_ids)}:{...EMPTY_PROFILE};
    const snapshot={format:'kpop-collection-backup',schema_version:5,data,assets:tables.has('backup_assets')?rows(db,'backup_assets'):[]};
    validateSnapshot(snapshot);
    return snapshot;
  } catch(error) { if(error.status)throw error;fail('SQLite 备份无法读取或格式不兼容。'); }
  finally { db?.close(); }
}
