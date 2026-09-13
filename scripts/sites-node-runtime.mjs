// Explicit compatibility harness for machines where the native Workers binary cannot start.
// It runs the built worker against real SQLite, but is not a substitute for workerd validation.
import sqlite3 from 'sqlite3';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
export async function createNodeRuntime({port=0,persist=false}={}) {
  if(persist)await mkdir(path.join(root,'.sites-runtime'),{recursive:true});
  const sqlite=new sqlite3.Database(persist?path.join(root,'.sites-runtime/compat.db'):':memory:');
  const query=(sql,values=[])=>new Promise((resolve,reject)=>sqlite.all(sql,values,(error,rows)=>error?reject(error):resolve(rows)));
  let tail=Promise.resolve();
  const serial=action=>{const result=tail.then(action);tail=result.catch(()=>{});return result;};
  await query('PRAGMA foreign_keys=ON');
  const DB={
    prepare(sql){const make=values=>({sql,values,bind:(...args)=>make(args),all:()=>serial(async()=>({results:await query(sql,values),success:true})),first:()=>serial(async()=>(await query(sql,values))[0]??null),run:()=>serial(async()=>({results:await query(sql,values),success:true}))});return make([]);},
    batch(stmts){return serial(async()=>{await query('BEGIN');try{const results=[];for(const stmt of stmts)results.push({results:await query(stmt.sql,stmt.values),success:true});await query('COMMIT');return results;}catch(error){await query('ROLLBACK');throw error;}});}
  };
  await DB.prepare('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)').run();
  for(const name of (await readdir(path.join(root,'drizzle'))).filter(f=>f.endsWith('.sql')).sort())if(!await DB.prepare('SELECT name FROM local_migrations WHERE name=?').bind(name).first()) {
    const sql=await readFile(path.join(root,'drizzle',name),'utf8');
    await DB.batch([...sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>DB.prepare(s)),DB.prepare('INSERT INTO local_migrations VALUES (?)').bind(name)]);
  }
  const images=new Map();
  const object=row=>row?{size:row.bytes.length,httpMetadata:row.metadata,httpEtag:'"local"',body:new Blob([row.bytes]).stream(),arrayBuffer:async()=>row.bytes.buffer.slice(row.bytes.byteOffset,row.bytes.byteOffset+row.bytes.byteLength),writeHttpMetadata:headers=>headers.set('content-type',row.metadata.contentType)}:null;
  const BUCKET={async put(key,value,options={}){const bytes=new Uint8Array(await new Response(value).arrayBuffer());images.set(key,{bytes,metadata:options.httpMetadata??{}});},async head(key){return object(images.get(key));},async get(key){return object(images.get(key));},async delete(key){images.delete(key);}};
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
  const ASSETS={async fetch(request){let pathname=new URL(request.url).pathname;if(pathname.endsWith('/'))pathname+='index.html';const file=path.resolve(root,'dist/client','.'+decodeURIComponent(pathname));if(!file.startsWith(path.join(root,'dist/client')+path.sep))return new Response(null,{status:404});try{return new Response(await readFile(file),{headers:{'content-type':types[path.extname(file)]??'application/octet-stream'}});}catch{return new Response(null,{status:404});}}};
  const worker=(await import(pathToFileURL(path.join(root,'dist/server/index.js')))).default;
  const dispatchFetch=(url,init)=>worker.fetch(new Request(url,init),{DB,BUCKET,ASSETS,LOCAL_PREVIEW:'true'},{});
  const server=createServer(async(req,res)=>{try{const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});const response=await worker.fetch(request,{DB,BUCKET,ASSETS,LOCAL_PREVIEW:'true'},{});res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();}catch(error){console.error(error.message);res.writeHead(500);res.end('Preview request failed');}});
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  return {dispatchFetch,ready:Promise.resolve(new URL(`http://127.0.0.1:${server.address().port}`)),dispose:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await new Promise((resolve,reject)=>sqlite.close(e=>e?reject(e):resolve()));}};
}
