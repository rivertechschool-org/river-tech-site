// Isolated tests of the actual Apps Script modules. No external requests or mail.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
const base=new URL('../../',import.meta.url);
function harness(){
  let now=new Date('2026-09-30T19:30:00Z').getTime(),locked=false;
  const data=new Map(),requests=[],sessions=new Map(),idempotency=new Map(),outbox=[],triggers=['reconcileHiddenAcresPayments'];
  const config={PP_REGISTRATION_OPEN:'true',HA_REGISTRATION_OPEN:'true',SHEET_ID:'isolated-test-sheet',STRIPE_SECRET_KEY:'sk_live_fixture'};
  const fail={post:false,afterPost:false,writeSession:false,writePaid:false};
  function sheet(name){
    const rows=data.get(name);
    return {hideSheet(){rows.hidden=true;},isSheetHidden:()=>rows.hidden===true,getName:()=>name,getLastRow:()=>rows.length,appendRow:r=>rows.push([...r]),setFrozenRows(){},getRange(r,c,n=1,m=1){return {
      getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[r-1+i]?.[c-1+j]??'')),
      setValues(values){if(fail.writeSession && c===21)throw Error('Simulated session storage failure');values.forEach((row,i)=>{rows[r-1+i]??=[];row.forEach((value,j)=>rows[r-1+i][c-1+j]=value);});return this;},
      setValue(value){if(fail.writePaid && c===16 && r===3)throw Error('Simulated partial paid write');rows[r-1]??=[];rows[r-1][c-1]=value;return this;},setFontWeight(){return this;},setNumberFormat(){return this;}
    };}};
  }
  const ctx=vm.createContext({
    Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},
    Logger:{log(){}},console,
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>config[k]||null,setProperty:(k,v)=>config[k]=v})},
    LockService:{getScriptLock:()=>({tryLock(){if(locked)return false;locked=true;return true;},releaseLock(){locked=false;}})},
    Utilities:{getUuid:randomUUID,formatDate:()=> '2026-09-30',DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(kind,text)=>Array.from(createHash(kind).update(text).digest())},
    SpreadsheetApp:{openById(id){assert.equal(id,'isolated-test-sheet');return {getSheetByName:name=>data.has(name)?sheet(name):null,insertSheet:name=>{data.set(name,[]);return sheet(name);},deleteSheet:sh=>data.delete(sh.getName())};},flush(){}},
    MailApp:{sendEmail:mail=>outbox.push(mail)},
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:value=>({value,getContent:()=>value,setMimeType(){return this;}})},
    ScriptApp:{getProjectTriggers:()=>triggers.map(name=>({getHandlerFunction:()=>name})),newTrigger:name=>({timeBased(){return this;},everyHours(){return this;},create(){triggers.push(name);}})},
    UrlFetchApp:{fetch(url,opts){
      assert(url.startsWith('https://api.stripe.com/v1/checkout/sessions'));requests.push({url,opts});let obj;
      if(opts.method==='post'){
        if(fail.post)throw Error('Simulated connection failure');
        const key=opts.headers['Idempotency-Key'];
        if(idempotency.has(key))obj=sessions.get(idempotency.get(key));
        else {
          const id='cs_live_fixture'+sessions.size;
          obj={id,url:'https://checkout.stripe.com/c/pay/'+id,status:'open',payment_status:'unpaid',metadata:{trip:opts.payload['metadata[trip]'],registrationId:opts.payload['metadata[registrationId]']},client_reference_id:opts.payload.client_reference_id,currency:'usd',amount_total:Number(opts.payload['line_items[0][quantity]'])*Number(opts.payload['line_items[0][price_data][unit_amount]']),livemode:true};
          sessions.set(id,obj);idempotency.set(key,id);
        }
        if(fail.afterPost)throw Error('Simulated lost Stripe response');
      }else obj=sessions.get(decodeURIComponent(url.split('/').pop()));
      return {getResponseCode:()=>obj?200:404,getContentText:()=>JSON.stringify(obj||{})};
    }}
  });
  for(const file of ['fieldtrip-Code.gs','hidden-acres.gs','hs-lunch-opt-out.gs','pumpkin-patch.gs'])vm.runInContext(fs.readFileSync(new URL('apps-script/'+file,base),'utf8'),ctx,{filename:file});
  return {ctx,data,sessions,requests,outbox,triggers,config,fail,setNow:value=>now=new Date(value).getTime(),setLocked:value=>locked=value,
    call:(input,post=true)=>JSON.parse(post?ctx.doPost({postData:{contents:JSON.stringify(input)}}).value:ctx.doGet({parameter:input}).value)};
}
function payload(n=1){return {action:'pumpkin_submit',requestId:'00000000-0000-4000-a000-'+String(n).padStart(12,'0'),trip:{id:'pumpkin-patch-2026-10-07'},parent:{firstName:'Test',lastName:'Guardian',email:'test@example.invalid',phone:'555-0100'},participants:[{firstName:'Fulltime',lastName:'Student',age:'10',type:'student',program:'full-time',priceUSD:0},{firstName:'Homeschool',lastName:'Student',age:'12',type:'student',program:'homeschool',priceUSD:0},{firstName:'Test',lastName:'Adult',type:'adult',age:'',program:'',priceUSD:0}],acknowledgments:{scheduleRead:true},release:{agreed:true,signatureName:'Test Guardian',signatureDate:'2026-09-30'}};}
let checks=0;function check(label,fn){fn();checks++;console.log('PASS '+label);}
const h=harness(),p=payload(),rows=()=>h.data.get('Pumpkin Patch 2026-10-07')||[],group=p=>rows().filter(r=>r[0]==='PP-'+p.requestId),posts=()=>h.requests.filter(r=>r.opts.method==='post');
check('Config identifies the new trip, price, open date and live mode',()=>{const c=h.call({action:'pumpkin_config'},false);assert(c.ready);assert.equal(c.priceUSD,12);assert.equal(c.tripId,p.trip.id);assert.equal(c.mode,'live');});
check('Required identity, type, program, age and consent fail before side effects',()=>{
  const edits=[x=>x.requestId='bad',x=>x.parent.email='bad',x=>x.participants[0].age='10.5',x=>x.participants[0].age='0',x=>x.participants[0].program='',x=>x.participants[2].type='free',x=>x.acknowledgments.scheduleRead=false,x=>x.release.agreed=false,x=>x.release.signatureName='',x=>x.release.signatureDate='2026-02-30',x=>x.participants.push({...x.participants[0]})];
  for(const edit of edits){const x=payload();edit(x);assert.equal(h.call(x).ok,false);}assert.equal(rows().length,0);assert.equal(h.requests.length,0);
});
let first;
check('Every full-time student, homeschool student and adult is charged $12',()=>{first=h.call(p);assert(first.ok);assert.equal(rows().length,4);assert(group(p).every(r=>r[13]===12 && r[14]===36 && r[15]==='No'));assert.equal(posts()[0].opts.payload['line_items[0][price_data][unit_amount]'],'1200');assert.equal(posts()[0].opts.payload['line_items[0][quantity]'],'3');assert.equal(group(p)[2][10],'');assert.equal(group(p)[2][3],'');assert.equal(group(p)[2][12],'');});
check('Student program and transport are preserved, release recorded per participant',()=>{const g=group(p);assert.equal(g[0][3],'full-time');assert.equal(g[1][3],'homeschool');assert.equal(g[0][12],'School bus both ways');assert.equal(g[1][12],'Private vehicle with supervising adult');assert(g.every(r=>r[22]==='Yes' && r[23]===p.trip.id && r[18]==='Yes'));});
check('Retry reuses checkout without duplicating rows or sessions',()=>{for(let i=0;i<10;i++)assert.equal(h.call(p).checkoutUrl,first.checkoutUrl);assert.equal(rows().length,4);assert.equal(h.sessions.size,1);assert.equal(posts().length,1);});
check('Changed details cannot reuse a request key; ignored browser pricing cannot alter totals',()=>{const x=payload();x.parent.firstName='Different';assert.equal(h.call(x).ok,false);const retry=payload();retry.participants[0].priceUSD=-500;assert(h.call(retry).ok);assert.equal(h.sessions.size,1);});
const sid=group(p)[0][20],session=h.sessions.get(sid);
check('Unpaid and cancelled payments never become paid',()=>{assert.equal(h.call({action:'pumpkin_status',session_id:sid},false).paid,false);assert(group(p).every(r=>r[15]==='No'));});
check('Wrong amount, currency, metadata, reference or payment mode never confirm',()=>{
  session.payment_status='paid';const fields=[['amount_total',1200],['currency','cad'],['livemode',false],['client_reference_id','other'],['metadata',{trip:p.trip.id,registrationId:'other'}],['metadata',{trip:'other',registrationId:session.client_reference_id}]];
  for(const [key,value] of fields){const original=session[key];session[key]=value;assert.equal(h.call({action:'pumpkin_status',session_id:sid},false).ok,false);assert(group(p).every(r=>r[15]==='No'));session[key]=original;}
});
check('Verified Stripe payment updates all participants, with readback',()=>{const status=h.call({action:'pumpkin_status',session_id:sid},false);assert(status.ok&&status.paid);assert(group(p).every(r=>r[15]==='Yes' && r[2]==='Paid (verified with Stripe)'));});
check('Paid registration never creates a second checkout',()=>{assert.equal(h.call(p).ok,false);assert.equal(h.sessions.size,1);});
check('Stripe failure retains intake and recovers with the same request',()=>{const x=payload(2);h.fail.post=true;assert.equal(h.call(x).ok,false);assert.equal(group(x).length,3);h.fail.post=false;assert(h.call(x).ok);assert.equal(group(x).length,3);});
check('Lost Stripe response and lost session write use the same idempotent checkout',()=>{for(const [n,flag] of [[3,'afterPost'],[4,'writeSession']]){const x=payload(n),before=h.sessions.size;h.fail[flag]=true;assert.equal(h.call(x).ok,false);assert.equal(h.sessions.size,before+1);h.fail[flag]=false;assert(h.call(x).ok);assert.equal(h.sessions.size,before+1);assert.equal(group(x).length,3);}});
check('An expired checkout is replaced without duplicating intake',()=>{const x=payload(5);assert(h.call(x).ok);const old=group(x)[0][20];h.sessions.get(old).status='expired';assert(h.call(x).ok);assert.notEqual(group(x)[0][20],old);assert.equal(group(x).length,3);assert.equal(h.call({action:'pumpkin_status',session_id:old},false).ok,false);});
check('Processing payment cannot create a new checkout',()=>{const x=payload(6);assert(h.call(x).ok);h.sessions.get(group(x)[0][20]).status='complete';const before=h.sessions.size;assert.equal(h.call(x).ok,false);assert.equal(h.sessions.size,before);});
check('Partial checkout mapping is repaired even when the first row lost its reference',()=>{const x=payload(7);assert(h.call(x).ok);const g=group(x),saved=g[1][20];g[0][20]='';g[0][21]='';assert(h.call(x).ok);assert(g.every(r=>r[20]===saved));});
check('Existing hourly Hidden Acres recovery finds Pumpkin payments without a return visit',()=>{const x=payload(8);assert(h.call(x).ok);const g=group(x);h.sessions.get(g[0][20]).payment_status='paid';g[0][15]='Yes';g[1][20]='';g[1][21]='';h.ctx.reconcileHiddenAcresPayments();assert(g.every(r=>r[15]==='Yes' && r[20]===g[0][20]));assert.deepEqual(h.triggers,['reconcileHiddenAcresPayments']);});
check('Partial paid writes remain recoverable and are never reported as successful',()=>{const x=payload(9);assert(h.call(x).ok);const g=group(x);h.sessions.get(g[0][20]).payment_status='paid';const oldSet=h.fail.writePaid;h.fail.writePaid=false; // exercise failure on one later participant by changing adapter temporarily
  const original=h.ctx.ppMarkPaid_;h.ctx.ppMarkPaid_=function(sh,items,s){sh.getRange(items[0].index,16).setValue('Yes');throw Error('Simulated interrupted paid write');};
  assert.equal(h.call({action:'pumpkin_status',session_id:g[0][20]},false).ok,false);assert.equal(g[1][15],'No');h.ctx.ppMarkPaid_=original;h.fail.writePaid=oldSet;h.ctx.reconcilePumpkinPayments();assert(g.every(r=>r[15]==='Yes'));
});
check('Missing configuration and lock contention produce no new records',()=>{const before=rows().length;h.config.PP_REGISTRATION_OPEN='false';assert.equal(h.call(payload(10)).ok,false);h.config.PP_REGISTRATION_OPEN='true';h.config.STRIPE_SECRET_KEY='';assert.equal(h.call(payload(10)).ok,false);h.config.STRIPE_SECRET_KEY='sk_live_fixture';h.setLocked(true);assert.equal(h.call(payload(10)).ok,false);h.setLocked(false);assert.equal(rows().length,before);});
check('Unicode and formula-like names are preserved safely',()=>{const x=payload(11);x.parent.firstName='Élodie';x.participants[0].firstName='=1+1';assert(h.call(x).ok);assert.equal(group(x)[0][4],'Élodie');assert.equal(group(x)[0][8],"'=1+1");assert.equal(h.ctx.ppCellText_('  =1+1'),"'  =1+1");});
check('Participant bounds reject zero or 51; adults alone and 50 participants pay correctly',()=>{for(const n of [0,51]){const x=payload(12);x.participants=Array.from({length:n},(_,i)=>({...x.participants[2],firstName:'Adult '+i}));assert.equal(h.call(x).ok,false);}const x=payload(12);x.participants=Array.from({length:50},(_,i)=>({...x.participants[2],firstName:'Adult '+i}));assert(h.call(x).ok);assert.equal(group(x).length,50);assert(group(x).every(r=>r[14]===600));});
check('Public input cannot enable sandbox or override payment settings',()=>{const x=payload(13);x.PP_RUNTIME_CONFIG={STRIPE_SECRET_KEY:'sk_test_fake'};x.test=true;x.SHEET_ID='other';assert(h.call(x).ok);assert.equal(h.call({action:'pumpkin_config'},false).mode,'live');});
check('Registration stays open after the requested deadline and closes only by owner setting',()=>{for(const [n,date] of [[14,'2026-10-05T06:59:59Z'],[15,'2026-10-05T07:00:00Z'],[16,'2026-10-06T20:00:00Z']]){h.setNow(date);const c=h.call({action:'pumpkin_config'},false);assert(c.ready);assert.equal(c.closed,false);assert(h.call(payload(n)).ok);}const before=rows().length;h.config.PP_REGISTRATION_OPEN='false';const c=h.call({action:'pumpkin_config'},false);assert.equal(c.ready,false);assert.equal(c.closed,true);assert.equal(h.call(payload(17)).ok,false);assert.equal(rows().length,before);});
check('Paid status and recovery still work after signup closes',()=>{const x=payload(14),g=group(x);h.sessions.get(g[0][20]).payment_status='paid';h.ctx.reconcilePumpkinPayments();assert(g.every(r=>r[15]==='Yes'));assert(h.call({action:'pumpkin_status',session_id:g[0][20]},false).paid);});
check('Silverwood, Hidden Acres and lunch routes still reach their original handlers',()=>{
  const names=['handleSubmission','handleHiddenAcres_','handleWaiverSubmission_','handleLunchOptOut_','hiddenAcresConfig_','hiddenAcresStatus_','lunchOptOutConfig_','silverwoodRoster_'];const originals={};names.forEach(name=>{originals[name]=h.ctx[name];h.ctx[name]=()=>({ok:true,handler:name});});
  for(const [input,method,expected] of [[{trip:{id:'silverwood-2026-06-01'}},true,'handleSubmission'],[{trip:{id:'hidden-acres-2026-09-16'}},true,'handleHiddenAcres_'],[{waiverType:'hs-super1-lunch'},true,'handleWaiverSubmission_'],[{formType:'hs-lunch-opt-out'},true,'handleLunchOptOut_'],[{action:'hiddenAcresConfig'},false,'hiddenAcresConfig_'],[{action:'hiddenAcresStatus'},false,'hiddenAcresStatus_'],[{action:'lunchOptOutConfig'},false,'lunchOptOutConfig_'],[{action:'silverwoodRoster'},false,'silverwoodRoster_']])assert.equal(h.call(input,method).handler,expected);
  names.forEach(name=>h.ctx[name]=originals[name]);assert.equal(h.outbox.length,0);
});
check('Pumpkin recovery error does not stop the existing Hidden Acres sweep',()=>{const original=h.ctx.reconcilePumpkinPayments;h.ctx.reconcilePumpkinPayments=()=>{throw Error('Temporary pumpkin issue');};assert.doesNotThrow(()=>h.ctx.reconcileHiddenAcresPayments());h.ctx.reconcilePumpkinPayments=original;});
console.log(`${checks} isolated backend checks passed. No external requests, charges, mail or production records.`);

export {harness};
