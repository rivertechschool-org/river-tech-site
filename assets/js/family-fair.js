(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const admin = document.body.dataset.fair === 'admin';
  const endpoint = window.FAMILY_FAIR_API;
  let session = null, listings = [], mine = [], editing = null, requestId = '', intent = 'create', photo = '', photoBusy = false, photoGeneration = 0;
  const auth = $('ff-auth'), editor = $('ff-editor');
  function message(text, error = false, target = 'ff-status') { const el = $(target); el.textContent = text; el.classList.toggle('error', error); }
  async function api(action, data = {}, publicRead = false) {
    if (!endpoint) throw new Error('Family Fair is being prepared. Please check back soon.');
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 25000);
    try {
      let response;
      if (publicRead) { const url = new URL(endpoint, location.origin); url.search = new URLSearchParams({action, ...data, v:Date.now()}); response = await fetch(url, {signal:abort.signal, credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer'}); }
      else response = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action,...data,token:session?.token}),signal:abort.signal,credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer'});
      const result = await response.json();
      if (!result.ok) { if(result.code === 'AUTH') {session=null; $('ff-signout').hidden=true;if(admin)$('ff-manage').textContent='Sign in to review';} throw new Error(result.error || 'Please try again shortly.'); }
      return result.data;
    } catch (error) { if(error.name === 'AbortError') throw new Error('The connection took too long. Please try again; your listing will not be duplicated.'); if(error instanceof TypeError || error instanceof SyntaxError) throw new Error('Could not connect to Family Fair. Check your connection and try again.'); throw error; }
    finally { clearTimeout(timer); }
  }
  function node(tag, text, className) { const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el; }
  function button(text,fn,cls='ff-secondary'){const b=node('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;}
  function link(text,href){const a=node('a',text);a.href=href;a.rel='noopener noreferrer';if(href.startsWith('https:'))a.target='_blank';return a;}
  function card(item, mode='public') {
    const el=node('article',undefined,'ff-card');
    if(item.hasPhoto){const img=node('img',undefined,'ff-photo');img.alt='Photo for '+item.title;img.loading='lazy';el.append(img);const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();api(mode==='public'?'photo':mode==='admin'?'reviewPhoto':'privatePhoto',{id:item.id},mode==='public').then(d=>{if(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(d.photo))img.src=d.photo;}).catch(()=>img.remove());}});observer.observe(img);}
    const body=node('div',undefined,'ff-card-body');body.append(node('span',item.category,'ff-tag'),node('h3',item.title),node('p',item.kind==='student'?item.name+' · Parent-managed':item.name,'ff-person'),node('p',item.description));
    if(mode!=='public'){
      const states={pending:'Awaiting approval',approved:'Published',rejected:'Needs changes'};
      body.append(node('p',states[item.status]||item.status,'ff-person'));
      if(item.reviewNote)body.append(node('p','School note: '+item.reviewNote,'ff-person'));
      const controls=node('div',undefined,'ff-review-controls');
      if(mode==='mine'){controls.append(button('Edit',()=>openEditor(item)),button('Remove',()=>remove(item)));}
      else{
        body.append(node('p','Submitted by '+item.ownerEmail,'ff-person'));
        if(item.status==='pending')controls.append(button('Approve',()=>review(item,'approved'),'ff-primary'));
        controls.append(button(item.status==='approved'?'Take down':'Request changes',()=>openReview(item)));
      }
      body.append(controls);
    }
    const contacts=node('div',undefined,'ff-contact');contacts.append(link(item.kind==='student'?'Email parent':'Email','mailto:'+encodeURIComponent(item.contactEmail)));
    if(item.contactPhone)contacts.append(link('Call','tel:'+item.contactPhone.replace(/[^+\d]/g,'')));
    if(item.website && /^https:\/\//.test(item.website))contacts.append(link('Website ↗',item.website));
    el.append(body,contacts);return el;
  }
  function empty(title,copy){const e=node('div',undefined,'ff-empty');e.append(node('h2',title),node('p',copy));return e;}
  function render(){
    const q=$('ff-search')?.value.trim().toLowerCase()||'',category=$('ff-category')?.value||'';
    const visible=listings.filter(i=>(!category||i.category===category)&&(!q||[i.title,i.name,i.description,i.category].join(' ').toLowerCase().includes(q)));
    const grid=$('ff-listings');grid.replaceChildren(...visible.map(i=>card(i,admin?'admin':'public')));
    if(!visible.length)grid.append(empty(admin?'All caught up':q||category?'No listings found':'A little community. A lot to offer.',admin?'New submissions will appear here for your review.':q||category?'Try a different search or category.':'Be the first to share a business, a handmade creation, or a helping hand.'));
    $('ff-count').textContent=visible.length+' '+(visible.length===1?'listing':'listings')+(admin?' to manage':' to explore');
  }
  async function load(){try{if(admin&&!session)return;const d=await api(admin?'reviewList':'list',{},!admin);listings=d.listings;render();}catch(e){message(e.message,true);$('ff-count').textContent='Listings unavailable';$('ff-listings').replaceChildren(button('Try again',load));}}
  function openAuth(next){intent=next;message('',false,'ff-auth-status');$('ff-email-step').hidden=false;$('ff-code-step').hidden=true;auth.showModal();$('ff-email').focus();}
  async function authenticated(next){if(!session){openAuth(next);return;}if(next==='create')openEditor();else if(next==='mine')await loadMine();else await load();}
  async function loadMine(){try{const d=await api('mine');mine=d.listings;$('ff-mine').hidden=false;$('ff-mine-list').replaceChildren(...mine.map(i=>card(i,'mine')));if(!mine.length)$('ff-mine-list').append(empty('Your corner of the fair','Create a listing to share something with the community.'));$('ff-mine').scrollIntoView({behavior:'smooth'});}catch(e){message(e.message,true);}}
  function openEditor(item=null){editing=item;photo='';photoBusy=false;photoGeneration++;requestId=crypto.randomUUID();$('ff-listing-form').reset();message('',false,'ff-editor-status');$('ff-editor-title').textContent=item?'Edit your listing':'Share something with the community';['title','name','kind','category','description','contactEmail','contactPhone','website'].forEach(k=>{$(k==='category'?'ff-category-input':'ff-'+k).value=item?.[k] || (k==='kind'?'parent':k==='category'?'Services':k==='contactEmail'?session.email:'');});$('ff-remove-photo-wrap').hidden=!item?.hasPhoto;$('ff-photo-preview').hidden=true;updateKind();editor.showModal();$('ff-title').focus();}
  function updateKind(){const student=$('ff-kind').value==='student';$('ff-name-label').textContent=student?'Student’s first name':'Parent or business name';$('ff-student-help').hidden=!student;$('ff-contactEmail').readOnly=student;if(student)$('ff-contactEmail').value=session.email;$('ff-adult-contact').hidden=student;}
  async function busy(form,work){const buttons=[...form.querySelectorAll('button[type=submit]')];buttons.forEach(b=>b.disabled=true);try{await work();}finally{buttons.forEach(b=>b.disabled=false);}}
  $('ff-email-form').addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,async()=>{try{message('',false,'ff-auth-status');const d=await api('requestCode',{email:$('ff-email').value,purpose:admin?'admin':'parent'});$('ff-email-step').hidden=true;$('ff-code-step').hidden=false;message(d.message,false,'ff-auth-status');$('ff-code').value='';$('ff-code').focus();}catch(err){message(err.message,true,'ff-auth-status');}});});
  $('ff-code-form').addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,async()=>{try{session=await api('verifyCode',{email:$('ff-email').value,code:$('ff-code').value.trim(),purpose:admin?'admin':'parent'});auth.close();$('ff-signout').hidden=false;if(admin)$('ff-manage').textContent='Refresh listings';message('Signed in as '+session.email+'.');await authenticated(intent);}catch(err){message(err.message,true,'ff-auth-status');}});});
  $('ff-resend').addEventListener('click',()=>{$('ff-code-step').hidden=true;$('ff-email-step').hidden=false;message('You can request another code after one minute.',false,'ff-auth-status');});
  $('ff-signout').addEventListener('click',async()=>{try{await api('logout');session=null;mine=[];if($('ff-mine')){$('ff-mine').hidden=true;$('ff-mine-list').replaceChildren();}if(admin){listings=[];$('ff-listings').replaceChildren();$('ff-count').textContent='Sign in to review submissions.';}$('ff-signout').hidden=true;if(admin)$('ff-manage').textContent='Sign in to review';message('You’re signed out.');}catch(e){message(e.message,true);}});
  $('ff-create')?.addEventListener('click',()=>authenticated('create'));
  $('ff-manage')?.addEventListener('click',()=>authenticated(admin?'admin':'mine'));
  $('ff-search')?.addEventListener('input',render);$('ff-category')?.addEventListener('change',render);
  $('ff-kind')?.addEventListener('change',updateKind);
  document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  async function resize(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Choose a JPG, PNG, or WebP photo under 10 MB.');
    const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>40000000){bitmap.close();throw new Error('That photo is too large. Choose a smaller image.');}
    const scale=Math.min(1,1000/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    for(const quality of [.8,.65,.5,.35]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<=180000)return data;}throw new Error('That photo has too much detail. Please crop it or choose a smaller one.');
  }
  $('ff-photo')?.addEventListener('change',async e=>{
    const generation=++photoGeneration, file=e.target.files[0];photo='';photoBusy=false;$('ff-photo-preview').hidden=true;
    if(!file)return;photoBusy=true;message('Preparing photo…',false,'ff-editor-status');
    try{const prepared=await resize(file);if(generation!==photoGeneration)return;photo=prepared;$('ff-photo-preview').src=photo;$('ff-photo-preview').hidden=false;message('',false,'ff-editor-status');}
    catch(err){if(generation===photoGeneration){e.target.value='';message(err.message,true,'ff-editor-status');}}
    finally{if(generation===photoGeneration)photoBusy=false;}
  });
  $('ff-listing-form')?.addEventListener('submit',e=>{e.preventDefault();if(photoBusy){message('Please wait for the photo to finish.',false,'ff-editor-status');return;}busy(e.currentTarget,async()=>{try{const listing={};['title','name','kind','category','description','contactEmail','contactPhone','website'].forEach(k=>listing[k]=$(k==='category'?'ff-category-input':'ff-'+k).value);listing.consent=$('ff-consent').checked;await api('save',{id:editing?.id,version:editing?.version,requestId,listing,photo,removePhoto:$('ff-remove-photo').checked});editor.close();message('Your listing is awaiting school approval. It will appear publicly after approval.');await load();await loadMine();}catch(err){message(err.message,true,'ff-editor-status');}});});
  let removing=null;
  function remove(item){removing=item;$('ff-remove-title').textContent='Remove “'+item.title+'”?';$('ff-remove-dialog').showModal();}
  $('ff-remove-confirm')?.addEventListener('click',async e=>{e.currentTarget.disabled=true;try{await api('remove',{id:removing.id,version:removing.version});$('ff-remove-dialog').close();message('Listing removed.');await load();await loadMine();}catch(err){$('ff-remove-dialog').close();message(err.message,true);}finally{$('ff-remove-confirm').disabled=false;}});
  async function review(item,decision,note=''){try{await api('review',{id:item.id,version:item.version,decision,note});message(decision==='approved'?'Listing approved and published.':'Listing hidden; the family can read your note in My listings.');await load();return true;}catch(e){message(e.message,true);return false;}}
  let reviewing=null;
  function openReview(item){reviewing=item;$('ff-review-note').value='';$('ff-review-dialog').showModal();$('ff-review-note').focus();}
  $('ff-review-form')?.addEventListener('submit',e=>{e.preventDefault();busy(e.currentTarget,async()=>{if(await review(reviewing,'rejected',$('ff-review-note').value))$('ff-review-dialog').close();});});
  if(admin){$('ff-count').textContent='Sign in to review submissions.';}else load();
})();
