(()=>{'use strict';const root=document.querySelector('.family-hub');if(!root)return;
const alias={welcome:'home',auditions:'shows',firstday:'daily/arrival',supplies:'daily/supplies',dresscode:'daily/dresscode',devices:'daily/devices',handbook:'daily/handbook',policies:'daily/handbook',nondiscrimination:'daily/handbook',nondis:'daily/handbook',start:'daily/handbook',trips:'calendar',tuition:'billing',connect:'contact'};
const panels=[...root.querySelectorAll('[data-hub-panel]')],shows=[...root.querySelectorAll('[data-show]')];let first=true;
function render(){let raw=decodeURIComponent(location.hash.slice(1)),[key,sub]=raw.split('/');const mapped=(alias[key]||key||'home').split('/');key=mapped[0];sub=mapped[1]||sub;
if(!panels.some(p=>p.dataset.hubPanel===key))key='home';
panels.forEach(p=>p.hidden=p.dataset.hubPanel!==key);root.querySelectorAll('[data-hub-link]').forEach(a=>{if(a.dataset.hubLink===key)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
if(key==='shows'){if(!shows.some(s=>s.dataset.show===sub))sub='talent';shows.forEach(s=>s.hidden=s.dataset.show!==sub);root.querySelector('#hub-show-select').value=sub;root.querySelectorAll('[data-show-link]').forEach(a=>{if(a.dataset.showLink===sub)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')})}
if(['daily','billing','contact'].includes(key)&&sub){let target=document.getElementById(sub);if(target&&root.contains(target)){if(target.tagName==='DETAILS')target.open=true;requestAnimationFrame(()=>{const nav=root.querySelector('.hub-nav');window.scrollTo({top:Math.max(0,target.getBoundingClientRect().top+window.scrollY-nav.offsetHeight-24),behavior:'instant'})})}}
else if(!first||(key==='shows'&&sub)){const nav=root.querySelector('.hub-nav'),panels=root.querySelector('.hub-panels');window.scrollTo({top:Math.max(0,panels.getBoundingClientRect().top+window.scrollY-nav.offsetHeight-24),behavior:'instant'})}first=false;}
root.querySelectorAll('[data-cast-filter]').forEach(input=>input.addEventListener('input',()=>{const d=input.closest('details'),rows=[...d.querySelectorAll('tbody tr')],q=input.value.trim().toLowerCase();let n=0;rows.forEach(r=>{r.hidden=!r.textContent.toLowerCase().includes(q);if(!r.hidden)n++});d.querySelector('.cast-status').textContent=q?`${n} matching ${n===1?'entry':'entries'}.`:'';}));
const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
root.querySelectorAll('[data-expires]:not([data-calendar-event])').forEach(e=>{if(e.dataset.expires<today)e.hidden=true});
const monthTabs=root.querySelector('.hub-month-tabs'),monthPanel=root.querySelector('#hub-month-events');
const events=[...root.querySelectorAll('[data-calendar-event]')];
const monthKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
const monthChoices=Array.from({length:3},(_,i)=>new Date(now.getFullYear(),now.getMonth()+i,1));
function selectMonth(index){
 const month=monthKey(monthChoices[index]);let count=0;
 [...monthTabs.children].forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1});
 monthPanel.setAttribute('aria-labelledby','hub-month-'+month);
 events.forEach(e=>{const show=e.dataset.expires>=today&&e.dataset.start.slice(0,7)<=month&&e.dataset.expires.slice(0,7)>=month;e.hidden=!show;if(show)count++});
 const empty=root.querySelector('.hub-empty');empty.hidden=count>0;empty.textContent='No upcoming events listed for '+monthChoices[index].toLocaleDateString('en-US',{month:'long'})+'. See the full school calendar for more dates.';
}
monthChoices.forEach((date,index)=>{const b=document.createElement('button');b.type='button';b.id='hub-month-'+monthKey(date);b.setAttribute('role','tab');b.setAttribute('aria-controls','hub-month-events');b.textContent=date.toLocaleDateString('en-US',{month:'long'});b.setAttribute('aria-label',date.toLocaleDateString('en-US',{month:'long',year:'numeric'}));b.addEventListener('click',()=>selectMonth(index));b.addEventListener('keydown',e=>{let next;if(e.key==='ArrowRight')next=(index+1)%3;if(e.key==='ArrowLeft')next=(index+2)%3;if(e.key==='Home')next=0;if(e.key==='End')next=2;if(next!==undefined){e.preventDefault();selectMonth(next);monthTabs.children[next].focus()}});monthTabs.append(b)});
monthTabs.hidden=false;selectMonth(0);
root.querySelector('#hub-show-select').addEventListener('change',e=>location.hash='shows/'+e.target.value);
window.addEventListener('hashchange',render);render();})();
