(() => {
'use strict';
const root = document.querySelector('.family-hub');
if (!root) return;
const office = 'learn@rivertech.me';
const people = {
 brooke: ['Brooke Donnelly', 'School office', 'Enrollment, records and payments.'],
 teacher: ['Your child’s teacher', 'Class questions', 'Include your child’s name and the class or subject.'],
 luke: ['Luke Hegelund', 'Student devices & apps', 'Computer requirements, required apps and accounts.'],
 jordan: ['Jordan Ezell', 'School technology', 'School portal and report-card access.'],
 mary: ['Mary Hegelund', 'School leadership', 'Student wellbeing, school events and field trips.'],
 dan: ['Dan Hegelund', 'Principal & Performing Arts Director', 'School-wide decisions and performing-arts questions.'],
 charlotte: ['Charlotte Tebow', 'Aladdin rehearsal coordination', 'Aladdin scripts and rehearsal material.'],
 angie: ['Angie', 'Costumes', 'Costumes for River Tech productions.'],
 kara: ['Kara McArthur', 'Props', 'Props for River Tech productions.'],
 emily: ['Emily Allison', 'School merchandise', 'River Tech merchandise questions.']
};
const topics = {
 home: [['School updates or a general question','brooke'],['An event or field trip','mary']],
 shows: [['Auditions, casting or performances','dan'],['Aladdin scripts or rehearsal material','charlotte'],['Costumes','angie'],['Props or backstage help','kara']],
 calendar: [['Field trips or chaperoning','mary'],['Your child’s class schedule or enrolled days','brooke'],['A class or lesson question','teacher']],
 daily: [['Classwork, progress or learning support','teacher'],['Computers, apps or accounts','luke'],['School portal or report-card access','jordan'],['Student wellbeing or a concern','mary']],
 billing: [['Invoices, payments or refunds','brooke']],
 contact: [['Enrollment, records or contact details','brooke'],['Student wellbeing or family concerns','mary'],['A policy or unresolved concern','dan'],['Volunteering or senior activities','brooke'],['School merchandise','emily']]
};
function el(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text)n.textContent=text; return n; }
function personCard(key, subject) {
 const p=people[key]||people.brooke, card=el('div','hub-help-person');
 const copy=el('div'); copy.append(el('p','hub-help-name',p[0]),el('p','hub-help-role',p[1]));
 const action=el('div','hub-help-action'); const a=el('a','hub-help-email','Open the Parent Portal');
 a.href='https://rivertech.me';
 const fallback=el('p','hub-help-via','Need help signing in? ');const email=el('a','','Email the office');email.href='mailto:'+office;fallback.append(email);
 action.append(a,fallback);
 card.append(copy,action); return card;
}
function helpBlock(id, choices) {
 const box=el('aside','hub-help');box.id='help-'+id;box.setAttribute('aria-label','Contact help for '+id);
 box.append(el('p','eyebrow','A PERSON WHEN YOU NEED ONE'),el('h3','','Still need help?'),el('p','hub-help-description','Message your teacher or the office through the Parent Portal. Sign in, choose Messages, pick who to contact, and press Send Message.'));
 const result=el('div','hub-help-result');result.setAttribute('aria-live','polite');
 function update(i){result.replaceChildren(personCard(choices[i][1],choices[i][0]));}
 if(choices.length>1){const label=el('label','hub-help-label','What is your question about?');label.htmlFor='help-choice-'+id;const select=el('select');select.id=label.htmlFor;choices.forEach((c,i)=>{const opt=el('option','',c[0]);opt.value=i;select.append(opt)});select.addEventListener('change',()=>update(+select.value));box.append(label,select);}else box.append(el('p','hub-help-description',choices[0][0]+'.'));
 box.append(result);update(0);return box;
}
Object.entries(topics).forEach(([id,choices])=>root.querySelector('[data-hub-panel="'+id+'"]').append(helpBlock(id,choices)));
const section=root.querySelector('#answers');
const sourceLinks=[...section.querySelectorAll('.hub-answer-result')];
const categories=['All topics','School day & learning','Computers & apps','Tuition & payments','Enrollment & records','Events & activities'];
function groupFor(href,q){if(/device|computer|apps|portal/i.test(q))return categories[2];if(href.startsWith('#billing'))return categories[3];if(href.startsWith('#contact'))return categories[4];if(/perform|field.trip|calendar|schedule|cast|script/i.test(q))return categories[5];return categories[1];}
function ownerFor(group,q){if(group===categories[3]||group===categories[4])return 'brooke';if(group===categories[2])return /portal|report.card access/i.test(q)?'jordan':'luke';if(/trip|chaperon/i.test(q))return 'mary';if(/perform|cast|script|audition/i.test(q))return 'dan';if(/policy|accredit|diploma/i.test(q))return 'dan';return /competency|classwork|assessment/i.test(q)?'teacher':'brooke';}
const entries=sourceLinks.map((a,i)=>{const href=a.getAttribute('href'),q=a.querySelector('strong').textContent,group=groupFor(href,q);return {id:'hub-'+i,q,group,href,owner:ownerFor(group,q),search:a.dataset.search};});
// These are personal requests rather than general policy answers.
const personal=[
 ['How do I report an absence or arrange an early pickup?',categories[1],'teacher','Sign in at rivertech.me and select Portal. Choose Report an Absence or Late Arrival / Early Pickup. Enter the details and press Tell the school.','#contact/attendance','late absent sick attendance pickup door'],
 ['How can I discuss my child’s progress or classwork?',categories[1],'teacher','Start with the teacher for the class or subject. Include your child’s name and what you would like to discuss.','/pages/teachers.html','homework grade assessment lesson teacher struggling'],
 ['Who can help with a student or friendship concern?',categories[1],'mary','Contact Mary about student wellbeing, friendship difficulties or a family concern. If something is happening at school right now, tell a staff member on site.','#contact','bullying behavior conflict wellbeing health support'],
 ['Who can help with apps, accounts or setup?',categories[2],'luke','For a device, app or account problem, contact Luke. For help with the work assigned in a class, contact that class’s teacher.','#daily/devices','login password software programs install computer laptop'],
 ['Who helps with the school portal or report-card access?',categories[2],'jordan','Contact Jordan about accessing the school portal or its features. Questions about a grade or assessment belong with the subject teacher.','#contact','login portal report card access'],
 ['I have a question about my invoice, payment or refund.',categories[3],'brooke','For a question about your family’s account, contact Brooke. Include your child’s name and the invoice number, if you have it.','#billing/payments','bill balance receipt wrong missing invoice refund'],
 ['How do I request a change to days, classes or enrollment?',categories[4],'brooke','Send Brooke the current arrangement, your requested change and the preferred start date. She coordinates approval and updates the enrollment record.','#contact','switch class withdraw add change days placement'],
 ['How do I update records or pickup permissions?',categories[4],'brooke','Send Brooke updates to emergency contacts, authorized pickup people or student information. She also handles school records and administrative forms.','#contact','transfer transcript forms records authorized pickup allergy medical'],
 ['How can I help with costumes or props?',categories[5],'angie','For costumes, contact Angie. For production props, contact Kara. Include the name of the show.','#shows','costume prop backstage volunteer','kara'],
 ['Who can help with an Aladdin rehearsal question?',categories[5],'charlotte','Contact Charlotte for Aladdin scripts and rehearsal material. For a broader production or casting question, contact Dan.','#shows/aladdin','aladdin rehearsal practice script'],
 ['Who coordinates graduation, senior activities or parent volunteering?',categories[5],'brooke','Brooke can connect you with the current organizer. For field-trip chaperoning, contact Mary.','#contact','senior graduation PTO parents volunteer'],
 ['Who can help with River Tech merchandise?',categories[4],'emily','Contact Emily about school merchandise, availability or an order question.','#contact','merchandise merch shirt order']
];
personal.forEach((r,i)=>entries.push({id:'request-'+i,q:r[0],group:r[1],owner:r[2],answer:r[3],href:r[4],search:r.join(' '),second:r[6]}));
section.replaceChildren();
const heading=el('div','hub-section-heading');heading.append(el('p','eyebrow','FAMILY QUESTIONS'),el('h2','','Find your answer.'));section.append(heading);
const label=el('label','hub-answer-label','What would you like to know?');label.htmlFor='hub-find-query';const input=el('input');input.id=label.htmlFor;input.type='search';input.placeholder='Try payments, computers, pickup or rehearsals';section.append(label,input);
const filters=el('div','hub-find-categories');filters.setAttribute('role','group');filters.setAttribute('aria-label','Answer categories');section.append(filters);
let category=categories[0],selected=entries[0].id;
const status=el('p','hub-find-count');status.setAttribute('role','status');section.append(status);
const layout=el('div','hub-find-layout'),list=el('div','hub-find-list');list.setAttribute('aria-label','Matching questions');
const mobileLabel=el('label','hub-find-mobile','Choose a question');mobileLabel.htmlFor='hub-find-select';const mobileSelect=el('select','hub-find-mobile');mobileSelect.id=mobileLabel.htmlFor;
const detail=el('article','hub-find-detail');detail.setAttribute('aria-live','polite');layout.append(list,detail);section.append(mobileLabel,mobileSelect,layout);
function normalize(s){return s.toLowerCase().normalize('NFKD').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function answerBody(entry){
 const container=el('div','hub-find-copy');
 if(entry.id==='request-0'){const source=document.getElementById('attendance');[...source.children].slice(1).forEach(n=>container.append(n.cloneNode(true)));return container;}
 if(entry.answer){container.append(el('p','',entry.answer));return container;}
 if(/pay tuition by check/i.test(entry.q)){const h=[...root.querySelectorAll('#payments summary')].find(n=>/paying by check/i.test(n.textContent));if(h?.nextElementSibling){container.append(h.nextElementSibling.cloneNode(true));return container;}}
 const parts=entry.href.slice(1).split('/'),target=document.getElementById(parts[parts.length-1]);
 if(target?.matches('.hub-faq-answer')){[...target.children].filter(n=>n.tagName!=='SUMMARY').forEach(n=>container.append(n.cloneNode(true)));}
 else if(target){
  const paras=[...target.querySelectorAll('p')].filter(n=>!n.closest('.hub-help')&&!n.classList.contains('eyebrow'));
  paras.slice(0,2).forEach(n=>container.append(n.cloneNode(true)));
 }
 if(!container.textContent.trim()){let text=entry.search;const q=entry.q.toLowerCase();if(text.startsWith(q))text=text.slice(q.length).trim();container.append(el('p','',text?text.charAt(0).toUpperCase()+text.slice(1):'Open the relevant Hub section for the current information.'));}
 container.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
 return container;
}
function show(entry){detail.replaceChildren();if(!entry){detail.append(el('h3','','Can’t find your question?'),el('p','','Try a simpler word, choose another category, or ask Brooke to connect you with the right person.'),helpBlock('answer',[['Help finding the right person','brooke']]));return;}
 const title=el('h3','hub-find-title',entry.q);detail.append(el('p','eyebrow',entry.group),title,answerBody(entry));
 const link=el('a','hub-find-source','Open the full Hub section →');link.href=entry.href;detail.append(link);
 if(entry.id==='request-0'){const a=el('a','hub-help-email','Open the Parent Portal');a.href='https://rivertech.me';detail.append(a);return;}
 const choices=[[entry.q,entry.owner]];if(entry.second)choices.push(['Production props',entry.second]);const help=helpBlock('answer',choices);if(!entry.second)help.querySelectorAll('.hub-help-description')[1]?.remove();detail.append(help);
}
function render(){const words=normalize(input.value).split(' ').filter(Boolean);const matches=entries.filter(e=>(category===categories[0]||e.group===category)&&words.every(w=>normalize(e.q+' '+e.search).includes(w)));
 if(!matches.some(e=>e.id===selected))selected=matches[0]?.id;
 list.replaceChildren();mobileSelect.replaceChildren();matches.forEach(e=>{const b=el('button','hub-find-question',e.q);b.type='button';b.setAttribute('aria-pressed',String(e.id===selected));b.addEventListener('click',()=>{selected=e.id;render()});list.append(b);const option=el('option','',e.q);option.value=e.id;mobileSelect.append(option);});mobileSelect.value=selected||'';mobileSelect.hidden=mobileLabel.hidden=!matches.length;
 status.textContent=matches.length+' '+(matches.length===1?'answer':'answers')+(category===categories[0]?'':' in '+category.toLowerCase());filters.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.textContent===category)));
 if(!matches.length)list.append(el('p','hub-find-empty','No matching questions.'));
 show(matches.find(e=>e.id===selected));}
 categories.forEach(c=>{const b=el('button','',c);b.type='button';b.addEventListener('click',()=>{category=c;render()});filters.append(b)});input.addEventListener('input',render);mobileSelect.addEventListener('change',()=>{selected=mobileSelect.value;render()});render();
