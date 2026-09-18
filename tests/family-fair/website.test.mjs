import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {harness,listing,save} from './harness.mjs';
const format=createRequire(import.meta.url)('../../assets/js/family-fair-format.js');

test('website field accepts bare domains, www, complete URLs and an optional blank',()=>{
 for(const [input,url] of [
  ['rivertechschool.com','https://rivertechschool.com'],
  [' www.rivertechschool.com ','https://www.rivertechschool.com'],
  ['https://rivertechschool.com','https://rivertechschool.com'],
  ['http://example.com/portfolio?type=video#work','https://example.com/portfolio?type=video#work'],
  ['HTTPS://Example.com','https://Example.com'],
  ['example.com:443/work','https://example.com:443/work'],
  ['   ','']
 ])assert.deepEqual(format.website(input),{url,error:''});
 for(const input of ['not a website','example','javascript:alert(1)','ftp://example.com','https://example.com@evil.test','example.com/with space','example.com/"bad','example.com/\\bad','example.com:8080','example.com/'+'a'.repeat(290)])assert.notEqual(format.website(input).error,'',input);
});

test('normalized websites survive saving, approval and public read through the unchanged backend',()=>{
 const h=harness(),p=h.signIn(),a=h.signIn('reviewer@example.test','admin');
 for(const input of ['rivertechschool.com','www.rivertechschool.com','https://example.com/portfolio?q=video#work','']){
  const website=format.website(input).url;
  const saved=h.call(save(p,{listing:listing({kind:'parent',name:'Test Parent',contactEmail:p.email,website})}));
  assert.equal(saved.ok,true,JSON.stringify(saved));
  const record=saved.data.listing;
  assert.equal(record.website,website);
  assert.equal(record.status,'pending');
  assert(!h.call({action:'list'},false).data.listings.some(l=>l.id===record.id));
  assert.equal(h.call({action:'review',token:a.token,id:record.id,version:record.version,decision:'approved'}).ok,true);
  assert.equal(h.call({action:'list'},false).data.listings.find(l=>l.id===record.id).website,website);
 }
});
