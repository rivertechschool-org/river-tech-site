import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {harness,listing,save} from './harness.mjs';
const ok=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result.data;};
const fail=(result,code)=>{assert.equal(result.ok,false);if(code)assert.equal(result.code,code);};

test('complete listing lifecycle: verify, pending, review, public, edit, reapprove, remove',()=>{
 const h=harness(),p=h.signIn(),a=h.signIn('reviewer@example.test','admin');
 const record=ok(h.call(save(p))).listing;
 assert.equal(record.status,'pending');assert.equal(record.contactEmail,p.email);assert.equal(record.contactPhone,'');assert.equal(record.website,'');
 assert.equal(ok(h.call({action:'list'},false)).listings.length,0);
 fail(h.call({action:'review',token:p.token,id:record.id,version:1,decision:'approved'}),'AUTH');
 assert.equal(ok(h.call({action:'reviewList',token:a.token})).listings.length,1);
 ok(h.call({action:'review',token:a.token,id:record.id,version:1,decision:'approved'}));
 const published=ok(h.call({action:'list'},false)).listings;assert.equal(published.length,1);
 for(const privateKey of ['owner','ownerEmail','version','status','reviewer','consentAt','photo','requestId','token'])assert.equal(privateKey in published[0],false);
 assert.equal(JSON.stringify(published).includes('NEVER RETURN'),false);
 const edit=save(p,{id:record.id,version:2,listing:listing({description:'Updated description'})});
 const edited=ok(h.call(edit)).listing;assert.equal(edited.status,'pending');assert.equal(edited.version,3);
 assert.equal(ok(h.call(edit)).listing.id,record.id); // lost-response retry
 assert.equal(ok(h.call({action:'list'},false)).listings.length,0);
 fail(h.call({action:'review',token:a.token,id:record.id,version:2,decision:'approved'}),'CONFLICT');
 ok(h.call({action:'review',token:a.token,id:record.id,version:3,decision:'approved'}));
 ok(h.call({action:'remove',token:p.token,id:record.id,version:4}));
 assert.equal(ok(h.call({action:'list'},false)).listings.length,0);
 assert.equal(ok(h.call({action:'mine',token:p.token})).listings.length,0);
 assert(h.writes.every(w=>w.name==='Listings'));
 assert(h.reads.filter(r=>r.name==='Register'&&r.r>1).every(r=>r.m===1&&[2,3,4].includes(r.c)));
});

test('both parent columns, exact normalized emails and current enrollment only',()=>{
 const h=harness();ok(h.call({action:'requestCode',email:'  SECOND@EXAMPLE.TEST '}));assert.equal(h.outbox.at(-1).to,'second@example.test');
 for(const email of ['withdrawn@example.test','waiting@example.test','declined@example.test','blank@example.test','stranger@example.test','parent+other@example.test']){
  const n=h.outbox.length;ok(h.call({action:'requestCode',email}));assert.equal(h.outbox.length,n);
 }
 assert(h.signIn('other@example.test').token);
 const generic=h.call({action:'requestCode',email:'absent@example.test'});
 assert.deepEqual(generic,h.call({action:'requestCode',email:'parent@example.test'}));
});

test('one-time code expiration, replay, attempt lockout, cooldown and hashed state',()=>{
 const h=harness();h.call({action:'requestCode',email:'parent@example.test'});const code=h.outbox[0].body.match(/\b\d{8}\b/)[0];
 assert(![...h.props.values()].some(v=>v.includes(code)));
 h.call({action:'requestCode',email:'parent@example.test'});assert.equal(h.outbox.length,1);
 for(let i=0;i<5;i++)fail(h.call({action:'verifyCode',email:'parent@example.test',code:'wrong'}),'CODE');
 fail(h.call({action:'verifyCode',email:'parent@example.test',code}),'CODE');
 h.advance(61000);h.call({action:'requestCode',email:'parent@example.test'});const newer=h.outbox.at(-1).body.match(/\b\d{8}\b/)[0];
 fail(h.call({action:'verifyCode',email:'parent@example.test',code}),'CODE');
 ok(h.call({action:'verifyCode',email:'parent@example.test',code:newer}));fail(h.call({action:'verifyCode',email:'parent@example.test',code:newer}),'CODE');
 h.advance(61000);h.call({action:'requestCode',email:'parent@example.test'});const expired=h.outbox.at(-1).body.match(/\b\d{8}\b/)[0];h.advance(600001);fail(h.call({action:'verifyCode',email:'parent@example.test',code:expired}),'CODE');
});

