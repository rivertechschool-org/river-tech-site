(()=>{'use strict';const root=document.querySelector('.family-hub');if(!root)return;
const month=root.querySelector('#hub-calendar-month'),kind=root.querySelector('#hub-calendar-kind'),rows=[...root.querySelectorAll('.hub-date-row')];
const now=new Date(),thisMonth=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
month.value=[...month.options].some(o=>o.value===thisMonth)?thisMonth:'all';
function filterDates(){let visible=0;rows.forEach(row=>{const inMonth=month.value==='all'||(row.dataset.date.slice(0,7)<=month.value&&row.dataset.endDate.slice(0,7)>=month.value);row.hidden=!inMonth||(kind.value!=='all'&&row.dataset.type!==kind.value);if(!row.hidden)visible++});root.querySelector('.hub-dates-empty').hidden=visible>0;}
month.addEventListener('change',filterDates);kind.addEventListener('change',filterDates);filterDates();
function route(){const [key,sub,level]=decodeURIComponent(location.hash.slice(1)).split('/');if(key!=='calendar')return;
const event=rows.find(r=>r.id===sub);const view=event?'dates':['dates','schedules','trips'].includes(sub)?sub:'dates';
root.querySelectorAll('[data-calendar-view]').forEach(el=>el.hidden=el.dataset.calendarView!==view);
root.querySelectorAll('[data-calendar-link]').forEach(a=>{if(a.dataset.calendarLink===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
if(event){month.value=event.dataset.date.slice(0,7);kind.value='all';filterDates();requestAnimationFrame(()=>event.scrollIntoView({block:'center',behavior:'instant'}));}
if(view==='trips'&&level){const target=document.getElementById(level);if(target&&root.contains(target)){let parent=target;while(parent&&parent!==root){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement}requestAnimationFrame(()=>target.scrollIntoView({block:'center',behavior:'instant'}));}}
if(view==='schedules'&&level?.startsWith('panel-')){const button=root.querySelector('.schedule-tab[data-tab="'+level.slice(6)+'"]');button?.click();}
}
window.addEventListener('hashchange',route);route();
const query=root.querySelector('#hub-answer-query'),results=[...root.querySelectorAll('.hub-answer-result')],count=root.querySelector('#hub-answer-count');
function search(){const words=query.value.toLowerCase().trim().split(/\s+/).filter(Boolean);let shown=0;results.forEach(a=>{a.hidden=!words.every(w=>a.dataset.search.includes(w));if(!a.hidden)shown++});count.textContent=shown?(words.length?shown+' matching '+(shown===1?'answer':'answers'):'Browse all '+shown+' answers'):'No matching answers. Try another word, or contact the school.';}
query.addEventListener('input',search);search();
})();
