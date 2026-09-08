import{T,sourcePose,cartwheelBoy}from'./boy-unified-v19.js?v=19.9';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(v,k)=>v.map(x=>x*k),len=v=>Math.hypot(...v),unit=v=>mul(v,1/(len(v)||1)),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10)};
const turn=(v,a)=>[v[0]*Math.cos(a)-v[1]*Math.sin(a),v[0]*Math.sin(a)+v[1]*Math.cos(a)];
const half={Hips:[95,151],Neck1:[121,83],Head:[136,61],LeftArm:[99,102],LeftForeArm:[86,128],LeftHand:[93,155],LeftPalm:[98,164],RightArm:[131,104],RightForeArm:[129,132],RightHand:[122,156],RightPalm:[119,164],LeftUpLeg:[86,153],LeftLeg:[80,188],LeftFoot:[65,228],LeftToeBaseEnd:[69,245],RightUpLeg:[109,154],RightLeg:[116,185],RightFoot:[120,226],RightToeBaseEnd:[138,242]};
const kneel={Hips:[100,157],Neck1:[134,96],Head:[147,73],LeftArm:[109,119],LeftForeArm:[103,153],LeftHand:[110,181],LeftPalm:[111,202],RightArm:[135,118],RightForeArm:[128,138],RightHand:[122,156],RightPalm:[118,165],LeftUpLeg:[94,161],LeftLeg:[92,221],LeftFoot:[58,209],LeftToeBaseEnd:[53,229],RightUpLeg:[110,158],RightLeg:[141,144],RightFoot:[133,208],RightToeBaseEnd:[147,222]};
const press={Hips:[88,145],Neck1:[128,80],Head:[139,57],LeftArm:[115,108],LeftForeArm:[128,137],LeftHand:[146,157],LeftPalm:[163,177],RightArm:[122,100],RightForeArm:[116,124],RightHand:[104,145],RightPalm:[102,156],LeftUpLeg:[83,151],LeftLeg:[80,202],LeftFoot:[46,190],LeftToeBaseEnd:[41,210],RightUpLeg:[98,147],RightLeg:[123,139],RightFoot:[118,191],RightToeBaseEnd:[134,203]};
export const timing={cartwheelStart:1.35,cartwheelEnd:3.85,press:5.55,flightEnd:7.15,finish:9.2};
// Shape-preserving curves pass through the poses without stopping at each
// drawing. Repeated poses still create an intentional anticipation or hold.
function curve(times,values,i,t){
 const slope=j=>(values[j+1]-values[j])/(times[j+1]-times[j]);
 const tangent=j=>{if(j===0||j===values.length-1)return 0;const a=slope(j-1),b=slope(j);if(a*b<=0)return 0;const h0=times[j]-times[j-1],h1=times[j+1]-times[j],w0=2*h1+h0,w1=h1+2*h0;return(w0+w1)/(w0/a+w1/b)};
 const h=times[i+1]-times[i],t2=t*t,t3=t2*t;
 return(2*t3-3*t2+1)*values[i]+(t3-2*t2+t)*h*tangent(i)+(-2*t3+3*t2)*values[i+1]+(t3-t2)*h*tangent(i+1);
}
function interpolatePose(keys,i,t){const times=keys.map(x=>x[0]);return Object.fromEntries(Object.keys(keys[i][1]).map(n=>[n,[0,1].map(d=>curve(times,keys.map(x=>x[1][n][d]),i,t))]))}
function elbow(a,b,l1,l2,sign){const v=sub(b,a),d=clamp(len(v),Math.abs(l1-l2)+.001,l1+l2-.001),u=unit(v),along=(l1*l1-l2*l2+d*d)/(2*d),out=Math.sqrt(Math.max(0,l1*l1-along*along));return add(a,add(mul(u,along),mul([-u[1],u[0]],out*sign)))}
export function boyPerformance(art,s,layout){
 if(s<=timing.cartwheelEnd)return cartwheelBoy(art,Math.min(640,340+(s-timing.cartwheelStart)*120),layout);
 const k=layout.height/232;
 const stand=sourcePose(T,layout),crouch=sourcePose(half,{...layout,anchor:89,floor:249}),low=sourcePose(kneel,{...layout,anchor:107.5,floor:228}),contact=sourcePose(press,{...layout,anchor:95,floor:209});
 // Fixed lead foot and a planted rear knee give the kneel a readable support.
 for(const p of[crouch,low,contact]){p.RightFoot=stand.RightFoot.slice();p.RightToeBaseEnd=stand.RightToeBaseEnd.slice()}
 const watch=structuredClone(stand);watch.Head=add(watch.Neck1,turn(sub(stand.Head,stand.Neck1),-.46));
 const retract=structuredClone(low);retract.Head=add(retract.Neck1,turn(mul(unit(sub(low.Head,low.Neck1)),len(sub(T.Head,T.Neck1))*k),-.28));
 const keys=[[3.85,cartwheelBoy(art,640,layout)],[4.32,stand],[4.55,stand],[4.97,crouch],[5.23,low],[5.55,contact],[5.70,contact],[6.00,retract],[6.34,crouch],[6.77,watch],[9.2,watch]];
 let pair=keys.length-2;for(let i=0;i<keys.length-1;i++)if(s<=keys[i+1][0]){pair=i;break}
 const [ta,a]=keys[pair],[tb,b]=keys[pair+1],t=clamp((s-ta)/(tb-ta));
 const P=interpolatePose(keys,pair,t);
 // Face size and both sneaker shapes stay constant through every action.
 for(const[root,end]of[['Neck1','Head'],['LeftFoot','LeftToeBaseEnd'],['RightFoot','RightToeBaseEnd']]){
  const angles=keys.map(x=>{const v=sub(x[1][end],x[1][root]);return Math.atan2(v[1],v[0])});
  for(let i=1;i<angles.length;i++)angles[i]=angles[i-1]+Math.atan2(Math.sin(angles[i]-angles[i-1]),Math.cos(angles[i]-angles[i-1]));
  const angle=curve(keys.map(x=>x[0]),angles,pair,t);
  P[end]=add(P[root],mul([Math.cos(angle),Math.sin(angle)],len(sub(T[end],T[root]))*k));
 }
 // Keep elbows articulated through the approach, contact and withdrawal.
 // Preserve the exact recorded pose during the initial landing handoff.
 for(const side of['Left','Right']){
  const l1=len(sub(T[side+'ForeArm'],T[side+'Arm']))*k,l2=len(sub(T[side+'Hand'],T[side+'ForeArm']))*k;
  const arm=P[side+'Arm'],wrist=P[side+'Hand'],v=sub(wrist,arm);
  if(len(v)>l1+l2){const adjusted=mix(wrist,add(arm,mul(unit(v),(l1+l2)*.995)),smooth((s-3.85)/.47));P[side+'Palm']=add(P[side+'Palm'],sub(adjusted,wrist));P[side+'Hand']=adjusted}
  P[side+'ForeArm']=mix(P[side+'ForeArm'],elbow(arm,P[side+'Hand'],l1,l2,side==='Left'?1:-1),smooth((s-3.85)/.47));
 }
 return P;
}
