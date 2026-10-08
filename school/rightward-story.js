import{paperSprite}from './cel/paper-sprite.js';
import{drawCel}from './cel/cel-characters.js';
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),status=document.querySelector('#status'),tabs=[...document.querySelectorAll('[data-level]')],replay=document.querySelector('#replay'),skip=document.querySelector('#skip'),scrub=document.querySelector('#scrub'),reduce=matchMedia('(prefers-reduced-motion: reduce)');
const D=6.8,R=8.2,P=12.3,H=0,C=2.4,names=['elementary','middle','high'],lib={images:{},reg:{}};let settled=Math.max(0,names.indexOf(location.hash.slice(1))),target=settled,direction=settled,origin=settled,elapsed=0,raf=0,last=null,ready=false,inspecting=false;const heights=[230,300,320],sheets=['young','older','teen'];
const cycle=[0,1,2,3,4,5,6,7,8,9,10,11,12,13];
function selected(n){tabs.forEach((b,i)=>{b.setAttribute('aria-selected',String(i===n));b.classList.toggle('selected',i===n);if(i===n)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current')});target=n;history.replaceState(null,'','#'+names[n]);window.show?.()}
function forward(t){if(t<3.3){const n=Math.min(35,Math.floor(Math.max(0,t-.25)*12));return{sheet:'young',i:t===0?14:cycle[n%14],x:225+275*n/35,h:230,f:1}}const n=Math.min(33,Math.floor(Math.max(0,t-3.75)*12));return{sheet:'older',i:t>=D?14:cycle[n%14],x:500+225*n/33,h:300,f:1}}
function returning(t){
 if(t<.8)return{sheet:t<.12?'older':'turn-older',i:t<.12?14:Math.min(3,Math.floor((t-.12)/.17)),x:725,h:300,f:1};
 if(t<4){const n=Math.min(33,Math.floor((t-.8)*12));return{sheet:'older',i:cycle[n%14],x:725-225*n/33,h:300,f:-1}};
 if(t<7.4){const n=Math.min(35,Math.floor(Math.max(0,t-4.2)*12));return{sheet:'young',i:n===35?14:cycle[n%14],x:500-275*n/35,h:230,f:-1}};
 if(t<R){const i=Math.min(3,Math.floor((t-7.4)/.2));return{sheet:'turn-young',i,x:225,h:230,f:i<2?-1:1}};
 return forward(0);
}

const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x)};
function person(q){drawCel(ctx,lib,q,q.x,430,q.h,q.f??1)}
function bench(baked=true){const im=lib.images[baked?'set':'bench-empty'];ctx.drawImage(im,im.width/2,0,im.width/2,im.height,705,84,281,375)}
function panel(){const im=lib.images.set;ctx.drawImage(im,0,0,im.width/2,im.height,332,23,336,448)}
function floor(){ctx.strokeStyle='#ded8cb';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(70,430);ctx.lineTo(2450,430);ctx.stroke()}
function base(q,greetingTime=null,waveSheet='middle-wave-right'){
 floor();
 const wave=greetingTime!==null&&greetingTime>=3.9&&greetingTime<6.7;
 if(wave){const a=greetingTime-3.9,i=a<.2?0:a<.45?1:a<2.05?[2,3,2,3,2][Math.min(4,Math.floor((a-.45)/.32))]:a<2.45?1:0;person({sheet:waveSheet,i,x:860,h:285,f:-1})}
 bench(!wave);person(q);panel();
}
function passage(t,reverse=false){
 const pauseAt=reverse?2.1:3.65, pause=clamp((t-pauseAt)/1.3)*1.3, closeAge=t-7.7, closePause=reverse?clamp(closeAge/C)*C:0, travel=t-pause-closePause;
 const raw=clamp((travel-.8)/9.2),n=Math.min(110,Math.floor(raw*110)),p=n/110,progress=reverse?1-p:p,camera=1200*ease(reverse?1-raw:raw);
 const bx=725+1025*progress,gx=860+1040*progress,bhi=bx>=1470,ghi=gx>=1470;
 const bh=bhi?320:300,gh=ghi?305:285,bs=bhi?'teen':'older',gs=ghi?'girl-high':'girl-middle';
 let b={sheet:bs,i:raw===0||raw===1?14:cycle[n%14],x:bx,h:bh,f:reverse?-1:1},g={sheet:gs,i:raw===0||raw===1?14:cycle[(n+4)%14],x:gx,h:gh,f:reverse?-1:1};
 const baked=!reverse?t<.1:travel>10.9;
 if(!reverse&&t<.8){b={sheet:'older',i:14,x:725,h:300,f:1};g={sheet:'girl-depart',i:Math.min(3,Math.floor(t/.2)),x:860,h:285,f:1}}
 if(reverse&&t<.8){b={sheet:'turn-teen',i:Math.min(3,Math.floor(t/.2)),x:1750,h:320,f:1};g={sheet:'girl-turn',i:Math.min(3,Math.floor(t/.2)),x:1900,h:305,f:1}}
 if(reverse&&travel>=10){const i=Math.max(0,3-Math.floor((travel-10)/.2));b={sheet:'turn-older',i,x:725,h:300,f:1};g={sheet:'girl-depart',i,x:860,h:285,f:i>=2?-1:1}}
 if(reverse&&travel>10.8)b={sheet:'older',i:14,x:725,h:300,f:1};
 const opening=ease((t-pauseAt-.6)/.65), closing=reverse?ease((closeAge-.95)/.75):ease((travel-10.0)/.9), doorOpen=reverse?(.72+.28*opening)*(1-closing):opening*(1-.28*closing);
 if(!reverse&&t>=pauseAt&&t<pauseAt+1.3){b.i=14;g={sheet:'door-reach',i:Math.min(3,Math.floor((t-pauseAt)/.28)),x:gx,h:285,f:1}}
 if(reverse&&t>=pauseAt&&t<pauseAt+1.3){b={sheet:'boy-door',i:(t-pauseAt<.25?0:t-pauseAt<.55?1:t-pauseAt<.78?2:t-pauseAt<1.05?1:3),x:bx,h:320,f:-1};g.i=14}
 const guiding=reverse&&closeAge>=0&&closeAge<C;
 if(guiding){
  b.i=14;
  if(closeAge<.5){const k=Math.min(2,Math.floor(closeAge/.17));g={sheet:'girl-depart',i:[3,2,0][k],x:gx,h:285,f:k<2?-1:1}}
  else if(closeAge<1.85){const a=closeAge-.5;g={sheet:'door-reach',i:a<.2?0:a<.4?1:a<.8?2:a<1.05?1:0,x:gx,h:285,f:1}}
  else {const k=Math.min(2,Math.floor((closeAge-1.85)/.18));g={sheet:'girl-depart',i:[0,2,3][k],x:gx,h:285,f:k? -1:1}}
 }
 ctx.save();ctx.translate(-camera,0);floor();
 const stage=lib.images['stage-bare'];ctx.drawImage(stage,320,0,stage.width-320,stage.height,1950,75,480,404);
 const stageTime=reverse?P+H:t;
 const pose=(a,b,c)=>stageTime<a?0:stageTime<b?1:stageTime<c?2:3;
 const farewell=(offset=0,robot=false)=>{const a=Math.max(0,t-offset);if(robot){if(a<.25||a>=4.3)return 0;return [0,1,2,3,2,1][Math.floor((a-.25)/.24)%6];}if(a<.8)return Math.min(3,Math.floor(a/.2));if(a<4.4)return [3,4,5,6,7,6,5,4][Math.floor((a-.8)/.36)%8];if(a<5)return [2,1,0][Math.min(2,Math.floor((a-4.4)/.2))];return 0};
 person({sheet:reverse?'farewell-girl':'stage-girl',i:reverse?farewell():pose(9.7,10.2,11.2),x:2205,h:225,f:1});
 person({sheet:reverse?'farewell-boy':'stage-boy',i:reverse?farewell(.15):pose(9.9,10.4,11.3),x:2360,h:320,f:1});
 person({sheet:reverse?'robot-small-wave':'stage-robot',i:reverse?farewell(0,true):pose(9.3,9.9,11.1),x:2072,h:128,f:1});
 person({sheet:reverse?'robot-small-wave':'stage-robot',i:reverse?farewell(.25,true):pose(9.8,10.3,11.25),x:2330,h:128,f:1});
 canvas.dataset.robotPose=reverse?[farewell(0,true),farewell(.25,true)].join(','):'still';
 canvas.dataset.stagePose=String(reverse?farewell():pose(9.7,10.2,11.2));
 // Moving girl remains behind the workbench until she has cleared it.
 if(!baked&&gx<1030)person(g);bench(baked);if(!baked&&gx>=1030)person(g);person(b);panel();
 // Solid door leaf conceals both independently timed changes of age.
 const door=lib.images['door-layers'];
 // Three-quarter projection: the portal crosses the walking route.
 ctx.save();ctx.transform(.62,.20,0,1,475,-245);
 // Draw only the wooden surround. The opening is genuinely see-through.
 ctx.save();ctx.beginPath();ctx.rect(1215,-5,250,445);ctx.rect(1251,24,177,393);ctx.clip('evenodd');
 ctx.drawImage(door,184,30,566,958,1215,-5,250,445);ctx.restore();
 // The leaf swings past the hinge to the right, concealing the age change
 // after the students have visibly crossed the open threshold.
 const w=168-508*ease(doorOpen),rise=-110*doorOpen;
 if(Math.abs(w)>1){ctx.save();ctx.transform(w/400,-rise/400,0,1,1428-w,24+rise);
 ctx.drawImage(door,930,65,400,923,0,0,400,390+15*doorOpen);ctx.restore();}
 ctx.restore();
 if(!reverse&&t>=pauseAt&&t<pauseAt+1.3)person(g);
 if(reverse&&t>=pauseAt&&t<pauseAt+1.3)person(b);
 if(guiding)person(g);
 canvas.dataset.doorOpen=doorOpen.toFixed(3);
 ctx.restore();canvas.dataset.camera=camera.toFixed(2);canvas.dataset.boyX=bx.toFixed(2);canvas.dataset.girlX=gx.toFixed(2);
}
function duration(){if(origin===0&&direction===1)return D;if(origin===1&&direction===0)return R;if(origin===0&&direction===2)return D+P+H;if(origin===2&&direction===0)return P+C+R;return origin===2?P+C:P+H}
function draw(){if(!ready)return;ctx.clearRect(0,0,1250,490);const active=!!raf||inspecting;
 if(!active){if(settled===2)passage(P+H);else base(forward(settled?D:0))}
 else if(origin===0&&direction===1)base(forward(elapsed),elapsed);
 else if(origin===1&&direction===0)base(returning(elapsed),elapsed+3.1,'middle-wave');
 else if(origin===0&&direction===2){if(elapsed<D)base(forward(elapsed),elapsed);else passage(elapsed-D)}
 else if(origin===2&&direction===0){if(elapsed<P+C)passage(elapsed,true);else base(returning(elapsed-P-C),elapsed-P-C+3.1,'middle-wave')}
 else passage(elapsed,origin===2);
 canvas.dataset.time=elapsed.toFixed(3);canvas.dataset.route=names[origin]+'-'+names[direction];canvas.dataset.state=raf?'animating':inspecting?'inspection':'still';scrub.max=duration();scrub.value=elapsed;
}
function hold(){cancelAnimationFrame(raf);raf=0;last=null;skip.hidden=true;inspecting=false;status.style.opacity='1';status.textContent=['Every idea starts somewhere.','A little older. An idea made real.','Their ideas. Their team. Their stage.'][settled];draw()}
function finish(){settled=target;hold()}
function tick(now){if(last!==null)elapsed+=1.3*Math.min(.08,(now-last)/1000);last=now;if(elapsed>=duration()){settled=direction;hold();if(target!==settled)start();return}raf=requestAnimationFrame(tick);draw()}
function start(){inspecting=false;origin=settled;direction=target;elapsed=0;last=null;status.style.opacity='0';skip.hidden=false;raf=requestAnimationFrame(tick);draw()}
function choose(n){selected(n);if(!ready)return;if(reduce.matches){finish();return}if(!raf&&target!==settled)start()}
tabs.forEach((b,i)=>{b.onclick=e=>{e.preventDefault();choose(i)};b.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowLeft'?2:1))%3;tabs[n].focus();choose(n)}}});replay.onclick=()=>{cancelAnimationFrame(raf);raf=0;settled=target===0?1:target-1;if(reduce.matches){finish();return}start()};skip.onclick=finish;scrub.oninput=()=>{cancelAnimationFrame(raf);raf=0;inspecting=true;elapsed=Number(scrub.value);draw()};reduce.onchange=finish;addEventListener('hashchange',()=>choose(Math.max(0,names.indexOf(location.hash.slice(1)))));
try{
 const root='./assets/panel-transition/',next='./assets/rightward/';
 for(const url of [root+'registration.json',root+'turn-registration.json',root+'teen-registration.json',next+'registration.json'])Object.assign(lib.reg,await(await fetch(url+'?v=robot-small1')).json());
 await Promise.all(['young','older','set','turns','teen','teen-turn','girl-middle','girl-high','girl-acting','bench-empty','stage-friends','door','door-layers','door-reach','boy-door','stage-bare','stage-girl','stage-boy','stage-robot','middle-wave','middle-wave-right','robot-small-wave','farewell-girl','farewell-boy'].map(async name=>{const im=new Image();im.src=(['young','older','set','turns','teen','teen-turn'].includes(name)?root:next)+name+'.webp?v=fluid5';await im.decode().catch(e=>{throw new Error(name+": "+e.message)});const paper=paperSprite(im),flat=document.createElement('canvas');flat.width=im.width;flat.height=im.height;flat.getContext('2d').drawImage(paper,0,0);paper.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext();lib.images[name]=flat}));
 lib.images['turn-older']=lib.images.turns;lib.images['turn-young']=lib.images.turns;lib.images['turn-teen']=lib.images['teen-turn'];lib.images['girl-depart']=lib.images['girl-acting'];lib.images['girl-turn']=lib.images['girl-acting'];ready=true;replay.disabled=false;selected(target);hold();
}catch(e){canvas.dataset.error=String(e.stack||e);status.textContent='The artwork could not load. Please refresh.';console.error(e)}
