import {prepareCapture,sampleCapture} from './cartwheel-capture.js?v=10.1';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(v,k)=>v.map(x=>x*k);
const length=v=>Math.hypot(...v),unit=v=>mul(v,1/(length(v)||1)),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),clamp=x=>Math.max(0,Math.min(1,x));
const normal=v=>[-v[1],v[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),ease=x=>{x=clamp(x);return x*x*(3-2*x)};
const image=src=>new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(Error('Could not load '+src));i.src=src});

// These are drawing landmarks on a single connected character, not separate pose cells.
export const R={Hips:[516,750],Neck1:[520,306],Head:[518,176],
 LeftArm:[405,380],LeftForeArm:[298,548],LeftHand:[223,690],LeftPalm:[174,794],
 RightArm:[635,380],RightForeArm:[737,548],RightHand:[807,690],RightPalm:[863,794],
 LeftUpLeg:[450,775],LeftLeg:[427,1020],LeftFoot:[398,1304],LeftToeBaseEnd:[349,1395],
 RightUpLeg:[581,775],RightLeg:[609,1020],RightFoot:[646,1304],RightToeBaseEnd:[691,1395]};

export async function loadRestored(){
 const [data,body]=await Promise.all([fetch('motion-source/90_04-cartwheel.json').then(r=>{if(!r.ok)throw Error('Could not load the cartwheel');return r.json()}),image('assets/story-v14/boy-pose-v11.webp')]);
 return {capture:prepareCapture(data,body),body,renderer:new PencilRenderer(body)};
}

// Keep the accepted recording and its frame numbers. Retarget limb lengths to the drawing.
export function restoredPose(capture,frame,x,ground,scale){
 const sampled=sampleCapture(capture,frame),p=sampled.p,last=capture.data.frames[600-capture.data.sourceFrameStart][0];
 const support=clamp((Math.min(p.LeftFoot[1],p.RightFoot[1])-3)/5),floor=sampled.floor+support*1.2;
 const old=Object.fromEntries(Object.entries(p).map(([n,v])=>[n,[x-(v[2]-last[2])*scale,ground-(v[1]-floor)*scale]]));
 const pixelScale=scale*28.6/1350,P={Hips:old.Hips.slice()};
 // Copy the performer's directions, but take EVERY body length from this drawing.
 // The drawing's torso and head are rigid shapes, with no independent X/Y squeeze.
 const rd=unit(sub(R.Hips,R.Neck1)),rn=[rd[1],-rd[0]],down=unit(sub(old.Hips,old.Neck1)),right=[down[1],-down[0]];
 const local=(v)=>add(mul(right,dot(v,rn)*pixelScale),mul(down,dot(v,rd)*pixelScale));
 P.Neck1=add(P.Hips,local(sub(R.Neck1,R.Hips)));
 const follow=(a,b)=>add(P[a],mul(unit(sub(old[b],old[a])),length(sub(R[b],R[a]))*pixelScale));
 for(const s of ['Left','Right']){
  P[s+'Arm']=add(P.Neck1,local(sub(R[s+'Arm'],R.Neck1)));
  P[s+'ForeArm']=follow(s+'Arm',s+'ForeArm');P[s+'Hand']=follow(s+'ForeArm',s+'Hand');P[s+'Palm']=follow(s+'Hand',s+'Palm');
  P[s+'UpLeg']=add(P.Hips,local(sub(R[s+'UpLeg'],R.Hips)));
  P[s+'Leg']=follow(s+'UpLeg',s+'Leg');P[s+'Foot']=follow(s+'Leg',s+'Foot');P[s+'ToeBaseEnd']=follow(s+'Foot',s+'ToeBaseEnd');
 }
 const lowBefore=Math.max(...['Left','Right'].flatMap(s=>[old[s+'Foot'][1]+scale,old[s+'ToeBaseEnd'][1]+scale*.25,old[s+'Palm'][1]]));
 const lowAfter=Math.max(...['Left','Right'].flatMap(s=>[P[s+'Foot'][1]+scale,P[s+'ToeBaseEnd'][1]+scale*.25,P[s+'Palm'][1]]));
 for(const n of Object.keys(P))P[n][1]+=lowBefore-lowAfter;
 function plant(s,start,end,z){
  const w=ease(Math.min((frame-start)/16,(end-frame)/16));if(!w)return;
  const wrist=mix(P[s+'Hand'],[x-(z-last[2])*scale,ground-scale],w);
  P[s+'ForeArm']=add(P[s+'ForeArm'],mul(sub(wrist,P[s+'Hand']),.5));P[s+'Hand']=wrist;
  P[s+'Palm']=mix(P[s+'Palm'],[wrist[0]-scale*1.65,ground],w);
 }
 plant('Left',413,486,-8.6);plant('Right',445,530,5.15);
 // The source shoes face the viewer. A side-camera toe vector cannot describe
 // their rotation: it can turn a front-facing sneaker sideways or upside down.
 // Follow the shin instead, with a small bounded ankle adjustment near the floor.
 for(const s of ['Left','Right']){
  const f=P[s+'Foot'],rest=sub(R[s+'ToeBaseEnd'],R[s+'Foot']);
  const grounded=ease((3.7*scale-(ground-f[1]))/(2.3*scale));
  f[1]+=(ground-116*pixelScale-f[1])*grounded;
  const shin=sub(f,P[s+'Leg']),sourceShin=sub(R[s+'Foot'],R[s+'Leg']);
  let rotation=Math.atan2(shin[1],shin[0])-Math.atan2(sourceShin[1],sourceShin[0]);
  rotation=Math.atan2(Math.sin(rotation),Math.cos(rotation));
  rotation-=Math.max(-Math.PI/7,Math.min(Math.PI/7,rotation))*grounded;
  const angle=Math.atan2(rest[1],rest[0])+rotation;
  P[s+'ToeBaseEnd']=add(f,mul([Math.cos(angle),Math.sin(angle)],length(rest)*pixelScale));
 }
 P.Head=add(P.Neck1,mul(unit(sub(old.HeadEnd,old.Neck1)),length(sub(R.Head,R.Neck1))*pixelScale));
 return {P,p};
}

