(()=>{
 let dialog,source;
 document.addEventListener('click',e=>{
  const a=e.target.closest('[data-school-video]');if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
  e.preventDefault();source=a;
  if(!dialog){dialog=document.createElement('dialog');dialog.className='school-video-dialog';dialog.setAttribute('aria-labelledby','school-video-title');dialog.innerHTML='<div class="school-video-top"><h2 id="school-video-title"></h2><form method="dialog"><button aria-label="Close video">×</button></form></div><div class="school-video-screen"></div><a class="school-video-external" target="_blank" rel="noopener">Watch on YouTube ↗</a>';document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.querySelector('.school-video-screen').replaceChildren();source?.focus({preventScroll:true})});dialog.addEventListener('click',ev=>{if(ev.target!==dialog)return;const r=dialog.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)dialog.close()})}
  dialog.querySelector('h2').textContent=a.dataset.videoTitle;dialog.querySelector('.school-video-external').href=a.href;
  const player=document.createElement('iframe');player.title=a.dataset.videoTitle;player.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(a.dataset.schoolVideo)+'?autoplay=1&rel=0';player.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';player.allowFullscreen=true;player.referrerPolicy='strict-origin-when-cross-origin';dialog.querySelector('.school-video-screen').replaceChildren(player);dialog.showModal();
 });
})();
