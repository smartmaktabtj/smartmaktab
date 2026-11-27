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
if(bridge)globalThis.smartMaktabBack=()=>{const openMenu=document.querySelector('details.sm-native-files[open]');if(openMenu){openMenu.open=false;return true;}return !document.dispatchEvent(new Event('sm:native-back',{cancelable:true}));};

export function setupUnifiedUpdateMenu(anchor,onOpenMaterials){
 if(!anchor)return null;
 const win=globalThis.SmartMaktabWindows;
 const details=document.createElement('details');
 details.className='sm-native-files';
 details.id='cabinetUpdateMenu';
 const summary=document.createElement('summary');
 summary.className='theme-toggle sm-upd-trigger';
 summary.id='cabinetUpdateTrigger';
 const icon=document.createElement('span');
 icon.setAttribute('aria-hidden','true');
 icon.textContent='↻';
 const dot=document.createElement('span');
 dot.className='sm-upd-badge';
 dot.id='cabinetUpdateDot';
 dot.hidden=true;
 summary.append(icon,dot);

 const menu=document.createElement('div');
 const appUpdate=document.createElement('button');
 const contentUpdate=document.createElement('button');
 const downloadWin=document.createElement('button');
 const status=document.createElement('p');
 status.className='small';
 status.hidden=true;
 status.style.margin='2px 4px 0';
 for(const btn of [appUpdate,contentUpdate,downloadWin]){btn.type='button';btn.className='button alt';}
 menu.append(appUpdate,contentUpdate,downloadWin,status);
 details.append(summary,menu);
 anchor.before(details);
 attachDropdown(details,menu);

 const language=()=>document.documentElement.lang==='tg'?'tg':'ru';
 function refresh(){
  const tg=language()==='tg';
  summary.title=tg?'Навсозӣ':'Обновление';
  summary.setAttribute('aria-label',tg?'Навсозӣ':'Обновление');
  appUpdate.textContent=tg?'Навсозии барнома':'Обновление приложения';
  contentUpdate.textContent=tg?'Навсозии мавод':'Обновление материалов';
  downloadWin.textContent=tg?'Боргирӣ барои Windows (.exe)':'Скачать для Windows (.exe)';
 }

 appUpdate.addEventListener('click',async()=>{
  details.open=false;
  const tg=language()==='tg';
  if(bridge){void send({action:'checkAssetUpdate',lang:language()}).catch(()=>{});return;}
  if(win?.checkAppRelease){
   const res=await win.checkAppRelease().catch(()=>({status:'network'}));
   if(res?.status==='available'&&res.downloadUrl){
    await win.openAppDownload(res.downloadUrl).catch(()=>{});
    return;
   }
   status.hidden=false;
   status.textContent=res?.status==='up-to-date'
    ?(tg?`Нусхаи навтарин (${res.currentVersion}) насб аст.`:`Установлена актуальная версия (${res.currentVersion}).`)
    :(tg?'Санҷиш имконнопазир (интернет лозим).':'Проверка недоступна (нужен интернет).');
   details.open=true;
   return;
  }
  try{const reg=await navigator.serviceWorker?.getRegistration?.();await reg?.update?.();}catch{}
  status.hidden=false;
  status.textContent=tg?'Нусха санҷида шуд.':'Версия проверена.';
  details.open=true;
 });

 contentUpdate.addEventListener('click',()=>{
  details.open=false;
  const tg=language()==='tg';
  if(bridge){void send({action:'downloadContentUpdate',lang:language()}).catch(()=>{});return;}
  if(typeof onOpenMaterials==='function'&&onOpenMaterials())return;
  status.hidden=false;
  status.textContent=tg?'Бастаҳои навсозии мавод дар барномаи Windows ё Android боргирӣ мешаванд.':'Пакеты обновления материалов доступны в приложении Windows или Android.';
  details.open=true;
 });

 downloadWin.addEventListener('click',()=>{
  details.open=false;
  if(bridge){void send({action:'downloadWindows',lang:language()}).catch(()=>{});return;}
  const url='https://github.com/smartmaktabtj/smartmaktab/releases/latest';
  if(win?.openAppDownload)void win.openAppDownload('https://github.com/smartmaktabtj/smartmaktab/releases').catch(()=>{});
  else window.open(url,'_blank','noopener');
 });

 if(win?.checkAppRelease){
  void win.checkAppRelease().then(r=>{if(r?.status==='available')dot.hidden=false;}).catch(()=>{});
 }
 if(win?.autoCheckContent){
  void win.autoCheckContent().then(r=>{
   if(r?.status==='available'||r?.status==='applied')dot.hidden=false;
   if(r?.status==='applied')document.dispatchEvent(new CustomEvent('sm:content-updated',{detail:r.payload}));
  }).catch(()=>{});
 }

 refresh();
 document.addEventListener('cabinet:language',refresh);
 return {dot};
}
export function setupNativePrograms(anchor){return setupUnifiedUpdateMenu(anchor);}
