const el=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};
export function mountWindowsContent(article,views){
 const api=globalThis.SmartMaktabWindows;if(!api?.contentStatus)return;
 const panel=el('section');panel.id='windowsContent';panel.className='section sm-screen no-print';article.append(panel);
 const heading=el('h2'),actions=el('div'),usb=el('button'),online=el('button'),status=el('p'),items=el('div');
 actions.className='control';status.setAttribute('role','status');for(const b of [usb,online]){b.type='button';b.className='button alt';actions.append(b);}panel.append(heading,actions,status,items);
 views.shortcut(panel.id,'Обновление материалов','Навсозии мавод','↻');
 let state={},code='',busy=false;const icons={folder:'▤',document:'▧',book:'▥',info:'ⓘ'};
 function render(){const lang=document.documentElement.lang==='tg'?'tg':'ru',t=(tg,ru)=>lang==='tg'?tg:ru;
  heading.textContent=t('Навсозии мавод','Обновление материалов');usb.textContent=t('Ворид кардани файл аз USB','Импорт файла с USB');online.textContent=t('Навсозӣ аз GitHub','Обновить из GitHub');usb.disabled=busy||state.status!=='ready';online.disabled=usb.disabled;online.hidden=!state.online;
  const texts={'no-key':t('Калиди санҷиши баста дар ин насб танзим нашудааст.','В этой сборке не настроен ключ проверки пакетов.'),corrupt:t('Бастаи маҳаллӣ тасдиқ нашуд. Ба дастгирӣ муроҷиат кунед.','Локальный пакет не прошёл проверку. Обратитесь в поддержку.'),'not-newer':t('Нусхаи навтар нест.','Пакет не новее установленного.'),signature:t('Имзои баста нодуруст аст.','Недействительная подпись пакета.'),error:t('Баста ворид нашуд.','Не удалось импортировать пакет.'),network:t('Боргирӣ дастрас нест.','Не удалось скачать пакет.'),applied:t('Баста ворид шуд.','Пакет применён.')};
  status.textContent=busy?t('Интизор шавед…','Подождите…'):[texts[code]??(['schema','size','format','denied'].includes(code)?texts.error:''),state.payload?t(`Нусхаи мавод: ${state.payload.sequence}`,`Версия материалов: ${state.payload.sequence}`):state.status==='ready'?t('Ҳоло баста ворид нашудааст.','Пакет ещё не установлен.'):texts[state.status]??''].filter(Boolean).join(' · ');
  const cats=state.payload?.cabinets?.[article.dataset.cabinetId]??[];items.replaceChildren();
  for(const cat of cats){const d=el('details'),s=el('summary',`${icons[cat.icon]} ${cat.title[lang]}`);d.append(s);for(const page of cat.sections){const sub=el('section'),p=el('p',page.text[lang]);p.style.whiteSpace='pre-wrap';sub.append(el('h4',page.title[lang]),p);d.append(sub);}items.append(d);}
  if(state.payload&&!cats.length)items.append(el('p',t('Дар баста барои ин вазифа мавод нест.','В пакете нет материалов для этой должности.')));
 }
 async function apply(handler){if(busy)return;busy=true;render();try{const r=await handler();code=r.status==='cancel'?'':r.status;if(r.status==='corrupt')state={status:'corrupt'};else if(r.payload)state={...state,payload:r.payload};}catch{code='error';}finally{busy=false;render();}}
 usb.addEventListener('click',()=>void apply(api.importContent));online.addEventListener('click',()=>void apply(api.fetchContent));
 document.addEventListener('cabinet:language',render);render();void api.contentStatus().then(s=>{state=s;render();},()=>{code='error';render();});
}
