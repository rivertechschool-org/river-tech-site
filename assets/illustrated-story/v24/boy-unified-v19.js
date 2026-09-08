import{prepareCapture}from'./cartwheel-capture.js?v=10.1';
import{R as Canonical,restoredPose}from'./boy-rig-v14.js?v=14.4';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(v,k)=>v.map(x=>x*k),length=v=>Math.hypot(...v),unit=v=>mul(v,1/(length(v)||1));
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x)},mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),dot=(a,b)=>a[0]*b[0]+a[1]*b[1],normal=v=>[-v[1],v[0]],rotate=(v,a)=>[v[0]*Math.cos(a)-v[1]*Math.sin(a),v[0]*Math.sin(a)+v[1]*Math.cos(a)];
export const T={Hips:[114,143],Neck1:[121,64],Head:[129,39],LeftArm:[96,83],LeftForeArm:[92,117],LeftHand:[94,142],LeftPalm:[98,161],RightArm:[137,82],RightForeArm:[138,115],RightHand:[141,140],RightPalm:[139,158],LeftUpLeg:[104,147],LeftLeg:[100,185],LeftFoot:[95,226],LeftToeBaseEnd:[94,244],RightUpLeg:[124,147],RightLeg:[124,184],RightFoot:[133,224],RightToeBaseEnd:[149,239]};
const image=src=>new Promise((ok,no)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>no(Error('Boy artwork could not load'));im.src=src});
export async function loadBoy(){const[data,body]=await Promise.all([fetch('motion-source/90_04-cartwheel.json').then(r=>r.json()),image('assets/story-v14/boy-launch-v8.webp')]);return{capture:prepareCapture(data,body),body,renderer:new PencilRenderer(body)}}
function mapBone(uv,a,b,P,k){const v=sub(T[b],T[a]),d=unit(v),n=normal(d),local=sub(uv,T[a]),target=sub(P[b],P[a]),td=unit(target);return add(P[a],add(mul(td,dot(local,d)*length(target)/length(v)),mul(normal(td),dot(local,n)*k)))}
function chain(uv,names,P,k){let nearest={distance:Infinity,index:0};for(let i=0;i<names.length-1;i++){const a=T[names[i]],v=sub(T[names[i+1]],a),u=clamp(dot(sub(uv,a),v)/dot(v,v)),distance=length(sub(uv,add(a,mul(v,u))));if(distance<nearest.distance)nearest={distance,index:i}}
 const i=nearest.index;let q=mapBone(uv,names[i],names[i+1],P,k);for(const j of[i,i+1])if(j>0&&j<names.length-1){const p=T[names[j]],axis=unit(add(unit(sub(p,T[names[j-1]])),unit(sub(T[names[j+1]],p)))),v=dot(sub(uv,p),axis);if(Math.abs(v)<5){q=mix(mapBone(uv,names[j-1],names[j],P,k),mapBone(uv,names[j],names[j+1],P,k),ease((v+5)/10));break}}return q}

