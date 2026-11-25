import {addWorkspaceShortcut} from '../../shared/workspace-view.mjs';
import {tabStorage,cabinetFormAction} from '../../shared/cabinet-runtime.mjs';
import {newLoans,updateLoans,readLoans,loanRows} from '../../shared/loans.mjs';
const labels={title:['Додан ва баргардонидани китоб','Выдача и возврат книг'],scope:['Танҳо нусхаҳои коғазӣ ва рамзҳои сохта. Маълумот дар ҳамин равзана мемонад.','Только бумажные экземпляры и вымышленные коды. Записи остаются в текущей вкладке.'], inventory:['Инвентар','Инвентарный номер'],name:['Номи китоб','Название книги'],reader:['Рамзи шартии хонанда','Вымышленный код читателя'],issued:['Санаи додан','Дата выдачи'],due:['Муҳлати бозгашт','Срок возврата'],add:['Иловаи нусха','Добавить экземпляр'],lend:['Додан','Выдать'],giveBack:['Баргардондан','Вернуть'],available:['Дар фонд','В наличии'],out:['Дода шудааст','Выдано'],overdue:['Муҳлат гузаштааст','Просрочено'],empty:['Нусха нест.','Экземпляров нет.'],total:['Ҳамагӣ','Всего'],history:['Таърихи додан ва бозгашт','История выдачи и возврата'],returned:['Баргардонда шуд','Возвращён'],done:['Сабт шуд.','Записано.'],badCode:['Рамзи нусхаро санҷед (A–Z, 0–9 ва тире).','Проверьте код экземпляра (A–Z, 0–9 и дефис).'],badTitle:['Номи китобро ворид кунед.','Введите название книги.'],duplicate:['Ин рамз аллакай сабт шудааст.','Такой номер уже зарегистрирован.'],limit:['Миқдори ниҳоии сабтҳои ин равзана пур шуд.','Достигнут лимит записей этой вкладки.'],alreadyOut:['Ин нусха аллакай дода шудааст.','Этот экземпляр уже выдан.'],alreadyIn:['Ин нусха ҳоло дода нашудааст.','Этот экземпляр сейчас не выдан.'],badDate:['Санаи бозгашт пеш аз санаи додан аст.','Возврат не может быть раньше выдачи.'],badLoan:['Рамзи хонанда ва санаҳоро санҷед.','Проверьте код читателя и даты.']};
export function setupLibraryLoans(school){
 const t=k=>labels[k][document.documentElement.lang==='ru'?1:0],node=(tag,cls)=>{const e=document.createElement(tag);if(cls)e.className=cls;return e;};
 const section=node('section','section no-print');section.id='libraryLoans';document.getElementById('workspaceDocs').after(section);
 const texts=new Map(),text=(tag,k)=>{const e=node(tag);texts.set(e,k);return e;};
 section.append(text('h2','title'),text('p','scope'));
 const addForm=node('form','school-fields'),lendForm=node('form','school-fields');addForm.autocomplete=lendForm.autocomplete='off';
 function field(form,k,type='text',id=k){const l=node('label','field'),e=node(type==='select'?'select':'input');e.dataset.loanField=id;l.append(text('span',k),e);form.append(l);e.required=true;if(type!=='select'){e.type=type;if(type==='text')e.maxLength=k==='name'?100:24;}return e;}
 function submit(form,k){const b=text('button',k);b.className='button';b.type='submit';form.append(b);return b;}
 const code=field(addForm,'inventory'),title=field(addForm,'name'),add=submit(addForm,'add');
 const target=field(lendForm,'inventory','select','target'),reader=field(lendForm,'reader'),issued=field(lendForm,'issued','date'),due=field(lendForm,'due','date'),lend=submit(lendForm,'lend');
 const messages=node('p','small'),list=node('ul','teaching-list'),log=node('details'),summary=text('summary','history'),logRows=node('ul','teaching-list');const totals=node('p','tag');messages.setAttribute('role','status');log.append(summary,logRows);section.append(totals,addForm,lendForm,messages,list,log);
 let state=newLoans(),note='';
 const today=()=>new Date().toLocaleDateString('sv-SE');
 const key=()=>school()?.id?`smartmaktab.demo.paper-loans.v1.${school().id}`:null;
 function load(){state=newLoans();try{if(key())state=readLoans(JSON.parse(tabStorage.getItem(key())));}catch{}note='';addForm.reset();lendForm.reset();issued.value=today();render();}
 function change(action){if(!key())return false;const {next,error}=updateLoans(state,action);if(error){note=error;render();return false;}state=next;tabStorage.setItem(key(),JSON.stringify(state));note='done';render();return true;}
 function render(){
  section.hidden=!school();for(const [el,k] of texts)el.textContent=t(k);messages.textContent=note?t(note):'';
  const rows=loanRows(state,today()),previous=target.value,available=rows.filter(x=>!x.loan);target.replaceChildren(...available.map(r=>new Option(`${r.code} · ${r.title}`,r.code)));if(available.some(x=>x.code===previous))target.value=previous;
  lend.disabled=available.length===0;totals.textContent=`${t('total')}: ${rows.length} · ${t('available')}: ${available.length} · ${t('out')}: ${rows.length-available.length} · ${t('overdue')}: ${rows.filter(r=>r.status==='overdue').length}`;
  list.replaceChildren(...rows.map(row=>{const li=node('li'),title=node('strong'),stateText=node('span');title.textContent=`${row.code} · ${row.title}`;stateText.textContent=t(row.status)+(row.loan?` · ${row.loan.reader} · ${row.loan.due}`:'');li.append(title,stateText);
   if(row.loan){const b=node('button','button alt');b.type='button';b.textContent=t('giveBack');b.addEventListener('click',()=>change({kind:'return',code:row.code,today:today()}));li.append(b);}return li;}));
  if(!rows.length){const li=node('li');li.textContent=t('empty');list.append(li);}
  logRows.replaceChildren(...state.history.slice().reverse().map(row=>{const li=node('li');li.textContent=`${row.code} · ${row.reader} · ${row.issued} → ${row.due}${row.returned?` · ${t('returned')}: ${row.returned}`:''}`;return li;}));log.hidden=!state.history.length;
 }
 cabinetFormAction(addForm,add,()=>{if(change({kind:'add',code:code.value,title:title.value})){addForm.reset();code.focus();}});
 cabinetFormAction(lendForm,lend,()=>{if(change({kind:'lend',code:target.value,reader:reader.value,issued:issued.value,due:due.value})){reader.value='';due.value='';}});
 document.addEventListener('cabinet:school',load);document.addEventListener('cabinet:language',render);load();addWorkspaceShortcut(section.id,'Выдача и возврат книг','Додан ва баргардонидани китоб','▥');
}
