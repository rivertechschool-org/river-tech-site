// Whole-figure exposures. No joints, width flips, interpolated faces or limbs.
import {paperSprite} from './paper-sprite.js';
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const ease=x=>(x=clamp(x),x*x*(3-2*x));
const image=async url=>{const i=new Image();i.src=url;await i.decode();return i};
const assets=new URL('./assets/',import.meta.url);
export async function loadCharacters(){
 const [v5,v6]=await Promise.all([5,6].map(v=>fetch(new URL(`performance-v${v}/registration.json`,assets)).then(r=>r.json())));
 const reg={...Object.fromEntries(Object.entries(v5).map(([k,v])=>['boy-'+k,v])),...v6},images={},pending={};
 async function ensure(names){await Promise.all([...new Set(names)].map(key=>{
  if(images[key])return;
  return pending[key]??=(async()=>{
   const source=await image(new URL(`performance-v${key in v6?6:5}/${key in v6?key:key.slice(4)}.webp`,assets));
   const matte=paperSprite(source),flat=document.createElement('canvas');
   flat.width=source.width;flat.height=source.height;flat.getContext('2d').drawImage(matte,0,0);
   matte.getContext('webgl').getExtension('WEBGL_lose_context')?.loseContext();
   images[key]=flat;
  })().catch(e=>{delete pending[key];throw e});
 }));}
 return {reg,images,ensure,all:()=>ensure(Object.keys(reg))};
}
export function drawCel(ctx,library,q,x,ground,height,facing=1){
 const group=library.reg[q.sheet],f=group.frames[q.i],k=height/group.bodyHeight;
 const anchor=f.contactAnchor??f.anchor;
 ctx.save();ctx.translate(x,ground-(q.lift||0)*height/270);ctx.scale(facing,1);
 ctx.globalCompositeOperation='source-over';
 ctx.drawImage(library.images[q.sheet],f.sx,f.sy,f.sw,f.sh,-anchor*k,-f.floor*k,f.sw*k,f.sh*k);
 ctx.restore();
}
function exposure(track,age){let q=track[0];for(const f of track)if(f[0]<=age)q=f;return {t:q[0],i:q[1]};}
const boyCycle=[['walk',4],['walk',5],['walk',6],['passing',0],['passing',1],['walk',8],['walk',9],['walk',10],['walk',11],['walk',12],['walk',13],['walk',14],['passing',4],['passing',5],['walk',0],['walk',1],['walk',2],['walk',3]];
const girlCycle=[4,5,6,7,8,9,10,11,12,13,14,15,0,1,2,3].map(i=>['walk',i]);

// Each authored walk has anticipation, complete strides, then a closing step.
// Root translation advances on the same exposure as the cel, including the
// last arrival drawing. This avoids drifting a held shoe along the floor.
export function walkCel(who,age,duration){
 const start=.34,end=.50,travel=Math.max(.01,duration-start-end),cycle=who==='boy'?boyCycle:girlCycle;
 const steps=Math.max(2,Math.round((duration-1)/.65));
 const count=Math.max(8,Math.round(steps*cycle.length/2)),dt=travel/count;
 if(age<start){const q=exposure([[0,5],[.12,6],[.25,7]],age);return {...q,sheet:who+'-acting',progress:.07*ease(q.t/start)};}
 if(age<duration-end){const n=Math.min(count-1,Math.floor((age-start)/dt)),[s,i]=cycle[n%cycle.length];return {sheet:who+'-'+s,i,t:start+n*dt,progress:.07+.85*n/count};}
 const q=exposure([[0,8],[.15,9],[.32,10],[.45,11]],age-duration+end);
 return {...q,sheet:who+'-acting',t:duration-end+q.t,progress:q.i===11?1:.92+.08*ease(q.t/.45)};
}

export function characterCel(who,a,age,duration){
 const kind=a.action.kind,acting=who+'-acting',book=who+'-book';
 if(kind==='walk')return walkCel(who,age,duration);
 if(kind==='turn'){
  // Turn through actual front / three-quarter / profile drawings. Reflection
  // changes sides at the front drawing; the silhouette is never squeezed.
  const q=exposure([[0,5],[.13,4],[.25,3],[.36,0],[.46,3],[.56,4],[.66,5]],age/duration*.7);
  return {...q,sheet:acting,facing:q.t<.36?a.action.fromFacing:a.action.toFacing};
 }
 if(kind==='draw'||kind==='read'){
  if(age<1.35&&!a.seated){const q=exposure([[0,0],[.18,1],[.38,2],[.68,kind==='draw'?3:8],[1.05,kind==='draw'?4:8]],age);return {...q,sheet:book,lift:who==='girl'?24*ease(q.t/.68):0};}
  // Brief pencil strokes, a considered pause, then another thought. Quiet
  // holds are intentional; there is no endlessly bobbing whole-body idle.
  const rhythm=(age-1.35+duration*.31)%(kind==='draw'?8.7:11.2);
  const q=kind==='draw'?exposure([[0,4],[.3,5],[.5,4],[.82,5],[1.05,4],[1.8,6],[3.9,4],[4.2,5],[4.5,4],[5.2,7],[7.1,6],[7.9,4]],rhythm):exposure([[0,8],[3.1,9],[6.3,8],[8.5,10],[10.5,8]],rhythm);
  return {...q,sheet:book,lift:who==='girl'?24:0};
 }
 if(kind==='rise'){
  const q=exposure([[0,10],[.14,2],[.32,11],[.58,1],[.79,0]],age/duration*.95);
  return {...q,sheet:book,lift:who==='girl'?24*(1-ease(q.t/.79)):0};
 }
 if(who==='boy'&&kind==='camera'){
  let q;
  if(age<1.6)q=exposure([[0,0],[.28,1],[.56,2],[.78,3],[1.0,4],[1.4,5]],age);
  else if(age>duration-1.1)q=exposure([[0,8],[.3,9],[.65,11]],age-duration+1.1);
  else q=exposure([[0,4],[1.2,5],[2.7,6],[4.4,7],[5.5,4],[6.4,3],[7.2,4]],(age-1.6)%8.7);
  return {...q,sheet:'boy-camera'};
 }
 if(who==='boy'&&kind==='notice'){
  const q=exposure([[0,8],[.16,9],[.4,10],[.75,11]],age);
  return {...q,sheet:'boy-camera'};
 }
 if(who==='boy'&&kind==='repair'){
  const q=exposure([[0,0],[.18,1],[.4,2],[.66,3],[.92,4],[1.2,5],[1.43,6],[1.65,7],[2.1,8],[2.8,9],[3.2,8],[4.1,9],[4.6,8],[5.4,10],[5.8,11],[6.9,10],[7.15,12],[7.4,13],[7.66,2],[7.89,1],[8.12,0]],age/duration*9);
  return {...q,sheet:'boy-repair'};
 }
 // Brief expressions are scheduled separately from the world's work choices.
 // Most of a listening / watching beat is a deliberate, planted drawing.
 const blink=(age+duration*.19)%7.3;
 const q=exposure([[0,11],[.55,1],[.7,2],[.82,3],[1.0,11]],blink);
 return {...q,sheet:acting};
}

// Visual stage marks can change without rewriting saved world positions.
const marks=new Map([[155,155],[405,455],[590,565],[650,650],[815,815]]);
export const stageX=x=>marks.get(x)??x;
export function actorPosition(who,a,t){
 const job=a.action;if(job.kind!=='walk')return stageX(a.x);
 const q=walkCel(who,clamp(t-job.start,0,job.end-job.start),job.end-job.start);
 return stageX(job.from)+(stageX(job.to)-stageX(job.from))*q.progress;
}