export function referencePose(x,ground,scale){
 const k=scale*28.6/1350;
 return Object.fromEntries(Object.entries(R).map(([n,v])=>[n,[x+(v[0]-516)*k,ground+(v[1]-1420)*k]]));
}

// A modest triangle mesh bends the intact sleeves and jeans across each joint.
// Texture coordinates never change, so every frame retains the same pencil marks.
class PencilRenderer{
 constructor(body){
  this.canvas=document.createElement('canvas');this.gl=this.canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true});
  if(!this.gl)throw Error('This illustration preview needs WebGL.');
  const gl=this.gl;
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
  const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 a_position;attribute vec2 a_uv;uniform vec2 u_size;varying vec2 v_uv;void main(){gl_Position=vec4(a_position/u_size*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);v_uv=a_uv;}'));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 v_uv;uniform sampler2D u_image;void main(){vec3 c=texture2D(u_image,v_uv).rgb;float ink=1.-min(c.r,min(c.g,c.b));float a=max(ink,smoothstep(.002,.035,ink));vec3 rgb=clamp((c-vec3(1.-a))/max(a,.001),0.,1.);gl_FragColor=vec4(rgb,a);}'));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  this.program=program;this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  for(const [name,offset]of[['a_position',0],['a_uv',8]]){const l=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,2,gl.FLOAT,false,16,offset)}
  this.size=gl.getUniformLocation(program,'u_size');
  this.textures=[body].map(img=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);return t});
  gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  this.dimensions=[[body.width,body.height]];
 }
 begin(w,h){const gl=this.gl,dpr=Math.min(2,devicePixelRatio||1),pw=Math.round(w*dpr),ph=Math.round(h*dpr);if(this.canvas.width!==pw||this.canvas.height!==ph){this.canvas.width=pw;this.canvas.height=ph}gl.viewport(0,0,pw,ph);gl.uniform2f(this.size,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT)}
 mesh(points,triangles,transform,texture=0){
  const vertices=[],[w,h]=this.dimensions[texture];
  for(const i of triangles){const uv=points[i],q=transform(uv);vertices.push(q[0],q[1],uv[0]/w,uv[1]/h)}
  const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.textures[texture]);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices.length/4);
 }
 polygon(points,transform,texture=0){const center=points.reduce((a,b)=>add(a,mul(b,1/points.length)),[0,0]),all=[center,...points],tri=[];for(let i=1;i<all.length;i++)tri.push(0,i,i===all.length-1?1:i+1);this.mesh(all,tri,transform,texture)}
 strip(rows,transform){const tri=[];for(let r=0;r<rows.length-1;r++)for(let c=0;c<2;c++){const a=r*3+c,b=a+1,d=(r+1)*3+c,e=d+1;tri.push(a,d,b,b,d,e)}this.mesh(rows.flat(),tri,transform)}
}

