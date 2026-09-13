import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
export async function createRuntime({port=0,persist=false}={}) {
  if(process.env.SITES_TEST_RUNTIME==='node'){console.warn('Using Node/SQLite compatibility harness; not native Workers validation. Images are temporary.');return (await import('./sites-node-runtime.mjs')).createNodeRuntime({port,persist});}
  const mf=new Miniflare({name:'kpop-collection',modules:true,scriptPath:path.join(root,'dist/server/index.js'),compatibilityDate:'2026-07-30',host:'127.0.0.1',port,bindings:{LOCAL_PREVIEW:'true'},d1Databases:['DB'],r2Buckets:['BUCKET'],d1Persist:persist?path.join(root,'.sites-runtime/d1'):false,r2Persist:persist?path.join(root,'.sites-runtime/r2'):false,assets:{directory:path.join(root,'dist/client'),binding:'ASSETS',run_worker_first:true}});
  try {
  const db=await mf.getD1Database('DB');
  await db.prepare('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)').run();
  for(const name of (await readdir(path.join(root,'drizzle'))).filter(name=>name.endsWith('.sql')).sort()) {
    if(await db.prepare('SELECT name FROM local_migrations WHERE name=?').bind(name).first())continue;
    const sql=await readFile(path.join(root,'drizzle',name),'utf8');
    await db.batch([...sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)),db.prepare('INSERT INTO local_migrations VALUES (?)').bind(name)]);
  }
  return mf;
  } catch(error) { await mf.dispose(); throw error; }
}