test('persistent email and global send limits',()=>{
 const h=harness();for(let i=0;i<10;i++){h.call({action:'requestCode',email:'parent@example.test'});h.advance(61000);}assert.equal(h.outbox.length,5);
 const x=harness();for(let i=0;i<80;i++)x.call({action:'requestCode',email:'stranger'+i+'@example.test'});x.call({action:'requestCode',email:'parent@example.test'});assert.equal(x.outbox.length,0);
});

test('ownership, admin allowlist, logout and session expiry are enforced server-side',()=>{
 const h=harness(),p=h.signIn(),q=h.signIn('other@example.test'),r=ok(h.call(save(p))).listing;
 for(const action of ['remove','privatePhoto'])fail(h.call({action,token:q.token,id:r.id,version:1}),'NOT_FOUND');
 fail(h.call(save(q,{id:r.id,version:1})),'NOT_FOUND');fail(h.call({action:'reviewList',token:p.token}),'AUTH');
 h.call({action:'requestCode',email:'parent@example.test',purpose:'admin'});assert(!h.outbox.some(m=>m.to===p.email&&m.body.includes('admin')));
 const admin=h.signIn('reviewer@example.test','admin');h.props.set('ADMIN_EMAILS','replacement@example.test');fail(h.call({action:'reviewList',token:admin.token}),'AUTH');
 ok(h.call({action:'logout',token:p.token}));fail(h.call({action:'mine',token:p.token}),'AUTH');
 h.advance(8*3600000+1);fail(h.call({action:'mine',token:q.token}),'AUTH');
});

test('withdrawal hides published listings and revokes write and approval access',()=>{
 const h=harness(),p=h.signIn(),a=h.signIn('reviewer@example.test','admin'),r=ok(h.call(save(p))).listing;
 ok(h.call({action:'review',token:a.token,id:r.id,version:1,decision:'approved'}));h.register[1][2]='Withdrawn';
 assert.equal(ok(h.call({action:'list'},false)).listings.length,0);fail(h.call({action:'mine',token:p.token}),'AUTH');
 fail(h.call({action:'review',token:a.token,id:r.id,version:2,decision:'approved'}),'INVALID');
});

test('consent, student first name, lengths, URLs, category and image type are validated',()=>{
 const h=harness(),p=h.signIn();
 for(const change of [{consent:false},{name:'First Last'},{title:'x'.repeat(81)},{description:''},{category:'Unknown'},{kind:'staff'},{kind:'parent',website:'javascript:alert(1)'},{kind:'parent',website:'https://example.test@evil.test'},{kind:'parent',contactEmail:'bad'}])fail(h.call(save(p,{listing:listing(change)})),'INVALID');
 fail(h.call(save(p,{photo:'data:image/svg+xml;base64,PHN2Zz4='})),'INVALID');
 fail(h.call(save(p,{photo:'data:image/jpeg;base64,ZmFrZQ=='})),'INVALID');
 fail(h.call(save(p,{photo:'data:image/jpeg;base64,'+'A'.repeat(180000)})),'INVALID');
});

test('duplicates, conflicts, limit, decline note and literal text storage',()=>{
 const h=harness(),p=h.signIn(),a=h.signIn('reviewer@example.test','admin'),req=save(p,{listing:listing({title:'=IMPORTXML("https://example.test")',description:'<script>alert(1)</script>'})});
 const r=ok(h.call(req)).listing;assert.equal(ok(h.call(req)).listing.id,r.id);assert.equal(h.records.length,2);
 fail(h.call({...req,listing:listing({title:'Changed'})}),'CONFLICT');
 ok(h.call({action:'review',token:a.token,id:r.id,version:1,decision:'rejected',note:'=Please use a clear title'}));
 assert.equal(ok(h.call({action:'mine',token:p.token})).listings[0].reviewNote,'=Please use a clear title');
 for(let i=0;i<7;i++)ok(h.call(save(p)));fail(h.call(save(p)),'LIMIT');
 assert(h.records.slice(1).flat().filter(x=>typeof x==='string').every(x=>!x.startsWith('=')));
});

test('GET cannot send email, verify, mutate or return private views; configuration fails closed',()=>{
 const h=harness();for(const action of ['requestCode','verifyCode','save','remove','review','reviewList','mine','privatePhoto','logout'])fail(h.call({action},false),'METHOD');
 h.props.delete('AUTH_SECRET');fail(h.call({action:'list'},false),'UNAVAILABLE');
 assert.equal(JSON.parse(h.ctx.doPost({postData:{contents:'not json'}}).value).code,'INVALID');
});

