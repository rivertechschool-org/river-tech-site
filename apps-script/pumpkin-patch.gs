/** Pumpkin Patch add-on for the existing Field Trip Backend.
 * Uses a dedicated tab in the existing private signup spreadsheet.
 * PP_REGISTRATION_OPEN=true enables the form through October 4, Pacific time.
 * The existing Hidden Acres hourly recovery also runs reconcilePumpkinPayments.
 * No email is sent by this module.
 */
const PP_TRIP_ID = 'pumpkin-patch-2026-10-07';
const PP_TAB = 'Pumpkin Patch 2026-10-07';
const PP_PRICE_USD = 12;
const PP_CLOSE_AT = '2026-10-05T07:00:00Z'; // October 5, 00:00 America/Los_Angeles
let PP_RUNTIME_CONFIG = null; // Owner-run isolated verification only; never set from public input.
function ppCfg_(key) { return PP_RUNTIME_CONFIG ? PP_RUNTIME_CONFIG[key] : cfg(key); }
function ppTab_() { return PP_RUNTIME_CONFIG && PP_RUNTIME_CONFIG.PP_QA_TAB ? PP_RUNTIME_CONFIG.PP_QA_TAB : PP_TAB; }
const PP_HEADERS = ['Registration ID','Submitted (UTC)','Status','Student Program','Parent First','Parent Last','Parent Email','Parent Phone','Participant First','Participant Last','Participant Age','Participant Type','Transportation','Price (USD)','Registration Total (USD)','Paid','Signature Name','Signature Date','Ack: Schedule Read','Request Hash','Stripe Session ID','Checkout URL','Release Agreed','Release Version'];

function pumpkinConfig_() {
  const closed = new Date().getTime() >= new Date(PP_CLOSE_AT).getTime();
  return {ok:true,tripId:PP_TRIP_ID,priceUSD:PP_PRICE_USD,deadline:'2026-10-04',closed:closed,
    ready:!closed && ppCfg_('PP_REGISTRATION_OPEN')==='true' && !!ppCfg_('SHEET_ID') && (ppCfg_('STRIPE_SECRET_KEY') || '').startsWith(PP_RUNTIME_CONFIG?'sk_test_':'sk_live_'),mode:PP_RUNTIME_CONFIG?'test':'live'};
}
function ppText_(value, max) { return typeof value==='string' && value.trim().length>0 && value.length<=(max || 250); }
function ppNormalize_(p) {
  if(!p || !p.trip || p.trip.id!==PP_TRIP_ID)throw Error('Please reload the current Pumpkin Patch form and try again.');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(p.requestId || ''))throw Error('Please refresh the form and try again.');
  if(!p.parent || !['firstName','lastName','email','phone'].every(function(k){return ppText_(p.parent[k]);}))throw Error('Parent/guardian information is incomplete.');
  const parent={firstName:p.parent.firstName.trim(),lastName:p.parent.lastName.trim(),email:p.parent.email.trim().toLowerCase(),phone:p.parent.phone.trim()};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.email))throw Error('Please enter a valid email address.');
  if(!Array.isArray(p.participants) || p.participants.length<1 || p.participants.length>50)throw Error('Please add between one and fifty participants.');
  const seen=new Set();
  const participants=p.participants.map(function(part,i){
    if(!part || !ppText_(part.firstName) || !ppText_(part.lastName) || ['student','adult'].indexOf(part.type)<0)throw Error('Participant '+(i+1)+': please complete the required information.');
    if(part.type==='student' && (!/^\d{1,2}$/.test(String(part.age)) || Number(part.age)<1 || ['full-time','homeschool'].indexOf(part.program)<0))throw Error('Student '+(i+1)+': please enter an age and choose a program.');
    const normalized={firstName:part.firstName.trim(),lastName:part.lastName.trim(),type:part.type,age:part.type==='student'?Number(part.age):'',program:part.type==='student'?part.program:''};
    const key=[normalized.firstName,normalized.lastName,normalized.type,normalized.age].join('|').normalize('NFKC').toLowerCase();
    if(seen.has(key))throw Error('A participant is listed twice. Please remove the duplicate.');
    seen.add(key);return normalized;
  });
  if(!p.acknowledgments || p.acknowledgments.scheduleRead!==true)throw Error('Please confirm you have read the schedule and what-to-bring list.');
  if(!p.release || p.release.agreed!==true || !ppText_(p.release.signatureName) || !/^\d{4}-\d{2}-\d{2}$/.test(p.release.signatureDate || ''))throw Error('Please read and agree to the release and type your full name.');
  const date=new Date(p.release.signatureDate+'T12:00:00Z');
  if(isNaN(date.getTime()) || date.toISOString().slice(0,10)!==p.release.signatureDate)throw Error('Please refresh the form to record a valid signature date.');
  return {requestId:p.requestId.toLowerCase(),parent:parent,participants:participants,release:{agreed:true,signatureName:p.release.signatureName.trim(),signatureDate:p.release.signatureDate},acknowledgments:{scheduleRead:true}};
}
function ppHash_(p) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify({trip:PP_TRIP_ID,parent:p.parent,participants:p.participants,release:p.release,acknowledgments:p.acknowledgments}))
    .map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}
