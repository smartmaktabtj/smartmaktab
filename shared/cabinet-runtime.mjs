// The file viewer uses an opaque sandbox origin and blocks external assets.
const ctxNode=document.getElementById('sm-viewer-context');
export const viewerContext=ctxNode?JSON.parse(ctxNode.textContent):null;
export const offlineViewer=!!viewerContext||window.origin==='null'||!['http:','https:','smapp:'].includes(location.protocol);
const memory=new Map(Object.entries(viewerContext?.store??{}));
const prefix='smartmaktab.demo.';
function tell(payload){if(viewerContext)parent.postMessage({channel:viewerContext.channel,...payload},'*');}
export function publishLanguage(value){tell({type:'language',value});}
export function publishReaderMode(value){tell({type:'reader-mode',value});}
export function publishTheme(value){tell({type:'theme',value});}
export const tabStorage={
 getItem(key){if(!offlineViewer)try{return sessionStorage.getItem(key);}catch{}return memory.get(key)??null;},
 setItem(key,value){if(!offlineViewer)try{sessionStorage.setItem(key,value);return;}catch{}memory.set(key,value);if(key.startsWith(prefix))tell({type:'store',key,value});},
 removeItem(key){if(!offlineViewer)try{sessionStorage.removeItem(key);return;}catch{}memory.delete(key);if(key.startsWith(prefix))tell({type:'remove',key});}
};
export const cabinetPageURL=viewerContext?new URL(viewerContext.path, 'https://sm-preview.invalid/'):
 offlineViewer?new URL(document.querySelector('meta[name="smartmaktab-path"]')?.content||'onboarding/index.html','https://sm-preview.invalid/'):new URL(location.href);
if(viewerContext?.school)cabinetPageURL.searchParams.set('school',viewerContext.school);
if(viewerContext?.lang==='tg'||viewerContext?.lang==='ru')cabinetPageURL.searchParams.set('lang',viewerContext.lang);
const fragment=cabinetPageURL.pathname.match(/^(.*\/)(?:cabinets|onboarding)\//)?.[1]??'/';
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
