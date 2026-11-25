let workspace;
export const openWorkspaceView=(id,trigger)=>workspace?.open(id,trigger);
export const closeWorkspaceView=id=>workspace?.close(id);
export const addWorkspaceShortcut=(id,ru,tg,icon)=>workspace?.shortcut(id,ru,tg,icon);

export function initWorkspaceViews(article){
 const frame=article.closest('main'),rail=document.getElementById('cabinetRailNav');
 const nav=document.createElement('nav');nav.className='sm-shortcuts no-print';
 const bar=document.createElement('header');bar.className='sm-view-bar no-print';bar.hidden=true;
 const back=document.createElement('button'),sectionName=document.createElement('span');back.type='button';back.className='button alt';bar.append(back,sectionName);frame.before(bar);
 const overview=document.getElementById('workspaceOverview');overview.after(nav);
 const shortcuts=[];let stack=[];
 const idOf=()=>stack.at(-1)?.id??'';
 const words=(ru,tg)=>document.documentElement.lang==='tg'?tg:ru;
 const displayTitle=panel=>panel?.querySelector('h2,h3')?.textContent.trim()??'';
 function refresh(){
  const id=idOf();back.textContent=words('← Назад','← Бозгашт');
  nav.setAttribute('aria-label',words('Разделы кабинета','Бахшҳои утоқи корӣ'));
  sectionName.textContent=id?displayTitle(document.getElementById(id)):'';
  for(const {button,id,ru,tg,icon} of shortcuts){button.textContent=`${icon}  ${words(ru,tg)}`;}
  rail?.querySelectorAll('a').forEach(a=>{if(a.hash==='#cabinetHome'||shortcuts.some(s=>`#${s.id}`===a.hash)){const yes=a.hash===`#${id||'cabinetHome'}`;a.classList.toggle('active',yes);if(yes)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}});
 }
 function show(focus){
  while(stack.length){const target=document.getElementById(idOf());if(target&&!target.closest('[hidden]'))break;stack.pop();}
  const id=idOf(),panel=document.getElementById(id);article.dataset.smScreen=id;
  article.querySelectorAll('.sm-screen-current,.sm-preview-parent,.sm-preview-content').forEach(el=>el.classList.remove('sm-screen-current','sm-preview-parent','sm-preview-content'));
  if(panel){let root=panel;while(root.parentElement!==article)root=root.parentElement;root.classList.add('sm-screen-current');if(panel!==root&&panel.matches('.print-card')){panel.parentElement.classList.add('sm-preview-parent');panel.classList.add('sm-preview-content');}}
  bar.hidden=!panel;frame.scrollTop=0;
  refresh();
  if(focus){const heading=panel?.querySelector('h2,h3');if(heading)heading.tabIndex=-1;(heading??overview.querySelector('h2'))?.focus({preventScroll:true});}
 }
 function open(id,trigger=document.activeElement,{replace=false,focus=true}={}){
  let target=document.getElementById(id);if(!target||!article.contains(target))return false;
  if(target.hidden){if(['teacherDocumentPanel','directorPlanPanel','libraryPlanPanel','libraryLoans'].includes(id))return open('workspaceSettings',trigger,{replace,focus});return false;}
  target.classList.add('sm-screen');
  if(idOf()===id)return true;
  const previous=stack.findIndex(s=>s.id===id);
  if(previous!==-1)stack=stack.slice(0,previous+1);
  else{if(replace)stack=[];stack.push({id,trigger});}
  show(focus);return true;
 }
 function close(id=idOf()){
  if(!id||id!==idOf())return false;
  const {trigger}=stack.pop();show(false);
  if(trigger?.isConnected&&trigger.getClientRects().length)trigger.focus({preventScroll:true});else (stack.length?back:nav.querySelector('button'))?.focus({preventScroll:true});
  return true;
 }
 function shortcut(id,ru,tg,icon='▤'){
  const target=document.getElementById(id);if(!target||!article.contains(target))return;
  target.classList.add('sm-screen');
  const button=document.createElement('button');button.type='button';button.className='sm-shortcut';button.dataset.openView=id;button.setAttribute('aria-controls',id);nav.append(button);
  shortcuts.push({button,id,ru,tg,icon});button.addEventListener('click',()=>open(id,button));refresh();
 }
 back.addEventListener('click',()=>close());
 rail?.addEventListener('click',event=>{
  const a=event.target.closest('a[href^="#"]');if(!a)return;
  const id=a.getAttribute('href').slice(1);
  if(id==='cabinetHome'){event.preventDefault();stack=[];show(true);}
  else if(document.getElementById(id)?.classList.contains('sm-screen')){event.preventDefault();open(id,a,{replace:true});}
 });
 document.addEventListener('sm:native-back',event=>{if(!event.defaultPrevented&&!document.querySelector('dialog[open]')&&close())event.preventDefault();});
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||event.defaultPrevented||document.querySelector('dialog[open]'))return;
  const print=document.querySelector('.sm-target-print');if(document.body.classList.contains('sm-print-preview')&&print){print.querySelector('[data-normal-label]')?.click();return;}
  if(close())event.preventDefault();
 });
 new MutationObserver(()=>{const id=idOf();if(id){const target=document.getElementById(id);if(!target||target.closest('[hidden]'))close(id);}}).observe(article,{subtree:true,attributes:true,attributeFilter:['hidden'],childList:true});
 document.addEventListener('cabinet:language',refresh);
 article.closest('.layout').classList.add('sm-app-layout');
 workspace={open,close,shortcut,refresh,current:idOf};show(false);return workspace;
}