// Retain the accepted cartwheel path and contact timing. Fit the exact rocket
// drawing to it; every later pose uses the same drawing and renderer.
export function cartwheelBoy(art,frame,{x,ground,height}){
 const scale=height/28.6,k=height/232,sample=restoredPose(art.capture,frame,x,ground,scale),old=sample.P,P=Object.fromEntries(Object.entries(old).map(([n,v])=>[n,v.slice()]));
 const map=uv=>{const v=sub(uv,T.Neck1),d=unit(sub(T.Hips,T.Neck1)),td=unit(sub(P.Hips,P.Neck1));return add(P.Neck1,add(mul(td,dot(v,d)*length(sub(P.Hips,P.Neck1))/length(sub(T.Hips,T.Neck1))),mul(normal(td),dot(v,normal(d))*k)))};
 for(const side of['Left','Right']){
  P[side+'Arm']=map(T[side+'Arm']);P[side+'UpLeg']=map(T[side+'UpLeg']);
  const cv=sub(Canonical[side+'ToeBaseEnd'],Canonical[side+'Foot']),pv=sub(old[side+'ToeBaseEnd'],old[side+'Foot']),a=Math.atan2(pv[1],pv[0])-Math.atan2(cv[1],cv[0]);
  P[side+'ToeBaseEnd']=add(P[side+'Foot'],mul(rotate(sub(T[side+'ToeBaseEnd'],T[side+'Foot']),a),k));
 }
 const v=sub(old.Head,old.Neck1),r=sub(Canonical.Head,Canonical.Neck1),headAngle=Math.atan2(v[1],v[0])-Math.atan2(r[1],r[0]);P.Head=add(P.Neck1,mul(rotate(sub(T.Head,T.Neck1),headAngle),k));
 return P;
}
export function sourcePose(points,{x,ground,height,anchor=109,floor=249}){const k=height/232;return Object.fromEntries(Object.entries(points).map(([n,v])=>[n,[x+(v[0]-anchor)*k,ground+(v[1]-floor)*k]]))}
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
  for(const i of triangles){const uv=points[i],q=transform(uv),tex=this.uvSample?this.uvSample(uv):uv;vertices.push(q[0],q[1],tex[0]/w,tex[1]/h)}
  const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.textures[texture]);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,vertices.length/4);
 }
 polygon(points,transform,texture=0){const center=points.reduce((a,b)=>add(a,mul(b,1/points.length)),[0,0]),all=[center,...points],tri=[];for(let i=1;i<all.length;i++)tri.push(0,i,i===all.length-1?1:i+1);this.mesh(all,tri,transform,texture)}
 strip(rows,transform){const tri=[];for(let r=0;r<rows.length-1;r++)for(let c=0;c<2;c++){const a=r*3+c,b=a+1,d=(r+1)*3+c,e=d+1;tri.push(a,d,b,b,d,e)}this.mesh(rows.flat(),tri,transform)}
}

