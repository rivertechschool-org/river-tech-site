import {clamp,smooth,ease,mix,loadImage as readImage,canvas2d,reportFailure} from './canvas.js';
import {playStory} from './player.js';
import {loadBoy,drawBoy,fingerPoint} from './boy-unified-v24.js?v=24.1';
import {boyPerformance,timing as storyTiming} from './boy-performance-v19.js?v=19.9';

const root=document.querySelector('#rt-home-story');
const loadImage=path=>readImage(new URL(path,import.meta.url).href);
try{
 const names=['girl-dance-v8','girl-robot-v8'];
 const [dance,robot,rocket,logo,registration,boy,controller]=await Promise.all([
  ...names.map(n=>loadImage(`assets/story-v14/${n}.webp`)),
  loadImage('assets/story-v14/model-rocket.webp'),loadImage('assets/story-v14/river-tech-logo.webp'),
  fetch(new URL('assets/story-registration-v8.json',import.meta.url)).then(r=>{if(!r.ok)throw new Error('Animation registration could not load');return r.json()}),
  loadBoy(),loadImage('assets/story-v14/launch-controller.webp')
 ]);
 const c=canvas2d(root.querySelector('canvas')),caption=root.querySelector('.rt-story-caption');
 const boyClockOffset=storyTiming.cartwheelStart,girlStart=1.15;
 const duration=(storyTiming.finish-boyClockOffset)*1000;
 const frameAt=seconds=>Math.min(23,Math.max(0,Math.floor(seconds*12)));

 // Register each original cell to its floor and body center at playback.
 function sprite(img,key,frame,x,ground,size,opacity=1,flip=1){
  const f=registration[key][frame],cell=img.width/6;
  c.ctx.save();c.ctx.globalAlpha=opacity;
  // Let the pale paper disappear into the page while retaining graphite lines.
  c.ctx.globalCompositeOperation='darken';
  c.ctx.translate(x,ground);c.ctx.scale(flip,1);
  const left=f.clipLeft??9,right=f.clipRight??f.sw-9;
  c.ctx.drawImage(img,f.sx+left,f.sy,right-left,f.sh,
   (left-f.anchorX)/cell*size,-f.floor/cell*size,size*(right-left)/cell,size*f.sh/cell);
  c.ctx.restore();
 }
 function prop(img,frame,source,x,ground,size,opacity=1){
  const cell=img.width/6,[sx,sy,sw,sh]=source;
  c.ctx.save();c.ctx.globalAlpha=opacity;c.ctx.globalCompositeOperation='darken';
  c.ctx.drawImage(img,(frame%6)*cell+sx,Math.floor(frame/6)*cell+sy,sw,sh,
   x-sw/2*size/cell,ground-sh*size/cell,sw*size/cell,sh*size/cell);
  c.ctx.restore();
 }
 function draw(t,ms){
  const {ctx,w,h}=c,s=ms/1000,bs=s+boyClockOffset,gs=s-girlStart,world=Math.max(600,Math.min(1050,w)),unit=w/world;
  const height=h/unit,ground=height*.81,characterRatio=mix(.27,.35,clamp((600-w)/240));
  const boyHeight=Math.min(height*.70,world*characterRatio),size=boyHeight*.82;
  const rocketX=world/2,boyX=rocketX-boyHeight*.68;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#f6f4f0';ctx.fillRect(0,0,w,h);
  ctx.save();ctx.scale(unit,unit);
  ctx.strokeStyle='#9b898249';ctx.lineWidth=.8;ctx.beginPath();
  ctx.moveTo(world*.04,ground+1);ctx.bezierCurveTo(world*.33,ground-2,world*.67,ground+3,world*.96,ground+1);ctx.stroke();

  // The girl's entire existing performance is reflected together, including
  // the robot, so the dance-to-kneel registration stays intact.
  const girlX=mix(-size*.4,boyX,ease(gs/1.70));
  const robotStart=2.20;
  const girlFrame=frameAt(gs),robotFrame=frameAt(gs-robotStart);
  const equipment=smooth((bs-storyTiming.cartwheelEnd-.08)/.34);

  if(bs>=storyTiming.cartwheelStart){
   const layout={x:boyX,ground,height:boyHeight},P=boyPerformance(boy,bs,layout);
   // Extend only the approach from beyond the right edge. The offset finishes
   // before the first captured hand plant; the cartwheel contacts stay fixed.
   if(s<.60){
    const start=boyPerformance(boy,storyTiming.cartwheelStart,layout);
    const firstEdge=Math.min(...Object.values(start).map(p=>p[0]));
    const u=clamp(s/.60),settle=u*u*u*(u*(u*6-15)+10);
    const entrance=Math.max(0,world+boyHeight*.08-firstEdge)*(1-settle);
    for(const p of Object.values(P))p[0]+=entrance;
   }
   const contact=fingerPoint(boyPerformance(boy,storyTiming.press,layout),boyHeight),controllerK=boyHeight/232;
   const bx=contact[0]-20*controllerK,by=ground-40*controllerK;
   ctx.save();ctx.globalCompositeOperation='darken';ctx.globalAlpha=equipment;
   ctx.drawImage(controller,bx,by,77*controllerK,40*controllerK);
   ctx.restore();
   drawBoy(ctx,boy,P,{width:world,height,boyHeight,launch:bs>4.2});
  }

  if(gs>=0){
   ctx.save();ctx.translate(world,0);ctx.scale(-1,1);
  if(gs<robotStart){
   const bob=gs<1.65?Math.sin(gs*Math.PI/1.65)*5:0;
   sprite(dance,'girl-dance',girlFrame,girlX,ground-bob,size,smooth(gs/.20));
   const arrival=smooth((gs-1.68)/.52);
   const robotCenter=registration.robotCrop[0]+registration.robotCrop[2]/2;
   const rx=boyX+(robotCenter-registration['girl-robot'][0].anchorX)/256*size*.95+(1-arrival)*size*.4;
   prop(robot,0,registration.robotCrop,rx,ground,size*.95,arrival);
  }else{
   sprite(robot,'girl-robot',robotFrame,boyX,ground,size*.95);
  }
   ctx.restore();
  }

  const rocketH=boyHeight*.28,ignition=storyTiming.press-boyClockOffset;
  const flight=clamp((s-ignition)/1.6),ry=ground-rocketH-Math.pow(flight,2)*(height+rocketH);
  if(flight>0&&flight<1){
   ctx.strokeStyle=`rgba(169,100,79,${.40*(1-flight)})`;ctx.lineWidth=1;
   ctx.beginPath();ctx.moveTo(rocketX,ground);ctx.bezierCurveTo(rocketX-4,ground-height*.2,rocketX+4,ry+rocketH+30,rocketX,ry+rocketH);ctx.stroke();
   for(let i=0;i<16;i++){
    const age=(flight*2.4+i/16)%1;
    ctx.globalAlpha=Math.max(0,(1-age)*.12*(1-flight));ctx.fillStyle='#ac7a68';
    ctx.beginPath();ctx.ellipse(rocketX+Math.sin(i*2.3)*age*32,ground-age*size*.22,4+age*16,2+age*5,0,0,Math.PI*2);ctx.fill();
   }
   ctx.globalAlpha=1;
  }
  if(flight<1){
   ctx.save();ctx.globalCompositeOperation='multiply';ctx.globalAlpha=equipment;
   ctx.drawImage(rocket,465,85,330,1065,rocketX-rocketH*.155,ry,rocketH*.31,rocketH);ctx.restore();
  }

  const reveal=smooth((bs-7.05)/1.05),logoSize=Math.min(155,height*.32);
  ctx.globalAlpha=reveal;ctx.drawImage(logo,rocketX-logoSize/2,height*.16,logoSize,logoSize*logo.height/logo.width);ctx.globalAlpha=1;
  ctx.restore();
  caption.textContent='Life is a Stage. Love is our Script.';
  caption.style.opacity=String(smooth((bs-7.6)/1.05));
 }
 playStory(draw,c.resize,duration);
}catch(e){reportFailure(e)}
