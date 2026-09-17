/* Standalone Family Fair web app. Never add this to an existing form project.
 * Configure Script Properties; see README.md. Register access is read-only.
 * Only doGet/doPost are remote entry points. No setup, mail or test endpoint.
 */
var FF_HEADERS = ['ID','Owner email','Status','Version','Created','Updated','Reviewer','Reviewed','Request ID','Request hash','Listing JSON','Photo file','Review note'];
var FF_CATEGORIES = ['Businesses','Services','Products','Student jobs'];

function ffError_(code, message) { var e = new Error(message); e.code = code; throw e; }
function ffJson_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function doGet(e) { return ffRespond_(e && e.parameter || {}, false); }
function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents || '';
    if (raw.length > 230000) ffError_('INVALID', 'That photo is too large. Please choose a smaller one.');
    return ffRespond_(JSON.parse(raw), true);
  } catch (err) { return ffJson_({ok:false, code:'INVALID', error:'Please check your submission and try again.'}); }
}
function ffRespond_(input, post) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) ffError_('BUSY', 'Please try again in a moment.');
    var cfg = ffConfig_();
    return ffJson_({ok:true, data:ffDispatch_(input, post, cfg)});
  } catch (err) {
    // No raw provider messages, emails, codes, tokens or sheet identifiers in responses/logs.
    return ffJson_({ok:false, code:err.code || 'UNAVAILABLE', error:err.code ? err.message : 'Family Fair is temporarily unavailable. Please try again shortly.'});
  } finally { if (lock.hasLock()) lock.releaseLock(); }
}
function ffConfig_() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {props:p, register:p.getProperty('REGISTER_ID'), registerTab:p.getProperty('REGISTER_TAB') || 'Register', book:p.getProperty('LISTINGS_ID'), photos:p.getProperty('PHOTOS_FOLDER_ID'), secret:p.getProperty('AUTH_SECRET'), admins:(p.getProperty('ADMIN_EMAILS') || '').split(',').map(ffEmail_).filter(Boolean)};
  if (!cfg.register || !cfg.book || !cfg.photos || !cfg.secret || cfg.secret.length < 43 || !cfg.admins.length || cfg.register === cfg.book) throw new Error('Configuration incomplete');
  return cfg;
}
function ffEmail_(s) { return typeof s === 'string' ? s.trim().toLowerCase() : ''; }
function ffValidEmail_(s) { return s.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(s); }
function ffHash_(s, cfg) { return Utilities.computeHmacSha256Signature(s, cfg.secret).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join(''); }
function ffRandom_(cfg) { return ffHash_(Utilities.getUuid() + Utilities.getUuid() + Date.now(), cfg); }
function ffEqual_(a,b) { var diff = a.length ^ b.length; for(var i=0;i<Math.max(a.length,b.length);i++) diff |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0); return diff===0; }
function ffReadState_(key,cfg) { var raw=cfg.props.getProperty(key); if(!raw)return null; var state=JSON.parse(raw); if(state.expires<=Date.now()){cfg.props.deleteProperty(key);return null;}return state; }
function ffWriteState_(key,state,cfg) { cfg.props.setProperty(key,JSON.stringify(state)); }
function ffPrune_(cfg) { var all=cfg.props.getProperties(); Object.keys(all).filter(function(k){return /^(otp|session|rate):/.test(k);}).forEach(function(k){if(JSON.parse(all[k]).expires<=Date.now())cfg.props.deleteProperty(k);}); }

