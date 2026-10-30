import http from 'node:http';
import {readFileSync,existsSync,copyFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {Limits} from './limits.mjs';
import {createAnswerEngine} from '../engine.mjs';
import {loadIndex,refreshIndex} from '../website.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const files=new Map([['/ask/', ['ask/index.html','text/html; charset=utf-8']],['/ask/index.html',['ask/index.html','text/html; charset=utf-8']],['/ask/ask.js',['ask/ask.js','text/javascript; charset=utf-8']],['/ask/stream.js',['ask/stream.js','text/javascript; charset=utf-8']],['/ask/ask.css',['ask/ask.css','text/css; charset=utf-8']]]);
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>24000)throw Object.assign(Error('Please ask a shorter question.'),{status:413});chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(Error('Please try a shorter question.'),{status:400});}}
export function createPublicServer({origin,apiKey,dbPath,salt,monthlyUsd,dailyUsd,concurrent=5,perMinute=5,perDay=20,fetchImpl=fetch,indexLoader=loadIndex,timeoutMs=80000,trustRenderProxy=false,clock=Date.now,logger=()=>{}}){
 const url=new URL(origin);if(!apiKey||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!['https:','http:'].includes(url.protocol))throw Error('A valid origin and server-side API key are required.');
 const limits=new Limits(dbPath,{monthlyUsd,dailyUsd,salt,concurrent,perMinute,perDay,clock});
 const answer=createAnswerEngine({getIndex:indexLoader,getKey:()=>apiKey,fetchImpl,timeoutMs,admit:address=>limits.admit(address),release:lease=>limits.release(lease),reserve:(request,lease)=>limits.reserve(request,lease),settle:(reservation,tokens)=>limits.settle(reservation,tokens)});
 const server=http.createServer(async(req,res)=>{
  const start=Date.now(),id=randomUUID();res.setHeader('X-Request-ID',id);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if(url.protocol==='https:')res.setHeader('Strict-Transport-Security','max-age=31536000');
  res.once('finish',()=>logger({id,status:res.statusCode,elapsedMs:Date.now()-start}));
  const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort();});
  try{
   // The platform health check can use its internal Host. It receives no sensitive data.
   if(req.url==='/healthz'&&req.method==='GET'){const current=Date.parse(indexLoader().expiresAt)>clock();json(res,current?200:503,{ready:current});return;}
   if(req.headers.host!==url.host){json(res,403,{error:'Please use the school guide’s address.'});return;}
   const path=new URL(req.url,origin).pathname;
   if(req.headers.origin&&req.headers.origin!==url.origin){json(res,403,{error:'Please use the school guide’s question form.'});return;}
   if(path==='/api/ask/status'&&req.method==='GET'){
    const index=indexLoader();json(res,200,{mode:'live',public:true,reviewed:index.generatedAt,indexedPages:index.coverage.pagesIndexed,indexedDocuments:index.coverage.pdfsIndexed,sourcesCurrent:Date.parse(index.expiresAt)>clock()});return;
   }
   if(path==='/api/ask'&&req.method==='POST'){
    if(req.headers.origin!==url.origin||!req.headers['content-type']?.startsWith('application/json')){json(res,403,{error:'Please use the school guide’s question form.'});return;}
    let address=req.socket.remoteAddress||'unknown';
    if(trustRenderProxy){address=String(req.headers['cf-connecting-ip']||'').trim();if(!isIP(address)){json(res,503,{error:'The guide’s connection needs attention. Please use the Family Hub.'});return;}}
    const input=await body(req);
    if(input.stream===true){
     res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});res.flushHeaders();
     const send=event=>{if(!res.destroyed)res.write('data: '+JSON.stringify(event)+'\n\n');};
     send({type:'status',message:'Checking River Tech’s information…'});
     try{send({type:'done',answer:await answer(input,send,controller.signal,'gpt-6-astra',address)});}
     catch(e){send({type:'error',error:e.status===429?e.message:'That answer could not be completed. Please try again or use the Family Hub.'});}
     res.end();
    }else json(res,200,await answer(input,undefined,controller.signal,'gpt-6-astra',address));return;
   }
   if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'That action is unavailable.'});return;}
   if(path==='/'||path==='/ask'){res.writeHead(302,{Location:'/ask/'});res.end();return;}
   const entry=files.get(path);if(!entry){json(res,404,{error:'Not found'});return;}
   let content=readFileSync(resolve(root,entry[0]));
   if(entry[0].endsWith('.html'))content=Buffer.from(content.toString().replaceAll('href="/pages/','href="https://www.rivertechschool.com/pages/').replace('href="/"','href="https://www.rivertechschool.com/"').replace('href="/favicon.ico"','href="https://www.rivertechschool.com/favicon.ico"').replace('Private preview · Connecting…','Ask River Tech · Connecting…').replace('This preview does not save conversations to disk.','This guide does not save conversations to disk.'));
   res.writeHead(200,{'Content-Type':entry[1]});res.end(req.method==='HEAD'?undefined:content);
  }catch(e){if(!res.headersSent){if(e.status===429)res.setHeader('Retry-After','60');json(res,e.status||400,{error:e.status===429||e.status===413?e.message:'That answer could not be completed. Please try again or use the Family Hub.'});}else res.end();}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=40;
 return {server,limits,answer};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dir=process.env.ASK_DATA_DIR;if(!dir||!process.env.ASK_INDEX_PATH||!process.env.ASK_PUBLIC_ORIGIN)throw Error('Persistent data directory, source-index path, and public origin are required.');
 if(!process.env.ASK_PUBLIC_ORIGIN.startsWith('https://'))throw Error('The public launch requires HTTPS.');
 if(process.env.ASK_TRUST_RENDER_PROXY==='1'&&process.env.RENDER!=='true')throw Error('Render proxy trust requires the Render runtime.');
 mkdirSync(dir,{recursive:true,mode:0o700});mkdirSync(dirname(process.env.ASK_INDEX_PATH),{recursive:true});
 if(!existsSync(process.env.ASK_INDEX_PATH))copyFileSync(fileURLToPath(new URL('../website-index.json',import.meta.url)),process.env.ASK_INDEX_PATH);
 const app=createPublicServer({origin:process.env.ASK_PUBLIC_ORIGIN,apiKey:process.env.OPENAI_API_KEY,dbPath:resolve(dir,'limits.sqlite'),salt:process.env.ASK_VISITOR_SALT,monthlyUsd:Number(process.env.ASK_MONTHLY_USD),dailyUsd:Number(process.env.ASK_DAILY_USD),concurrent:Number(process.env.ASK_MAX_CONCURRENT||5),perMinute:Number(process.env.ASK_PER_MINUTE||5),perDay:Number(process.env.ASK_PER_DAY||20),trustRenderProxy:process.env.ASK_TRUST_RENDER_PROXY==='1',logger:record=>console.log(JSON.stringify(record))});
 refreshIndex();const timer=setInterval(refreshIndex,3600000);timer.unref();
 app.server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Ask River Tech public service started.'));
 for(const name of ['SIGTERM','SIGINT'])process.on(name,()=>{app.server.close(()=>{app.limits.close();process.exit(0);});setTimeout(()=>process.exit(1),85000).unref();});
}
