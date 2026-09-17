// Local-only review server. Never deploy this process. Optionally point the browser at a staging web app.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {harness} from './harness.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const remote=process.env.FAMILY_FAIR_STAGING_API||'';
if(remote&&!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(remote))throw new Error('Use the staging Apps Script /exec URL.');
const h=remote?null:harness();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon'};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
http.createServer(async(req,res)=>{
 try{
  // Loopback binding and strict Host/Origin checks keep the test mailbox off external sites.
  if(req.headers.host!=='127.0.0.1:4177' || (req.headers.origin&&req.headers.origin!=='http://127.0.0.1:4177')){res.writeHead(403);res.end();return;}
  const url=new URL(req.url,'http://127.0.0.1:4177');res.setHeader('Cache-Control','no-store');
  if(remote&&(url.pathname==='/api/family-fair'||url.pathname==='/__test/inbox')){res.writeHead(404);res.end('Local adapters are disabled in Google staging mode.');return;}
  if(url.pathname==='/api/family-fair'){
   let result;
   if(req.method==='GET')result=h.call(Object.fromEntries(url.searchParams),false);
   else if(req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>230000){res.writeHead(413);res.end();return;}}result=h.call(JSON.parse(body));}
   else{res.writeHead(405);res.end();return;}
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
  }
  if(url.pathname==='/__test/inbox'){
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Family Fair test mailbox</title><body style="font:16px system-ui;padding:30px"><h1>Fictional test mailbox</h1><p>No email is sent. Reload to see new codes.</p>'+h.outbox.map(m=>'<article><h2>'+esc(m.to)+'</h2><pre>'+esc(m.body)+'</pre></article>').join('')+'</body></html>');return;
  }
  if(url.pathname==='/assets/js/family-fair-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.FAMILY_FAIR_API='+JSON.stringify(remote||'/api/family-fair')+';');return;}
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/pages/family-fair.html':url.pathname));
  if(!target.startsWith(root)||url.pathname.split('/').some(p=>p.startsWith('.'))){res.writeHead(403);res.end();return;}
  let bytes=await readFile(target);res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');
  if(target.endsWith('.html'))bytes=bytes.toString().replace(/(<body[^>]*>)/,'$1<div style="position:relative;z-index:101;background:#e7dcba;color:#3e3926;text-align:center;font:13px/1.5 system-ui;padding:6px">'+(remote?'Google staging test · separate test records · verification codes are sent by email':'Private preview · fictional families · no emails sent · <a href="/__test/inbox">Test mailbox</a>')+'</div>');
  res.end(bytes);
 }catch(e){res.writeHead(404);res.end('Not found');}
}).listen(4177,'127.0.0.1',()=>console.log('Family Fair private preview: http://127.0.0.1:4177/pages/family-fair.html'));
