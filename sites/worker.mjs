import bootstrap from './bootstrap.json' with { type: 'json' };
import initialAssets from './bootstrap-assets.json' with { type: 'json' };
import { EMPTY_PROFILE, STATUSES, fail, id, text, validateProfile, statement, all, first, profile, profileStatement, validateSnapshot, insertStatements, exportData, assetReferences } from './data.mjs';
import { sqliteExport, sqliteImport } from './sqlite-backup.mjs';
const MAX_UPLOAD = 8 * 1024 * 1024, MAX_BACKUP = 24 * 1024 * 1024;
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const keyFor = value => { const key = typeof value==='string'?value.replace(/^\/uploads\//,''):''; if (!key || key.length>500 || !/^[a-zA-Z0-9_.-]+$/.test(key) || key==='.' || key==='..') fail('图片路径无效。'); return key; };
const decode = value => Uint8Array.from(atob(value),c=>c.charCodeAt(0));
function encode(bytes) { let s=''; for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s); }
async function limitedBody(request,max) {
  if (Number(request.headers.get('content-length'))>max) fail('文件过大。',413);
  const reader=request.body?.getReader(); if(!reader)return new Uint8Array();
  const chunks=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail('文件过大。',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const value of chunks){bytes.set(value,offset);offset+=value.length;}return bytes;
}
async function form(request,max) { const bytes=await limitedBody(request,max);return new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData(); }
async function payload(request) { try{return JSON.parse(new TextDecoder().decode(await limitedBody(request,MAX_BACKUP)));}catch(e){if(e.status)throw e;fail('JSON 格式无效。');} }
async function initialize(env) {
  if(await first(env.DB,"SELECT value FROM site_state WHERE key='initialized'"))return;
  const data=validateSnapshot(bootstrap);
  for(const asset of initialAssets)if(!await env.BUCKET.head(keyFor(asset.key)))await env.BUCKET.put(asset.key,decode(asset.base64),{httpMetadata:{contentType:asset.type}});
  try {
    await env.DB.batch([statement(env.DB,"INSERT INTO site_state (key,value) VALUES ('initialized','1')"),...insertStatements(env.DB,data)]);
  } catch(error) {
    if(!await first(env.DB,"SELECT value FROM site_state WHERE key='initialized'"))throw error;
  }
}
async function groups(db) {
  const rows=await all(db,`SELECT g.*,COUNT(DISTINCT a.id) album_count,COUNT(DISTINCT v.id) version_count,
    COUNT(DISTINCT CASE WHEN c.status='owned' THEN v.id END) owned_count,
    COUNT(DISTINCT CASE WHEN c.status='wishlist' THEN v.id END) wishlist_count,
    COUNT(DISTINCT CASE WHEN c.status='preordered' THEN v.id END) preordered_count
    FROM groups g LEFT JOIN albums a ON a.group_id=g.id LEFT JOIN album_versions v ON v.album_id=a.id
    LEFT JOIN collection c ON c.album_version_id=v.id GROUP BY g.id ORDER BY g.name COLLATE NOCASE`);
  return rows.map(r=>({...r,completion:r.version_count?Math.round(r.owned_count/r.version_count*100):0}));
}
async function library(db) {
  const [groupRows,albums,versions,tracks]=await Promise.all([groups(db),all(db,`SELECT a.*,g.name group_name FROM albums a JOIN groups g ON g.id=a.group_id ORDER BY a.release_date DESC,a.id`),
    all(db,`SELECT v.*,COALESCE(c.status,'missing') status,COALESCE(c.quantity,0) quantity,COALESCE(c.purchase_date,'') purchase_date,c.purchase_price,COALESCE(c.purchase_channel,'') purchase_channel,COALESCE(c.purchase_currency,'CNY') purchase_currency,COALESCE(c.opened,0) opened,COALESCE(c.notes,'') collection_notes FROM album_versions v LEFT JOIN collection c ON c.album_version_id=v.id ORDER BY v.album_id,v.version_name COLLATE NOCASE,v.id`),
    all(db,'SELECT * FROM album_tracks ORDER BY album_id,disc_no,track_no,id')]);
  const byId=new Map(albums.map(a=>[a.id,{...a,versions:[],tracks:[]}]));
  for(const v of versions)byId.get(v.album_id)?.versions.push(v);
  for(const t of tracks)byId.get(t.album_id)?.tracks.push(t);
  return {groups:groupRows,albums:[...byId.values()],runtime:'sites'};
}
async function collectAssets(env,snapshot) {
  const assets=[];let size=0;
  for(const path of assetReferences(snapshot.data)) {
    const key=keyFor(path),object=await env.BUCKET.get(key);if(!object)fail('备份中有图片缺失，请先检查封面。',409);
    size+=object.size;if(size>12*1024*1024)fail('图片总量超过单份备份限制（12 MB），请先单独保存原图。',413);
    assets.push({key,type:object.httpMetadata?.contentType||'application/octet-stream',base64:encode(new Uint8Array(await object.arrayBuffer()))});
  }
  return assets;
}
async function restore(env,snapshot) {
  const data=validateSnapshot(snapshot),assets=snapshot.assets??[],uploaded=[];
  if(!Array.isArray(assets)||assets.length>1000)fail('备份图片格式无效。');
  const references=assetReferences(data), replacements=new Map();let total=0;
  for(const asset of assets) {
    const key=keyFor(asset.key);if(!references.has(`/uploads/${key}`))fail('备份包含未引用的图片。');
    if(typeof asset.base64!=='string'||asset.base64.length>MAX_BACKUP||!/^image\/(png|jpeg|webp|gif|avif|svg\+xml)$/.test(asset.type))fail('备份图片格式无效。');
    let bytes;try{bytes=decode(asset.base64);}catch{fail('备份图片编码无效。');}
    total+=bytes.length;if(total>12*1024*1024)fail('备份图片过大。',413);
    if(replacements.has(key))fail('备份图片重复。');
    replacements.set(key,{key:`${crypto.randomUUID()}.${key.split('.').pop().slice(0,10)}`,bytes,type:asset.type});
  }
  for(const reference of references)if(!replacements.has(keyFor(reference))&&!await env.BUCKET.head(keyFor(reference)))fail('备份引用的图片尚未上传到云端，请使用包含图片的完整备份。',409);
  const remap=value=>value?.startsWith('/uploads/')&&replacements.has(keyFor(value))?`/uploads/${replacements.get(keyFor(value)).key}`:value;
  for(const row of data.groups){row.cover=remap(row.cover);row.logo=remap(row.logo);}
  for(const row of [...data.albums,...data.album_versions])row.cover=remap(row.cover);
  data.profile.avatar=remap(data.profile.avatar);data.profile.hero_cover=remap(data.profile.hero_cover);
  // Never overwrite existing object keys. A failed SQL batch leaves live data intact.
  const safety=await exportData(env.DB),safetyKey=`backups/before-restore-${crypto.randomUUID()}.json`;
  await env.BUCKET.put(safetyKey,JSON.stringify(safety),{httpMetadata:{contentType:'application/json'}});
  try {
    for(const asset of replacements.values()){await env.BUCKET.put(asset.key,asset.bytes,{httpMetadata:{contentType:asset.type}});uploaded.push(asset.key);}
    const deletes=['album_tracks','catalog_imports','collection','album_versions','albums','groups','profile'].map(table=>statement(env.DB,`DELETE FROM ${table}`));
    await env.DB.batch([...deletes,...insertStatements(env.DB,data)]);
  }catch(error){await Promise.all(uploaded.map(key=>env.BUCKET.delete(key)));throw error;}
  return {success:true,safety_backup:safetyKey,counts:{groups:data.groups.length,albums:data.albums.length,versions:data.album_versions.length,collection:data.collection.length}};
}
const entities={groups:{table:'groups',fields:['name','korean_name','company','debut_date','logo','cover'],required:'name'},albums:{table:'albums',fields:['name','korean_name','release_date','album_type','cover','notes'],required:'name',parent:'group_id',parentTable:'groups'},versions:{table:'album_versions',fields:['version_name','edition_type','barcode','cover'],required:'version_name',parent:'album_id',parentTable:'albums'}};
async function entityMutation(db,entity,recordId,method,body) {
  const spec=entities[entity];let current;
  if(recordId){current=await first(db,`SELECT * FROM ${spec.table} WHERE id=?`,[recordId]);if(!current)fail('未找到记录。',404);}
  if(method==='DELETE') {
    const steps=[statement(db,`DELETE FROM ${spec.table} WHERE id=?`,[recordId])];
    if(entity==='groups')steps.push(statement(db,`UPDATE profile SET favorite_group_ids=(SELECT json_group_array(value) FROM json_each(profile.favorite_group_ids) WHERE value != ?) WHERE id=1`,[recordId]));
    await db.batch(steps);return json({success:true});
  }
  if(!body||typeof body!=='object'||Array.isArray(body))fail('表单格式无效。');
  const data={};for(const field of spec.fields)data[field]=body[field]===undefined?(current?.[field]??''):text(body[field]);
  if(!data[spec.required])fail('名称不能为空。');
  if(!recordId&&spec.parent){data[spec.parent]=id(body[spec.parent]);if(!await first(db,`SELECT id FROM ${spec.parentTable} WHERE id=?`,[data[spec.parent]]))fail('所属团体或专辑不存在。',404);}
  const fields=Object.keys(data),values=Object.values(data);
  const result=recordId?await statement(db,`UPDATE ${spec.table} SET ${fields.map(f=>`${f}=?`).join(',')} WHERE id=? RETURNING *`,[...values,recordId]).first():await statement(db,`INSERT INTO ${spec.table} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')}) RETURNING *`,values).first();
  return json(result,recordId?200:201);
}
async function collection(db,versionId,body) {
  if(!body||typeof body!=='object'||Array.isArray(body))fail('收藏表单格式无效。');
  if(!await first(db,'SELECT id FROM album_versions WHERE id=?',[versionId]))fail('未找到版本。',404);
  const current=await first(db,'SELECT * FROM collection WHERE album_version_id=?',[versionId])??{};
  const status=body.status??current.status??'missing';if(!STATUSES.has(status))fail('收藏状态无效。');
  let quantity=Number(body.quantity??current.quantity??(status==='owned'?1:0));if(!Number.isSafeInteger(quantity)||quantity<0)fail('数量必须是非负整数。');if(status==='owned')quantity=Math.max(1,quantity);
  const value=body.purchase_price===undefined?current.purchase_price:body.purchase_price,price=value===null||value===undefined||value===''?null:Number(value);
  if(price!==null&&(!Number.isFinite(price)||price<0))fail('价格必须是非负数。');
  const data={album_version_id:versionId,status,quantity,purchase_date:text(body.purchase_date??current.purchase_date),purchase_price:price,purchase_channel:text(body.purchase_channel??current.purchase_channel),purchase_currency:text(body.purchase_currency??current.purchase_currency??'CNY',10).toUpperCase(),opened:body.opened===undefined?(current.opened??0):[true,1,'1','true','on'].includes(body.opened)?1:0,notes:text(body.notes??current.notes),updated_at:new Date().toISOString()};
  const fields=Object.keys(data);
  return statement(db,`INSERT INTO collection (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')}) ON CONFLICT(album_version_id) DO UPDATE SET ${fields.slice(1).map(f=>`${f}=excluded.${f}`).join(',')} RETURNING *`,Object.values(data)).first();
}
async function api(request,env,url) {
  const path=url.pathname,method=request.method,db=env.DB;
  if(path==='/api/health')return json({ok:true,version:'0.6-sites',runtime:'sites'});
  await initialize(env);
  if(path==='/api/library'&&method==='GET')return json(await library(db));
  if(path==='/api/groups'&&method==='GET')return json(await groups(db));
  if(path==='/api/stats'&&method==='GET') {
    const g=await groups(db),totals=g.reduce((a,r)=>({groups:a.groups+1,albums:a.albums+r.album_count,versions:a.versions+r.version_count,owned:a.owned+r.owned_count,wishlist:a.wishlist+r.wishlist_count,preordered:a.preordered+r.preordered_count}),{groups:0,albums:0,versions:0,owned:0,wishlist:0,preordered:0});
    return json({...totals,completion:totals.versions?Math.round(totals.owned/totals.versions*100):0});
  }
  if(path==='/api/profile') {
    if(method==='GET')return json(await profile(db));
    if(method==='PUT'){const fields=validateProfile(await payload(request),new Set((await all(db,'SELECT id FROM groups')).map(g=>g.id)));await profileStatement(db,{...await profile(db),...fields}).run();return json(await profile(db));}
  }
  const match=path.match(/^\/api\/(groups|albums|versions)(?:\/(\d+))?$/);
  if(match){const [,entity,key]=match,recordId=key?id(key):null;
    if(entity==='groups'&&method==='GET'&&recordId){const lib=await library(db),group=lib.groups.find(g=>g.id===recordId);if(!group)fail('未找到团体。',404);const albums=lib.albums.filter(a=>a.group_id===recordId);return json({group,albums,summary:{albums:group.album_count,versions:group.version_count,owned:group.owned_count,wishlist:group.wishlist_count,preordered:group.preordered_count,completion:group.completion}});}
    if(method==='POST'&&!recordId||['PUT','DELETE'].includes(method)&&recordId)return entityMutation(db,entity,recordId,method,method==='DELETE'?null:await payload(request));
  }
  const v=path.match(/^\/api\/collection\/(\d+)$/);if(v&&method==='PUT')return json(await collection(db,id(v[1]),await payload(request)));
  if(path==='/api/upload'&&method==='POST') {
    const data=await form(request,MAX_UPLOAD+65536),file=data.get('image');if(!file?.arrayBuffer||file.size<1||file.size>MAX_UPLOAD)fail('请选择不超过 8 MB 的图片。');
    const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif'},ext=extensions[file.type];if(!ext)fail('支持 PNG、JPEG、WebP、GIF、AVIF 图片。');
    const key=`${crypto.randomUUID()}.${ext}`;await env.BUCKET.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});return json({path:`/uploads/${key}`},201);
  }
  if(path==='/api/export'&&method==='GET'){const snapshot=await exportData(db);if(url.searchParams.get('assets')==='1')snapshot.assets=await collectAssets(env,snapshot);const response=json(snapshot);response.headers.set('Content-Disposition',`attachment; filename="kpop-collection-${new Date().toISOString().slice(0,10)}.json"`);return response;}
  if(path==='/api/import'&&method==='POST')return json(await restore(env,await payload(request)));
  if(path==='/api/backup/database'&&method==='GET'){const snapshot=await exportData(db);snapshot.assets=await collectAssets(env,snapshot);const bytes=await sqliteExport(snapshot);return new Response(bytes,{headers:{'Content-Type':'application/vnd.sqlite3','Content-Disposition':'attachment; filename="kpop-collection.db"','Cache-Control':'private, no-store'}});}
  if(path==='/api/backup/database/restore'&&method==='POST'){const data=await form(request,MAX_BACKUP),file=data.get('database');if(!file?.arrayBuffer)fail('请选择 SQLite 备份。');return json(await restore(env,await sqliteImport(new Uint8Array(await file.arrayBuffer()))));}
  return json({error:'未找到接口。'},404);
}
export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url),local=env.LOCAL_PREVIEW==='true'&&['localhost','127.0.0.1'].includes(url.hostname);
    // The Sites dispatcher enforces owner-only access and supplies signed-in identity.
    if(!local&&!request.headers.get('oai-authenticated-user-id'))return json({error:'请先登录你的 ChatGPT 账号。'},401);
    if(!['GET','HEAD'].includes(request.method)) {
      const origin=request.headers.get('origin');
      if(request.headers.get('sec-fetch-site')==='cross-site'||origin&&origin!==url.origin)return json({error:'不允许跨站修改收藏。'},403);
    }
    try {
      if(url.pathname.startsWith('/api/'))return await api(request,env,url);
      if(url.pathname.startsWith('/uploads/')) {
        if(!['GET','HEAD'].includes(request.method))return json({error:'不支持此操作。'},405);
        await initialize(env);const object=await env.BUCKET.get(keyFor(url.pathname));if(!object)return json({error:'图片不存在。'},404);
        const headers=new Headers();object.writeHttpMetadata(headers);headers.set('ETag',object.httpEtag);headers.set('Cache-Control','private, max-age=300');headers.set('X-Content-Type-Options','nosniff');headers.set('Content-Security-Policy',"sandbox; default-src 'none'");return new Response(request.method==='HEAD'?null:object.body,{headers});
      }
      if(!['GET','HEAD'].includes(request.method))return json({error:'不支持此操作。'},405);
      let response=await env.ASSETS.fetch(request);
      if(response.status===404&&!url.pathname.split('/').pop().includes('.'))response=await env.ASSETS.fetch(new Request(new URL('/index.html',url),request));
      return response;
    } catch(error) {
      console.error('Collection request failed',error.message);
      const status=error.status??(/UNIQUE constraint/i.test(error.message)?409:/constraint|SQLITE_/i.test(error.message)?400:500);
      return json({error:error.status?error.message:status===409?'这条记录已存在。':status===400?'数据格式或关联不正确，原有收藏未被替换。':'暂时无法保存或读取收藏，请稍后重试。'},status);
    }
  }
};
