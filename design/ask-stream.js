// Shared by the browser and local server. Never evaluate streamed content as code.
export async function* readEvents(body) {
  if(!body)throw Error('The answer stream is unavailable.');
  const reader=body.getReader(),decoder=new TextDecoder();let buffer='';
  try{
    while(true){
      const {value,done}=await reader.read();
      buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
      if(buffer.length>2_000_000)throw Error('The answer stream is too large.');
      let match;
      while((match=/\r?\n\r?\n/.exec(buffer))){
        const block=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);
        const data=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
        if(data&&data!=='[DONE]')yield JSON.parse(data);
      }
      if(done){if(buffer.trim())throw Error('The answer stream ended unexpectedly.');break;}
    }
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
