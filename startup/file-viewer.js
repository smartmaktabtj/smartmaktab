const useFileViewer=window.origin==='null'||!['http:','https:','smapp:'].includes(location.protocol);
const openOfflineRoute=new URLSearchParams(location.search).get('offlineCabinet');
const embeddedStore=Object.create(null);
let embeddedChannel='',embeddedFrame=null,packPromise=null,openSeq=0;
const viewerNode=id=>document.getElementById(id);
const cleanJson=value=>JSON.stringify(value).replaceAll(String.fromCharCode(60),'\\u003c');
const decode=pack=>new TextDecoder().decode(Uint8Array.from(atob(pack),character=>character.charCodeAt(0)));
function appendScript(doc,code){
 const node=doc.createElement('script');node.textContent=code;doc.body.append(node);
}
const startupTheme=installTheme(viewerNode('themeToggle'));
async function readPack(){
 const data=Uint8Array.from(atob(viewerNode('sm-embedded-pages').dataset.pack),c=>c.charCodeAt(0));
 if(typeof DecompressionStream==='function')try{
  const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).json();
 }catch{}
 return globalThis.smartMaktabReadGzip(data);
}
const getPack=()=>packPromise??=readPack().catch(error=>{packPromise=null;throw error;});
async function openEmbedded(path,options={}){
 if(path==='index.html'||path===''){closeEmbedded();return true;}
 const seq=++openSeq;
 let pack;
 try{pack=await getPack();}catch{
  const message=document.documentElement.lang==='tg'?'Пешнамоиши кориро кушоед.':'Не удалось открыть кабинет в этом просмотрщике. Откройте «SmartMaktab — рабочая версия».';
  const target=viewerNode('offlineDeck').hidden?viewerNode('viewerNotReady'):viewerNode('offlineNavStatus');
  target.textContent=message;target.hidden=false;return false;
 }
 if(seq!==openSeq)return false;
 const route=typeof path==='string'&&Object.hasOwn(pack.routes,path)?pack.routes[path]:null;
 if(!route){
  viewerNode('offlineNavStatus').hidden=false;viewerNode('offlineNavStatus').textContent='Ин бахш танҳо дар пешнамоиши корӣ дастрас аст.';
  return false;
 }
 const lang='tg';
 const school=/^[a-z0-9-]+$/i.test(options.school??'')?options.school:'';
 embeddedChannel=Array.from(crypto.getRandomValues(new Uint32Array(4)),item=>item.toString(16)).join('-');
 const ctx={path,channel:embeddedChannel,school,lang,hash:options.hash??'',store:embeddedStore,theme:startupTheme.mode()};
 const doc=new DOMParser().parseFromString(route.html,'text/html');
 const styles=doc.createElement('style');styles.textContent=pack.css;doc.head.append(styles);
 const data=doc.createElement('script');data.type='application/json';data.id='sm-viewer-context';data.textContent=cleanJson(ctx);doc.body.append(data);
 const portable=location.protocol==='file:'&&path==='cabinets/school/teacher.html';
 if(portable){const assets=doc.createElement('template');assets.id='sm-portable-reader';assets.dataset.pack=viewerNode('sm-portable-pdf').dataset.pack;doc.body.append(assets);}
 appendScript(doc,pack.bundles[route.entry]);
 const html=doc.documentElement.outerHTML;
 const panel=viewerNode('offlineDeck'),frame=document.createElement('iframe');
 frame.setAttribute('sandbox',portable?'allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox':'allow-scripts');frame.allowFullscreen=true;frame.title='SmartMaktab · Утоқи корӣ';frame.srcdoc=html;
 embeddedFrame=frame;viewerNode('offlineFrameSlot').replaceChildren(frame);
 viewerNode('offlineNavStatus').textContent='';viewerNode('offlineNavStatus').hidden=true;viewerNode('offlineTitle').textContent=options.title??'SmartMaktab';
 viewerNode('startupShell').hidden=true;panel.classList.remove('reader-active');panel.hidden=false;viewerNode('offlineBack').focus({preventScroll:true});
 return true;
}
function closeEmbedded(){
 ++openSeq;
 if(!embeddedFrame)return;
 viewerNode('offlineFrameSlot').replaceChildren();embeddedFrame=null;embeddedChannel='';
 viewerNode('offlineDeck').hidden=true;viewerNode('startupShell').hidden=false;
 (viewerNode('begin').closest('[data-step]').hidden?viewerNode('wizard').querySelector('section:not([hidden]) h2'):viewerNode('begin')).focus({preventScroll:true});
}
window.addEventListener('message',event=>{
 const info=event.data;
 if(!embeddedFrame||event.source!==embeddedFrame.contentWindow||info?.channel!==embeddedChannel)return;
 if(info.type==='theme')startupTheme.set(info.value);
 if(info.type==='reader-mode')viewerNode('offlineDeck').classList.toggle('reader-active',info.value===true);
 if(info.type==='open')openEmbedded(info.path,{lang:info.lang,school:info.school,hash:info.hash});
 if(typeof info.key!=='string'||!/^smartmaktab\.(?:demo|profile|cloud|active-cabinet)\.[a-z0-9_.-]{2,100}$/.test(info.key))return;
 if(info.type==='remove')delete embeddedStore[info.key];
 if(info.type==='store'&&typeof info.value==='string'&&info.value.length<=12000)embeddedStore[info.key]=info.value;
});
viewerNode('offlineBack').addEventListener('click',closeEmbedded);
