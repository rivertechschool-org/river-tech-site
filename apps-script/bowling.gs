/** Bowling add-on for the existing Field Trip Backend.
 * Uses a dedicated tab in the existing private signup spreadsheet.
 * Registration closes after November 1, Pacific time; the owner may close it earlier.
 * The existing Hidden Acres hourly recovery also runs reconcileBowlingPayments.
 * No email is sent by this module.
 */
const BW_TRIP_ID = 'bowling-2026-11-04';
const BW_TAB = 'Bowling 2026-11-04';
const BW_PRICE_USD = 12;
const BW_CLOSE_AT = '2026-11-02T08:00:00Z'; // Midnight after Sunday, Pacific Standard Time.
let BW_RUNTIME_CONFIG = null; // Owner-run isolated verification only; never set from public input.
function bwCfg_(key) { return BW_RUNTIME_CONFIG ? BW_RUNTIME_CONFIG[key] : cfg(key); }
function bwTab_() { return BW_RUNTIME_CONFIG && BW_RUNTIME_CONFIG.BW_QA_TAB ? BW_RUNTIME_CONFIG.BW_QA_TAB : BW_TAB; }
const BW_HEADERS = ['Registration ID','Submitted (UTC)','Status','Student Program','Parent First','Parent Last','Parent Email','Parent Phone','Participant First','Participant Last','Participant Age','Participant Type','Transportation','Price (USD)','Registration Total (USD)','Paid','Request Hash','Stripe Session ID','Checkout URL'];

function bowlingConfig_() {
  const closed = bwCfg_('BW_REGISTRATION_OPEN') === 'false' || new Date().getTime() >= new Date(BW_CLOSE_AT).getTime();
  return {ok:true,tripId:BW_TRIP_ID,priceUSD:BW_PRICE_USD,deadline:'2026-11-01',closed:closed,
    ready:!closed && bwCfg_('BW_REGISTRATION_OPEN')==='true' && !!bwCfg_('SHEET_ID') && (bwCfg_('STRIPE_SECRET_KEY') || '').startsWith(BW_RUNTIME_CONFIG?'sk_test_':'sk_live_'),mode:BW_RUNTIME_CONFIG?'test':'live'};
}
function bwText_(value, max) { return typeof value==='string' && value.trim().length>0 && value.length<=(max || 250); }
function bwNormalize_(p) {
  if(!p || !p.trip || p.trip.id!==BW_TRIP_ID)throw Error('Please reload the current Bowling form and try again.');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(p.requestId || ''))throw Error('Please refresh the form and try again.');
  if(!p.parent || !['firstName','lastName','email','phone'].every(function(k){return bwText_(p.parent[k]);}))throw Error('Parent/guardian information is incomplete.');
  const parent={firstName:p.parent.firstName.trim(),lastName:p.parent.lastName.trim(),email:p.parent.email.trim().toLowerCase(),phone:p.parent.phone.trim()};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.email))throw Error('Please enter a valid email address.');
  if(!Array.isArray(p.participants) || p.participants.length<1 || p.participants.length>50)throw Error('Please add between one and fifty participants.');
  const seen=new Set();
  const participants=p.participants.map(function(part,i){
    if(!part || !bwText_(part.firstName) || !bwText_(part.lastName) || ['student','adult'].indexOf(part.type)<0)throw Error('Participant '+(i+1)+': please complete the required information.');
    if(part.type==='student' && (!/^\d{1,2}$/.test(String(part.age)) || Number(part.age)<1 || ['full-time','homeschool'].indexOf(part.program)<0))throw Error('Student '+(i+1)+': please enter an age and choose a program.');
    if(part.type==='student' && part.program==='homeschool' && (['adult','teacher','mary-approved'].indexOf(part.supervision)<0 || (part.supervision==='teacher' && Number(part.age)<13) || (part.supervision==='mary-approved' && (Number(part.age)>12 || part.maryApproved!==true))))throw Error('Please select the supervision arrangement allowed for this student. Children 12 and younger need Mary’s approval before teacher drop-off.');
    const normalized={firstName:part.firstName.trim(),lastName:part.lastName.trim(),type:part.type,age:part.type==='student'?Number(part.age):'',program:part.type==='student'?part.program:'',supervision:part.type==='student'&&part.program==='homeschool'?part.supervision:'',maryApproved:part.type==='student'&&part.program==='homeschool'&&part.supervision==='mary-approved'};
    const key=[normalized.firstName,normalized.lastName,normalized.type,normalized.age].join('|').normalize('NFKC').toLowerCase();
    if(seen.has(key))throw Error('A participant is listed twice. Please remove the duplicate.');
    seen.add(key);return normalized;
  });
  return {requestId:p.requestId.toLowerCase(),parent:parent,participants:participants};
}
function bwHash_(p) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify({trip:BW_TRIP_ID,parent:p.parent,participants:p.participants}))
    .map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}
