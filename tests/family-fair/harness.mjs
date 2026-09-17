// Test-only Google-service adapters. Executes the actual production Code.gs unchanged.
// No live Google access and no mail delivery. All identities below are fictional.
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHmac,randomUUID,randomBytes} from 'node:crypto';
const source=readFileSync(new URL('../../apps-script/family-fair/Code.gs',import.meta.url),'utf8');
export function harness(){
  let now=Date.now();
  const outbox=[],files=new Map(),reads=[],writes=[];
  const props=new Map(Object.entries({REGISTER_ID:'test-register',REGISTER_TAB:'Register',LISTINGS_ID:'test-listings',PHOTOS_FOLDER_ID:'test-photos',AUTH_SECRET:randomBytes(32).toString('base64'),ADMIN_EMAILS:'reviewer@example.test'}));
  const register=[['Unrelated private column','Parent 2 email','Status','Parent email'],['NEVER RETURN PRIVATE DATA','second@example.test','Enrolled','parent@example.test'],['SECRET','other2@example.test','Committed','other@example.test'],['SECRET','','Withdrawn','withdrawn@example.test'],['SECRET','','Waiting','waiting@example.test'],['SECRET','','Declined','declined@example.test'],['SECRET','','','blank@example.test']];
  const records=[];
  function sheet(rows,name){return {getLastColumn:()=>rows[0]?.length||0,getLastRow:()=>rows.length,setFrozenRows(){},getRange(r,c,n=1,m=1){return {getValues(){reads.push({name,r,c,n,m});return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[r+i-1]?.[c+j-1]??''));},getDisplayValues(){return this.getValues().map(row=>row.map(String));},setValues(values){writes.push({name,r,c,n,m});for(let i=0;i<n;i++){rows[r+i-1]??=[];for(let j=0;j<m;j++)rows[r+i-1][c+j-1]=values[i][j];}return this;}};}};}
  const sheets={Register:sheet(register,'Register'),Listings:sheet(records,'Listings')};
  const blob=bytes=>({getBytes:()=>bytes});
  const folder={getSharingAccess:()=> 'PRIVATE',createFile(b){const id=randomUUID();files.set(id,{id,bytes:b.getBytes(),trashed:false});return file(id);}};
  const file=id=>({getId:()=>id,getBlob(){const f=files.get(id);if(!f||f.trashed)throw Error('No file');return blob(f.bytes);},setTrashed(value){files.get(id).trashed=value;}});
  let locked=false;
  const ctx=vm.createContext({
    Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
    SpreadsheetApp:{openById(id){if(!['test-register','test-listings'].includes(id))throw Error('Unknown spreadsheet');return {getSheetByName:name=>sheets[name]||null,insertSheet:name=>{sheets[name]=sheet([],name);return sheets[name];}};},flush(){}},
    MailApp:{getRemainingDailyQuota:()=>100,sendEmail:message=>{outbox.push({...message});}},
    DriveApp:{getFolderById:()=>folder,getFileById:file,Access:{PRIVATE:'PRIVATE'}},
    LockService:{getScriptLock:()=>({tryLock(){if(locked)return false;locked=true;return true;},hasLock:()=>locked,releaseLock:()=>{locked=false;}})},
    Utilities:{getUuid:randomUUID,computeHmacSha256Signature:(s,key)=>Array.from(createHmac('sha256',key).update(s).digest()),base64Decode:s=>Array.from(Buffer.from(s,'base64')),base64Encode:bytes=>Buffer.from(bytes.map(b=>(b+256)%256)).toString('base64'),newBlob:bytes=>blob(bytes)},
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:value=>({value,setMimeType(){return this;}})}
  });
  vm.runInContext(source,ctx);ctx.setupFamilyFair();writes.length=0;reads.length=0;
  function call(input,post=true){return JSON.parse(post?ctx.doPost({postData:{contents:JSON.stringify(input)}}).value:ctx.doGet({parameter:input}).value);}
  function signIn(email='parent@example.test',purpose='parent'){
    call({action:'requestCode',email,purpose});
    const mail=outbox.findLast(m=>m.to===email);if(!mail)throw Error('No test email for '+email);
    const code=mail.body.match(/\b\d{8}\b/)[0];
    const result=call({action:'verifyCode',email,code,purpose});if(!result.ok)throw Error(JSON.stringify(result));return result.data;
  }
  return {call,signIn,outbox,props,files,register,records,reads,writes,ctx,folder,advance:ms=>{now+=ms;}};
}
export const listing=(overrides={})=>({title:'Friendly yard help',name:'Alex',kind:'student',category:'Student jobs',description:'Help with raking and garden tidy-ups. Contact my parent to arrange a visit.',contactEmail:'ignored@example.test',contactPhone:'555-123-4567',website:'https://example.test',consent:true,...overrides});
export const save=(session,overrides={})=>({action:'save',token:session.token,requestId:randomUUID(),listing:listing(),...overrides});
