import {readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const indexPath=process.env.ASK_INDEX_PATH||fileURLToPath(new URL(process.env.ASK_WEBSITE_PREVIEW==='1'?'./.runtime/website-preview-index.json':'./website-index.json',import.meta.url));
let cached,stamp=0,refreshing=false;
export function loadIndex(){
  const modified=statSync(indexPath).mtimeMs;
  if(!cached||modified!==stamp){const next=JSON.parse(readFileSync(indexPath,'utf8'));if(!next.sources?.length||!Number.isFinite(Date.parse(next.expiresAt))||!next.coverage?.resources)throw Error('Invalid website index');cached=next;stamp=modified;}
  return cached;
}
export const indexCurrent=()=>Date.parse(loadIndex().expiresAt)>Date.now();
export function refreshIndex(){
  if(refreshing||Date.now()-Date.parse(loadIndex().generatedAt)<6*3600*1000)return;
  refreshing=true;
  const python=process.env.ASK_INDEX_PYTHON||'/Users/danhegelund/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
  const child=spawn(python,[fileURLToPath(new URL('./index_website.py',import.meta.url))],{stdio:'ignore',timeout:300000});
  child.once('error',()=>{refreshing=false;});child.once('exit',()=>{refreshing=false;});
}

const stop=new Set('the and for can with are our what how does have would could from this that your about need some want know come much just really please tell there their them they were when where will you its into like only'.split(' '));
const aliases={scholarships:'scholarship',afford:'assistance',affordable:'assistance',funding:'assistance',aid:'assistance',laptops:'laptop',computers:'computer',costs:'tuition',cost:'tuition',prices:'tuition',price:'tuition',acting:'theater',drama:'theater',enrol:'enrollment',enroll:'enrollment',kids:'children',dresscode:'dress',bus:'transportation',homeschooled:'homeschool',homeschooling:'homeschool',homeschoolers:'homeschool',grades:'grade',transcripts:'transcript',tests:'test',testing:'test',absent:'absence',times:'time',hours:'time',arrive:'arrival',arrives:'arrival',starts:'start'};
export const terms=text=>(text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\bpick[\s-]+up\b/g,'pickup').replace(/\bdrop[\s-]+off\b/g,'dropoff').match(/[a-z0-9]{2,}/g)||[]).map(w=>aliases[w]||w).filter(w=>!stop.has(w));
let preparedFor,prepared,documentFrequency;
function prepare(sources){
  if(preparedFor===sources)return;
  preparedFor=sources;documentFrequency=new Map();
  prepared=sources.map(source=>{
    const words=terms(source.content),title=terms(source.title),counts=new Map();
    for(const word of words)counts.set(word,(counts.get(word)||0)+1);
    for(const word of new Set([...words,...title]))documentFrequency.set(word,(documentFrequency.get(word)||0)+1);
    return {source,counts,title:new Set(title),length:words.length};
  });
}
export function searchWebsite(query,history=[],sources=loadIndex().sources,limit=10){
  prepare(sources);
  const tokens=[...new Set(terms(query))];
  const previous=[...new Set(terms(history.filter(x=>x.role==='user').map(x=>x.content).join(' ')))];
  const scored=prepared.map(row=>{
    let score=0;
    for(const word of tokens){
      const tf=row.counts.get(word)||0;
      const idf=Math.log(1+(sources.length-(documentFrequency.get(word)||0)+.5)/((documentFrequency.get(word)||0)+.5));
      score+=idf*(tf*2.2/(tf+1.2*(.25+.75*row.length/200))+(row.title.has(word)?2.5:0));
    }
    for(const word of previous)if(row.title.has(word))score+=.15;
    return {...row,score};
  }).filter(row=>row.score>0).sort((a,b)=>b.score-a.score);
  // Avoid filling all results with duplicated FAQ summaries of the same section.
  const seen=new Set();const result=[];
  for(const row of scored){const signature=row.source.content.replace(/\s/g,'').slice(0,250);if(seen.has(signature))continue;seen.add(signature);result.push(row.source);if(result.length>=limit)break;}
  return result;
}

export const websiteTools=[{
  type:'function',name:'search_website',description:'Search the complete public River Tech website index, including program tabs, FAQs, policies, dates, linked PDF text and the public directory. Use alternate specific terms if the first snippets are incomplete. Use this before claiming information is absent.',strict:true,
  parameters:{type:'object',additionalProperties:false,properties:{query:{type:'string'}},required:['query']}
},{
  type:'function',name:'read_website_page',description:'Read every indexed section of one school page when search excerpts are not enough. Supply the exact indexed page URL. This never follows an arbitrary outside URL.',strict:true,
  parameters:{type:'object',additionalProperties:false,properties:{url:{type:'string'},part:{type:'integer',description:'Zero-based part; start at 0. The result says whether more parts remain.'}},required:['url','part']}
}];

export function runWebsiteTool(name,args,sources){
  if(name==='search_website'){
    if(typeof args.query!=='string'||args.query.length>500)throw Error('Invalid search');
    return {sources:searchWebsite(args.query,[],sources,8)};
  }
  if(name==='read_website_page'){
    if(typeof args.url!=='string'||!Number.isInteger(args.part)||args.part<0)throw Error('Invalid page request');
    const base=args.url.split('#')[0];
    const matches=sources.filter(s=>s.url.split('#')[0]===base);
    const start=args.part*8;
    return {sources:matches.slice(start,start+8),more:start+8<matches.length,nextPart:start+8<matches.length?args.part+1:null};
  }
  throw Error('Unknown website tool');
}
