import {canNativeSave,nativeSave} from './native-shell.mjs';
import {cachedPdf,rememberPdf,readerStore} from './reader-memory.mjs';
import {extractReaderText} from './reader-text.mjs';
import {hasPortablePdf,portablePdf,PortableFonts} from './portable-pdf.mjs';
import {appRoot,offlineViewer,publishReaderMode} from './cabinet-runtime.mjs';
import {fetchBookFile,readableSize,bookFilename} from './book-transfer.mjs';
import {saveBookOffline,getCachedBook,deleteCachedBook} from './book-cache.mjs';
import {makeReaderAliya} from './reader-aliya.mjs';
const words={fit:['Андозаи муқаррарӣ','Исходный масштаб'],findPrevious:['Натиҷаи пешина','Предыдущее совпадение'],findNext:['Натиҷаи баъдӣ','Следующее совпадение'],searchStop:['Қатъи ҷустуҷӯ','Остановить поиск'],searchStopped:['Ҷустуҷӯ қатъ шуд.','Поиск остановлен.'],read:['Хондан','Читать'],loading:['Китоб бор мешавад…','Загрузка книги…'],failure:['Китоб кушода нашуд. Пайвастро санҷед ва дубора кӯшиш кунед.','Не удалось открыть книгу. Попробуйте исходную ссылку.'],prev:['Саҳифаи пешина','Предыдущая страница'],next:['Саҳифаи баъдӣ','Следующая страница'],larger:['Калон кардан','Увеличить'],smaller:['Хурд кардан','Уменьшить'],close:['Пӯшидани китоб','Закрыть книгу'],download:['Зеркашӣ','Скачать'],saveOffline:['Барои офлайн','Сохранить офлайн'],removeOffline:['Аз офлайн тоза','Удалить из кэша'],offlineSaved:['Барои хониши офлайн сабт шуд.','Сохранено для офлайн-чтения.'],cancel:['Қатъ кардан','Отменить'],done:['Зеркашӣ анҷом ёфт','Загрузка завершена'],downloadError:['Зеркашӣ нашуд. Пайвастро санҷед ва дубора кӯшиш кунед.','Не удалось скачать. Попробуйте исходную ссылку.'],tooLarge:['Файл аз ҳадди боргирии дохилӣ калонтар аст. Пайванди аслиро истифода баред.','Файл превышает лимит встроенной загрузки. Используйте исходную ссылку.'],downloading:['Зеркашӣ мешавад','Скачивание'],page:['Саҳифа','Страница'],size:['Ҳаҷми файл','Размер файла'],light:['Рӯз','День'],dark:['Шаб','Ночь'],brightness:['Дурахшонӣ','Яркость'],settings:['Танзимот','Настройки'],search:['Ҷустуҷӯ','Поиск'],searchLimit:['Аз саҳифаи ҷорӣ то ҳамаи саҳифаҳо санҷида мешавад.','Проверяется до всей книге, начиная с текущей.'],searching:['Ҷустуҷӯ идома дорад…','Идёт поиск…'],notFound:['Натиҷа ёфт нашуд. Агар китоб скан бошад, матни он ҷустуҷӯшаванда нест.','Ничего не найдено. Если это скан, в нём может не быть текстового слоя.'],screen:['Экрани пурра','Полный экран'],notes:['Ёддоштҳо','Заметки'],saveFile:['Сабти файл','Сохранить файл'],last:['Ҷойи хониш сабт мешавад','Позиция чтения сохраняется на этом устройстве']};
const label=key=>words[key][document.documentElement.lang==='ru'?1:0];
const el=(tag,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;return n;};
export function makePdfReader(host){
 const portable=hasPortablePdf();if(offlineViewer&&!portable)return null;
 const view=el('dialog','pdf-reader no-print'),shell=el('div','reader-layout'),top=el('header','reader-top'),head=el('div','reader-head'),title=el('h4'),meta=el('small'),mark=el('span','reader-brand'),tools=el('div','reader-tools'),body=el('div','reader-body'),stage=el('main','pdf-stage'),canvas=el('canvas'),bottom=el('footer','reader-bottom'),marking=el('div','reader-location'),indicator=el('output'),quick=el('input'),status=el('p','reader-status');
 const settings=el('section','reader-settings'),search=el('section','reader-search'),searchForm=el('form'),query=el('input'),searchInfo=el('p'),hits=el('ol'),searchNav=el('div','reader-tools');
 const transfer=el('div','reader-transfer'),downloadStatus=el('p'),bar=el('progress'),transferButtons=el('div','reader-tools');
 title.id='teacherReaderTitle';title.tabIndex=-1;view.setAttribute('aria-labelledby',title.id);status.setAttribute('role','status');downloadStatus.setAttribute('role','status');
 mark.textContent='SMARTMAKTAB  /  KITOBKHONA';head.append(mark,title,meta);top.append(head,tools);stage.append(canvas);body.append(stage);shell.append(top,transfer,status,body,bottom);view.append(shell);document.body.append(view);
 transfer.append(downloadStatus,bar,transferButtons);marking.append(indicator,quick);quick.type='number';quick.min='1';quick.inputMode='numeric';bottom.append(marking);settings.hidden=search.hidden=true;
 searchForm.append(query);query.type='search';query.maxLength=100;search.append(searchForm,searchNav,searchInfo,hits);body.append(search,settings);
 let generation=0,drawGeneration=0,seekGeneration=0,load=null,rendering=null,doc=null,book=null,page=1,zoom=1,message='',modulePromise,reading=false,night=false,brightness=100,transferContext=null,downloadFile=null,objectURL='',launch=null,hitIndex=-1,offlineStored=false;const pageTexts=new Map();
 const transferStates=()=>transferContext?.state??'';
 const buttons=new Map();
 function button(k,parent,callback,symbol=''){const b=el('button','reader-button');b.type='button';b.addEventListener('click',callback);b.dataset.readerAction=k;buttons.set(k,{b,symbol});parent.append(b);return b;}
 const go=(n)=>{if(!doc||!Number.isInteger(n))return;page=Math.max(1,Math.min(doc.numPages,n));draw();};
 const back=button('close',tools,()=>close(true),'←');
 button('search',tools,()=>showPanel('search'),'⌕');button('notes',tools,()=>showPanel('notes'),'▤');button('screen',tools,toggleScreen,'⛶');
 const aliyaButton=el('button','reader-button reader-aliya');aliyaButton.type='button';aliyaButton.textContent='✦ Алия';aliyaButton.addEventListener('click',()=>showPanel('aliya'));tools.append(aliyaButton);
 button('prev',bottom,()=>go(page-1),'‹');button('next',bottom,()=>go(page+1),'›');button('smaller',bottom,()=>changeZoom(-.15),'−');button('fit',bottom,()=>{zoom=1;draw();});button('larger',bottom,()=>changeZoom(.15),'+');button('settings',bottom,()=>showPanel('settings'),'◐');
 button('download',bottom,startDownload,'⇩');button('saveOffline',bottom,toggleOfflineSave,'★');button('read',bottom,loadReader,'▤');button('cancel',transferButtons,cancelDownload);button('saveFile',transferButtons,saveDownload);
 const inputLight=el('input'),lightLabel=el('label'),lightCaption=el('span');inputLight.type='range';inputLight.min='50';inputLight.max='120';inputLight.value='100';inputLight.addEventListener('input',()=>{brightness=Number(inputLight.value);refresh();});lightLabel.append(lightCaption,inputLight);
 const toggleTheme=el('button','reader-button'),settingsTitle=el('h3');toggleTheme.type='button';toggleTheme.addEventListener('click',()=>{night=!night;refresh();});settings.append(settingsTitle,toggleTheme,lightLabel);
 button('findPrevious',searchNav,()=>moveHit(-1),'↑');button('findNext',searchNav,()=>moveHit(1),'↓');button('searchStop',searchNav,stopSearch);
 const searchButton=el('button','reader-button');searchButton.type='submit';searchForm.append(searchButton);searchForm.addEventListener('submit',event=>{event.preventDefault();runSearch();});
 const aliya=makeReaderAliya(view,()=>({book,doc,page,textFor,pageImage}),()=>{aliya.dismiss();aliyaButton.focus();});
 function showPanel(name){
  if(name==='search'){aliya.dismiss();settings.hidden=true;search.hidden=!search.hidden;if(!search.hidden)query.focus();return;}
  if(name==='settings'){aliya.dismiss();search.hidden=true;settings.hidden=!settings.hidden;if(!settings.hidden)toggleTheme.focus();return;}
  search.hidden=settings.hidden=true;if(!aliya.node.hidden&&name==='aliya'){aliya.dismiss();return;}aliya.open();if(name==='notes')aliya.showNotes();
 }
 function toggleScreen(){if(document.fullscreenElement){document.exitFullscreen().catch(()=>{});return;}if(view.requestFullscreen)view.requestFullscreen().catch(()=>{});}
 function changeZoom(by){if(doc){zoom=Math.max(.5,Math.min(4,zoom+by));draw();}}
 function refresh(){
  title.textContent=book?.title??'';meta.textContent=`${label('size')}: ${readableSize(book?.size)} · ${label('last')}`;status.textContent=message?label(message):'';status.hidden=!message;indicator.textContent=doc?`${page} / ${doc.numPages}`:'';
  view.dataset.theme=night?'dark':'light';view.style.setProperty('--read-light',String(brightness/100));
  for(const [key,{b,symbol}] of buttons){b.textContent=symbol?`${symbol} ${label(key)}`:label(key);b.setAttribute('aria-label',label(key));}
  const access=(key,disabled)=>{buttons.get(key).b.disabled=disabled;};
  access('prev',!doc||page<=1);access('next',!doc||page>=doc.numPages);access('smaller',!doc||zoom<=.5);access('larger',!doc||zoom>=4);access('search',!doc);access('read',reading||!!doc);access('fit',!doc);access('findPrevious',!hits.children.length);access('findNext',!hits.children.length);buttons.get('searchStop').b.hidden=!searchInfo.dataset.running;access('download',transferStates()==='downloading'&&transferContext?.wantsSave);
  buttons.get('saveOffline').b.hidden=!book;
  buttons.get('saveOffline').b.textContent=`${offlineStored?'✓ ':'★ '}${label(offlineStored?'removeOffline':'saveOffline')}`;
  buttons.get('saveOffline').b.setAttribute('aria-label',label(offlineStored?'removeOffline':'saveOffline'));
  buttons.get('fit').b.textContent=`${Math.round(zoom*100)}%`;
  buttons.get('read').b.hidden=!!doc||reading;aliyaButton.disabled=!book;stage.hidden=!doc;
  quick.disabled=!doc;quick.max=doc?.numPages??'';if(document.activeElement!==quick)quick.value=doc?String(page):'';quick.setAttribute('aria-label',label('page'));
  searchButton.textContent=label('search');query.placeholder=label('search');query.setAttribute('aria-label',label('search'));if(!searchInfo.textContent)searchInfo.textContent=label('searchLimit');
  settingsTitle.textContent=label('settings');toggleTheme.textContent=label(night?'light':'dark');lightCaption.textContent=`${label('brightness')}: ${brightness}%`;
  repaintTransfer();aliya.update();
 }
 function repaintTransfer(){
  const data=transferContext,mode=data?.state??'';transfer.hidden=!data;bar.hidden=mode!=='downloading';
  buttons.get('cancel').b.hidden=mode!=='downloading';buttons.get('saveFile').b.hidden=mode!=='done';
  if(!data){downloadStatus.textContent='';return;}
  if(mode==='downloading'){
   const {loaded,total}=data;const pct=total&&loaded!=null?Math.min(99,Math.floor(100*loaded/total)):null;
   if(pct===null)bar.removeAttribute('value');else{bar.max=100;bar.value=pct;}
   bar.setAttribute('aria-label',label('downloading'));downloadStatus.textContent=`${label('downloading')} · ${loaded?readableSize(loaded):'0 МБ'}${total?` / ${readableSize(total)} · ${pct}%`:''}`;
  }else downloadStatus.textContent=mode==='done'?`${label('done')} · 100% · ${readableSize(downloadFile?.size)}`:mode==='cancel'?label('cancel'):data.error==='too_large'?label('tooLarge'):label('downloadError');
 }
 async function bytesForBook({wantsSave=false}={}){
  const file=downloadFile??cachedPdf(book.url);if(file){downloadFile=file;return file;}
  try{const cachedBytes=await getCachedBook(book.url);if(cachedBytes?.byteLength){const cachedBlob=new Blob([cachedBytes],{type:'application/pdf'});downloadFile=cachedBlob;offlineStored=true;rememberPdf(book.url,cachedBlob);return cachedBlob;}}catch{}
  if(transferContext?.state==='downloading'){if(wantsSave)transferContext.wantsSave=true;return transferContext.promise;}
  const v=generation,url=book.url,controller=new AbortController();
  const op={state:'downloading',loaded:0,total:book.size,controller,wantsSave};transferContext=op;
  op.promise=fetchBookFile(book,{signal:controller.signal,onProgress:progress=>{if(transferContext!==op)return;Object.assign(op,progress);repaintTransfer();}}).then(file=>{
   if(v!==generation||transferContext!==op||controller.signal.aborted)throw new DOMException('Aborted','AbortError');
   downloadFile=file;rememberPdf(url,file);op.state='done';if(!op.wantsSave)transferContext=null;refresh();return file;
  }).catch(error=>{if(v===generation&&transferContext===op){op.state=controller.signal.aborted?'cancel':'error';op.error=error.message;refresh();}throw error;});
  refresh();return op.promise;
 }
 async function toggleOfflineSave(){
  if(!book)return;const target=book;
  if(offlineStored){await deleteCachedBook(target.url).catch(()=>{});if(book===target){offlineStored=false;message='';refresh();}return;}
  try{
   const file=await bytesForBook();if(book!==target||!file)return;
   await saveBookOffline({id:target.url,title:target.title},new Uint8Array(await file.arrayBuffer()));
   if(book===target){offlineStored=true;message='offlineSaved';refresh();}
  }catch{}
 }
 async function startDownload(){
  if(!book||transferContext?.wantsSave&&transferStates()==='downloading')return;
  const v=generation;
  try{
   const file=await bytesForBook({wantsSave:true});if(v!==generation||!file)return;
   if(!transferContext)transferContext={state:'done',loaded:file.size,total:file.size,wantsSave:true};
   refresh();saveDownload();
  }catch{/* The transfer panel shows cancel or retry status. */}
 }
 function cancelDownload(){const op=transferContext;if(op?.state==='downloading'){op.controller.abort();op.state='cancel';refresh();}}
 function saveDownload(){
  if(!downloadFile)return;if(canNativeSave()){const current=generation;void nativeSave(downloadFile,bookFilename(book.title)).catch(()=>{if(current===generation&&transferContext){transferContext.state='error';refresh();}});return;}if(!objectURL)objectURL=URL.createObjectURL(downloadFile);
  const a=el('a');a.download=bookFilename(book.title);a.href=objectURL;view.append(a);a.click();a.remove();
 }
 function serverModule(){
  if(portable)return portablePdf();
  if(!modulePromise)modulePromise=import(new URL('vendor/pdf/pdf.min.mjs',appRoot).href).then(engine=>{engine.GlobalWorkerOptions.workerSrc=new URL('vendor/pdf/pdf.worker.min.mjs',appRoot).href;return engine;}).catch(err=>{modulePromise=null;throw err;});return modulePromise;
 }
 
 async function open(item,{download=false,trigger}={}){
  close(false);book=item;launch=trigger??document.activeElement;page=1;zoom=1;night=false;brightness=100;inputLight.value='100';offlineStored=false;
  try{view.showModal();}catch{return;}document.body.classList.add('reader-modal-open');publishReaderMode(true);refresh();title.focus();
  getCachedBook(item.url).then(bytes=>{if(book===item&&bytes?.byteLength){offlineStored=true;refresh();}}).catch(()=>{});
  if(download)startDownload();else loadReader();
 }
 async function loadReader(){
  if(!book||reading||doc)return;const active=generation;reading=true;message='loading';refresh();
  try{
   const [engine,file]=await Promise.all([serverModule(),bytesForBook()]);if(active!==generation)return;
   const opts={data:new Uint8Array(await file.arrayBuffer())};if(active!==generation)return;
   load=engine.getDocument({...opts,isEvalSupported:false,enableXfa:false,useWasm:false,maxImageSize:16000000,...(portable?{StandardFontDataFactory:PortableFonts,useWorkerFetch:false}:{standardFontDataUrl:new URL('vendor/pdf/standard_fonts/',appRoot).href}),rangeChunkSize:65536});
   const result=await load.promise;if(active!==generation)return;doc=result;let saved=1;try{saved=Number(readerStore.get('position',book.url))||1;}catch{}
   page=Math.min(doc.numPages,Math.max(1,Math.floor(saved)));message='';await draw();
  }catch{if(active===generation){doc=null;message=transferStates()==='cancel'?'':'failure';}}finally{if(active===generation){reading=false;refresh();}}
 }
 async function draw(){
  const v=generation,seq=++drawGeneration,previous=rendering;previous?.cancel();rendering=null;refresh();
  try{
   if(previous)try{await previous.promise;}catch{}
   if(!doc||v!==generation||seq!==drawGeneration)return;const current=page;
   const n=await doc.getPage(current);if(v!==generation||seq!==drawGeneration)return;
   const size=n.getViewport({scale:1}),available=Math.max(80,stage.clientWidth-32),height=Math.max(80,stage.clientHeight-32),fit=Math.min(available/size.width,height/size.height);
   const scale=Math.min(zoom*fit,3000/Math.max(size.width,size.height)),viewport=n.getViewport({scale});
   const ratio=Math.max(1,Math.min(devicePixelRatio||1,2,4000/Math.max(viewport.width,viewport.height)));
   canvas.style.width=`${Math.floor(viewport.width)}px`;canvas.style.height=`${Math.floor(viewport.height)}px`;canvas.width=Math.max(1,Math.floor(viewport.width*ratio));canvas.height=Math.max(1,Math.floor(viewport.height*ratio));
   const task=n.render({canvas,viewport,transform:ratio>1?[ratio,0,0,ratio,0,0]:undefined});rendering=task;await task.promise;
   if(rendering===task&&v===generation&&seq===drawGeneration){rendering=null;try{readerStore.set('position',book.url,String(current));}catch{}stage.scrollTo(0,0);}
  }catch{if(v===generation&&seq===drawGeneration){message='failure';refresh();}}
 }
 async function textFor(n){
  if(!doc)return '';if(pageTexts.has(n))return pageTexts.get(n);const source=doc,title=book.title;
  const p=await source.getPage(n);const text=extractReaderText((await p.getTextContent()).items,title);
  if(source===doc){if(pageTexts.size>=48)pageTexts.delete(pageTexts.keys().next().value);pageTexts.set(n,text);}return text;
 }
 async function pageImage(n){
  const p=await doc.getPage(n),base=p.getViewport({scale:1}),viewport=p.getViewport({scale:Math.min(2,1500/Math.max(base.width,base.height))});
  const image=el('canvas');image.width=Math.ceil(viewport.width);image.height=Math.ceil(viewport.height);
  try{await p.render({canvas:image,viewport,background:'white'}).promise;return image.toDataURL('image/jpeg',.8).split(',')[1];}
  finally{image.width=image.height=0;}
 }
 function stopSearch(){seekGeneration++;searchInfo.dataset.running='';searchInfo.textContent=label('searchStopped');refresh();}
 function moveHit(step){const count=hits.children.length;if(!count)return;hitIndex=hitIndex<0?(step>0?0:count-1):(hitIndex+step+count)%count;const item=hits.children[hitIndex],button=item.querySelector('button');go(Number(button.dataset.page));for(const node of hits.children)node.classList.toggle('current-hit',node===item);item.scrollIntoView({block:'nearest'});}
 async function runSearch(){
  const q=query.value.trim().toLocaleLowerCase('ru').normalize('NFC');if(!q||!doc)return;const seq=++seekGeneration;hits.replaceChildren();hitIndex=-1;searchInfo.dataset.running='yes';searchInfo.textContent=label('searching');const count=doc.numPages;refresh();
  for(let n=1;n<=count;n++){
   if(seq!==seekGeneration)return;let raw='';try{raw=await textFor(n);}catch{}if(seq!==seekGeneration)return;
   if(n%9===0)searchInfo.textContent=`${label('searching')} ${n} / ${count}`;
   const found=raw.toLocaleLowerCase('ru').indexOf(q);if(found<0)continue;
   const li=el('li'),b=el('button','reader-button');b.type='button';b.dataset.page=String(n);b.textContent=`${label('page')} ${n} · ${raw.slice(Math.max(0,found-28),found+q.length+48)}`;b.addEventListener('click',()=>{hitIndex=[...hits.children].indexOf(li);moveHit(0);});li.append(b);hits.append(li);refresh();
  }
  if(seq===seekGeneration){searchInfo.dataset.running='';searchInfo.textContent=hits.children.length?`${hits.children.length} · ${count}`:label('notFound');refresh();}
 }
 function close(focus=false){
  generation++;drawGeneration++;seekGeneration++;rendering?.cancel();rendering=null;if(load)load.destroy().catch(()=>{});load=null;doc=null;book=null;message='';reading=false;canvas.width=canvas.height=0;
  transferContext?.controller?.abort();transferContext=null;downloadFile=null;if(objectURL)URL.revokeObjectURL(objectURL);objectURL='';
  aliya.dismiss();search.hidden=settings.hidden=true;hits.replaceChildren();pageTexts.clear();searchInfo.dataset.running='';searchInfo.textContent='';query.value='';
  if(view.open)view.close();document.body.classList.remove('reader-modal-open');publishReaderMode(false);if(document.fullscreenElement===view)document.exitFullscreen().catch(()=>{});if(focus)(launch?.isConnected?launch:host.querySelector('[data-reader-launch]'))?.focus();
 }
 function handleBack(){if(!aliya.node.hidden){if(!aliya.handleBack()){aliya.dismiss();aliyaButton.focus();}}else if(!search.hidden||!settings.hidden){search.hidden=settings.hidden=true;back.focus();}else close(true);}
 view.addEventListener('cancel',event=>{event.preventDefault();handleBack();});
 document.addEventListener('sm:native-back',event=>{if(view.open&&!event.defaultPrevented){event.preventDefault();handleBack();}});
 quick.addEventListener('change',()=>go(Number(quick.value)));quick.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();go(Number(quick.value));quick.blur();}});
 view.addEventListener('keydown',event=>{if(!doc||event.target.matches('input,textarea,select')||!aliya.node.hidden)return;if(['ArrowLeft','ArrowRight','PageUp','PageDown'].includes(event.key)){event.preventDefault();go(page+(['ArrowLeft','PageUp'].includes(event.key)?-1:1));}});
 let touch=null,pinch=null;
 const gap=points=>Math.hypot(points[1].clientX-points[0].clientX,points[1].clientY-points[0].clientY);
 stage.addEventListener('touchstart',event=>{if(event.touches.length===2&&doc){touch=null;const distance=gap(event.touches);if(distance>8)pinch={distance,zoom,latest:zoom};}else touch=event.touches.length===1?event.touches[0]:null;},{passive:true});
 stage.addEventListener('touchmove',event=>{if(pinch&&event.touches.length===2){if(event.cancelable)event.preventDefault();pinch.latest=Math.max(.5,Math.min(4,pinch.zoom*gap(event.touches)/pinch.distance));}},{passive:false});
 stage.addEventListener('touchcancel',()=>{pinch=touch=null;});
 stage.addEventListener('touchend',event=>{if(pinch){zoom=pinch.latest;pinch=touch=null;draw();return;}if(!touch)return;const p=event.changedTouches[0],dx=p.clientX-touch.clientX,dy=p.clientY-touch.clientY;touch=null;if(Math.abs(dx)>66&&Math.abs(dx)>1.7*Math.abs(dy)&&stage.scrollWidth<=stage.clientWidth+16)go(page+(dx<0?1:-1));},{passive:true});
 let resizeTimer;const resize=()=>{if(!view.open||!doc)return;clearTimeout(resizeTimer);resizeTimer=setTimeout(draw,85);};
 if(typeof ResizeObserver==='function')new ResizeObserver(resize).observe(stage);else window.addEventListener('resize',resize);
 return {open,close,refresh,buttonText:()=>label('read'),downloadText:()=>label('download'),sizeText:bytes=>`${label('size')}: ${readableSize(bytes)}`};
}
