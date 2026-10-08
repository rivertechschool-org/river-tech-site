(()=>{
 function activate(button){
  const area=button.closest('.education');
  area.querySelectorAll('[role=tab]').forEach(tab=>{const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;});
  area.querySelectorAll('[role=tabpanel]').forEach(panel=>{panel.hidden=panel.id!==button.getAttribute('aria-controls');});
 }
 document.addEventListener('click',event=>{
  const compare=event.target.closest('[data-compare-level]');
  if(compare){
   const rowTop=compare.closest('.compare-levels').getBoundingClientRect().top;
   const subject=document.querySelector('.education [aria-selected="true"]')?.getAttribute('aria-controls').split('-').pop() || '0';
   const level=compare.dataset.compareLevel;
   // Reuse the existing selection path and settle it before the next painted frame.
   document.querySelector('.story-tabs [data-level="'+level+'"]').click();
   if(!document.querySelector('#replay').disabled)document.querySelector('#skip').click();
   const selectedSubject=document.querySelector('#education-tab-'+level+'-'+subject);
   activate(selectedSubject);
   const newRow=document.querySelector('.compare-levels');
   newRow.querySelector('[data-compare-level="'+level+'"]').focus({preventScroll:true});
   window.scrollBy({top:newRow.getBoundingClientRect().top-rowTop,behavior:'instant'});
   return;
  }
  const tab=event.target.closest('.education [role=tab]');if(tab){activate(tab);return;}
  const link=event.target.closest('a[data-scroll],a[href="#next"]');if(!link)return;
  const target=document.querySelector(link.getAttribute('href'));if(!target)return;
  event.preventDefault();target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 });
 document.addEventListener('keydown',event=>{
  const tab=event.target.closest('.education [role=tab]');if(!tab)return;
  const tabs=[...tab.parentElement.querySelectorAll('[role=tab]')];let index=tabs.indexOf(tab);
  if(event.key==='ArrowRight')index=(index+1)%tabs.length;else if(event.key==='ArrowLeft')index=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else return;
  event.preventDefault();activate(tabs[index]);tabs[index].focus();
 });
 if(new URLSearchParams(location.search).has('content'))window.addEventListener('load',()=>document.fonts.ready.then(()=>requestAnimationFrame(()=>document.querySelector('#parent-content')?.scrollIntoView())));
})();