export function boneMap(uv,a,b,P,pixelScale){
 const r0=R[a],r1=R[b],v=sub(r1,r0),dir=unit(v),n=normal(dir),local=sub(uv,r0);
 const target=sub(P[b],P[a]),tdir=unit(target),tn=normal(tdir);
 return add(P[a],add(mul(tdir,dot(local,dir)*length(target)/length(v)),mul(tn,dot(local,n)*pixelScale)));
}
function chainMap(uv,chain,P,pixelScale){
 const candidates=[];
 for(let i=0;i<chain.length-1;i++){
  const a=R[chain[i]],b=R[chain[i+1]],v=sub(b,a),t=clamp(dot(sub(uv,a),v)/dot(v,v)),near=add(a,mul(v,t));
  candidates.push({i,d:length(sub(uv,near))});
 }
 const nearest=candidates.reduce((a,b)=>a.d<b.d?a:b),i=nearest.i;
 let q=boneMap(uv,chain[i],chain[i+1],P,pixelScale);
 for(const joint of [i,i+1])if(joint>0&&joint<chain.length-1){
  const j=R[chain[joint]],before=unit(sub(j,R[chain[joint-1]])),after=unit(sub(R[chain[joint+1]],j)),axis=unit(add(before,after)),v=dot(sub(uv,j),axis),radius=38;
  if(Math.abs(v)<radius){const a=boneMap(uv,chain[joint-1],chain[joint],P,pixelScale),b=boneMap(uv,chain[joint],chain[joint+1],P,pixelScale);q=mix(a,b,ease((v+radius)/(radius*2)));break}
 }
 return q;
}

const rows=(left,center,right)=>left.map((p,i)=>[p,center[i],right[i]]);
// Include the full sleeve cap, from shoulder crest to underarm. The old first
// row was only a narrow triangle at the crest, which pinched when the arm rose.
const leftArm=rows([[367,318],[330,383],[298,447],[278,502],[252,549],[222,607],[192,677],[178,726],[147,778],[145,818]],[[388,390],[361,438],[342,472],[313,508],[298,548],[265,611],[226,685],[209,729],[185,775],[170,812]],[[400,468],[393,478],[387,496],[369,532],[345,577],[303,632],[253,710],[242,748],[210,802],[180,823]]);
const rightArm=leftArm.map(row=>row.map(([x,y])=>[1040-x,y]));
const leftLeg=rows([[390,716],[382,804],[375,903],[367,1007],[358,1125],[345,1244],[340,1288],[331,1340]],[[449,722],[449,804],[439,903],[429,1007],[417,1125],[405,1244],[398,1288],[395,1340]],[[512,716],[516,804],[498,903],[486,1007],[474,1125],[464,1244],[460,1288],[449,1340]]);
const rightLeg=leftLeg.map(row=>row.map(([x,y])=>[1034-x,y]));
const torso=[[460,280],[578,280],[674,322],[640,467],[642,591],[655,717],[516,720],[384,709],[393,589],[396,466],[367,322]];

