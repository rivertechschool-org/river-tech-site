import {DatabaseSync} from 'node:sqlite';
import {createHmac,randomUUID} from 'node:crypto';
const fail=(message,status=429)=>Object.assign(Error(message),{status});
const dateParts=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export class Limits {
 constructor(path,{monthlyUsd,dailyUsd,salt,concurrent=20,perMinute=5,perDay=20,clock=Date.now}={}){
  if(!Number.isFinite(monthlyUsd)||monthlyUsd<=0||!Number.isFinite(dailyUsd)||dailyUsd<=0||dailyUsd>monthlyUsd||typeof salt!=='string'||salt.length<32)throw Error('Explicit daily/monthly budgets and a private visitor salt are required.');
  for(const n of [concurrent,perMinute,perDay])if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid request limits');
  Object.assign(this,{monthly:Math.floor(monthlyUsd*1e6),daily:Math.floor(dailyUsd*1e6),salt,concurrent,perMinute,perDay,clock});
  this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS periods(id TEXT PRIMARY KEY,spent INTEGER NOT NULL DEFAULT 0 CHECK(spent>=0),reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0));
  CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY,day TEXT NOT NULL,month TEXT NOT NULL,amount INTEGER NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS leases(id TEXT PRIMARY KEY,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS visitors(id TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS reservation_age ON reservations(state,created);`);
 }
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 cleanup(now){
  this.db.prepare('DELETE FROM leases WHERE expires<?').run(now);
  this.db.prepare('DELETE FROM visitors WHERE expires<?').run(now);
  // A crashed/interrupted request keeps its maximum charge rather than resetting the cap.
  for(const row of this.db.prepare("SELECT * FROM reservations WHERE state='held' AND created<?").all(now-120000))this.charge(row,row.amount,'unknown');
 }
 admit(address){return this.tx(()=>{
  const now=this.clock();this.cleanup(now);
  if(this.db.prepare('SELECT count(*) AS n FROM leases').get().n>=this.concurrent)throw fail('The guide is busy right now. Please try again shortly.');
  const date=dateParts(now),identity=createHmac('sha256',this.salt).update(date+'|'+address).digest('hex');
  const buckets=[['m:'+Math.floor(now/60000)+':'+identity,this.perMinute,now+120000],['d:'+date+':'+identity,this.perDay,now+172800000]];
  for(const [id,max] of buckets)if((this.db.prepare('SELECT count FROM visitors WHERE id=?').get(id)?.count||0)>=max)throw fail('You’ve reached the question limit for now. Please use the Family Hub or try again later.');
  for(const [id,,expires] of buckets)this.db.prepare('INSERT INTO visitors VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1').run(id,expires);
  const lease={id:randomUUID(),day:'d:'+date,month:'m:'+date.slice(0,7)};this.db.prepare('INSERT INTO leases VALUES(?,?)').run(lease.id,now+110000);return lease;
 });}
 release(lease){this.db.prepare('DELETE FROM leases WHERE id=?').run(lease.id);}
 reserve(request,lease){return this.tx(()=>{
  this.cleanup(this.clock());
  const amount=Math.ceil((Buffer.byteLength(JSON.stringify(request))+2048)*12.5+request.max_output_tokens*50);
  for(const [period,cap] of [[lease.day,this.daily],[lease.month,this.monthly]]){
   this.db.prepare('INSERT OR IGNORE INTO periods(id) VALUES(?)').run(period);
   const row=this.db.prepare('SELECT * FROM periods WHERE id=?').get(period);
   if(row.spent+row.reserved+amount>cap)throw fail('The guide has reached its spending limit. Please use the Family Hub or email the school.');
  }
  for(const period of [lease.day,lease.month])this.db.prepare('UPDATE periods SET reserved=reserved+? WHERE id=?').run(amount,period);
  const id=randomUUID();this.db.prepare('INSERT INTO reservations VALUES(?,?,?,?,?,?)').run(id,lease.day,lease.month,amount,'held',this.clock());return id;
 });}
 charge(row,amount,state){
  for(const period of [row.day,row.month])this.db.prepare('UPDATE periods SET reserved=reserved-?,spent=spent+? WHERE id=?').run(row.amount,amount,period);
  this.db.prepare('UPDATE reservations SET state=? WHERE id=?').run(state,row.id);
 }
 settle(id,tokens){return this.tx(()=>{
  const row=this.db.prepare('SELECT * FROM reservations WHERE id=?').get(id);if(!row||row.state!=='held')return;
  const valid=tokens&&Number.isSafeInteger(tokens.input_tokens)&&tokens.input_tokens>=0&&Number.isSafeInteger(tokens.output_tokens)&&tokens.output_tokens>=0;
  const amount=valid?Math.ceil(tokens.input_tokens*12.5+tokens.output_tokens*50):row.amount;
  // Keep the reservation if the provider reports an unexpected amount; fail closed.
  if(amount>row.amount)throw fail('The guide’s usage needs review. Please use the Family Hub.',503);
  this.charge(row,amount,valid?'settled':'unknown');
 });}
 snapshot(){return this.db.prepare('SELECT * FROM periods ORDER BY id').all();}
 close(){this.db.close();}
}
