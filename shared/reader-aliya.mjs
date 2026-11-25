import {gatewayEnabled,runGateway} from './reader-gateway.mjs';
import {readerStore} from './reader-memory.mjs';
import {termsFromText,summarizeReaderText,examplesForTerms} from './reader-text.mjs';
const copy={title:['Алия · Ёвари китобхон','Алия · Помощник читателя'],explain:['Ёвар аз матни худи PDF истифода мебарад. Хулоса иқтибосӣ аст; ҷавобҳоро бо китоб санҷед.','Помощник работает с текстом самого PDF. Выжимка состоит из фрагментов книги; сверяйте результат с оригиналом.'],from:['Аз саҳифа','Со страницы'],to:['То саҳифа','По страницу'],summary:['Хулосаи мавзӯъ','Краткая выжимка'],words:['Калимаҳо ва истилоҳот','Слова и термины'],test:['Санҷиш ва тест','Вопросы для проверки'],lesson:['Нақшаи дарс','План урока'],translate:['Тарҷума','Перевод'],notes:['Ёддоштҳо','Заметки'],save:['Сабти ёддошт','Сохранить заметку'],remove:['Хориҷ кардан','Удалить'],close:['Бозгашт ба китоб','Вернуться к книге'],working:['Матни китоб хонда мешавад…','Извлекаю текст книги…'],noText:['Матни ҷустуҷӯшаванда ёфт нашуд. Барои скан шинохти матн лозим аст.','Текстовый слой не найден. Для скана нужно распознавание текста.'],range:['Аз 1 то 12 саҳифа дар як амал интихоб кунед.','Выберите от 1 до 12 страниц за одно действие.'],failed:['Ин амал анҷом наёфт.','Не удалось выполнить действие.'],translationUnavailable:['Тарҷумаи маҳаллӣ барои ин браузер ё ин забон дастрас нест. Матн ба сервер фиристода нашуд.','Локальный перевод для этого браузера или языковой пары недоступен. Текст на сервер не отправлен.'],toLang:['Забони тарҷума','Язык перевода'],fromLang:['Забони матн','Язык текста'],noteHint:['Ёддошт дар ҳамин браузер мемонад.','Заметка останется в этом браузере.'],noWords:['Истилоҳҳои мувофиқ ёфт нашуданд.','Подходящие термины не найдены.'],notesTask:['Сабт дар ёддошт','В заметки'],currentPage:['Саҳифаи ҷорӣ','Текущая страница'],cancel:['Бекор кардан','Отменить'],mode:['Навъи супориш','Вид задания'],notSaved:['Браузер нигоҳдории ёддоштҳоро иҷозат надод.','Браузер не разрешил сохранить заметки.']};
const languages={tg:'Тоҷикӣ',ru:'Русский',en:'English',de:'Deutsch',fr:'Français',uz:'Oʻzbekcha',tr:'Türkçe',ar:'العربية',fa:'فارسی',zh:'中文'};
const el=(tag,cls)=>{const x=document.createElement(tag);if(cls)x.className=cls;return x;};
export function makeReaderAliya(host,readContext,onClose){
 const local=(tg,ru)=>document.documentElement.lang==='ru'?ru:tg,t=k=>copy[k][document.documentElement.lang==='ru'?1:0];
 const pane=el('section','aliya-reading-pane'),title=el('h3'),context=el('p','aliya-context'),fields=el('div','aliya-fields'),actions=el('div','aliya-actions'),result=el('section','aliya-result'),empty=el('div','aliya-result-card aliya-empty'),notebox=el('details'),summary=el('summary'),noteForm=el('div','aliya-notes-form'),note=el('textarea'),list=el('ul'),save=el('button','reader-button'),close=el('button','reader-button'),message=el('p'),toolbar=el('div','aliya-tools'),useCurrent=el('button','reader-button'),cancel=el('button','reader-button'),mode=el('select'),modeLabel=el('label'),modeTitle=el('span'),cloudChoice=el('label','aliya-cloud'),cloud=el('input'),cloudText=el('span');
 const mobile=()=>matchMedia('(max-width: 800px)').matches;
 const header=el('header','aliya-phone-head'),headingText=el('div','aliya-heading'),subline=el('small'),notesJump=el('button','reader-button aliya-notes-jump');
 const scroll=el('div','aliya-phone-scroll'),inner=el('div','aliya-phone-inner'),card=el('section','aliya-book-context'),label=el('div','aliya-eyebrow'),name=el('h1'),position=el('p'),progress=el('progress'),tasksTitle=el('h2','aliya-task-heading');
 const backdrop=el('div','aliya-sheet-backdrop'),sheet=el('section','aliya-sheet'),sheetTitle=el('h3'),go=el('button','reader-button aliya-go'),leave=el('button','reader-button'),error=el('p','aliya-config-error');
 const grab=el('div','aliya-grab'),sheetActions=el('div','aliya-sheet-actions');sheetActions.append(go,leave);
 const mark=()=>{const i=el('span','aliya-mark');i.setAttribute('aria-hidden','true');i.innerHTML='<svg viewBox="0 0 32 32" fill="currentColor"><path d="M16 4.2c1.1 5.9 3.9 8.7 9.8 9.8-5.9 1.1-8.7 3.9-9.8 9.8-1.1-5.9-3.9-8.7-9.8-9.8 5.9-1.1 8.7-3.9 9.8-9.8Z"/><circle cx="25.7" cy="7.3" r="1.55"/><circle cx="7" cy="24.7" r="1.15"/><path d="M24.3 21.8c.45 2.05 1.45 3.05 3.5 3.5-2.05.45-3.05 1.45-3.5 3.5-.45-2.05-1.45-3.05-3.5-3.5 2.05-.45 3.05-1.45 3.5-3.5Z"/></svg>';return i;};
 const taskIcons={summary:'📝',words:'📖',translate:'🌐',test:'✅',lesson:'🎓',notesTask:'📌'};
 const notesClose=el('button','reader-button aliya-notes-close');notesClose.type='button';notesClose.addEventListener('click',hideNotes);
 function hideNotes(){notebox.hidden=mobile();notebox.open=false;pane.classList.remove('aliya-notes-open');header.inert=false;notesJump.focus({preventScroll:true});}
 close.type=go.type=leave.type=notesJump.type='button';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheetTitle.id='aliya-config-heading';sheet.setAttribute('aria-labelledby',sheetTitle.id);sheet.inert=true;backdrop.hidden=sheet.hidden=true;
 headingText.append(title,subline);header.append(close,headingText,notesJump);card.append(label,name,position,progress);scroll.append(inner);
 title.tabIndex=-1;result.setAttribute('aria-live','polite');message.setAttribute('role','status');note.maxLength=1200;note.rows=3;
 noteForm.append(note,save);notebox.append(summary,notesClose,noteForm,message,list);cloud.type='checkbox';cloudChoice.hidden=!gatewayEnabled;cloudChoice.append(cloud,cloudText);toolbar.append(cancel);inner.append(card,tasksTitle,actions,toolbar,context,result,notebox);sheet.append(grab,sheetTitle,fields,useCurrent,cloudChoice,error,sheetActions);pane.append(header,scroll,backdrop,sheet);pane.setAttribute('role','dialog');pane.setAttribute('aria-label','Алия');pane.hidden=true;host.append(pane);
 const bounds=new Map(),langs=new Map(),buttons=new Map();let seq=0,busy=false,kind='',bookKey='',translating=null,chosen=false,lastPage=0,request=null,selectedButton=null,answerBody=null;
 function hideSheet(returnFocus=true){sheet.hidden=backdrop.hidden=true;sheet.inert=true;header.inert=scroll.inert=false;if(returnFocus)selectedButton?.focus({preventScroll:true});}
 function showSheet(key,button){kind=key;selectedButton=button;error.textContent='';sheet.hidden=backdrop.hidden=false;sheet.inert=false;header.inert=scroll.inert=true;update();sheetTitle.tabIndex=-1;sheetTitle.focus({preventScroll:true});}
 leave.addEventListener('click',()=>hideSheet());backdrop.addEventListener('click',()=>hideSheet());
 go.addEventListener('click',()=>{const {doc}=readContext(),a=Number(from.value),b=Number(to.value);if(!doc||!Number.isInteger(a)||!Number.isInteger(b)||a<1||b<a||b>doc.numPages||b-a>=12){error.textContent=t('range');return;}const task=kind;hideSheet();void run(task);});
 notesJump.addEventListener('click',()=>showNotes());
 function showNotes(){notebox.open=true;notebox.hidden=false;if(mobile()){pane.classList.add('aliya-notes-open');header.inert=true;}notebox.scrollIntoView({block:'nearest'});note.focus({preventScroll:true});}
 function handleBack(){if(!sheet.hidden){hideSheet();return true;}if(!notebox.hidden&&mobile()){hideNotes();return true;}return false;}

 function inputField(k,type,options){const label=el('label'),txt=el('span'),n=el(options?'select':'input');if(!options){n.type=type;n.min='1';}else for(const [v,name] of Object.entries(languages))n.add(new Option(name,v));label.append(txt,n);fields.append(label);(options?langs:bounds).set(k,{txt,n});return n;}
 const from=inputField('from','number'),to=inputField('to','number'),source=inputField('fromLang','',true),target=inputField('toLang','',true);source.value='tg';target.value='ru';
 for(const key of ['summary','words','translate','test','lesson','notesTask']){const btn=el('button','reader-button');btn.type='button';btn.dataset.aliyaTask=key;actions.append(btn);buttons.set(key,btn);btn.addEventListener('click',()=>{if(key==='words'){resetRange();void run(key);return;}if(!mobile()&&!gatewayEnabled&&!['translate','test'].includes(key)){void run(key);return;}showSheet(key,btn);});}
 const resetRange=()=>{const page=readContext().page;from.value=to.value=String(page);lastPage=page;chosen=false;};
 from.addEventListener('input',()=>{chosen=true;});to.addEventListener('input',()=>{chosen=true;});
 modeLabel.append(modeTitle,mode);fields.append(modeLabel);for(const value of ['test','essay','argument','short'])mode.add(new Option('',value));
 useCurrent.type=cancel.type=close.type=save.type='button';useCurrent.addEventListener('click',resetRange);cancel.addEventListener('click',()=>{seq++;busy=false;request?.abort();request=null;try{translating?.destroy();}catch{}translating=null;setResult(local('Амал бекор шуд.','Действие отменено.'));update();});close.addEventListener('click',onClose);save.addEventListener('click',()=>storeNote(note.value));
 function readNotes(){if(!bookKey)return [];try{const x=JSON.parse(readerStore.get('notes',bookKey));return Array.isArray(x)?x.filter(item=>typeof item?.text==='string'&&Number.isInteger(item?.page)).slice(0,25):[];}catch{return [];}}
 function putNotes(data){try{readerStore.set('notes',bookKey,JSON.stringify(data));message.textContent='';return true;}catch{message.textContent=t('notSaved');return false;}}
 function storeNote(value,page=Number(from.value)||readContext().page){const cleaned=String(value).trim().slice(0,1200);if(!cleaned||!bookKey)return;if(putNotes([{page,text:cleaned},...readNotes()].slice(0,8))){notebox.hidden=false;notebox.open=true;note.value='';renderNotes();update();}}
 function renderNotes(){list.replaceChildren(...readNotes().map((item,i)=>{const li=el('li'),p=el('p'),r=el('button','reader-button');p.textContent=`${local('Саҳ.','Стр.')} ${item.page} · ${item.text}`;r.textContent=t('remove');r.type='button';r.addEventListener('click',()=>{if(putNotes(readNotes().filter((_,j)=>j!==i))){renderNotes();update();}});li.append(p,r);return li;}));}
 function update(){
  const {book,doc,page}=readContext();if(!chosen&&page!==lastPage&&!busy)resetRange();
  title.replaceChildren(mark(),document.createTextNode('Алия')); close.textContent='‹';close.setAttribute('aria-label',t('close'));notesJump.setAttribute('aria-label',t('notes'));notesJump.textContent=`🔖 ${readNotes().length}`;notesClose.textContent=local('Пӯшидан','Закрыть');subline.textContent=book?local(`«${book.title}» · саҳ. ${page}${doc?` аз ${doc.numPages}`:''}`,`«${book.title}» · стр. ${page}${doc?` из ${doc.numPages}`:''}`):'';
  label.textContent=local('КИТОБИ КУШОДА','ОТКРЫТАЯ КНИГА');name.textContent=book?.title??'';
  const grade=book?.rows?.[0]?.classCode?.match(/^\d{1,2}/)?.[0]??book?.title.match(/(?:—|синфи)\s*(\d{1,2})/i)?.[1];position.textContent=local(`${grade?`Синфи ${grade} · `:''}Саҳифаи ${page}${doc?` аз ${doc.numPages}`:''}`,`${grade?`${grade}-й класс · `:''}Страница ${page}${doc?` из ${doc.numPages}`:''}`);
  progress.max=doc?.numPages??1;progress.value=page;progress.setAttribute('aria-label',local('Пешрафти хондан','Прогресс чтения'));
  tasksTitle.textContent=local('Бо матни китоб кор кунед','Работайте с текстом книги');sheetTitle.textContent=kind?`${taskIcons[kind]} ${t(kind)}`:'';go.textContent=local('Оғоз','Начать');leave.textContent=local('Бекор','Отмена');summary.textContent=`${t('notes')} (${readNotes().length})`;note.placeholder=t('noteHint');note.setAttribute('aria-label',t('notes'));save.textContent=t('save');
  useCurrent.textContent=t('currentPage');useCurrent.disabled=!doc||busy;cancel.textContent=t('cancel');cancel.hidden=!busy;modeTitle.textContent=t('mode');
  for(const [idx,option] of [...mode.options].entries())option.textContent=[local('Тест','Тест'),local('Иншо','Сочинение'),local('Эссе','Эссе'),local('Иншои хурд','Мини-сочинение')][idx];
  cloudText.textContent=local('Алияи Kitobkhona: барои ҳамин амал матн ё тасвири саҳифаи интихобшударо ба сервер мефиристад.','Алия Kitobkhona: при запуске действия отправляет текст или снимок выбранной страницы на сервер.');cloud.disabled=busy;
  context.textContent='';context.hidden=true;
  for(const [k,{txt,n}] of [...bounds,...langs]){txt.textContent=t(k);if(bounds.has(k))n.max=doc?.numPages??1;else n.closest('label').hidden=kind!=='translate';}
  modeLabel.hidden=kind!=='test';for(const [k,b] of buttons){if(!b.firstChild){b.append(el('span','aliya-task-icon'),el('span','aliya-task-label'));b.firstChild.setAttribute('aria-hidden','true');b.firstChild.textContent=taskIcons[k];}b.lastChild.textContent=t(k);b.disabled=!doc||busy;b.setAttribute('aria-pressed',String(k===kind));}
 }
 function setResult(text){if(answerBody)answerBody.textContent=text;else empty.lastChild.textContent=text;}
 function open(){const {book}=readContext();if(!book)return;pane.hidden=false;scroll.scrollTop=0;hideSheet(false);notebox.hidden=mobile();notebox.open=false;pane.classList.remove('aliya-notes-open');bookKey=book.url;resetRange();note.value='';kind='';cloud.checked=false;message.textContent='';answerBody=null;empty.replaceChildren(mark(),el('span'));setResult(local('Амалро интихоб кунед. Алия бо матни ҳамин китоб кор мекунад. Барои скан шинохти матн лозим аст.','Выберите действие. Алия работает с текстом открытой книги. Для скана нужно распознавание текста.'));result.replaceChildren(empty);renderNotes();update();title.focus({preventScroll:true});}
 function dismiss(){seq++;busy=false;request?.abort();request=null;kind='';hideSheet(false);pane.hidden=true;try{translating?.destroy();}catch{}translating=null;answerBody=null;result.replaceChildren();}
 function addText(text){const p=el('p');p.textContent=text;answerBody.append(p);}
 function appendSave(answer,page){const button=el('button','reader-button');button.type='button';button.textContent=t('save');button.addEventListener('click',()=>storeNote(answer,page));answerBody.append(button);}
 function showParts(items){const list=el('ol');for(const v of items){const li=el('li');li.textContent=v;list.append(li);}answerBody.append(list);}
 function newResult(key,a,b){const box=el('article','aliya-result-card'),head=el('header'),label=el('strong'),meta=el('small');label.textContent=`${taskIcons[key]} ${t(key)}`;meta.textContent=local(`саҳ. ${a===b?a:`${a}–${b}`}`,`стр. ${a===b?a:`${a}–${b}`}`);head.append(label,meta);answerBody=el('div');box.append(head,answerBody);empty.remove();if(result.children.length>=10)result.firstElementChild.remove();result.append(box);return box;}
 async function run(key){
  const info=readContext(),a=Number(from.value),b=Number(to.value);
  if(!info.doc||!Number.isInteger(a)||!Number.isInteger(b)||a<1||b<a||b>info.doc.numPages||b-a>=12){setResult(t('range'));return;}
  const current=++seq;busy=true;kind=key;update();const box=newResult(key,a,b);setResult(t('working'));box.scrollIntoView({block:'nearest'});
  try{
   const useCloud=gatewayEnabled&&cloud.checked;const controller=useCloud?new AbortController():null;request=controller;
   const chunks=[];for(let i=a;i<=b;i++){if(current!==seq)return;chunks.push(await info.textFor(i));}
   if(current!==seq)return;let passage=chunks.join('\n').trim();
   if(useCloud&&chunks.some(x=>x.trim().length<12)){
    if(a!==b){setResult(local('Барои OCR як саҳифаро интихоб кунед.','Для распознавания скана выберите одну страницу.'));return;}
    const image=await info.pageImage(a);if(current!==seq)return;
    passage=await runGateway({task:'ocr',image},controller.signal);if(current!==seq)return;
   }
   if(passage.length<12){setResult(t('noText'));return;}
   if(useCloud){
    const answer=await runGateway({task:key,text:passage.slice(0,26000),language:key==='translate'?target.value:document.documentElement.lang,mode:mode.value},controller.signal);
    if(current!==seq)return;answerBody.replaceChildren();for(const part of answer.split(/\n{1,}/).filter(Boolean))addText(part);
    if(key==='notesTask')storeNote(answer);else appendSave(answer,a);
    return;
   }
   const terms=termsFromText(passage,8),short=summarizeReaderText(passage),examples=examplesForTerms(passage,terms);answerBody.replaceChildren();
   if(key==='summary')addText(short);
   if(key==='words'){if(!terms.length)addText(t('noWords'));else showParts(examples.map(x=>x.quote?`${x.word} — «${x.quote}»`:x.word));}
   if(key==='test'){
    const facts=examples.filter(x=>x.quote).slice(0,5);
    if(mode.value==='test'&&facts.length){showParts(facts.map((x,i)=>{const at=x.quote.toLocaleLowerCase('ru').indexOf(x.word);return at<0?`${i+1}. ${x.quote}`:x.quote.slice(0,at)+'___'+x.quote.slice(at+x.word.length);}));const answers=el('details'),caption=el('summary');caption.textContent=local('Ҷавобҳо','Ответы');answers.append(caption,document.createTextNode(facts.map((x,i)=>`${i+1}. ${x.word}`).join(' · ')));answerBody.append(answers);}
    else showParts([local('Фикри асосии матнро бо суханони худ баён кунед.','Сформулируйте главную мысль своими словами.'),local('Аз ин саҳифа ду далел ё мисол биёред.','Приведите два аргумента или примера с выбранной страницы.'),local('Хулосаро бо матни китоб муқоиса кунед.','Сверьте вывод с текстом книги.')]);
   }
   if(key==='notesTask'){addText(short);storeNote(short);addText(local('Хулоса ба ёддоштҳои китоб илова шуд.','Выжимка добавлена в заметки книги.'));return;}
   if(key==='lesson'){showParts([local('Оғоз: истилоҳҳои асосиро баррасӣ кунед.','Начало: обсудите ключевые термины.')+` ${terms.slice(0,4).map(x=>x.word).join(', ')}`,local('Шарҳ: порчаи зеринро хонед ва ғояи асосиро пайдо кунед.','Объяснение: прочитайте фрагмент и выделите главную мысль.')+' '+short,local('Машқ: аз хонандагон мисол ва хулосаи кӯтоҳ пурсед.','Практика: попросите привести пример и сформулировать вывод.')]);}
   if(key==='translate'){
    if(source.value===target.value){addText(passage.slice(0,5500));return;}
    const params={sourceLanguage:source.value,targetLanguage:target.value};
    if(!globalThis.Translator||await globalThis.Translator.availability(params)!=='available'){if(current===seq)setResult(t('translationUnavailable'));return;}
    if(current!==seq)return;const translator=await globalThis.Translator.create(params);if(current!==seq){translator.destroy();return;}translating=translator;
    try{const translated=await translator.translate(passage.slice(0,5500));if(current===seq)addText(translated);}finally{if(translating===translator){translator.destroy();translating=null;}}
   }
   const answer=answerBody.textContent.trim();if(answer)appendSave(answer,a);
  }catch{if(current===seq)setResult(request?local('Сервери Алия посух надод. Танзимотро санҷед ё ҳолати маҳаллиро истифода баред.','Сервер Алия не ответил. Проверьте настройки или используйте локальный режим.'):t('failed'));}finally{if(current===seq){busy=false;request=null;update();}}
 }
 return {open,dismiss,update,showNotes,handleBack,node:pane,notesCount:()=>readNotes().length};
}
