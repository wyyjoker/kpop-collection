const test = require('node:test');
const assert = require('node:assert/strict');
// The regular suite is portable. CI additionally exercises the native Workers runtime.
process.env.SITES_TEST_RUNTIME ??= 'node';

test('Sites runtime: authentication, durable CRUD, images and atomic backup restore', {timeout:120000}, async t => {
  const {createRuntime}=await import('../scripts/sites-runtime.mjs');
  const mf=await createRuntime();t.after(()=>mf.dispose());
  const origin='http://localhost';
  const call=(path,method='GET',body,headers={})=>mf.dispatchFetch(origin+path,{method,headers:{...(body && !(body instanceof FormData)?{'content-type':'application/json'}:{}),...headers},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  const ok=async(path,method,body)=>{const r=await call(path,method,body);const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;};
  await t.test('owner authentication is mandatory outside localhost',async()=>{
    assert.equal((await mf.dispatchFetch('https://example.test/api/library')).status,401);
    assert.equal((await mf.dispatchFetch('https://example.test/api/health',{headers:{'oai-authenticated-user-id':'owner'}})).status,200);
    assert.equal((await call('/api/groups','POST',{name:'Blocked'},{origin:'https://other.test'})).status,403);
  });
  let group,album,version,backup,imageBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=','base64');
  await t.test('initialization is concurrent-safe and never overwrites edits',async()=>{
    const [a,b]=await Promise.all([ok('/api/library'),ok('/api/library')]);
    assert.equal(a.albums.length,32);assert.equal(b.albums.length,32);
    assert.equal(a.albums.flatMap(a=>a.tracks).length,291);
    group=await ok('/api/groups','POST',{name:'Test Girl Group'});
    album=await ok('/api/albums','POST',{group_id:group.id,name:'Test Album',release_date:'2026-09-13'});
    version=await ok('/api/versions','POST',{album_id:album.id,version_name:'Limited',edition_type:'limited'});
    await ok(`/api/collection/${version.id}`,'PUT',{status:'owned',quantity:2,purchase_price:128});
    await ok('/api/profile','PUT',{name:'Cloud diary',favorite_group_ids:[group.id]});
    assert.equal((await ok('/api/library')).albums.find(a=>a.id===album.id).versions[0].quantity,2);
    assert.equal((await ok('/api/profile')).name,'Cloud diary');
    assert.equal((await call(`/api/collection/${version.id}`,'PUT',{quantity:-1})).status,400);
    assert.equal((await call('/api/groups','POST',{name:'test girl group'})).status,409);
  });
  await t.test('R2 upload is read back and included in JSON export',async()=>{
    const form=new FormData();form.append('image',new Blob([imageBytes],{type:'image/png'}),'cover.png');
    const upload=await ok('/api/upload','POST',form);
    await ok(`/api/albums/${album.id}`,'PUT',{cover:upload.path});
    const img=await call(upload.path);assert.equal(img.status,200);assert.deepEqual(Buffer.from(await img.arrayBuffer()),imageBytes);
    backup=await ok('/api/export?assets=1');assert.equal(backup.assets.length,1);
    assert.equal(backup.data.profile.name,'Cloud diary');
  });
  await t.test('JSON restore preserves images and rejects corrupt data without data loss',async()=>{
    const bad=structuredClone(backup);bad.data.albums[0].group_id=99999;
    assert.equal((await call('/api/import','POST',bad)).status,400);
    assert.equal((await ok('/api/library')).albums.length,33);
    await ok('/api/profile','PUT',{name:'Changed'});
    await ok('/api/import','POST',backup);
    assert.equal((await ok('/api/profile')).name,'Cloud diary');
    const restored=(await ok('/api/library')).albums.find(a=>a.id===album.id);
    assert.notEqual(restored.cover,backup.data.albums.find(a=>a.id===album.id).cover);
    assert.deepEqual(Buffer.from(await (await call(restored.cover)).arrayBuffer()),imageBytes);
    const conflict=structuredClone(backup);conflict.data.groups.push({...conflict.data.groups[0],id:999});
    assert.equal((await call('/api/import','POST',conflict)).status,409);
    assert.equal((await ok('/api/library')).albums.length,33);
  });
  await t.test('SQLite download and restore round-trip data and image bytes',async()=>{
    const response=await call('/api/backup/database');
    assert.equal(response.status,200,await response.clone().text());
    const bytes=await response.arrayBuffer();assert.equal(Buffer.from(bytes).subarray(0,15).toString(),'SQLite format 3');
    await ok('/api/profile','PUT',{name:'SQLite changed'});
    const form=new FormData();form.append('database',new Blob([bytes]),'backup.db');
    await ok('/api/backup/database/restore','POST',form);
    assert.equal((await ok('/api/profile')).name,'Cloud diary');
    const restored=(await ok('/api/library')).albums.find(a=>a.id===album.id);
    assert.deepEqual(Buffer.from(await (await call(restored.cover)).arrayBuffer()),imageBytes);
    const bad=new FormData();bad.append('database',new Blob(['not sqlite']),'bad.db');
    assert.equal((await call('/api/backup/database/restore','POST',bad)).status,400);
  });
  await t.test('deleting groups cascades and prunes favorites without reseeding',async()=>{
    await ok(`/api/groups/${group.id}`,'DELETE');
    assert.equal((await ok('/api/library')).albums.length,32);
    assert.deepEqual((await ok('/api/profile')).favorite_group_ids,[]);
    const snapshot=await ok('/api/export');snapshot.data.groups=[];snapshot.data.albums=[];snapshot.data.album_versions=[];snapshot.data.collection=[];snapshot.data.album_tracks=[];snapshot.data.catalog_imports=[];
    await ok('/api/import','POST',snapshot);
    assert.equal((await ok('/api/library')).albums.length,0);
  });
  await t.test('frontend and supplied reference image are served',async()=>{
    assert.equal((await call('/?view=home')).status,200);
    assert.equal((await call('/assets/scrapbook/reference-masthead.png')).status,200);
  });
});