// Snapshot shared answers before adding FAQ copies to their source panels.
const answerCopies=new Map(entries.map(entry=>[entry.id,answerBody(entry)]));
const tabQuestions={
 home: ['Where can I find the class schedule?','Where are field-trip details?','Where are casts, scripts, and practice recordings?'],
 shows: ['Where are casts, scripts, and practice recordings?','Who can help with an Aladdin rehearsal question?','How can I help with costumes or props?'],
 calendar: ['Where can I find the class schedule?','Where are field-trip details?','How do I request a change to days, classes or enrollment?'],
 daily: ['How do I report an absence or arrange an early pickup?','What is the dress code?','What devices should students bring?','What supplies do students need?','How can I discuss my child’s progress or classwork?','Who can help with apps, accounts or setup?'],
 billing: ['How much does River Tech cost?','Can I pay tuition by check?','Are there enrollment fees or sibling discounts?','I have a question about my invoice, payment or refund.'],
 contact: ['How do I report an absence or arrange an early pickup?','How do I update records or pickup permissions?','How do I request a change to days, classes or enrollment?','How can I volunteer at River Tech?','How does the wait pool work?']
};
Object.entries(tabQuestions).forEach(([id,questions])=>{
 const faq=el('section','hub-tab-faq');faq.id='questions-'+id;
 const title=el('h3','','Common questions');title.id='questions-title-'+id;faq.setAttribute('aria-labelledby',title.id);faq.append(title);
 questions.forEach(q=>{
  const entry=entries.find(e=>e.q===q);if(!entry)return;
  const row=el('details','hub-faq-answer');const summary=el('summary','',entry.q);
  const body=answerCopies.get(entry.id).cloneNode(true);
  const link=el('a','hub-find-source','View the full information →');link.href=entry.href;body.append(link);
  row.append(summary,body);faq.append(row);
 });
 const help=document.getElementById('help-'+id);help.before(faq);
});
})();
