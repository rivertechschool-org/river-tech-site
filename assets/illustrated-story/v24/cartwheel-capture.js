// CMU 90_04. One performer, one continuous take, one camera and one global mirror.
// No reordered poses or independently repositioned drawings.
const mix=(a,b,t)=>a+(b-a)*t, lerp=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const len=v=>Math.hypot(...v),norm=v=>v.map(x=>x/(len(v)||1)),times=(v,k)=>v.map(x=>x*k);
export async function loadCapture(){
 const [data,img]=await Promise.all([fetch('motion-source/90_04-cartwheel.json').then(r=>{if(!r.ok)throw Error('Motion could not load');return r.json()}),new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src='assets/boy-mocap-parts-white-v10.png'})]);
 return prepareCapture(data,img);
}
export function prepareCapture(data,img){
 // Suppress small optical tracking jitters over a 67ms window. The root is retained.
 const weights=[1,4,7,10,12,10,7,4,1],sum=weights.reduce((a,b)=>a+b,0);
 const frames=data.frames.map((f,i)=>f.map((p,k)=>k===0?p:p.map((v,axis)=>weights.reduce((s,w,j)=>s+w*data.frames[Math.max(0,Math.min(data.frames.length-1,i+j-4))][k][axis],0)/sum)));
 return {data:{...data,frames},img,index:Object.fromEntries(data.names.map((n,i)=>[n,i]))};
}
export function sampleCapture(capture,frame){
 const {data,index}=capture,i=Math.max(0,Math.min(data.frames.length-1,frame-(data.sourceFrameStart||0))),a=Math.floor(i),b=Math.min(a+1,data.frames.length-1);
 const p=Object.fromEntries(Object.entries(index).map(([n,k])=>[n,lerp(data.frames[a][k],data.frames[b][k],i-a)]));
 // Hands were not captured: extend the captured wrist along the forearm to a palm.
 for(const s of ['Left','Right'])p[s+'Palm']=add(p[s+'Hand'],times(norm(sub(p[s+'Hand'],p[s+'ForeArm'])),1.65));
 const floor=Math.min(...['Left','Right'].flatMap(s=>[p[s+'Foot'][1]-1.0,p[s+'ToeBaseEnd'][1]-.25,p[s+'Palm'][1]]));
 return {p,floor};
}

