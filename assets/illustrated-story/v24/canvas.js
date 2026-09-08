export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
export const ease=t=>1-Math.pow(1-clamp(t),3);
export const mix=(a,b,t)=>a+(b-a)*t;
export async function loadImage(src){const im=new Image();im.src=src;await im.decode();return im}
export function canvas2d(canvas){let w=0,h=0;const ctx=canvas.getContext('2d');function resize(){w=canvas.parentElement.clientWidth;h=canvas.parentElement.clientHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)}resize();return{ctx,resize,get w(){return w},get h(){return h}}}

export function reportFailure(error){const stage=document.querySelector('#rt-home-story .rt-story-stage');stage.dataset.error='true';stage.disabled=true;console.error('River Tech illustration:',error)}