function ppSheet_() {
  if(!ppCfg_('SHEET_ID'))throw Error('Registration is not configured.');
  const ss=SpreadsheetApp.openById(ppCfg_('SHEET_ID'));
  let sh=ss.getSheetByName(ppTab_());
  if(!sh)sh=ss.insertSheet(ppTab_());
  if(sh.getLastRow()===0){sh.appendRow(PP_HEADERS);sh.getRange(1,1,1,PP_HEADERS.length).setFontWeight('bold');sh.setFrozenRows(1);}
  if(JSON.stringify(sh.getRange(1,1,1,PP_HEADERS.length).getValues()[0])!==JSON.stringify(PP_HEADERS))throw Error('Registration sheet needs attention.');
  return sh;
}
function ppRows_(sh,id) {
  if(sh.getLastRow()<2)return [];
  return sh.getRange(2,1,sh.getLastRow()-1,PP_HEADERS.length).getValues().map(function(row,i){return {row:row,index:i+2};}).filter(function(item){return item.row[0]===id;});
}
function ppCellText_(value) { const text=String(value==null?'':value);return /^\s*[=+@\-]/.test(text)?"'"+text:text; }
function ppStripe_(path,params,key) {
  const secret=ppCfg_('STRIPE_SECRET_KEY');
  if(!(secret || '').startsWith(PP_RUNTIME_CONFIG?'sk_test_':'sk_live_'))throw Error('Payment is not configured.');
  const options={method:params?'post':'get',headers:{Authorization:'Bearer '+secret},muteHttpExceptions:true};
  if(params)options.payload=params;
  if(key)options.headers['Idempotency-Key']=key;
  const response=UrlFetchApp.fetch('https://api.stripe.com/v1/'+path,options);
  if(response.getResponseCode()<200 || response.getResponseCode()>=300)throw Error('Payment service is unavailable. Please try again with the same details.');
  return JSON.parse(response.getContentText());
}
function ppVerifySession_(rows,session) {
  const id=rows.length && rows[0].row[0],total=rows.length*PP_PRICE_USD;
  if(!id || !session || !/^cs_(test|live)_[a-zA-Z0-9]+$/.test(session.id || '') || session.currency!=='usd' ||
      !session.metadata || session.metadata.trip!==PP_TRIP_ID || session.metadata.registrationId!==id || session.client_reference_id!==id ||
      session.amount_total!==total*100 || session.livemode!==!PP_RUNTIME_CONFIG ||
      rows.some(function(item){return Number(item.row[13])!==PP_PRICE_USD || Number(item.row[14])!==total || item.row[19]!==rows[0].row[19];}))
    throw Error('Payment could not be verified against this registration.');
}
function ppSaveSession_(sh,rows,session) {
  rows.forEach(function(item){sh.getRange(item.index,21,1,2).setValues([[session.id,session.url || item.row[21]]]);});
  SpreadsheetApp.flush();
  if(ppRows_(sh,rows[0].row[0]).some(function(item){return item.row[20]!==session.id;}))throw Error('Payment reference readback failed.');
}
function handlePumpkin_(payload) {
  let p;try{p=ppNormalize_(payload);}catch(err){return {ok:false,error:err.message};}
  const config=pumpkinConfig_();
  if(!config.ready)return {ok:false,error:config.closed?'Pumpkin Patch signup closed after Sunday, October 4. Please contact Mary.':'Pumpkin Patch registration is not open yet. Please contact Mary.'};
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))return {ok:false,error:'Registration is busy. Please try again with the same details.'};
  try {
    const sh=ppSheet_(),id='PP-'+p.requestId,hash=ppHash_(p),total=p.participants.length*PP_PRICE_USD;
    let rows=ppRows_(sh,id);
    if(rows.length && (rows.length!==p.participants.length || rows.some(function(item){return item.row[19]!==hash;})))return {ok:false,error:'These registration details have changed. Please refresh and try again.'};
    if(rows.length && rows.every(function(item){return item.row[15]==='Yes';}))return {ok:false,error:'This registration is already paid. Please do not pay again.'};
    let generation='initial';
    const savedSession=rows.map(function(item){return item.row[20];}).filter(String)[0];
    if(savedSession) {
      const session=ppStripe_('checkout/sessions/'+encodeURIComponent(savedSession));
      ppVerifySession_(rows,session);
      if(session.payment_status==='paid'){ppMarkPaid_(sh,rows,session);return {ok:false,error:'This registration is already paid. Please do not pay again.'};}
      if(session.status==='complete')return {ok:false,error:'Your payment is processing. Please do not submit another payment; contact the school if you need help.'};
      if(session.status==='open' && /^https:\/\/checkout\.stripe\.com\//.test(session.url || '')){ppSaveSession_(sh,rows,session);return {ok:true,registrationId:id,checkoutUrl:session.url};}
      if(session.status!=='expired')throw Error('Checkout state needs attention.');
      generation=session.id;
    }
    if(!rows.length) {
      const submitted=new Date().toISOString();
      const values=p.participants.map(function(part){return [id,submitted,'Submitted (awaiting payment)',part.program,ppCellText_(p.parent.firstName),ppCellText_(p.parent.lastName),ppCellText_(p.parent.email),ppCellText_(p.parent.phone),ppCellText_(part.firstName),ppCellText_(part.lastName),part.age,part.type,part.type==='student'?(part.program==='full-time'?'School bus both ways':'Private vehicle with supervising adult'):'',PP_PRICE_USD,total,'No',ppCellText_(p.release.signatureName),p.release.signatureDate,'Yes',hash,'','','Yes',PP_TRIP_ID];});
      const first=sh.getLastRow()+1;
      // Keep contact details and signed dates as entered; leave amount columns numeric.
      sh.getRange(first,2,values.length,1).setNumberFormat('@');
      sh.getRange(first,5,values.length,6).setNumberFormat('@');
      sh.getRange(first,17,values.length,2).setNumberFormat('@');
      sh.getRange(first,1,values.length,PP_HEADERS.length).setValues(values);
      SpreadsheetApp.flush();
      const saved=sh.getRange(first,1,values.length,PP_HEADERS.length).getValues();
      if(saved.some(function(row,i){return row.some(function(cell,j){const expected=values[i][j];return String(cell)!==String(expected) && !(typeof expected==='string' && expected[0]==="'" && String(cell)===expected.slice(1));});}))throw Error('Registration readback did not match.');
      rows=ppRows_(sh,id);
    }
    const session=ppStripe_('checkout/sessions',{
      mode:'payment','payment_method_types[0]':'card',
      success_url:ppCfg_('PP_SUCCESS_URL') || SUCCESS_URL,
      cancel_url:(ppCfg_('PP_FORM_URL') || FORM_PAGE_URL)+'?cancelled=1',
      customer_email:p.parent.email,client_reference_id:id,
      'metadata[registrationId]':id,'metadata[trip]':PP_TRIP_ID,'metadata[tripDate]':'2026-10-07','metadata[totalUSD]':String(total),
      'line_items[0][price_data][currency]':'usd',
      'line_items[0][price_data][product_data][name]':'Pumpkin Patch at Hidden Acres Orchard — October 7, 2026',
      'line_items[0][price_data][product_data][description]':'$12 per participant, student or adult, full-time or part-time/homeschool. Full-time student bus transportation is covered by River Tech.',
      'line_items[0][price_data][unit_amount]':String(PP_PRICE_USD*100),'line_items[0][quantity]':String(p.participants.length)
    },id+'-'+generation);
    ppVerifySession_(rows,session);
    if(!/^https:\/\/checkout\.stripe\.com\//.test(session.url || ''))throw Error('Payment could not be opened. Please try again with the same details.');
    ppSaveSession_(sh,rows,session);
    return {ok:true,registrationId:id,checkoutUrl:session.url};
  } catch(err){Logger.log('Pumpkin Patch registration failed: '+err.message);return {ok:false,error:'We could not complete registration. No payment is confirmed. Please retry with the same details or contact Mary.'};}
  finally{lock.releaseLock();}
}
function ppMarkPaid_(sh,rows,session) {
  ppVerifySession_(rows,session);
  if(session.payment_status!=='paid')throw Error('Payment has not completed.');
  ppSaveSession_(sh,rows,session);
  rows.forEach(function(item){sh.getRange(item.index,3).setValue('Paid (verified with Stripe)');sh.getRange(item.index,16).setValue('Yes');});
  SpreadsheetApp.flush();
  if(ppRows_(sh,rows[0].row[0]).some(function(item){return item.row[2]!=='Paid (verified with Stripe)' || item.row[15]!=='Yes';}))throw Error('Payment confirmation readback failed.');
}
function pumpkinStatus_(sessionId) {
  if(!/^cs_(test|live)_[a-zA-Z0-9]+$/.test(sessionId || ''))return {ok:false,error:'Invalid payment reference.'};
  try {
    const session=ppStripe_('checkout/sessions/'+encodeURIComponent(sessionId));
    if(!session.metadata || session.metadata.trip!==PP_TRIP_ID)return {ok:false,error:'Payment reference does not match this trip.'};
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(10000))return {ok:false,error:'Please refresh shortly.'};
    try {
      const sh=ppSheet_(),rows=ppRows_(sh,session.client_reference_id);
      if(!rows.length || !rows.some(function(item){return item.row[20]===sessionId;}))return {ok:false,error:'Registration not found for this payment.'};
      ppVerifySession_(rows,session);
      if(session.payment_status==='paid')ppMarkPaid_(sh,rows,session);
      return {ok:true,tripId:PP_TRIP_ID,paid:session.payment_status==='paid',registrationId:session.client_reference_id};
    }finally{lock.releaseLock();}
  }catch(err){Logger.log('Pumpkin Patch payment check failed: '+err.message);return {ok:false,error:'Unable to verify payment. Please refresh shortly.'};}
}
function reconcilePumpkinPayments() {
  // Read existing records only; do not create a tab before the launch switch is enabled.
  if(!ppCfg_('SHEET_ID'))return;
  const sh=SpreadsheetApp.openById(ppCfg_('SHEET_ID')).getSheetByName(ppTab_());
  if(!sh || sh.getLastRow()<2)return;
  const sessions=new Set(),registrations={};
  sh.getRange(2,1,sh.getLastRow()-1,PP_HEADERS.length).getValues().forEach(function(row){
    const group=registrations[row[0]] || (registrations[row[0]]={pending:false,sessions:[]});
    if(row[15]!=='Yes')group.pending=true;
    if(row[20])group.sessions.push(row[20]);
  });
  Object.keys(registrations).forEach(function(id){const group=registrations[id];if(group.pending)group.sessions.forEach(function(session){sessions.add(session);});});
  sessions.forEach(function(id){pumpkinStatus_(id);});
}