export function drawCapture(ctx,capture,frame,{x=0,ground=0,scale=10,outline=false}={}){
 const sampled=sampleCapture(capture,frame),p=sampled.p,last=capture.data.frames[600-(capture.data.sourceFrameStart||0)][0];
 const support=Math.max(0,Math.min(1,(Math.min(p.LeftFoot[1],p.RightFoot[1])-3)/5));
 const floor=sampled.floor+support*1.2;
 const pt=n=>[x-(p[n][2]-last[2])*scale,ground-(p[n][1]-floor)*scale];
 const P=Object.fromEntries(Object.keys(p).map(n=>[n,pt(n)]));
 // Retarget the captured hand contacts to the illustrated character's hand size.
 // The hips retain the take's unmodified lateral trajectory.
 function contactWeight(start,end){const f=Math.max(0,Math.min(1,Math.min((frame-start)/16,(end-frame)/16)));return f*f*(3-2*f)}
 function plant(s,start,end,z){
  const weight=contactWeight(start,end);if(!weight)return;
  const oldElbow=P[s+'ForeArm'];
  const wrist=lerp(P[s+'Hand'],[x-(z-last[2])*scale,ground-scale],weight);
  // Share the small contact offset with the elbow while retaining its captured bend.
  P[s+'ForeArm']=add(oldElbow,times(sub(wrist,P[s+'Hand']),.5));P[s+'Hand']=wrist;
  P[s+'Palm']=lerp(P[s+'Palm'],[wrist[0]-scale*1.65,ground],weight);
 }
 plant('Left',413,486,-8.6);plant('Right',445,530,5.15);
 const img=capture.img;
 function part(rect,sa,sb,a,b,width,clip){
  const src=sub(sb,sa),dst=sub(b,a),ys=len(dst)/len(src),xs=width*scale/rect[2];
  const angle=Math.atan2(dst[1],dst[0])-Math.atan2(src[1],src[0]);
  ctx.save();ctx.translate(...a);ctx.rotate(angle);ctx.scale(xs,ys);ctx.translate(-sa[0],-sa[1]);
  if(clip){ctx.beginPath();clip.forEach((q,i)=>i?ctx.lineTo(...q):ctx.moveTo(...q));ctx.closePath();ctx.clip()}
  ctx.drawImage(img,...rect,...rect);ctx.restore();
 }
 function limb(s){
  const left=s==='Left',u=left?0:350;
  part([175+u,642,112,316],[230+u,678],[230+u,928],P[s+'UpLeg'],P[s+'Leg'],3.0);
  const c=left?0:337;
  part([897+c,681,93,202],[945+c,709],[945+c,862],P[s+'Leg'],P[s+'Foot'],2.15);
  // Shoes follow the recorded ankle and toe orientation, not a global body spin.
  const rect=left?[824,851,164,132]:[1225,853,165,130];
  const sa=left?[947,887]:[1269,887],sb=left?[850,951]:[1372,951];
  const a=P[s+'Foot'],b=P[s+'ToeBaseEnd'],src=sub(sb,sa),dst=sub(b,a),sc=len(dst)/len(src);
  ctx.save();ctx.translate(...a);ctx.rotate(Math.atan2(dst[1],dst[0])-Math.atan2(src[1],src[0]));ctx.scale(sc,sc);ctx.translate(-sa[0],-sa[1]);ctx.drawImage(img,...rect,...rect);ctx.restore();
 }
 function arm(s){
  const left=s==='Left',u=left?0:359;
  part([182+u,379,90,242],[225+u,411],[232+u,599],P[s+'Arm'],P[s+'ForeArm'],1.85);
  const c=left?0:341;
  part([901+c,402,72,183],[938+c,424],[937+c,577],P[s+'ForeArm'],P[s+'Hand'],1.45);
  part([902+c,566,72,109],[937+c,578],[941+c,652],P[s+'Hand'],P[s+'Palm'],1.35);
 }
 ctx.save();ctx.globalCompositeOperation='darken';
 // Draw the farther limbs first. A whole side retains its depth order through a joint.
 const order=['Left','Right'].sort((a,b)=>p[a+'UpLeg'][0]-p[b+'UpLeg'][0]);
 for(const s of order)limb(s);
 for(const s of ['Left','Right'].sort((a,b)=>p[a+'Arm'][0]-p[b+'Arm'][0]))arm(s);
 const shoulder=lerp(P.LeftArm,P.RightArm,.5),hip=lerp(P.LeftUpLeg,P.RightUpLeg,.5),down=norm(sub(hip,shoulder)),right=[down[1],-down[0]];
 const sw=Math.abs(sub(P.RightArm,P.LeftArm).reduce((sum,v,i)=>sum+v*right[i],0))/scale;
 const width=Math.max(4.0,Math.min(9.2,sw*1.42));
 part([811,30,287,352],[952,92],[949,352],shoulder,hip,width,[[845,91],[894,34],[1003,34],[1057,91],[1036,191],[1044,382],[850,382],[866,190]]);
 // The head pivots on the captured neck; clothing and identity remain one drawing.
 const head=add(P.Neck1,times(norm(sub(P.HeadEnd,P.Neck1)),3.0*scale));
 part([104,24,231,319],[235,311],[223,165],P.Neck1,head,4.35,[[104,24],[335,24],[335,277],[291,300],[271,330],[194,330],[179,297],[104,277]]);
 ctx.restore();
 if(outline){
  ctx.save();ctx.strokeStyle='#18678e';ctx.lineWidth=1.3;ctx.globalAlpha=.7;
  for(const s of ['Left','Right'])for(const [a,b] of [[s+'Arm',s+'ForeArm'],[s+'ForeArm',s+'Hand'],[s+'UpLeg',s+'Leg'],[s+'Leg',s+'Foot']]){ctx.beginPath();ctx.moveTo(...P[a]);ctx.lineTo(...P[b]);ctx.stroke()}
  ctx.restore();
 }
 return P;
}
