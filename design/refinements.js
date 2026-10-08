(()=>{
 // Full-size photographs preserve the selected collection and return keyboard focus.
 const viewer=document.querySelector('#photo-viewer'),tiles=[...document.querySelectorAll('.photo-tile')];
 if(viewer){
  let current=0,origin=null;const visible=()=>tiles.filter(t=>!t.hidden);
  const show=n=>{const list=visible();current=(n+list.length)%list.length;const img=list[current].querySelector('img');document.querySelector('#viewer-image').src=img.src;document.querySelector('#viewer-image').alt=img.alt;document.querySelector('#viewer-caption').textContent=(current+1)+' / '+list.length+' · '+img.alt};
  tiles.forEach(tile=>tile.addEventListener('click',()=>{origin=tile;show(visible().indexOf(tile));viewer.showModal()}));
  viewer.addEventListener('close',()=>origin?.focus({preventScroll:true}));
  document.querySelector('#photo-prev').addEventListener('click',()=>show(current-1));document.querySelector('#photo-next').addEventListener('click',()=>show(current+1));
  viewer.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show(current+(e.key==='ArrowLeft'?-1:1))}});
  viewer.addEventListener('click',e=>{if(e.target===viewer)viewer.close()});
  document.querySelectorAll('[data-photo-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-photo-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));tiles.forEach(t=>t.hidden=b.dataset.photoFilter!=='All'&&t.dataset.photoGroup!==b.dataset.photoFilter);document.querySelector('#photo-count').textContent=visible().length+' photographs'}));
 }
 // On phones, a compact topic chooser gives families more room for the answer.
 for(const hub of document.querySelectorAll('#famhub,#polhub')){
  const nav=hub.querySelector('.side'),buttons=[...nav.querySelectorAll('button[data-p]')];if(!buttons.length)continue;
  const label=document.createElement('label');label.className='resource-chooser';label.textContent='Choose a topic';const select=document.createElement('select');select.setAttribute('aria-label','Choose a resource topic');
  buttons.forEach(b=>{const o=document.createElement('option');o.value=b.dataset.p;const clone=b.cloneNode(true);clone.querySelector('.ico')?.remove();o.textContent=clone.textContent.trim();select.append(o)});label.append(select);nav.before(label);
  const sync=()=>{select.value=buttons.find(b=>b.classList.contains('active'))?.dataset.p||buttons[0].dataset.p};sync();new MutationObserver(sync).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});select.addEventListener('change',()=>buttons.find(b=>b.dataset.p===select.value)?.click());
 }
 // Keep focus inside the open mobile menu while preserving its established fade.
 const menu=document.querySelector('.mobile-nav-overlay'),opener=document.querySelector('#menu');
 if(menu&&opener){
  menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Site navigation');let wasOpen=false;
  const focusable=()=>[...menu.querySelectorAll('a,button,input,select,[tabindex]')].filter(e=>e.tabIndex>=0&&e.getClientRects().length);
  new MutationObserver(()=>{const open=menu.classList.contains('open');if(open===wasOpen)return;wasOpen=open;opener.setAttribute('aria-expanded',String(open));document.body.classList.toggle('menu-open',open);if(open){menu.setAttribute('aria-modal','true');setTimeout(()=>{if(menu.classList.contains('open'))menu.querySelector('.close-btn')?.focus()},80)}else{menu.removeAttribute('aria-modal');opener.focus({preventScroll:true})}}).observe(menu,{attributes:true,attributeFilter:['class']});
  matchMedia('(max-width:900px)').addEventListener('change',e=>{if(!e.matches)menu.classList.remove('open')});
  document.addEventListener('keydown',e=>{if(e.key==='Tab'&&menu.classList.contains('open')&&!menu.contains(document.activeElement)){e.preventDefault();focusable()[0]?.focus()}});
  menu.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.classList.remove('open');return}if(e.key!=='Tab')return;const list=focusable(),first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}});
 }
 document.querySelectorAll('[data-has-submenu]').forEach(link=>{const submenu=link.nextElementSibling;if(!submenu)return;const sync=()=>link.setAttribute('aria-expanded',String(submenu.classList.contains('open')));sync();new MutationObserver(sync).observe(submenu,{attributes:true,attributeFilter:['class']})});
 document.querySelectorAll('.data-scroll').forEach(w=>{if(w.scrollWidth>w.clientWidth){w.tabIndex=0;w.setAttribute('role','region');w.setAttribute('aria-label','Scrollable table')}});
})();
(()=>{for(const wrap of document.querySelectorAll('.schedule-table-wrap')){const note=document.createElement('p');note.className='schedule-scroll-hint';note.textContent='Scroll sideways to see the full week →';wrap.after(note);const update=()=>{const overflow=wrap.scrollWidth>wrap.clientWidth+1&&wrap.clientWidth>0;note.hidden=!overflow;if(overflow){wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Scrollable weekly schedule')}};new ResizeObserver(update).observe(wrap);update()}})();
(()=>{document.querySelectorAll('.mobile-submenu').forEach(sub=>{const parent=sub.previousElementSibling;if(!parent?.href)return;if([...sub.querySelectorAll('a')].some(a=>a.href===parent.href))return;const overview=document.createElement('a');overview.href=parent.href;overview.textContent=parent.textContent.trim()+' overview';overview.addEventListener('click',()=>sub.closest('.mobile-nav-overlay')?.classList.remove('open'));sub.prepend(overview)})})();

// Give dynamically added family fields the same accessible labels as static fields.
(()=>{let serial=0;const labelFields=()=>{for(const control of document.querySelectorAll('form input:not([type=hidden]),form select,form textarea')){
 if(control.labels?.length||control.hasAttribute('aria-label')||control.hasAttribute('aria-labelledby'))continue;
 let before=control.previousElementSibling,label=null;
 while(before){if(before.tagName==='LABEL'){label=before;break}if(before.matches('input,select,textarea'))break;before=before.previousElementSibling}
 if(!label||label.htmlFor){if(control.placeholder)control.setAttribute('aria-label',control.placeholder);continue;}
 if(!control.id){do{serial++;control.id='draft-field-'+serial}while(document.querySelectorAll('#'+control.id).length>1)}label.htmlFor=control.id;
 }};labelFields();for(const form of document.querySelectorAll('form'))new MutationObserver(labelFields).observe(form,{childList:true,subtree:true})})();