test('private photos, approved-only delivery, EXIF removal, ownership and cleanup',async()=>{
 const {readFileSync}=await import('node:fs');const raw=readFileSync(new URL('./square.jpg',import.meta.url));
 const exif=Buffer.from('Exif\0\0GPS PRIVATE LOCATION');const app1=Buffer.concat([Buffer.from([255,225,0,exif.length+2]),exif]);
 const uploaded='data:image/jpeg;base64,'+Buffer.concat([raw.subarray(0,2),app1,raw.subarray(2)]).toString('base64');
 const h=harness(),p=h.signIn(),q=h.signIn('other@example.test'),a=h.signIn('reviewer@example.test','admin');
 const r=ok(h.call(save(p,{photo:uploaded}))).listing;assert.equal(r.hasPhoto,true);assert.equal(h.files.size,1);
 fail(h.call({action:'photo',id:r.id},false),'NOT_FOUND');fail(h.call({action:'privatePhoto',token:q.token,id:r.id}),'NOT_FOUND');
 assert(!Buffer.from(ok(h.call({action:'reviewPhoto',token:a.token,id:r.id})).photo.split(',')[1],'base64').includes(exif));
 ok(h.call({action:'review',token:a.token,id:r.id,version:1,decision:'approved'}));
 const photo=ok(h.call({action:'photo',id:r.id},false)).photo;assert(photo.startsWith('data:image/jpeg;base64,'));
 ok(h.call(save(p,{id:r.id,version:2,removePhoto:true})));assert([...h.files.values()].every(f=>f.trashed));
 fail(h.call({action:'photo',id:r.id},false),'NOT_FOUND');
});

test('service failures fail closed and ambiguous writes recover without losing photos',async()=>{
 const {readFileSync}=await import('node:fs');const photo='data:image/jpeg;base64,'+readFileSync(new URL('./square.jpg',import.meta.url)).toString('base64');
 const h=harness(),p=h.signIn(),request=save(p,{photo});
 h.ctx.SpreadsheetApp.flush=()=>{throw Error('provider internals and secrets');};
 const failure=h.call(request);fail(failure,'UNAVAILABLE');assert(!failure.error.includes('provider'));
 assert([...h.files.values()].every(f=>!f.trashed));h.ctx.SpreadsheetApp.flush=()=>{};
 assert.equal(ok(h.call(request)).listing.hasPhoto,true);assert.equal(h.records.length,2);assert.equal(h.files.size,1);
 h.register[0][1]='Missing second parent header';fail(h.call({action:'list'},false),'UNAVAILABLE');fail(h.call(save(p)),'UNAVAILABLE');
 const mail=harness();mail.ctx.MailApp.sendEmail=()=>{throw Error('private provider details');};
 ok(mail.call({action:'requestCode',email:'parent@example.test'}));assert(![...mail.props.keys()].some(k=>k.startsWith('otp:')));
 fail(mail.call({action:'verifyCode',email:'parent@example.test',code:'12345678'}),'CODE');
});

test('parent and administrator challenges cannot be exchanged or replayed across roles',()=>{
 const h=harness();h.props.set('ADMIN_EMAILS','parent@example.test');
 h.call({action:'requestCode',email:'parent@example.test',purpose:'parent'});const code=h.outbox.at(-1).body.match(/\b\d{8}\b/)[0];
 fail(h.call({action:'verifyCode',email:'parent@example.test',code,purpose:'admin'}),'CODE');
 const p=ok(h.call({action:'verifyCode',email:'parent@example.test',code,purpose:'parent'}));fail(h.call({action:'reviewList',token:p.token}),'AUTH');
 const a=h.signIn('parent@example.test','admin');fail(h.call(save(a)),'AUTH');
});

test('server enforces concise single-paragraph descriptions and square photos',async()=>{
 const {readFileSync}=await import('node:fs');const h=harness(),p=h.signIn();
 for(const description of ['One. Two. Three. Four. Five. Six.', 'First paragraph.\nSecond paragraph.', 'x'.repeat(301)])fail(h.call(save(p,{listing:listing({description})})),'INVALID');
 ok(h.call(save(p,{listing:listing({description:'One. Two. Three. Four. Five.'})})));
 const rectangular='data:image/jpeg;base64,'+readFileSync(new URL('./fixture.jpg',import.meta.url)).toString('base64');
 fail(h.call(save(p,{photo:rectangular})),'INVALID');assert.equal(h.files.size,0);
 const square='data:image/jpeg;base64,'+readFileSync(new URL('./square.jpg',import.meta.url)).toString('base64');
 assert.equal(ok(h.call(save(p,{photo:square}))).listing.hasPhoto,true);
});