const rows=(a,b,c)=>{
 const sparse=a.map((p,i)=>[p,b[i],c[i]]),dense=[];
 for(let i=0;i<sparse.length-1;i++){
  const count=Math.max(1,Math.ceil(length(sub(b[i+1],b[i]))/2));
  for(let j=0;j<count;j++)dense.push(sparse[i].map((p,k)=>mix(p,sparse[i+1][k],j/count)));
 }
 dense.push(sparse.at(-1));return dense;
};
const arms={Left:rows([[91,74],[84,96],[84,110],[85,125],[88,141],[89,149],[92,157],[95,163]],[[98,82],[93,99],[92,113],[93,126],[94,142],[96,149],[97,156],[98,162]],[[108,79],[100,100],[99,113],[99,126],[101,141],[103,148],[103,155],[99,163]]),Right:rows([[130,74],[134,99],[135,112],[136,125],[135,139],[135,148],[138,158]],[[137,82],[140,99],[139,112],[141,126],[141,140],[140,149],[139,157]],[[143,77],[147,99],[145,112],[146,126],[146,140],[144,150],[142,158]])};
const legs={Left:rows([[96,135],[92,153],[90,177],[88,190],[88,211],[86,226],[86,230]],[[105,140],[103,156],[102,177],[99,191],[97,211],[96,226],[97,230]],[[115,139],[115,157],[113,177],[109,191],[107,211],[106,226],[106,230]]),Right:rows([[113,137],[112,158],[113,178],[115,193],[115,210],[115,225],[117,229]],[[123,142],[126,158],[125,178],[125,192],[125,210],[127,224],[129,230]],[[136,135],[138,158],[137,178],[137,193],[137,211],[139,224],[140,231]])};
const shoes={Left:[[86,222],[107,222],[108,236],[103,248],[85,251],[79,247],[83,235]],Right:[[114,220],[139,221],[143,231],[156,236],[156,244],[139,246],[116,239]]};
const torso=[[113,59],[128,62],[135,72],[137,82],[134,101],[138,138],[111,142],[96,138],[100,102],[98,82],[102,72]];
export function drawBoy(ctx,art,P,{width,height,boyHeight,launch=false}){
 const r=art.renderer,k=boyHeight/232;r.begin(width,height);
 for(const side of['Left','Right']){
  const leg=uv=>chain(uv,[side+'UpLeg',side+'Leg',side+'Foot'],P,k),shoe=uv=>mapBone(uv,side+'Foot',side+'ToeBaseEnd',P,k);
  r.polygon(shoes[side],shoe);
  // The standing drawing's hand overlaps the upper left thigh. Sample the
  // unobstructed denim inside that same thigh when articulating it.
  r.uvSample=side==='Left'?uv=>uv[1]>140&&uv[1]<170&&uv[0]<105?[106+(uv[0]-86)*.28,uv[1]]:uv:null;
  r.strip(legs[side],uv=>mix(leg(uv),shoe(uv),ease((uv[1]-217)/13)));r.uvSample=null;
 }
 for(const side of['Right','Left'])r.strip(arms[side],uv=>chain(uv,[side+'Arm',side+'ForeArm',side+'Hand',side+'Palm'],P,k));
 const torsoMap=uv=>mapBone(uv,'Neck1','Hips',P,k);
 // Small textured shoulder panels bridge the sleeve rotation to the torso.
 // Their source pixels stay inside the shirt, avoiding a white paper wedge.
 for(const side of['Left','Right']){
  const spec=side==='Left'?{
   uv:[[108,76],[98,79],[94,95],[106,97]],target:[[104,74],[87,88],[102,99],[101,101]]
  }:{uv:[[128,75],[135,80],[139,94],[129,97]],target:[[132,74],[145,87],[134,99],[132,101]]};
  const sourceAxis=sub(T[side+'ForeArm'],T[side+'Arm']),poseAxis=sub(P[side+'ForeArm'],P[side+'Arm']);
  const theta=Math.atan2(poseAxis[1],poseAxis[0])-Math.atan2(sourceAxis[1],sourceAxis[0]);
  const raised=ease(Math.abs(Math.atan2(Math.sin(theta),Math.cos(theta)))/1.1);
  const target=spec.target.map((uv,i)=>{
   const map=i===1||i===2?p=>mapBone(p,side+'Arm',side+'ForeArm',P,k):torsoMap;
   return mix(map(spec.uv[i]),map(uv),raised);
  });
  r.mesh(spec.uv,[0,1,2,0,2,3],uv=>target[spec.uv.indexOf(uv)]);
 }

 const xs=[104,108,112,117,123,130,136],ys=[132,137,143,149,155,162],v=ys.flatMap(y=>xs.map(x=>[x,y])),tri=[];
 for(let row=0;row<ys.length-1;row++)for(let col=0;col<xs.length-1;col++){const a=row*xs.length+col,b=a+1,c=a+xs.length,d=c+1;tri.push(a,c,b,b,c,d)}
 r.mesh(v,tri,uv=>mix(torsoMap(uv),mix(mapBone(uv,'LeftUpLeg','LeftLeg',P,k),mapBone(uv,'RightUpLeg','RightLeg',P,k),ease((uv[0]-106)/17)),ease((uv[1]-135)/23)));
 r.polygon(torso,torsoMap);
 if(launch)r.strip(arms.Left.filter(row=>row[1][1]>=108),uv=>chain(uv,['LeftArm','LeftForeArm','LeftHand','LeftPalm'],P,k));
 r.polygon([[105,13],[151,13],[153,52],[142,60],[135,60],[126,64],[115,61],[109,55],[105,44]],uv=>mapBone(uv,'Neck1','Head',P,k));
 ctx.drawImage(r.canvas,0,0,width,height);
}

export function fingerPoint(P,height){return mapBone([99,162],'LeftHand','LeftPalm',P,height/232)}
