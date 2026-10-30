"""Index the published public website, not a manually chosen list of topics.

GET requests only. Follow sitemap + same-site page/document links. Never sign in,
submit a form, execute scripts, or follow a link into the parent portal.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit, unquote
from urllib.request import Request, urlopen
from io import BytesIO
import hashlib, json, mimetypes, os, re, xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[2]
PREVIEW=os.environ.get('ASK_WEBSITE_PREVIEW')=='1'
DEST=ROOT/('tools/ask-river-tech/.runtime/website-preview-index.json' if PREVIEW else 'tools/ask-river-tech/website-index.json')
DEST=Path(os.environ.get('ASK_INDEX_PATH',str(DEST)))
BASE='https://www.rivertechschool.com/'
NOW=datetime.now(timezone.utc)
VOID={'img','br','input','hr','link','meta','source','wbr','area','embed','param','track','col'}
SKIP={'script','style','nav','header','footer','dialog','noscript','template','select','button'}
MEDIA={'.png','.jpg','.jpeg','.webp','.gif','.svg','.ico','.mp4','.mp3','.wav','.mov','.webm','.m4a','.zip','.glb','.gltf','.css','.js','.woff','.woff2','.ttf'}
HANDBOOK_ID='104T-VPtYPYlxYGGHTXEF-GfKRuqasqFWMNFc7RmNyhI'
# These sections conflict with newer published information or decisions under review.
# Keep them out of answer context until the public handbook has been reconciled.
HANDBOOK_HOLD={
    'NON-DISCRIMINATION POLICY':'Use the current notice on the school website.',
    'ATTENDANCE POLICY':'Contains an unverified legal-status claim and older contact instructions.',
    'ABSENCES':'Contact instructions predate the parent-portal rollout.',
    'CLOSED CAMPUS':'Contact instructions predate the parent-portal rollout.',
    'END-OF-DAY PICKUP':'Superseded dismissal choices and late-fee formula.',
    'FOUR-DAY STUDENTS':'Conflicts with written explanations of full-time academic coverage; principal clarification pending.',
    'HOME-SCHOOLERS':'Age range and teacher-qualification statements need reconciliation.',
    'PORTABLE ELECTRONIC DEVICES':'Hardware specifications are superseded by the tiered public device guide.'
}

def normalize(url, base=BASE):
    p=urlsplit(urljoin(base,url))
    if p.scheme not in {'http','https'}: return None
    if p.hostname not in {'www.rivertechschool.com','rivertechschool.com'}: return None
    path=unquote(p.path) or '/'
    if path.endswith('/index.html'):path=path[:-10]
    if any(x in {'.','..'} for x in path.split('/')): return None
    if path.startswith(('/ask/','/tools/','/.','/api/')): return None
    return urlunsplit(('https','www.rivertechschool.com',path,'',''))

def fetch(url):
    try:
        if PREVIEW and normalize(url):
            local=(ROOT/urlsplit(url).path.lstrip('/')).resolve()
            if local.is_dir():local=local/'index.html'
            if local.is_relative_to(ROOT) and local.is_file():
                raw=local.read_bytes()
                if len(raw)>20_000_000:raise ValueError('Resource exceeds 20 MB')
                return {'url':url,'final':normalize(url),'raw':raw,'type':mimetypes.guess_type(local)[0] or 'application/octet-stream','status':'ok'}
        with urlopen(Request(url,headers={'User-Agent':'RiverTech-public-guide/1.0'}),timeout=25) as r:
            final=normalize(r.url)
            if not final: return {'url':url,'status':'external redirect','destination':r.url}
            raw=r.read(20_000_001)
            if len(raw)>20_000_000: raise ValueError('Resource exceeds 20 MB')
            return {'url':url,'final':final,'raw':raw,'type':r.headers.get_content_type(),'status':'ok'}
    except Exception as error: return {'url':url,'status':'failed','error':str(error)}

class Page(HTMLParser):
    def __init__(self,url):
        super().__init__();self.url=url;self.stack=[];self.links=set();self.outbound=set();self.document_notes={};self.lines=[];self.title=[];self.heading='';self.anchor='';self.redirect=None;self.has_main=False
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='main' or 'main-content' in a.get('class','').split():self.has_main=True
        if tag=='meta' and a.get('http-equiv','').lower()=='refresh':
            m=re.search(r'url\s*=\s*(.+)',a.get('content',''),re.I)
            if m:self.redirect=urljoin(self.url,m[1].strip(' \"\''))
        if tag=='a' and a.get('href'):
            full=urljoin(self.url,a['href']);target=normalize(full,self.url)
            if target:
                self.links.add(target)
                if a.get('data-source-note'):self.document_notes[target]=a['data-source-note']
            elif full.startswith(('https://','http://')):self.outbound.add(full)
        if tag in {'h1','h2','h3','h4','p','li','tr','summary','blockquote','figcaption','dt','dd'}:self.flush()
        if tag in {'td','th'}:self.add(' | ')
        if tag=='br':self.add(' / ')
        if tag=='img' and a.get('alt'):self.add('[Image: '+a['alt']+']')
        if tag not in VOID:self.stack.append({'tag':tag,'attrs':a,'heading':tag in {'h1','h2','h3','h4','summary'},'text':[]})
    def handle_endtag(self,tag):
        for n in range(len(self.stack)-1,-1,-1):
            item=self.stack[n]
            if item['tag']==tag:
                if item['heading']:
                    self.heading=' '.join(''.join(item['text']).split())
                    ids=[x['attrs'].get('id') for x in self.stack[:n+1] if x['attrs'].get('id')]
                    self.anchor=self.route(ids)
                    self.add(self.heading)
                if tag in {'h1','h2','h3','h4','p','li','tr','summary','blockquote','figcaption','dt','dd'}:self.flush()
                self.stack=self.stack[:n];break
    def route(self,ids):
        if '/family-hub.html' in self.url:
            for root in ['billing','daily','contact','calendar','shows']:
                if root in ids:
                    children=ids[ids.index(root)+1:]
                    last=children[0] if children else root
                    if root=='calendar':last={'school-dates':'dates','class-schedules':'schedules','field-trips':'trips'}.get(ids[-1],ids[-1])
                    return root if last==root else root+'/'+last
        return ids[-1] if ids else ''
    def active(self):
        return not any(x['tag'] in SKIP or x['attrs'].get('aria-hidden')=='true' or set(x['attrs'].get('class','').split()) & {'sidebar','site-rail','mobile-nav','mobile-menu','hub-answer-result'} for x in self.stack)
    def add(self,text):
        if self.active():self.lines.append((self.heading,self.anchor,text,any(x['tag']=='main' or 'main-content' in x['attrs'].get('class','').split() for x in self.stack)))
    def handle_data(self,data):
        for x in self.stack:
            if x['heading']:x['text'].append(data)
        if any(x['tag']=='title' for x in self.stack):self.title.append(data)
        if not any(x['heading'] for x in self.stack):self.add(data)
    def flush(self):self.add('\n')
    def sections(self):
        groups=[]
        for heading,anchor,text,inmain in self.lines:
            if self.has_main and not inmain:continue
            if not groups or groups[-1][0:2]!=(heading,anchor):groups.append((heading,anchor,[]))
            groups[-1][2].append(text)
        return [(h,a,re.sub(r'[ \t]+',' ',''.join(t)).strip()) for h,a,t in groups if ''.join(t).strip()]

def chunks(text,size=1800):
    # No truncation: every extracted character belongs to an indexed chunk.
    lines=text.splitlines();out=[];current=''
    for line in lines:
        line=line.strip()
        if not line:continue
        if current and len(current)+len(line)>size:out.append(current);current=''
        while len(line)>size:
            if current:out.append(current);current=''
            cut=line.rfind(' ',0,size)
            if cut<1:cut=size
            out.append(line[:cut]);line=line[cut:].lstrip()
        current+=(('\n' if current else '')+line)
    if current:out.append(current)
    return out

def run():
    sitemap=fetch(BASE+'sitemap.xml')
    if sitemap['status']!='ok':raise RuntimeError('Cannot read the public sitemap; preserving last good index')
    seeds={BASE}
    for element in ET.fromstring(sitemap['raw']).iter():
        if element.tag.endswith('loc') and element.text:
            u=normalize(element.text)
            if u:seeds.add(u)
    queue=set(seeds);seen=set();sources=[];pages=[];outbound=set();media=set();redirects=[];failures=[];dynamic=[];source_ids=set();document_notes={}
    def add(url,title,text,kind,chunk_size=1800,context=''):
        # The principal has withdrawn his personal number from public contact use.
        text=re.sub(r'(?:\+?1[\s().-]*)?425[\s().-]*444[\s().-]*2081', '[personal number removed]', text)
        for i,part in enumerate(chunks(text,chunk_size)):
            if context:part=context+'\n\n'+part
            digest=hashlib.sha256((url+'|'+title+'|'+str(i)+'|'+part).encode()).hexdigest()[:16]
            if digest in source_ids:continue
            source_ids.add(digest)
            sources.append({'id':'web_'+digest,'title':title,'url':url,'content':part,'keywords':title,'reviewed':NOW.date().isoformat(),'expires':(NOW+timedelta(days=7)).date().isoformat(),'kind':kind})
    with ThreadPoolExecutor(max_workers=5) as pool:
        while queue:
            batch=sorted(queue-seen);queue.clear()
            if not batch:break
            if len(seen)+len(batch)>500:raise RuntimeError('Discovery exceeded 500 resources; inspect coverage before increasing limit')
            seen.update(batch)
            for result in pool.map(fetch,batch):
                url=result['url']
                if result['status']!='ok':failures.append({k:v for k,v in result.items() if k!='raw'});continue
                final=result['final'];raw=result['raw'];kind=result['type'];count=len(sources)
                if kind=='application/pdf' or final.lower().endswith('.pdf'):
                    try:
                        from pypdf import PdfReader
                        reader=PdfReader(BytesIO(raw));empty=[]
                        for n,pdfpage in enumerate(reader.pages,1):
                            text=pdfpage.extract_text() or ''
                            if text.strip():
                                note=document_notes.get(final,'')
                                add(final+'#page='+str(n),Path(urlsplit(final).path).name+' · page '+str(n),text,'pdf',context='Published course note: '+note if note else '')
                            else:empty.append(n)
                        pages.append({'url':url,'canonical':final,'kind':'pdf','chunks':len(sources)-count,'pages':len(reader.pages),'pagesWithoutText':empty})
                    except Exception as error:failures.append({'url':url,'status':'PDF extraction failed','error':str(error)})
                    continue
                if kind not in {'text/html','application/xhtml+xml'}:
                    failures.append({'url':url,'status':'unsupported content','type':kind});continue
                html=raw.decode('utf-8','replace')
                page=Page(final);page.feed(html);document_notes.update(page.document_notes)
                # Legacy addresses also use JavaScript redirects. Read the literal
                # destination; never execute page code during a crawl.
                moved=re.search(r'(?:window\.)?location\.(?:replace|assign)\(\s*[\"\']([^\"\']+)[\"\']',html)
                if moved and not page.redirect:page.redirect=urljoin(final,moved[1])
                if page.redirect:
                    dest=normalize(page.redirect,final)
                    redirects.append({'url':url,'destination':page.redirect})
                    if dest and dest not in seen:queue.add(dest)
                    else:outbound.add(page.redirect)
                    continue
                if final!=url:redirects.append({'url':url,'destination':final})
                if final!=url and final in seen:continue
                seen.add(final)
                title=' '.join(''.join(page.title).split()) or Path(urlsplit(final).path).stem or 'River Tech'
                sections=page.sections()
                # Keep a short, linked section together. Separating a heading such as
                # 'Up to $5,000' from its scholarship section loses the policy context.
                grouped=[]
                for heading,anchor,text in sections:
                    if anchor and grouped and grouped[-1][1]==anchor:
                        previous=grouped[-1]
                        grouped[-1]=(previous[0],anchor,previous[2]+'\n'+text)
                    else:grouped.append((heading,anchor,text))
                for heading,anchor,text in grouped:
                    if final.endswith('/pages/river-tech-days.html'):
                        text='Historical May 2026 school visit event. These event-specific hours and instructions do not describe the regular school program. Future visit dates have not been announced.\n'+text
                    add(final+('#'+anchor if anchor else ''),title+(' · '+heading if heading else ''),text,'page',4000 if anchor else 1800)
                if final==BASE:
                    footer=re.search(r'<footer\b[^>]*>([\s\S]*?)</footer>',html,re.I)
                    if footer:
                        footer_page=Page(final);footer_page.feed(footer[1])
                        for _,_,text in footer_page.sections():add(final,'School contact and legal notices',text,'footer')
                # Full-time program panels are JSON-encoded HTML in the page.
                # Include every level, not only the initially visible tab.
                panel_start=re.search(r'const panels\s*=\s*',html)
                if panel_start:
                    try:
                        panels,_=json.JSONDecoder().raw_decode(html[panel_start.end():])
                        for level,markup in panels.items():
                            panel=Page(final+'#'+level);panel.feed(markup)
                            for heading,anchor,text in panel.sections():add(final+'#'+level,title+' · '+level.title()+(' · '+heading if heading else ''),text,'program-panel')
                            page.links.update(panel.links);outbound.update(panel.outbound)
                        dynamic.append({'url':final,'kind':'program panels','items':len(panels)})
                    except Exception as error:failures.append({'url':final,'status':'program panel extraction failed','error':str(error)})
                videos=re.search(r'const videos\s*=\s*(\[[\s\S]*?\]);',html)
                if videos:
                    try:
                        entries=json.loads(re.sub(r'\b(id|title)\s*:',r'"\1":',videos[1]))
                        add(final,title+' · Video library','\n'.join(v['title']+' — https://www.youtube.com/watch?v='+v['id'] for v in entries),'video-catalog')
                        dynamic.append({'url':final,'kind':'video titles and links','items':len(entries)})
                    except Exception as error:failures.append({'url':final,'status':'video catalog extraction failed','error':str(error)})
                if final.endswith('/pages/family-fair.html'):
                    try:
                        config=fetch(BASE+'assets/js/family-fair-config.js')
                        endpoint=re.search(r"FAMILY_FAIR_API\s*=\s*'([^']+)'",config['raw'].decode())[1]
                        endpoint_parts=urlsplit(endpoint)
                        if endpoint_parts.scheme!='https' or endpoint_parts.hostname!='script.google.com' or not endpoint_parts.path.startswith('/macros/s/'):raise ValueError('Unexpected public directory host')
                        # This is exactly the unauthenticated public GET used by
                        # the page. Only fields displayed on public cards enter.
                        with urlopen(Request(endpoint+'?action=list',headers={'User-Agent':'RiverTech-public-guide/1.0'}),timeout=30) as response:public=json.load(response)
                        if not public.get('ok'):raise ValueError('Public directory unavailable')
                        listings=public['data']['listings']
                        for item in listings:
                            text='\n'.join(f'{key}: {item[key]}' for key in ['title','category','name','description','contactEmail','contactPhone','website'] if item.get(key))
                            add(final,title+' · '+item['title'],text,'public-directory')
                        dynamic.append({'url':final,'kind':'approved public directory cards','items':len(listings)})
                    except Exception as error:failures.append({'url':final,'status':'public directory extraction failed','error':str(error)})
                pages.append({'url':url,'canonical':final,'title':title,'kind':'page','chunks':len(sources)-count,'contentHash':hashlib.sha256(raw).hexdigest()})
                outbound.update(page.outbound)
                for link in page.links:
                    suffix=Path(urlsplit(link).path).suffix.lower()
                    if suffix in MEDIA:media.add(link);continue
                    if suffix in {'','.html','.htm','.pdf'} and link not in seen:queue.add(link)
                # The homepage's interactive tuition prices live in this public script.
                if final==BASE:
                    js=fetch(BASE+'assets/homepage/home.js')
                    if js['status']=='ok':
                        match=re.search(r'const rates=(\{.*?\});',js['raw'].decode())
                        if match:
                            rates=json.loads(re.sub(r'(\w+):',r'"\1":',match[1]));lines=[]
                            for program,days in rates.items():
                                for day,amounts in days.items():
                                    m,q,a=amounts
                                    lines.append(f"{'Full-time' if program=='full' else 'À La Carte'} {day} days: ${m} monthly, 12 payments (${m*12}/year); ${q} quarterly, 4 payments (${q*4}/year); annual plan ${a}. Per student. Different plans have different totals.")
                            add(BASE+'#tuition','Published tuition calculator','\n'.join(lines),'calculator')
                        else:failures.append({'url':BASE+'assets/homepage/home.js','status':'calculator prices not extracted'})
                    else:failures.append({'url':BASE+'assets/homepage/home.js','status':'calculator could not be fetched'})
    external_documents=[]
    handbook_links=[u for u in outbound if 'docs.google.com/document/d/'+HANDBOOK_ID+'/' in u]
    if handbook_links:
        handbook_url='https://docs.google.com/document/d/'+HANDBOOK_ID+'/edit'
        try:
            export='https://docs.google.com/document/d/'+HANDBOOK_ID+'/export?format=txt'
            # Anonymous request only: a signed-in/private Drive document is never imported.
            with urlopen(Request(export,headers={'User-Agent':'RiverTech-public-guide/1.0'}),timeout=25) as response:
                if response.headers.get_content_type()!='text/plain':raise ValueError('Handbook is not anonymously readable text')
                handbook=response.read(1_000_001).decode('utf-8-sig').replace('\r\n','\n').replace('\r','\n')
            if len(handbook)>1_000_000 or not handbook.startswith('River Tech Handbook'):raise ValueError('Unexpected handbook content')
            date=re.search(r'Last updated:\s*([^\n]+)',handbook)
            source_date=date[1].strip() if date else 'date not stated'
            body=handbook[handbook.index('\nSCHOOL CULTURE\nIdaho Roots\n'):]
            headings=list(re.finditer(r'^([A-Z][A-Z /&–-]{3,})[ \t]*$',body,re.M))
            if len(headings)<15:raise ValueError('Handbook section structure changed')
            included=[];held=[]
            for n,heading in enumerate(headings):
                name=heading[1].strip()
                if name in HANDBOOK_HOLD:
                    held.append({'section':name,'reason':HANDBOOK_HOLD[name]});continue
                section=body[heading.end():headings[n+1].start() if n+1<len(headings) else len(body)].strip()
                add(handbook_url,'River Tech Handbook · '+name,f'Handbook section: {name}. Document dated {source_date}.\n'+section,'public-handbook')
                included.append(name)
            external_documents.append({'url':handbook_url,'kind':'public-handbook','anonymousAccess':True,'sourceDate':source_date,'includedSections':included,'heldSections':held,'excludedFrontMatter':'Table of contents and external emergency-services directory; not school question-and-answer material.'})
        except Exception as error:failures.append({'url':handbook_url,'status':'Public handbook extraction failed','error':str(error)})
    # Only the linked, anonymous parent guide is imported; never crawl portal accounts.
    guide_url='https://rivertech.me/parents/'
    try:
        with urlopen(Request(guide_url,headers={'User-Agent':'RiverTech-public-guide/1.0'}),timeout=25) as response:
            if response.url.rstrip('/')!=guide_url.rstrip('/') or response.headers.get_content_type()!='text/html':raise ValueError('Unexpected parent guide response')
            raw=response.read(1_000_001)
        if len(raw)>1_000_000:raise ValueError('Parent guide exceeds size limit')
        class ParentGuide(Page):
            def active(self):
                return super().active() and not any(set(x['attrs'].get('class','').split()) & {'shot','caption'} for x in self.stack)
        guide=ParentGuide(guide_url);guide.feed(raw.decode('utf-8'))
        allowed={'setup','create','confirm','link','openchild','around','absence','lateearly','messages','classes','extras','settings','help','stuck','cannot'}
        grouped={}
        for heading,anchor,text in guide.sections():
            if anchor in allowed:
                grouped.setdefault(anchor,[]).append(text)
        if not {'link','classes','stuck'}.issubset(grouped):raise ValueError('Parent guide structure changed')
        for anchor,parts in grouped.items():
            text='\n'.join(parts)
            add(guide_url+'#'+anchor,'Parent Portal Guide · '+anchor,text,'public-portal-guide',4000)
        external_documents.append({'url':guide_url,'kind':'public-portal-guide','anonymousAccess':True,'includedSections':list(grouped),'excludedSections':['progress','reports'],'exclusionReason':'Report cards are addressed by the current program-specific Hub FAQ. Illustrative screenshots and example records are excluded.'})
    except Exception as error:failures.append({'url':guide_url,'status':'Public parent guide extraction failed','error':str(error)})
    if len(pages)<10 or not sources:raise RuntimeError('Incomplete crawl; preserving last good index')
    covered={x['url'] for x in pages}|{x['url'] for x in redirects}
    missing=sorted(seeds-covered)
    report={'generatedAt':NOW.isoformat(),'sitemapPages':len(seeds),'pagesIndexed':sum(x['kind']=='page' for x in pages),'pdfsIndexed':sum(x['kind']=='pdf' for x in pages),'chunks':len(sources),'sitemapMissing':missing,'failures':failures,'redirects':redirects,'dynamicContent':dynamic,'resources':pages,'linkedMedia':sorted(media),'externalLinks':sorted(outbound),'limits':['Images and audiovisual content are represented by captions/links, not transcribed.','External websites and signed-in portals are linked, not crawled.','PDF pages without extractable text are listed explicitly.']}
    if failures or missing:
        (DEST.parent/'website-refresh-failure.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
        raise RuntimeError('Coverage gaps detected; preserving the last complete index. See website-refresh-failure.json.')
    report['mode']='local-preview' if PREVIEW else 'published'
    report['externalDocuments']=external_documents
    index={'generatedAt':NOW.isoformat(),'expiresAt':(NOW+timedelta(days=7)).isoformat(),'sources':sources,'coverage':report}
    DEST.parent.mkdir(parents=True,exist_ok=True)
    temp=DEST.with_suffix('.tmp');temp.write_text(json.dumps(index,ensure_ascii=False));temp.replace(DEST)
    (DEST.parent/('website-preview-coverage.json' if PREVIEW else 'website-coverage.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['sitemapPages','pagesIndexed','pdfsIndexed','chunks','sitemapMissing','failures']},ensure_ascii=False))

if __name__=='__main__':run()