test('verified staff can publish their own listing, with the same approval and photo privacy',async()=>{
 const {readFileSync}=await import('node:fs');
 const h=harness(),s=h.signIn('staff@example.test'),a=h.signIn('reviewer@example.test','admin');
 assert.equal(s.canPostStudent,false);assert.equal(h.signIn().canPostStudent,true);
 const photo='data:image/jpeg;base64,'+readFileSync(new URL('./square.jpg',import.meta.url)).toString('base64');
 const adult=listing({kind:'parent',name:'Test Video Studio',category:'Services',contactEmail:s.email});
 const r=ok(h.call(save(s,{listing:adult,photo}))).listing;
 assert.equal(r.status,'pending');assert.equal(ok(h.call({action:'list'},false)).listings.length,0);
 fail(h.call({action:'photo',id:r.id},false),'NOT_FOUND');fail(h.call({action:'reviewList',token:s.token}),'AUTH');
 fail(h.call(save(s)),'INVALID'); // staff status cannot stand in for parental approval
 ok(h.call({action:'review',token:a.token,id:r.id,version:1,decision:'approved'}));
 assert.equal(ok(h.call({action:'list'},false)).listings[0].name,adult.name);
 assert.equal(ok(h.call({action:'photo',id:r.id},false)).photo,photo);
 const edited=ok(h.call(save(s,{id:r.id,version:2,listing:{...adult,description:'An updated introduction.'}}))).listing;
 assert.equal(edited.status,'pending');assert.equal(ok(h.call({action:'list'},false)).listings.length,0);
 ok(h.call({action:'review',token:a.token,id:r.id,version:3,decision:'approved'}));
 ok(h.call({action:'remove',token:s.token,id:r.id,version:4}));assert([...h.files.values()].every(f=>f.trashed));
 assert(h.writes.every(w=>w.name==='Listings'));
});

test('staff allowlist is exact, normalized, private, optional, and grants no administrator rights',()=>{
 const h=harness();h.props.set('STAFF_EMAILS','  STAFF@EXAMPLE.TEST , malformed, ');
 const s=h.signIn('staff@example.test');assert(s.token);
 for(const [email,purpose] of [['stranger@example.test','parent'],['staff+alias@example.test','parent'],['staff@example.test','admin']]){
  const n=h.outbox.length;ok(h.call({action:'requestCode',email,purpose}));assert.equal(h.outbox.length,n);
 }
 h.props.delete('STAFF_EMAILS');fail(h.call({action:'mine',token:s.token}),'AUTH');assert(h.signIn().token);
 assert(!JSON.stringify(ok(h.call({action:'list'},false))).includes('staff@example.test'));
});

test('staff removal revokes existing codes and sessions, hides photos and blocks pending approval',async()=>{
 const {readFileSync}=await import('node:fs');const h=harness(),s=h.signIn('staff@example.test'),a=h.signIn('reviewer@example.test','admin');
 const adult=listing({kind:'parent',name:'A staff business',category:'Services'});
 const r=ok(h.call(save(s,{listing:adult,photo:'data:image/jpeg;base64,'+readFileSync(new URL('./square.jpg',import.meta.url)).toString('base64')}))).listing;
 ok(h.call({action:'review',token:a.token,id:r.id,version:1,decision:'approved'}));
 const pending=ok(h.call(save(s,{listing:adult}))).listing;
 h.advance(61000);ok(h.call({action:'requestCode',email:s.email}));const code=h.outbox.at(-1).body.match(/\b\d{8}\b/)[0];
 h.props.set('STAFF_EMAILS','');
 fail(h.call({action:'verifyCode',email:s.email,code}),'AUTH');fail(h.call(save(s,{listing:adult})),'AUTH');
 assert.equal(ok(h.call({action:'list'},false)).listings.length,0);fail(h.call({action:'photo',id:r.id},false),'NOT_FOUND');
 fail(h.call({action:'review',token:a.token,id:pending.id,version:1,decision:'approved'}),'INVALID');
});

test('staff who are also parents lose student-listing rights when their family leaves',()=>{
 const h=harness();h.props.set('STAFF_EMAILS','parent@example.test');
 const p=h.signIn(),a=h.signIn('reviewer@example.test','admin');assert.equal(p.canPostStudent,true);
 const child=ok(h.call(save(p))).listing,pendingChild=ok(h.call(save(p))).listing;
 const adult=ok(h.call(save(p,{listing:listing({kind:'parent',name:'Adult business',category:'Services'})}))).listing;
 for(const r of [child,adult])ok(h.call({action:'review',token:a.token,id:r.id,version:1,decision:'approved'}));
 h.register[1][2]='Withdrawn';assert.deepEqual(ok(h.call({action:'list'},false)).listings.map(r=>r.id),[adult.id]);
 fail(h.call(save(p)),'INVALID');fail(h.call({action:'review',token:a.token,id:pendingChild.id,version:1,decision:'approved'}),'INVALID');
 assert.equal(ok(h.call({action:'mine',token:p.token})).listings.length,3);
});
