(()=>{
 const dialog=document.querySelector('#site-search, #search-dialog');
 if(!dialog)return;
 const input=dialog.querySelector('input[type=search]'),out=dialog.querySelector('#site-results, #search-results'),trigger=document.querySelector('#site-search-open, #search-open');
 const status=document.createElement('p');status.className='search-status';status.setAttribute('role','status');input.after(status);
 out.removeAttribute('aria-live');let data,pending,request=0;
 const clean=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 async function render(){
  const serial=++request;status.textContent='';
  try{if(!data){pending??=fetch('/school/ui/search.json').then(r=>{if(!r.ok)throw Error();return r.json()});data=await pending}}
  catch{pending=null;out.replaceChildren();status.textContent='Search is unavailable. Use the menu to browse the school, tuition, and family resources.';return}
  if(serial!==request)return;
  const q=clean(input.value),tokens=q.split(' ').filter(Boolean);
  const matches=data.map((x,i)=>{const title=clean(x.title),text=clean(x.title+' '+x.description+' '+(x.keywords||''));return {x,i,score:!q?(x.popular||0):(tokens.every(t=>text.includes(t))?(title===q?100:title.includes(q)?60:30)+tokens.filter(t=>title.includes(t)).length:0)}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,12);
  out.replaceChildren();
  status.textContent=q?(matches.length?matches.length+' matching destination'+(matches.length===1?'':'s'):'No matches. Try “tuition”, “dress code”, or “teachers”.'):'Popular destinations';
  for(const {x} of matches){const a=document.createElement('a'),h=document.createElement('strong'),p=document.createElement('p');a.href=x.url;h.textContent=x.title;p.textContent=x.description;a.append(h,p);a.addEventListener('click',()=>dialog.close());out.append(a)}
 }
 const open=()=>{if(!dialog.open)dialog.showModal();render();input.focus()};
 trigger?.addEventListener('click',open);input.addEventListener('input',render);
 dialog.querySelector('#search-close')?.addEventListener('click',()=>dialog.close());
 input.addEventListener('keydown',e=>{if(['ArrowDown','Enter'].includes(e.key)){const first=out.querySelector('a');if(first){e.preventDefault();if(e.key==='Enter')first.click();else first.focus()}}});
 dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close()});
 document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open()}});
})();
