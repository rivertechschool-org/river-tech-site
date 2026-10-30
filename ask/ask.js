import {readEvents} from './stream.js';
const $=s=>document.querySelector(s);
let history=[],busy=false,mode='sample';
const conversation=$('#conversation'), welcome=$('#welcome');
const answerPreference = {role:'user',content:'My answer preference: talk with me naturally, like a thoughtful, friendly person. Lead with the answer to my question. Use contractions and short everyday sentences. Usually 40–80 words is enough. Give only the details I need now. Avoid report headings, bureaucratic language, long disclaimers, and listing every alternative. For a price question without a payment preference, give the quarterly option first and offer monthly details only as a follow-up. Mention material uncertainty briefly and naturally. Do not invent missing facts or hide limitations.'};
const questions={programs:'We homeschool. Can we come for acting and robotics?',tuition:'How much would two days a week cost?',devices:'Does my homeschooler need a laptop?'};
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function safeLink(url){try{if(url==='mailto:learn@rivertech.me')return true;const u=new URL(url,location.origin);if(u.username||u.password)return false;if(u.origin===location.origin)return u.pathname==='/'||u.pathname.startsWith('/pages/')||u.pathname.startsWith('/school/')||(u.pathname.startsWith('/assets/docs/')&&u.pathname.endsWith('.pdf'));if(u.protocol!=='https:')return false;return ['www.rivertechschool.com','rivertechschool.com'].includes(u.hostname)||(u.hostname==='rivertech.me'&&u.pathname.startsWith('/parents/'))||(u.hostname==='docs.google.com'&&u.pathname.startsWith('/document/d/104T-VPtYPYlxYGGHTXEF-GfKRuqasqFWMNFc7RmNyhI/'));}catch{return false;}}
function message(role,text){
  const el=node('article',undefined,`message ${role}`);
  el.append(node('div',role==='user'?'Your question':'Ask River Tech','message-label'));
  if(text)el.append(node('p',text));
  conversation.append(el);return el;
}
function renderAnswer(data,existing){
  const el=existing||message('assistant');
  if(existing)el.replaceChildren(node('div','Ask River Tech','message-label'));
  el.removeAttribute('aria-busy');
  el.querySelector('.message-label').textContent=data.mode==='sample'?'Ask River Tech · Written example':data.mode==='excerpts'?'Website excerpts · Preview':data.mode==='live'?'Ask River Tech · AI answer':'Ask River Tech';
  if(data.mode!=='live')el.append(node('h3',data.title,'answer-title'));
  for(const paragraph of data.paragraphs)el.append(node('p',paragraph));
  if(data.sources?.length){const links=node('div',undefined,'sources');links.setAttribute('aria-label','School sources');for(const source of data.sources){if(!safeLink(source.url))continue;const a=node('a',source.title+' ↗');a.href=source.url;a.target='_blank';a.rel='noopener';links.append(a);}el.append(links);}
  if(data.action&&safeLink(data.action.url)){const a=node('a',data.action.label+' ↗','next-step');a.href=data.action.url;if(!data.action.url.startsWith('mailto:')){a.target='_blank';a.rel='noopener';}el.append(a);}
  el.scrollIntoView({behavior:'auto',block:'nearest'});
}
function setBusy(value){busy=value;$('#send').disabled=value;$('#question').disabled=value;$('#reset').disabled=value;document.querySelectorAll('[data-sample]').forEach(b=>b.disabled=value);$('#request-status').textContent=value?(mode==='live'?'Checking River Tech’s information…':'Finding the school information…'):'';}
async function ask(question){
  if(busy||!question.trim())return;
  welcome.hidden=true;$('#reset').hidden=false;message('user',question);setBusy(true);$('#question').value='';
  let streamingMessage;
  try{
    const response=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,stream:true,history:[answerPreference,...history.slice(-4)]}),signal:AbortSignal.timeout(90000)});
    let data;
    if(response.ok&&response.headers.get('content-type')?.includes('text/event-stream')){
      for await(const event of readEvents(response.body)){
        if(event.type==='error')throw Error(event.error||'The answer was interrupted. Please try again.');
        if(event.type==='status')$('#request-status').textContent=event.message;
        if(event.type==='draft'){
          if(!event.paragraphs?.some(Boolean)){streamingMessage?.remove();streamingMessage=null;continue;}
          const follow=conversation.scrollHeight-conversation.scrollTop-conversation.clientHeight<90;
          if(!streamingMessage){streamingMessage=message('assistant');streamingMessage.setAttribute('aria-busy','true');}
          streamingMessage.querySelector('.message-label').textContent='Ask River Tech · AI answer';
          const paragraphs=[...streamingMessage.querySelectorAll('p')];
          event.paragraphs.forEach((text,i)=>{const p=paragraphs[i]||node('p');p.textContent=text;if(!p.parentNode)streamingMessage.append(p);});
          paragraphs.slice(event.paragraphs.length).forEach(p=>p.remove());
          $('#request-status').textContent='Writing your answer…';
          if(follow)conversation.scrollTop=conversation.scrollHeight;
        }
        if(event.type==='done')data=event.answer;
      }
      if(!data)throw Error('The connection ended before the answer was complete. Please try again.');
    }else{data=await response.json();if(!response.ok)throw Error(data.error||'Please try again.');}
    renderAnswer(data,streamingMessage);streamingMessage=null;history.push({role:'user',content:question},{role:'assistant',content:[data.title,...data.paragraphs].join('\n').slice(0,2200)});history=history.slice(-6);
  }catch(error){streamingMessage?.remove();renderAnswer({title:'Let’s try another way.',paragraphs:[error.name==='TimeoutError'?'That answer took too long. Please try again or use the Family Hub.':error.message==='Failed to fetch'?'The preview connection is unavailable. Please use the Family Hub or email the school.':error.message],sources:[],action:{label:'Open the Family Hub',url:'https://www.rivertechschool.com/pages/family-hub.html'},mode:'error'});}
  finally{setBusy(false);$('#question').focus({preventScroll:true});}
}
$('#ask-form').addEventListener('submit',e=>{e.preventDefault();ask($('#question').value.trim());});
$('#question').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#ask-form').requestSubmit();}});
document.querySelectorAll('[data-sample]').forEach(b=>b.addEventListener('click',()=>ask(questions[b.dataset.sample])));
$('#reset').addEventListener('click',()=>{history=[];conversation.querySelectorAll('.message').forEach(e=>e.remove());welcome.hidden=false;$('#reset').hidden=true;$('#question').value='';$('#question').focus({preventScroll:true});});
try{
  const response=await fetch('/api/ask/status');if(!response.ok)throw Error();const status=await response.json();mode=status.mode;
  $('#mode-banner').textContent=status.public?'Ask River Tech · Live answers':mode==='live'?'Private preview · Live AI answers':'Private preview · Live AI not connected';
  $('#mode-label').textContent=mode==='live'?'Answers from River Tech’s public information.':'Connect OpenAI to ask questions.';
  $('#composer-hint').textContent=mode==='live'?'No account needed.':'Live answers need an OpenAI connection.';
  $('#sample-disclosure').hidden=mode==='live';
  if(status.reviewed&&status.indexedPages)$('#source-checked').textContent='School website checked '+new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',month:'long',day:'numeric',year:'numeric'}).format(new Date(status.reviewed))+'. Includes '+status.indexedPages+' public pages and '+status.indexedDocuments+' PDFs.';
}catch{
  $('#mode-banner').textContent='Private preview · Connection unavailable';$('#request-status').textContent='Open this preview through its local server to try questions.';
}