export function drawRestored(ctx,art,frame,{x=255,ground=442,scale=10.5,w=1152,h=500,reference=false,pose=null}={}){
 const sampled=restoredPose(art.capture,frame,x,ground,scale),P=pose||(reference?referencePose(x,ground,scale):sampled.P),p=sampled.p,r=art.renderer,pixelScale=scale*28.6/1350;
 r.begin(w,h);
 const legOrder=['Left','Right'].sort((a,b)=>p[a+'UpLeg'][0]-p[b+'UpLeg'][0]);
 for(const s of legOrder){
  const leg=uv=>chainMap(uv,[s+'UpLeg',s+'Leg',s+'Foot'],P,pixelScale);
  const shoe=uv=>boneMap(uv,s+'Foot',s+'ToeBaseEnd',P,pixelScale);
  // Each sneaker is one rigid drawing. Only the trouser cuff blends into it;
  // no shoe vertices are assigned to competing knee/ankle/foot transforms.
  r.polygon(s==='Left'?[[346,1276],[453,1276],[452,1388],[409,1417],[299,1430],[292,1397],[323,1345]]:[[583,1276],[690,1276],[711,1345],[741,1397],[740,1430],[625,1417],[582,1388]],shoe);
  const cropped=(s==='Left'?leftLeg:rightLeg).slice(0,-1);
  r.strip(cropped,uv=>mix(leg(uv),shoe(uv),ease((uv[1]-1210)/78)));
 }
 const armOrder=['Left','Right'].sort((a,b)=>p[a+'Arm'][0]-p[b+'Arm'][0]);
 for(const s of armOrder)r.strip(s==='Left'?leftArm:rightArm,uv=>chainMap(uv,[s+'Arm',s+'ForeArm',s+'Hand',s+'Palm'],P,pixelScale));
 const torsoMap=uv=>boneMap(uv,'Neck1','Hips',P,pixelScale);
 for(const s of armOrder){
  // A stitched strip shares the sleeve edge with the torso; it closes the
  // gap as the arm turns without flattening the shoulder or bowing the chest.
  const seam=[[367,318],[388,390],[400,468]].map(([x,y])=>[s==='Left'?x:1040-x,y]),bridge=seam.flatMap(uv=>[uv.slice(),uv.slice()]);
  r.mesh(bridge,[0,1,2,1,3,2,2,3,4,3,5,4],uv=>bridge.indexOf(uv)%2?boneMap(uv,s+'Arm',s+'ForeArm',P,pixelScale):torsoMap(uv));
  const patch=[[400,410],[400,468],[387,496],[370,450]].map(([x,y])=>[s==='Left'?x:1040-x,y]);
  r.mesh(patch,[0,1,2,0,2,3],uv=>patch.indexOf(uv)<2?torsoMap(uv):boneMap(uv,s+'Arm',s+'ForeArm',P,pixelScale));
 }
 // A connected waist surface joins the trouser legs to the shirt through the split.
 const xs=[380,415,450,482,516,550,582,617,659],ys=[699,716,742,765,787,812,832],vertices=ys.flatMap(y=>xs.map(x=>[x,y])),tri=[];
 for(let row=0;row<ys.length-1;row++)for(let col=0;col<xs.length-1;col++){const a=row*xs.length+col,b=a+1,c=a+xs.length,d=c+1;tri.push(a,c,b,b,c,d)}
 r.mesh(vertices,tri,uv=>{
  const left=boneMap(uv,'LeftUpLeg','LeftLeg',P,pixelScale),right=boneMap(uv,'RightUpLeg','RightLeg',P,pixelScale),pants=mix(left,right,ease((uv[0]-451)/130));
  return mix(torsoMap(uv),pants,ease((uv[1]-706)/91));
 });
 r.polygon(torso,torsoMap);
 // Head, face and neck all come from the SAME drawing as the body.
 r.polygon([[406,44],[620,44],[620,242],[592,279],[586,328],[454,328],[445,282],[406,242]],uv=>boneMap(uv,'Neck1','Head',P,pixelScale));
 ctx.drawImage(r.canvas,0,0,w,h);
 return P;
}
