const brandSplash=(()=>{
 const byId=id=>document.getElementById(id);
 const dialog=byId('brandSplash'),word=byId('splashLetters'),caret=byId('splashCaret'),skip=byId('splashSkip');
 const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 const name='SmartMaktab';
 let active=null;
 skip.addEventListener('click',()=>active?.finish());
 dialog.addEventListener('cancel',event=>{event.preventDefault();active?.finish();});
 motion.addEventListener('change',event=>{if(event.matches)active?.finish();});
 function play(scene,{school='',role='',lang=document.documentElement.lang}={}){
  if(motion.matches||typeof dialog.showModal!=='function')return Promise.resolve();
  if(active)return active.promise;
  const toSchool=scene==='school',tg=lang==='tg';
  const timings=toSchool?{lead:100,step:76,hold:1360}:{lead:165,step:87,hold:2110};
  dialog.dataset.scene=scene;dialog.classList.remove('leaving');dialog.style.setProperty('--splash-time',`${timings.hold+150}ms`);
  byId('splashKind').textContent=toSchool?(tg?'Воридшавӣ ба утоқи корӣ':'Вход в рабочий кабинет'):(tg?'Барномаи идоракунии мактаб':'Программа для работы школы');
  byId('splashCaption').textContent=toSchool?school:(tg?'Ҷойи кории шумо дар як ҷо':'Ваше рабочее место в школе');
  const roleLine=byId('splashRole');roleLine.hidden=!toSchool||!role;roleLine.textContent=toSchool?role:'';
  skip.textContent=tg?'Гузарондан':'Пропустить';
  word.replaceChildren();caret.classList.remove('done');
  try{dialog.showModal();skip.focus({preventScroll:true});}catch{return Promise.resolve();}
  const timers=[];let resolve;
  const promise=new Promise(done=>{resolve=done;});
  let finished=false;
  const wait=(ms,callback)=>timers.push(setTimeout(callback,ms));
  function finish(){
   if(finished)return;finished=true;
   for(const timer of timers)clearTimeout(timer);
   try{if(dialog.open)dialog.close();}finally{dialog.classList.remove('leaving');active=null;resolve();}
  }
  active={finish,promise};
  for(const [index,character] of Array.from(name).entries())wait(timings.lead+index*timings.step,()=>{
   const letter=document.createElement('span');letter.className=index>=5?'splash-letter accent':'splash-letter';letter.textContent=character;word.append(letter);
  });
  wait(timings.lead+name.length*timings.step+90,()=>caret.classList.add('done'));
  wait(timings.hold,()=>{dialog.classList.add('leaving');wait(220,finish);});
  return promise;
 }
 return {play};
})();
