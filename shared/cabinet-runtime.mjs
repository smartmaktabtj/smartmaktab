// The file viewer uses an opaque sandbox origin and blocks external assets.
const ctxNode=document.getElementById('sm-viewer-context');
export const viewerContext=ctxNode?JSON.parse(ctxNode.textContent):null;
export const offlineViewer=!!viewerContext||window.origin==='null'||!['http:','https:','smapp:'].includes(location.protocol);
const memory=new Map(Object.entries(viewerContext?.store??{}));
const canPostKey=key=>/^smartmaktab\.(?:demo|profile|cloud|active-cabinet)\.[a-z0-9_.-]{2,100}$/.test(key);
const activeKey='smartmaktab.active-cabinet.v1';
const routePattern=/^cabinets\/(?:[a-z-]+\/)*[a-z-]+\.html\?(?:school=[a-z0-9-]+&)?lang=(?:tg|ru)$/;
const sqlite=()=>typeof globalThis.SmartMaktabSqlite?.getItem==='function'?globalThis.SmartMaktabSqlite:null;
function tell(payload){if(viewerContext)parent.postMessage({channel:viewerContext.channel,...payload},'*');}
export function publishLanguage(value){tell({type:'language',value});}
export function publishReaderMode(value){tell({type:'reader-mode',value});}
export function publishTheme(value){tell({type:'theme',value});}
export const persistentStore={
 getItem(key){
  if(offlineViewer)return memory.get(key)??null;
  try{const v=localStorage.getItem(key);if(v!==null)return v;}catch{}
  try{const v=sqlite()?.getItem?.(key);if(v!==null&&v!==undefined){try{localStorage.setItem(key,v);}catch{}return v;}}catch{}
  return memory.get(key)??null;
 },
 setItem(key,value){
  const text=String(value);
  if(offlineViewer){memory.set(key,text);if(canPostKey(key))tell({type:'store',key,value:text});return;}
  try{localStorage.setItem(key,text);}catch{}
  try{sqlite()?.setItem?.(key,text);}catch{}
  memory.set(key,text);
 },
 removeItem(key){
  if(offlineViewer){memory.delete(key);if(canPostKey(key))tell({type:'remove',key});return;}
  try{localStorage.removeItem(key);}catch{}
  try{sqlite()?.removeItem?.(key);}catch{}
  memory.delete(key);
 }
};
export const tabStorage={
 getItem(key){
  if(!offlineViewer){
   try{const v=sessionStorage.getItem(key);if(v!==null)return v;}catch{}
   try{const v=sqlite()?.getItem?.(key);if(v!==null&&v!==undefined){try{localStorage.setItem(key,v);}catch{}return v;}}catch{}
   try{const v=localStorage.getItem(key);if(v!==null)return v;}catch{}
  }
  return memory.get(key)??null;
 },
 setItem(key,value){
  const text=String(value);
  if(!offlineViewer){
   try{sessionStorage.setItem(key,text);}catch{}
   try{localStorage.setItem(key,text);}catch{}
   try{sqlite()?.setItem?.(key,text);}catch{}
   return;
  }
  memory.set(key,text);if(canPostKey(key))tell({type:'store',key,value:text});
 },
 removeItem(key){
  if(!offlineViewer){
   try{sessionStorage.removeItem(key);}catch{}
   try{localStorage.removeItem(key);}catch{}
   try{sqlite()?.removeItem?.(key);}catch{}
   return;
  }
  memory.delete(key);if(canPostKey(key))tell({type:'remove',key});
 }
};
export function saveActiveResume({role='',school='',lang='tg',route=''}){
 if(offlineViewer||!routePattern.test(route))return;
 const safeLang='tg';
 const payload={role,school,lang:safeLang,route,savedAt:Date.now()};
 persistentStore.setItem(activeKey,JSON.stringify(payload));
 try{sqlite()?.saveResumeSession?.(role,school,safeLang,route);}catch{}
}
export function clearActiveResume(){
 persistentStore.removeItem(activeKey);
 try{sqlite()?.clearResumeRoute?.();}catch{}
}
export const cabinetPageURL=viewerContext?new URL(viewerContext.path, 'https://sm-preview.invalid/'):
 offlineViewer?new URL(document.querySelector('meta[name="smartmaktab-path"]')?.content||'index.html','https://sm-preview.invalid/'):new URL(location.href);
if(viewerContext?.school)cabinetPageURL.searchParams.set('school',viewerContext.school);
cabinetPageURL.searchParams.set('lang','tg');
const fragment=cabinetPageURL.pathname.match(/^(.*\/)cabinets\//)?.[1]??'/';
export const appRoot=new URL(fragment,cabinetPageURL);
export function openCabinetView(url){
 if(!offlineViewer){location.assign(url);return;}
 if(viewerContext){tell({type:'open',path:url.pathname.replace(/^\//,''),school:url.searchParams.get('school')||'',lang:url.searchParams.get('lang')||'',hash:url.hash});return;}
 showViewerHint(document.documentElement.lang==='tg'?'Барои гузариш байни утоқҳо файли оғози SmartMaktab-ро кушоед.':'Для перехода между кабинетами откройте стартовый файл SmartMaktab.');
}
function showViewerHint(text,anchor){
 let output=document.getElementById('cabinetViewerHint');
 if(!output){output=document.createElement('p');output.id='cabinetViewerHint';output.setAttribute('role','status');output.className='notice';}
 output.textContent=text;
 if(anchor)anchor.after(output);else document.querySelector('main')?.prepend(output);
}
export function printCabinetSheet(button){
 const sheet=button.closest('.print-card');if(!sheet)return;
 const clear=()=>{document.body.classList.remove('sm-isolated-print');sheet.classList.remove('sm-target-print');};
 if(!offlineViewer){
  document.body.classList.add('sm-isolated-print');sheet.classList.add('sm-target-print');
  window.addEventListener('afterprint',clear,{once:true});window.print();return;
 }
 const expanded=document.body.classList.toggle('sm-print-preview');
 document.body.classList.toggle('sm-isolated-print',expanded);sheet.classList.toggle('sm-target-print',expanded);
 const tg=document.documentElement.lang==='tg';
 if(!button.dataset.normalLabel)button.dataset.normalLabel=button.textContent;
 button.textContent=expanded?(tg?'Бозгашт ба шакл':'Вернуться к форме'):button.dataset.normalLabel;
 showViewerHint(expanded?(tg?'Нусхаи чопӣ. Барои равзанаи чоп пешнамоиши кориро кушоед.':'Печатная версия. Для системного диалога печати откройте рабочий предпросмотр.'):'',button);
 if(expanded)sheet.scrollIntoView({block:'start'});
 else document.getElementById('cabinetViewerHint')?.remove();
}
// Do not rely on submit events: sandbox without allow-forms prevents them.
export function cabinetFormAction(form,button,handler){
 button.type='button';
 const run=event=>{event?.preventDefault();if(!button.disabled&&form.reportValidity())handler();};
 button.addEventListener('click',run);
 form.addEventListener('submit',run);
 form.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&event.target instanceof HTMLInputElement&&event.target.type!=='checkbox'&&!event.isComposing)run(event);
 });
}
