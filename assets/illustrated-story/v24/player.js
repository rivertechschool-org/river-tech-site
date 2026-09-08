// One quiet, keyboard-accessible surface; no player toolbar or timeline.
export function playStory(render,resize,duration){
 const stage=document.querySelector('#rt-home-story .rt-story-stage');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const params=new URLSearchParams(location.search),at=params.has('story-time')?Number(params.get('story-time')):null;
 const still=stage.querySelector('.rt-story-still'),canvas=stage.querySelector('canvas');
 let playing=false,elapsed=0,started=0,raf=0;
 function draw(){
  render(elapsed/duration,elapsed);
  if(playing)still.hidden=true;else{still.src=canvas.toDataURL('image/png');still.hidden=false}
  stage.dataset.motion=playing?'playing':elapsed>=duration?'complete':'paused';
  stage.dataset.elapsed=String(Math.round(elapsed));
  stage.setAttribute('aria-label',playing?'Pause the illustrated story':elapsed>=duration?'Replay the illustrated story':'Continue the illustrated story');
 }
 function stop(){playing=false;cancelAnimationFrame(raf);draw()}
 function finish(){elapsed=duration;stop()}
 function tick(now){if(!playing)return;elapsed=Math.min(duration,now-started);draw();if(elapsed>=duration){finish();return}raf=requestAnimationFrame(tick)}
 function play(){if(elapsed>=duration)elapsed=0;playing=true;started=performance.now()-elapsed;cancelAnimationFrame(raf);draw();raf=requestAnimationFrame(tick)}
 function toggle(){playing?stop():play()}
 stage.addEventListener('click',toggle);
 stage.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();e.stopPropagation();toggle()}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish()}});
 new ResizeObserver(()=>{resize();draw()}).observe(stage);
 new IntersectionObserver(e=>{if(!e[0].isIntersecting&&playing)finish()},{threshold:.05}).observe(stage);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)finish()});
 reduced.addEventListener('change',()=>{if(reduced.matches)finish()});
 stage.dataset.ready='true';stage.disabled=false;
 // Reduced motion opens on the composed final drawing; playback is opt-in.
 if(at!==null&&Number.isFinite(at)){elapsed=Math.max(0,Math.min(duration,at*1000));draw()}else if(reduced.matches)finish();else play();
}