function bwSheet_() {
  if(!bwCfg_('SHEET_ID'))throw Error('Registration is not configured.');
  const ss=SpreadsheetApp.openById(bwCfg_('SHEET_ID'));
  let sh=ss.getSheetByName(bwTab_());
  if(!sh)sh=ss.insertSheet(bwTab_());
  if(sh.getLastRow()===0){sh.appendRow(BW_HEADERS);sh.getRange(1,1,1,BW_HEADERS.length).setFontWeight('bold');sh.setFrozenRows(1);}
  if(JSON.stringify(sh.getRange(1,1,1,BW_HEADERS.length).getValues()[0])!==JSON.stringify(BW_HEADERS))throw Error('Registration sheet needs attention.');
  return sh;
}
function bwRows_(sh,id) {
  if(sh.getLastRow()<2)return [];
  return sh.getRange(2,1,sh.getLastRow()-1,BW_HEADERS.length).getValues().map(function(row,i){return {row:row,index:i+2};}).filter(function(item){return item.row[0]===id;});
}
function bwCellText_(value) { const text=String(value==null?'':value);return /^\s*[=+@\-]/.test(text)?"'"+text:text; }
function bwStripe_(path,params,key) {
  const secret=bwCfg_('STRIPE_SECRET_KEY');
  if(!(secret || '').startsWith(BW_RUNTIME_CONFIG?'sk_test_':'sk_live_'))throw Error('Payment is not configured.');
  const options={method:params?'post':'get',headers:{Authorization:'Bearer '+secret},muteHttpExceptions:true};
  if(params)options.payload=params;
  if(key)options.headers['Idempotency-Key']=key;
  const response=UrlFetchApp.fetch('https://api.stripe.com/v1/'+path,options);
  if(response.getResponseCode()<200 || response.getResponseCode()>=300)throw Error('Payment service is unavailable. Please try again with the same details.');
  return JSON.parse(response.getContentText());
}
function bwVerifySession_(rows,session) {
  const id=rows.length && rows[0].row[0],total=rows.length*BW_PRICE_USD;
  if(!id || !session || !/^cs_(test|live)_[a-zA-Z0-9]+$/.test(session.id || '') || session.currency!=='usd' ||
      !session.metadata || session.metadata.trip!==BW_TRIP_ID || session.metadata.registrationId!==id || session.client_reference_id!==id ||
      session.amount_total!==total*100 || session.livemode!==!BW_RUNTIME_CONFIG ||
      rows.some(function(item){return Number(item.row[13])!==BW_PRICE_USD || Number(item.row[14])!==total || item.row[16]!==rows[0].row[16];}))
    throw Error('Payment could not be verified against this registration.');
}
function bwSaveSession_(sh,rows,session) {
  rows.forEach(function(item){sh.getRange(item.index,18,1,2).setValues([[session.id,session.url || item.row[18]]]);});
  SpreadsheetApp.flush();
  if(bwRows_(sh,rows[0].row[0]).some(function(item){return item.row[17]!==session.id;}))throw Error('Payment reference readback failed.');
}
function handleBowling_(payload) {
  let p;try{p=bwNormalize_(payload);}catch(err){return {ok:false,error:err.message};}
  const config=bowlingConfig_();
  if(!config.ready)return {ok:false,error:'Bowling registration is not open. Please contact Mary.'};
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))return {ok:false,error:'Registration is busy. Please try again with the same details.'};
  try {
    if(!bowlingConfig_().ready)return {ok:false,error:'Online signup is closed. Text Mary about an approved late place; pay Mary in cash.'};
    const sh=bwSheet_(),id='BW-'+p.requestId,hash=bwHash_(p),total=p.participants.length*BW_PRICE_USD;
    let rows=bwRows_(sh,id);
    if(rows.length && (rows.length!==p.participants.length || rows.some(function(item){return item.row[16]!==hash;})))return {ok:false,error:'These registration details have changed. Please refresh and try again.'};
    if(rows.length && rows.every(function(item){return item.row[15]==='Yes';}))return {ok:false,error:'This registration is already paid. Please do not pay again.'};
    let generation='initial';
    const savedSession=rows.map(function(item){return item.row[17];}).filter(String)[0];
    if(savedSession) {
      const session=bwStripe_('checkout/sessions/'+encodeURIComponent(savedSession));
      bwVerifySession_(rows,session);
      if(session.payment_status==='paid'){bwMarkPaid_(sh,rows,session);return {ok:false,error:'This registration is already paid. Please do not pay again.'};}
      if(session.status==='complete')return {ok:false,error:'Your payment is processing. Please do not submit another payment; contact the school if you need help.'};
      if(session.status==='open' && /^https:\/\/checkout\.stripe\.com\//.test(session.url || '')){bwSaveSession_(sh,rows,session);return {ok:true,registrationId:id,checkoutUrl:session.url};}
      if(session.status!=='expired')throw Error('Checkout state needs attention.');
      generation=session.id;
    }
    if(!rows.length) {
      const submitted=new Date().toISOString();
      const values=p.participants.map(function(part){return [id,submitted,'Submitted (awaiting payment)',part.program,bwCellText_(p.parent.firstName),bwCellText_(p.parent.lastName),bwCellText_(p.parent.email),bwCellText_(p.parent.phone),bwCellText_(part.firstName),bwCellText_(part.lastName),part.age,part.type,part.type==='student'?(part.program==='full-time'?'School bus or Jordan/Caitlin/Luke/Mary vehicle':(part.supervision==='adult'?'Private vehicle; own supervising adult':part.supervision==='teacher'?'Private vehicle; teacher drop-off age 13+':'Private vehicle; parent reports Mary-approved drop-off, age 12 or younger')):'',BW_PRICE_USD,total,'No',hash,'',''];});
      const first=sh.getLastRow()+1;
      // Keep contact details and signed dates as entered; leave amount columns numeric.
      sh.getRange(first,2,values.length,1).setNumberFormat('@');
      sh.getRange(first,5,values.length,6).setNumberFormat('@');
      sh.getRange(first,1,values.length,BW_HEADERS.length).setValues(values);
      SpreadsheetApp.flush();
      const saved=sh.getRange(first,1,values.length,BW_HEADERS.length).getValues();
      if(saved.some(function(row,i){return row.some(function(cell,j){const expected=values[i][j];return String(cell)!==String(expected) && !(typeof expected==='string' && expected[0]==="'" && String(cell)===expected.slice(1));});}))throw Error('Registration readback did not match.');
      rows=bwRows_(sh,id);
    }
    const session=bwStripe_('checkout/sessions',{
      mode:'payment','payment_method_types[0]':'card',
      success_url:bwCfg_('BW_SUCCESS_URL') || SUCCESS_URL,
      cancel_url:(bwCfg_('BW_FORM_URL') || FORM_PAGE_URL)+'?cancelled=1',
      customer_email:p.parent.email,client_reference_id:id,
      'metadata[registrationId]':id,'metadata[trip]':BW_TRIP_ID,'metadata[tripDate]':'2026-11-04','metadata[totalUSD]':String(total),
      'line_items[0][price_data][currency]':'usd',
      'line_items[0][price_data][product_data][name]':'Bowling at River City Lanes — November 4, 2026',
      'line_items[0][price_data][product_data][description]':'$12 per bowler, including shoe rental and taxes. Supervising-only adults attend free.',
      'line_items[0][price_data][unit_amount]':String(BW_PRICE_USD*100),'line_items[0][quantity]':String(p.participants.length)
    },id+'-'+generation);
    bwVerifySession_(rows,session);
    if(!/^https:\/\/checkout\.stripe\.com\//.test(session.url || ''))throw Error('Payment could not be opened. Please try again with the same details.');
    bwSaveSession_(sh,rows,session);
    return {ok:true,registrationId:id,checkoutUrl:session.url};
  } catch(err){Logger.log('Bowling registration failed: '+err.message);return {ok:false,error:'We could not complete registration. No payment is confirmed. Please retry with the same details or contact Mary.'};}
  finally{lock.releaseLock();}
}
function bwMarkPaid_(sh,rows,session) {
  bwVerifySession_(rows,session);
  if(session.payment_status!=='paid')throw Error('Payment has not completed.');
  bwSaveSession_(sh,rows,session);
  rows.forEach(function(item){sh.getRange(item.index,3).setValue('Paid (verified with Stripe)');sh.getRange(item.index,16).setValue('Yes');});
  SpreadsheetApp.flush();
  if(bwRows_(sh,rows[0].row[0]).some(function(item){return item.row[2]!=='Paid (verified with Stripe)' || item.row[15]!=='Yes';}))throw Error('Payment confirmation readback failed.');
}
function bowlingStatus_(sessionId) {
  if(!/^cs_(test|live)_[a-zA-Z0-9]+$/.test(sessionId || ''))return {ok:false,error:'Invalid payment reference.'};
  try {
    const session=bwStripe_('checkout/sessions/'+encodeURIComponent(sessionId));
    if(!session.metadata || session.metadata.trip!==BW_TRIP_ID)return {ok:false,error:'Payment reference does not match this trip.'};
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(10000))return {ok:false,error:'Please refresh shortly.'};
    try {
      const sh=bwSheet_(),rows=bwRows_(sh,session.client_reference_id);
      if(!rows.length || !rows.some(function(item){return item.row[17]===sessionId;}))return {ok:false,error:'Registration not found for this payment.'};
      bwVerifySession_(rows,session);
      if(session.payment_status==='paid')bwMarkPaid_(sh,rows,session);
      return {ok:true,tripId:BW_TRIP_ID,paid:session.payment_status==='paid',registrationId:session.client_reference_id};
    }finally{lock.releaseLock();}
  }catch(err){Logger.log('Bowling payment check failed: '+err.message);return {ok:false,error:'Unable to verify payment. Please refresh shortly.'};}
}
function reconcileBowlingPayments() {
  // Read existing records only; do not create a tab before the launch switch is enabled.
  if(!bwCfg_('SHEET_ID'))return;
  const sh=SpreadsheetApp.openById(bwCfg_('SHEET_ID')).getSheetByName(bwTab_());
  if(!sh || sh.getLastRow()<2)return;
  const sessions=new Set(),registrations={};
  sh.getRange(2,1,sh.getLastRow()-1,BW_HEADERS.length).getValues().forEach(function(row){
    const group=registrations[row[0]] || (registrations[row[0]]={pending:false,sessions:[]});
    if(row[15]!=='Yes')group.pending=true;
    if(row[17])group.sessions.push(row[17]);
  });
  Object.keys(registrations).forEach(function(id){const group=registrations[id];if(group.pending)group.sessions.forEach(function(session){sessions.add(session);});});
  sessions.forEach(function(id){bowlingStatus_(id);});
}
