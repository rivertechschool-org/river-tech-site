import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const format=createRequire(import.meta.url)('../../assets/js/family-fair-format.js');

test('short single-paragraph introductions allow five sentences and reject six',()=>{
 for(const text of ['We make gifts. Ask about colors! Can we help? Call us. Thank you.', 'We make gifts. Ask about colors! Can we help? Call us. Thank you', 'We make gifts... Ask us about colors!'])assert.equal(format.description(text).error,'',text);
 assert.match(format.description('One. Two. Three. Four. Five. Six.').error,/five sentences/);
 assert.match(format.description('One. Two. Three. Four. Five. Six').error,/five sentences/);
 for(const text of ['A first paragraph.\nAnother one.', 'Line one.\r\nLine two.', 'First\u2028Second', 'First\u2029Second'])assert.match(format.description(text).error,/one paragraph/);
 assert.equal(format.description('x'.repeat(300)).error,'');assert.match(format.description('x'.repeat(301)).error,/300/);
});

test('sentence limit handles ordinary abbreviations, websites, decimals and closing quotes',()=>{
 assert.equal(format.description('Dr. Green tutors. Visit example.com. Lessons cost $12.50. Call us! We would love to help.').sentences,5);
 assert.equal(format.description('We make U.S. flags. See https://example.test/help?q=flags. Ask us!').sentences,3);
 assert.equal(format.description('“One.” Two! Three? Four. Five. Six.').sentences,6);
});

test('square crops stay inside landscape, portrait and square images at all positions',()=>{
 for(const [w,h] of [[800,500],[500,800],[500,500],[1,1000]])for(const zoom of [1,1.5,3])for(const x of [0,50,100])for(const y of [0,50,100]){
  const c=format.crop(w,h,zoom,x,y);assert(c.size>0);assert(c.x>=0&&c.y>=0);assert(c.x+c.size<=w+1e-9);assert(c.y+c.size<=h+1e-9);
 }
 assert.deepEqual(format.crop(800,500),{x:150,y:0,size:500});
 assert.deepEqual(format.crop(500,800),{x:0,y:150,size:500});
 assert.deepEqual(format.crop(500,500),{x:0,y:0,size:500});
 assert.throws(()=>format.crop(0,500));
});
