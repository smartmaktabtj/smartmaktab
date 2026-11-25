const bridge=globalThis.SmartMaktabAndroid;
let pending=null,saving=false;
if(bridge)bridge.onmessage=event=>{if(pending){const done=pending;pending=null;done(event.data);}};
function send(args,timeout=15000){
 if(!bridge||pending)return Promise.reject(new Error('Native bridge unavailable'));
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending=null;reject(new Error('Native bridge timeout'));},timeout);
  pending=value=>{clearTimeout(timer);if(value==='ok'||value==='cancel')resolve(value);else reject(new Error('Native bridge request failed'));};
  try{bridge.postMessage(JSON.stringify(args));}catch(error){clearTimeout(timer);pending=null;reject(error);}
 });
}
export function canNativeSave(){return !!bridge;}
export async function nativeSave(blob,name){
 if(!bridge||saving)throw new Error('Save already in progress');saving=true;
 try{
  await send({action:'begin',name,size:blob.size});
  for(let offset=0;offset<blob.size;offset+=65536){const bytes=new Uint8Array(await blob.slice(offset,offset+65536).arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=4096)text+=String.fromCharCode(...bytes.subarray(i,i+4096));await send({action:'chunk',chunk:btoa(text)});}
  return await send({action:'finish'},180000);
 }catch(error){if(!pending)await send({action:'abort'}).catch(()=>{});throw error;}
 finally{saving=false;}
}
function attachDropdown(details,menu){
 const position=()=>{
  if(!details.open)return;
  menu.style.transform='';
  const rect=menu.getBoundingClientRect();
  const pad=10,maxRight=document.documentElement.clientWidth-pad;
  let dx=0;
  if(rect.left<pad)dx=pad-rect.left;
  else if(rect.right>maxRight)dx=maxRight-rect.right;
  if(dx)menu.style.transform=`translateX(${Math.round(dx)}px)`;
 };
 details.addEventListener('toggle',()=>{
  if(!details.open)return;
  for(const other of document.querySelectorAll('details.sm-native-files[open]'))if(other!==details)other.open=false;
  position();
 });
 window.addEventListener('resize',position);
 document.addEventListener('click',event=>{if(details.open&&!details.contains(event.target))details.open=false;});
}
export function setupNativeFiles(anchor){
 if((!bridge&&!globalThis.SmartMaktabWindows)||!anchor)return;
 const details=document.createElement('details'),header=document.createElement('summary'),menu=document.createElement('div');details.className='sm-native-files';header.className='theme-toggle';details.append(header,menu);
 const open=document.createElement('button'),share=document.createElement('button');open.type=share.type='button';open.className=share.className='button alt';menu.append(open);if(bridge)menu.append(share);anchor.before(details);
 attachDropdown(details,menu);
 function refresh(){const tg=document.documentElement.lang==='tg';header.textContent=tg?'Файлҳо':'Файлы';open.textContent=tg?'Кушодан дар барномаи дигар':'Открыть в другой программе';share.textContent=tg?'Мубодила':'Поделиться';}
 open.addEventListener('click',()=>{details.open=false;if(bridge)void send({action:'openFile'}).catch(()=>{});else void globalThis.SmartMaktabWindows.openFile().catch(()=>{});});
 share.addEventListener('click',()=>{details.open=false;void send({action:'shareFile'}).catch(()=>{});});refresh();document.addEventListener('cabinet:language',refresh);
}

if(bridge)globalThis.smartMaktabBack=()=>{const openMenu=document.querySelector('details.sm-native-files[open]');if(openMenu){openMenu.open=false;return true;}return !document.dispatchEvent(new Event('sm:native-back',{cancelable:true}));};

export function setupNativePrograms(anchor){
 if(!bridge||!anchor)return;
 const details=document.createElement('details'),header=document.createElement('summary'),menu=document.createElement('div'),appUpdate=document.createElement('button'),update=document.createElement('button'),download=document.createElement('button');
 details.className='sm-native-files';header.className='theme-toggle';appUpdate.type='button';appUpdate.className='button alt';update.type='button';update.className='button alt';download.type='button';download.className='button alt';
 menu.append(appUpdate,update,download);details.append(header,menu);anchor.before(details);
 attachDropdown(details,menu);
 const language=()=>document.documentElement.lang==='tg'?'tg':'ru';
 function refresh(){const tg=language()==='tg';header.textContent=tg?'Барномаҳо':'Программы';appUpdate.textContent=tg?'Навсозии барнома':'Обновление приложения';update.textContent=tg?'Навсозии мавод':'Обновление материалов';download.textContent=tg?'Боргирӣ барои Windows (.exe)':'Скачать для Windows (.exe)';}
 appUpdate.addEventListener('click',()=>{details.open=false;void send({action:'checkAssetUpdate',lang:language()}).catch(()=>{});});
 update.addEventListener('click',()=>{details.open=false;void send({action:'downloadContentUpdate',lang:language()}).catch(()=>{});});
 download.addEventListener('click',()=>{details.open=false;void send({action:'downloadWindows',lang:language()}).catch(()=>{});});
 refresh();document.addEventListener('cabinet:language',refresh);
}
