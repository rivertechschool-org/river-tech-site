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
function stringAt(text,start){
  let value='';
  for(let i=start+1;i<text.length;i++){
    const c=text[i];if(c==='"')return {value,end:i+1,complete:true};
    if(c==='\\'){
      const next=text[++i];if(next===undefined)break;
      if(next==='u'){
        const hex=text.slice(i+1,i+5);if(!/^[\da-f]{4}$/i.test(hex))break;
        value+=String.fromCharCode(parseInt(hex,16));i+=4;
      }else{const escapes={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};if(!(next in escapes))break;value+=escapes[next];}
    }else value+=c;
  }
  // A split UTF-16 surrogate is completed by the next update.
  return {value:value.replace(/[\uD800-\uDBFF]$/,''),end:text.length,complete:false};
}
export function partialParagraphs(text){
  let depth=0;
  for(let i=0;i<text.length;i++){
    if(text[i]==='"'){
      const token=stringAt(text,i);if(!token.complete)return [];
      let next=token.end;while(/\s/.test(text[next]||'!'))next++;
      if(depth===1&&token.value==='paragraphs'&&text[next]===':'){
        next++;while(/\s/.test(text[next]||'!'))next++;
        if(text[next++]!=='[')return [];
        const result=[];
        while(next<text.length&&result.length<5){
          while(/[\s,]/.test(text[next]||'!'))next++;
          if(text[next]!== '"')break;
          const part=stringAt(text,next);
          result.push(part.value.replace(/(?:\+?1[\s().-]*)?425[\s().-]*444[\s().-]*2081/g,'[personal number removed]').slice(0,2000));
          if(!part.complete)break;next=part.end;
        }
        return result;
      }
      i=token.end-1;
    }else if(text[i]==='{'||text[i]==='[')depth++;
    else if(text[i]==='}'||text[i]===']')depth--;
  }
  return [];
}