// Read only the three eligibility columns. No names, grades, dates of birth or notes.
function ffFamilies_(cfg) {
  var sh=SpreadsheetApp.openById(cfg.register).getSheetByName(cfg.registerTab);
  if(!sh)throw new Error('Register unavailable');
  var headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  var columns=['Status','Parent email','Parent 2 email'].map(function(h){var i=headers.indexOf(h);if(i<0 || headers.lastIndexOf(h)!==i)throw new Error('Register schema mismatch');return i+1;});
  var n=sh.getLastRow()-1, eligible={}; if(n<=0)return eligible;
  var data=columns.map(function(col){return sh.getRange(2,col,n,1).getDisplayValues();});
  for(var r=0;r<n;r++) if(['Enrolled','Committed'].indexOf(data[0][r][0].trim())>=0) [1,2].forEach(function(c){var email=ffEmail_(data[c][r][0]);if(ffValidEmail_(email))eligible[email]=true;});
  return eligible;
}
function ffAllowed_(email,purpose,cfg) { return purpose==='admin' ? cfg.admins.indexOf(email)>=0 : !!ffFamilies_(cfg)[email]; }
function ffRate_(key,limit,ms,cfg) { var state=ffReadState_(key,cfg)||{count:0,expires:Date.now()+ms};if(state.count>=limit)return false;state.count++;ffWriteState_(key,state,cfg);return true; }
function ffRequestCode_(p,cfg) {
  var email=ffEmail_(p.email), purpose=p.purpose==='admin'?'admin':'parent';
  var generic={message:'If this email is eligible, a code will arrive shortly. Check your inbox and spam folder.'};
  if(!ffValidEmail_(email))return generic;
  ffPrune_(cfg);
  var key=ffHash_(purpose+':'+email,cfg);
  // Persistent limits cannot disappear through cache eviction. Unknown addresses are identical.
  if(!ffRate_('rate:global',80,3600000,cfg))return generic;
  if(!ffRate_('rate:email:'+key,5,3600000,cfg))return generic;
  var prior=ffReadState_('otp:'+key,cfg);
  if(prior && Date.now()-prior.sent<60000)return generic;
  if(!ffAllowed_(email,purpose,cfg))return generic;
  if(MailApp.getRemainingDailyQuota()<1)return generic;
  var code=('00000000'+(parseInt(ffRandom_(cfg).slice(0,12),16)%100000000)).slice(-8);
  var state={hash:ffHash_(key+':'+code,cfg),tries:0,sent:Date.now(),expires:Date.now()+600000};
  ffWriteState_('otp:'+key,state,cfg);
  try { MailApp.sendEmail({to:email,subject:'Your River Tech Family Fair sign-in code',body:'Your Family Fair '+(purpose==='admin'?'admin ':'')+'sign-in code is:\n\n'+code+'\n\nIt expires in 10 minutes and works once. Do not share this code.\n\nIf you did not request it, you can ignore this email.',name:'River Tech Family Fair'}); }
  catch(err){cfg.props.deleteProperty('otp:'+key);}
  return generic;
}
function ffVerifyCode_(p,cfg) {
  var email=ffEmail_(p.email), purpose=p.purpose==='admin'?'admin':'parent', key=ffHash_(purpose+':'+email,cfg);
  var state=ffReadState_('otp:'+key,cfg);
  if(!state || state.tries>=5)ffError_('CODE','That code is invalid or expired. Request a new code.');
  state.tries++;ffWriteState_('otp:'+key,state,cfg);
  if(typeof p.code!=='string' || !/^\d{8}$/.test(p.code) || !ffEqual_(state.hash,ffHash_(key+':'+p.code,cfg)))ffError_('CODE','That code is invalid or expired. Request a new code.');
  cfg.props.deleteProperty('otp:'+key);
  if(!ffAllowed_(email,purpose,cfg))ffError_('AUTH','This email is no longer eligible. Please contact the school.');
  var token=ffRandom_(cfg), expires=Date.now()+8*3600000;
  ffWriteState_('session:'+ffHash_(token,cfg),{email:email,purpose:purpose,expires:expires},cfg);
  return {token:token,email:email,expires:expires};
}
function ffSession_(p,cfg,purpose) {
  if(typeof p.token!=='string' || !/^[0-9a-f]{64}$/.test(p.token))ffError_('AUTH','Please sign in again.');
  var s=ffReadState_('session:'+ffHash_(p.token,cfg),cfg);
  if(!s || s.purpose!==purpose)ffError_('AUTH','Please sign in again.');
  if(!ffAllowed_(s.email,s.purpose,cfg))ffError_('AUTH','This email is no longer eligible. Please contact the school.');
  return s;
}
function ffSheet_(cfg) {
  var sh=SpreadsheetApp.openById(cfg.book).getSheetByName('Listings');
  if(!sh || JSON.stringify(sh.getRange(1,1,1,FF_HEADERS.length).getValues()[0])!==JSON.stringify(FF_HEADERS))throw new Error('Listing schema mismatch');
  return sh;
}
function ffRows_(sh) { return sh.getLastRow()<2?[]:sh.getRange(2,1,sh.getLastRow()-1,FF_HEADERS.length).getValues().map(function(r,i){return {row:i+2,id:r[0],owner:JSON.parse(r[1]),status:r[2],version:Number(r[3]),created:r[4],updated:r[5],reviewer:r[6]?JSON.parse(r[6]):'',reviewed:r[7],request:r[8],hash:r[9],data:JSON.parse(r[10]),photo:r[11],note:r[12]?JSON.parse(r[12]):''};}); }
function ffSaveRow_(sh,r) {
  // User text lives inside JSON, never in formula-interpreted cells.
  sh.getRange(r.row,1,1,FF_HEADERS.length).setValues([[r.id,JSON.stringify(r.owner),r.status,r.version,r.created,r.updated,r.reviewer?JSON.stringify(r.reviewer):'',r.reviewed,r.request,r.hash,JSON.stringify(r.data),r.photo,r.note?JSON.stringify(r.note):'']]);
  SpreadsheetApp.flush();
}
function ffPublic_(r) { return {id:r.id,title:r.data.title,name:r.data.name,kind:r.data.kind,category:r.data.category,description:r.data.description,contactEmail:r.data.contactEmail,contactPhone:r.data.contactPhone,website:r.data.website,hasPhoto:!!r.photo}; }
function ffPrivate_(r) { var v=ffPublic_(r);v.status=r.status;v.version=r.version;v.updated=r.updated;v.reviewNote=r.note||'';return v; }
function ffText_(s,max,label) { if(typeof s!=='string' || !s.trim() || s.trim().length>max || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(s))ffError_('INVALID','Please check '+label+'.');return s.trim(); }
function ffListing_(p,email) {
  if(p.consent!==true)ffError_('INVALID','A parent or guardian must approve the public listing.');
  if(p.kind!=='parent' && p.kind!=='student')ffError_('INVALID','Choose who this listing is for.');
  var d={title:ffText_(p.title,80,'the title'),name:ffText_(p.name,60,'the name'),kind:p.kind,category:ffText_(p.category,30,'the category'),description:ffText_(p.description,600,'the description')};
  if(FF_CATEGORIES.indexOf(d.category)<0)ffError_('INVALID','Choose a category.');
  if(d.kind==='student' && !/^[\p{L}\p{M}]+(?:[-’'][\p{L}\p{M}]+)*$/u.test(d.name))ffError_('INVALID','For a student, use a first name only.');
  d.contactEmail=d.kind==='student'?email:ffEmail_(p.contactEmail);
  if(!ffValidEmail_(d.contactEmail))ffError_('INVALID','Enter a valid contact email.');
  d.contactPhone=d.kind==='student'?'':String(p.contactPhone||'').trim();
  if(d.contactPhone && (!/^[+()\d .-]{7,24}$/.test(d.contactPhone) || d.contactPhone.replace(/\D/g,'').length<7))ffError_('INVALID','Enter a valid phone number.');
  d.website=d.kind==='student'?'':String(p.website||'').trim();
  if(d.website && (d.website.length>300 || !/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(?::443)?(?:[/?#][^\s<>"\\]*)?$/i.test(d.website)))ffError_('INVALID','Use a complete https:// website address.');
  d.consentAt=new Date().toISOString();d.consentVersion='family-fair-1';
  return d;
}

// Accept JPEG only; remove EXIF/GPS, comments and all APP metadata except JFIF.
function ffPhotoBytes_(data) {
  if(typeof data!=='string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(data) || data.length>180000)ffError_('INVALID','Please choose a JPEG photo under 130 KB after resizing.');
  var bytes=Utilities.base64Decode(data.split(',')[1]), b=bytes.map(function(v){return (v+256)%256;});
  if(b[0]!==255 || b[1]!==216 || b[b.length-2]!==255 || b[b.length-1]!==217)ffError_('INVALID','That photo could not be read. Please choose another.');
  var out=[255,216],i=2,frame=false;
  while(i<b.length-2){
    if(b[i]!==255)ffError_('INVALID','Invalid JPEG photo.');
    var marker=b[i+1],len=(b[i+2]<<8)+b[i+3];
    if(marker===218){if(!frame || len<2 || i+2+len>=b.length)ffError_('INVALID','Invalid JPEG photo.');for(var j=i+2+len;j<b.length-2;j++){if(b[j]===255){var next=b[++j];if(next!==0 && !(next>=208&&next<=215))ffError_('INVALID','Unsupported JPEG photo.');}}return out.concat(b.slice(i)).map(function(v){return v>127?v-256:v;});}
    if(len<2 || i+2+len>b.length)ffError_('INVALID','Invalid JPEG photo.');
    if(marker===194)ffError_('INVALID','Please reselect the photo so it can be prepared for upload.');
    if(marker===192){var h=(b[i+5]<<8)+b[i+6],w=(b[i+7]<<8)+b[i+8];if(!w||!h||w>1600||h>1600)ffError_('INVALID','Please resize the photo to 1600 pixels or less.');frame=true;}
    if(!((marker>=225&&marker<=239)||marker===254))out=out.concat(b.slice(i,i+2+len));
    i+=2+len;
  }
  ffError_('INVALID','Invalid JPEG photo.');
}
function ffDispatch_(p,post,cfg) {
  if(!p || typeof p!=='object')ffError_('INVALID','Invalid request.');
  if(p.action==='list'){
    var families=ffFamilies_(cfg);
    return {listings:ffRows_(ffSheet_(cfg)).filter(function(r){return r.status==='approved' && families[r.owner];}).sort(function(a,b){return String(b.updated).localeCompare(String(a.updated));}).map(ffPublic_)};
  }
  if(p.action==='photo' && !post){
    var r=ffRows_(ffSheet_(cfg)).find(function(r){return r.id===p.id;});
    if(!r || r.status!=='approved' || !r.photo || !ffFamilies_(cfg)[r.owner])ffError_('NOT_FOUND','Photo unavailable.');
    return {photo:'data:image/jpeg;base64,'+Utilities.base64Encode(DriveApp.getFileById(r.photo).getBlob().getBytes())};
  }
  if(!post)ffError_('METHOD','Use a secure submission for this action.');
  if(p.action==='requestCode')return ffRequestCode_(p,cfg);
  if(p.action==='verifyCode')return ffVerifyCode_(p,cfg);
  if(p.action==='logout'){if(typeof p.token==='string')cfg.props.deleteProperty('session:'+ffHash_(p.token,cfg));return {};}
  var admin=['reviewList','review','reviewPhoto'].indexOf(p.action)>=0;
  var session=ffSession_(p,cfg,admin?'admin':'parent'),sh=ffSheet_(cfg),rows=ffRows_(sh);
  if(p.action==='mine')return {listings:rows.filter(function(r){return r.owner===session.email&&r.status!=='removed';}).map(ffPrivate_)};
  if(p.action==='reviewList')return {listings:rows.filter(function(r){return ['pending','approved'].indexOf(r.status)>=0;}).map(function(r){var v=ffPrivate_(r);v.ownerEmail=r.owner;return v;})};
  var current=rows.find(function(r){return r.id===p.id;});
  if(p.action==='privatePhoto' || p.action==='reviewPhoto'){
    if(!current || (!admin&&current.owner!==session.email) || !current.photo || current.status==='removed')ffError_('NOT_FOUND','Photo unavailable.');
    return {photo:'data:image/jpeg;base64,'+Utilities.base64Encode(DriveApp.getFileById(current.photo).getBlob().getBytes())};
  }
  if(p.action==='save'){
    if(p.id && (!current || current.owner!==session.email || current.status==='removed'))ffError_('NOT_FOUND','Listing unavailable.');
    if(typeof p.requestId!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(p.requestId))ffError_('INVALID','Please reopen the listing form.');
    var data=ffListing_(p.listing||{},session.email), hash=ffHash_(JSON.stringify(p.listing)+':'+String(p.photo||'')+':'+!!p.removePhoto,cfg);
    var prior=rows.find(function(r){return r.owner===session.email&&r.request===p.requestId;});
    if(prior){if(prior.hash!==hash)ffError_('CONFLICT','This request changed. Reopen the listing form.');return {listing:ffPrivate_(prior)};}
    if(current && p.version!==current.version)ffError_('CONFLICT','This listing changed. Refresh your listings before editing it.');
    if(!current && rows.filter(function(r){return r.owner===session.email&&r.status!=='removed';}).length>=8)ffError_('LIMIT','You can have up to eight listings. Remove an old listing first.');
    var photo=current&&current.photo||'', oldPhoto=photo, createdFile=null;
    if(p.photo){var bytes=ffPhotoBytes_(p.photo);var folder=DriveApp.getFolderById(cfg.photos);if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE)throw new Error('Photo storage is not private');createdFile=folder.createFile(Utilities.newBlob(bytes,'image/jpeg','family-fair-'+Utilities.getUuid()+'.jpg'));photo=createdFile.getId();}
    else if(p.removePhoto)photo='';
    var now=new Date().toISOString();
    var record={row:current?current.row:sh.getLastRow()+1,id:current?current.id:Utilities.getUuid(),owner:session.email,status:'pending',version:current?current.version+1:1,created:current?current.created:now,updated:now,reviewer:'',reviewed:'',request:p.requestId,hash:hash,data:data,photo:photo,note:''};
    // On an ambiguous Sheets failure retain the private photo: the row may have saved.
    // Retrying the same request ID resolves the outcome without duplicating the listing.
    ffSaveRow_(sh,record);
    if(oldPhoto && oldPhoto!==photo){try{DriveApp.getFileById(oldPhoto).setTrashed(true);}catch(err){/* orphan remains private */}}
    return {listing:ffPrivate_(record)};
  }
  if(p.action==='remove' || p.action==='review'){
    if(!current || (!admin&&current.owner!==session.email) || current.status==='removed')ffError_('NOT_FOUND','Listing unavailable.');
    if(p.version!==current.version)ffError_('CONFLICT','This listing changed. Refresh before trying again.');
    if(p.action==='review'){
      if(['approved','rejected'].indexOf(p.decision)<0)ffError_('INVALID','Choose approve or decline.');
      if(p.decision==='approved' && (current.status!=='pending' || !ffFamilies_(cfg)[current.owner]))ffError_('INVALID','Only a pending listing from a current family can be approved.');
      current.status=p.decision;current.reviewer=session.email;current.reviewed=new Date().toISOString();
      current.note=p.decision==='rejected'?ffText_(p.note,300,'a short reason for the family'):'';
    }else{current.status='removed';}
    current.version++;current.updated=new Date().toISOString();ffSaveRow_(sh,current);
    if(current.status==='removed'&&current.photo){try{DriveApp.getFileById(current.photo).setTrashed(true);}catch(err){/* remains private */}}
    return {};
  }
  ffError_('INVALID','Unknown action.');
}

// Run once from the editor, never from an HTTP request. Uses configured private storage.
function setupFamilyFair() {
  var cfg=ffConfig_();ffFamilies_(cfg);
  var folder=DriveApp.getFolderById(cfg.photos);
  if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE)throw new Error('Photo folder must be private.');
  var book=SpreadsheetApp.openById(cfg.book);
  var sh=book.getSheetByName('Listings')||book.insertSheet('Listings');
  if(sh.getLastRow()===0){sh.getRange(1,1,1,FF_HEADERS.length).setValues([FF_HEADERS]);sh.setFrozenRows(1);}
  ffSheet_(cfg);
}
