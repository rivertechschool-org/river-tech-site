/** Hidden Acres add-on for the existing Field Trip Backend.
 * Keep Silverwood history and the off-campus lunch waiver handlers unchanged.
 * Uses a dedicated tab in the existing private signup spreadsheet.
 * Install reconcileHiddenAcresPayments as an hourly trigger when deploying.
 * No email is sent by this add-on. Payment receipts are managed by Stripe.
 */
const HA_TRIP_ID = 'hidden-acres-2026-09-16';
const HA_TAB = 'Hidden Acres 2026-09-16';
const HA_PRICE_USD = 10;
let HA_RUNTIME_CONFIG = null;
function haCfg_(key) { return HA_RUNTIME_CONFIG ? HA_RUNTIME_CONFIG[key] : cfg(key); }
const HA_HEADERS = ['Registration ID','Submitted (UTC)','Status','Family Type','Parent First','Parent Last','Parent Email','Parent Phone','Student First','Student Last','Student Age','Transportation','Price (USD)','Registration Total (USD)','Paid','Signature Name','Signature Date','Ack: Schedule Read','Request Hash','Stripe Session ID','Checkout URL','Release Agreed','Release Version'];

function hiddenAcresConfig_() {
  return {ok:true,tripId:HA_TRIP_ID,priceUSD:HA_PRICE_USD,ready:haCfg_('HA_REGISTRATION_OPEN')==='true' && !!haCfg_('SHEET_ID') && (haCfg_('STRIPE_SECRET_KEY') || '').startsWith(HA_RUNTIME_CONFIG?'sk_test_':'sk_live_'),mode:HA_RUNTIME_CONFIG?'test':'live'};
}
function haText_(s) { return typeof s === 'string' && s.trim().length > 0 && s.length <= 250; }
function validateHiddenAcres_(p) {
  if (!p || !p.trip || p.trip.id !== HA_TRIP_ID || p.familyType !== 'full-time') return 'This form is for full-time students attending Hidden Acres Farm.';
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(p.requestId || '')) return 'Please refresh the form and try again.';
  if (!p.parent || !['firstName','lastName','email','phone'].every(function(k){return haText_(p.parent[k]);})) return 'Parent/guardian information is incomplete.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.parent.email)) return 'Please enter a valid email address.';
  if (!Array.isArray(p.participants) || p.participants.length < 1 || p.participants.length > 50) return 'Please add your full-time students.';
  for (let i=0;i<p.participants.length;i++) {
    const part=p.participants[i];
    if (!part || !haText_(part.firstName) || !haText_(part.lastName) || !/^\d{1,2}$/.test(String(part.age)) || Number(part.age)<1 || part.type !== 'student' || part.transport !== 'bus-both') return 'Student '+(i+1)+': please complete the required information.';
  }
  if (!p.acknowledgments || p.acknowledgments.scheduleRead !== true) return 'Please confirm you have read the schedule and what-to-bring list.';
  if (!p.release || p.release.agreed !== true || !haText_(p.release.signatureName) || !/^\d{4}-\d{2}-\d{2}$/.test(p.release.signatureDate || '')) return 'Please read and agree to the release and type your full name.';
    const date=new Date(p.release.signatureDate+'T12:00:00Z');
  if(isNaN(date.getTime()) || date.toISOString().slice(0,10)!==p.release.signatureDate)return 'Please refresh the form to record a valid signature date.';
  return null;
}
function haHash_(p) {
  const canonical={parent:p.parent,participants:p.participants,release:p.release,acknowledgments:p.acknowledgments};
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(canonical)).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}
function haSheet_() {
  if (!haCfg_('SHEET_ID')) throw new Error('Registration is not configured.');
  const ss=SpreadsheetApp.openById(haCfg_('SHEET_ID'));
  let sh=ss.getSheetByName(HA_TAB);
  if (!sh) sh=ss.insertSheet(HA_TAB);
  if (sh.getLastRow()===0) {sh.appendRow(HA_HEADERS);sh.getRange(1,1,1,HA_HEADERS.length).setFontWeight('bold');sh.setFrozenRows(1);}
  const header=sh.getRange(1,1,1,HA_HEADERS.length).getValues()[0];
  if (JSON.stringify(header)!==JSON.stringify(HA_HEADERS)) throw new Error('Registration sheet needs attention.');
  return sh;
}
function haRows_(sh,id) {
  if(sh.getLastRow()<2)return [];
  return sh.getRange(2,1,sh.getLastRow()-1,HA_HEADERS.length).getValues().map(function(row,i){return {row:row,index:i+2};}).filter(function(item){return item.row[0]===id;});
}
function haCellText_(value) {
  const text=String(value || '');
  return /^[=+@\-]/.test(text)?"'"+text:text;
}
function haStripe_(path,params,key) {
  const secret=haCfg_('STRIPE_SECRET_KEY');
  if(!secret)throw new Error('Payment is not configured.');
  const options={method:params?'post':'get',headers:{Authorization:'Bearer '+secret},muteHttpExceptions:true};
  if(params)options.payload=params;
  if(key)options.headers['Idempotency-Key']=key;
  const response=UrlFetchApp.fetch('https://api.stripe.com/v1/'+path,options);
  if(response.getResponseCode()<200 || response.getResponseCode()>=300)throw new Error('Payment service is unavailable. Please try again with the same details.');
  return JSON.parse(response.getContentText());
}
function handleHiddenAcres_(p) {
  const error=validateHiddenAcres_(p);
  if(error)return {ok:false,error:error};
  if(!hiddenAcresConfig_().ready)return {ok:false,error:'Hidden Acres registration is not open yet. Please contact Mary.'};
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))return {ok:false,error:'Registration is busy. Please try again with the same details.'};
  try {
    const sh=haSheet_(), id='HA-'+p.requestId, hash=haHash_(p), total=p.participants.length*HA_PRICE_USD;
    let rows=haRows_(sh,id);
    if(rows.length && (rows.length!==p.participants.length || rows.some(function(item){return item.row[18]!==hash;})))return {ok:false,error:'These registration details have changed. Please refresh and try again.'};
    if(rows.length && rows[0].row[14]==='Yes')return {ok:false,error:'This registration is already paid. Please do not pay again.'};
    let generation='initial';
    if(rows.length && rows[0].row[19]) {
      const session=haStripe_('checkout/sessions/'+encodeURIComponent(rows[0].row[19]));
      if(session.payment_status==='paid') {
        haMarkPaid_(sh,rows,session);
        return {ok:false,error:'This registration is already paid. Please do not pay again.'};
      }
      if(session.status==='complete') return {ok:false,error:'Your payment is processing. Please do not submit another payment; contact the school if you need help.'};
      if(session.status==='open' && /^https:\/\/checkout\.stripe\.com\//.test(session.url || '')) {
        rows.forEach(function(item){sh.getRange(item.index,20,1,2).setValues([[session.id,session.url]]);});
        return {ok:true,registrationId:id,checkoutUrl:session.url};
      }
      generation=session.id;
    }
    if(!rows.length) {
      const submitted=new Date().toISOString();
      const values=p.participants.map(function(part){return [id,submitted,'Submitted (awaiting payment)','full-time',haCellText_(p.parent.firstName),haCellText_(p.parent.lastName),haCellText_(p.parent.email),haCellText_(p.parent.phone),haCellText_(part.firstName),haCellText_(part.lastName),Number(part.age),'School bus both ways',HA_PRICE_USD,total,'No',haCellText_(p.release.signatureName),p.release.signatureDate,'Yes',hash,'','','Yes','hidden-acres-2026-09-16'];});
      sh.getRange(sh.getLastRow()+1,1,values.length,HA_HEADERS.length).setValues(values);
      SpreadsheetApp.flush();
      rows=haRows_(sh,id);
    }
    const session=haStripe_('checkout/sessions',{
      mode:'payment',
      'payment_method_types[0]':'card',
      success_url:haCfg_('HA_SUCCESS_URL') || SUCCESS_URL,
      cancel_url:(haCfg_('HA_FORM_URL') || FORM_PAGE_URL)+'?cancelled=1',
      customer_email:p.parent.email,
      client_reference_id:id,
      'metadata[registrationId]':id,
      'metadata[trip]':HA_TRIP_ID,
      'metadata[tripDate]':'2026-09-16',
      'metadata[totalUSD]':String(total),
      'line_items[0][price_data][currency]':'usd',
      'line_items[0][price_data][product_data][name]':'Hidden Acres Farm — September 16, 2026',
      'line_items[0][price_data][product_data][description]':'Full-time student: school-bus transportation, teacher supervision, and produce picked by the student and sold at the market.',
      'line_items[0][price_data][unit_amount]':String(HA_PRICE_USD*100),
      'line_items[0][quantity]':String(p.participants.length)
    },id+'-'+generation);
    if(!session.id || !/^https:\/\/checkout\.stripe\.com\//.test(session.url || ''))throw new Error('Payment could not be opened. Please try again with the same details.');
    rows.forEach(function(item){sh.getRange(item.index,20,1,2).setValues([[session.id,session.url]]);});
    return {ok:true,registrationId:id,checkoutUrl:session.url};
  } catch(err) {
    Logger.log('Hidden Acres registration failed: '+err.message);
    return {ok:false,error:'We could not complete registration. No payment is confirmed. Please retry with the same details or contact Mary.'};
  } finally {lock.releaseLock();}
}
function haMarkPaid_(sh,rows,session) {
  if(!rows.length || session.payment_status!=='paid' || session.currency!=='usd' || !session.metadata || session.metadata.trip!==HA_TRIP_ID || session.client_reference_id!==rows[0].row[0] || session.amount_total!==Number(rows[0].row[13])*100 || session.amount_total!==rows.length*HA_PRICE_USD*100 || (HA_RUNTIME_CONFIG && session.livemode!==false))throw new Error('Payment could not be verified against this registration.');
  rows.forEach(function(item){sh.getRange(item.index,20,1,2).setValues([[session.id,session.url || item.row[20]]]);});
  SpreadsheetApp.flush();
  rows.forEach(function(item){sh.getRange(item.index,3).setValue('Paid (verified with Stripe)');sh.getRange(item.index,15).setValue('Yes');});
}
function hiddenAcresStatus_(sessionId) {
  if(!/^cs_(test|live)_[a-zA-Z0-9]+$/.test(sessionId || ''))return {ok:false,error:'Invalid payment reference.'};
  try {
    const session=haStripe_('checkout/sessions/'+encodeURIComponent(sessionId));
    if(!session.metadata || session.metadata.trip!==HA_TRIP_ID)return {ok:false,error:'Payment reference does not match this trip.'};
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(10000))return {ok:false,error:'Please refresh shortly.'};
    try {
      const sh=haSheet_(),rows=haRows_(sh,session.client_reference_id);
      if(!rows.length || rows[0].row[19]!==sessionId)return {ok:false,error:'Registration not found for this payment.'};
      if(session.payment_status==='paid')haMarkPaid_(sh,rows,session);
      return {ok:true,tripId:HA_TRIP_ID,paid:session.payment_status==='paid',registrationId:session.client_reference_id};
    } finally {lock.releaseLock();}
  } catch(err) {Logger.log('Hidden Acres payment check failed: '+err.message);return {ok:false,error:'Unable to verify payment. Please refresh shortly.'};}
}
// Recovery for a parent who paid but closed Stripe without returning to the site.
function reconcileHiddenAcresPayments() {
  const sh=haSheet_();
  if(sh.getLastRow()<2)return;
  const sessions=new Set(),registrations={};
  sh.getRange(2,1,sh.getLastRow()-1,HA_HEADERS.length).getValues().forEach(function(row){
    const group=registrations[row[0]] || (registrations[row[0]]={pending:false,sessions:[]});
    if(row[14]!=='Yes')group.pending=true;
    if(row[19])group.sessions.push(row[19]);
  });
  Object.keys(registrations).forEach(function(id){const group=registrations[id];if(group.pending)group.sessions.forEach(function(session){sessions.add(session);});});
  sessions.forEach(function(id){hiddenAcresStatus_(id);});
}

function installHiddenAcresRecovery() {
  const exists=ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='reconcileHiddenAcresPayments';});
  if(!exists)ScriptApp.newTrigger('reconcileHiddenAcresPayments').timeBased().everyHours(1).create();
  console.log('Hidden Acres hourly payment recovery is installed.');
}
function verifyHiddenAcresLaunch() {
  const account=haStripe_('account');
  console.log(JSON.stringify({tripId:HA_TRIP_ID,priceUSD:HA_PRICE_USD,liveKey:(cfg('STRIPE_SECRET_KEY') || '').startsWith('sk_live_'),stripeAccount:account.id,chargesEnabled:account.charges_enabled,recoveryInstalled:ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='reconcileHiddenAcresPayments';}),registrationOpen:cfg('HA_REGISTRATION_OPEN')==='true'}));
}
