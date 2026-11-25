export const classGrades=Object.freeze(Array.from({length:11},(_,i)=>String(i+1)));
export const classLetters=Object.freeze('А Б В Г Ғ Д Е Ё Ж З И Ӣ Й К Қ Л М Н О П Р С Т У Ӯ Ф Х Ҳ Ч Ҷ Ш Щ Ъ Ы Ь Э Ю Я'.split(' '));
export const classCodes=Object.freeze(classGrades.flatMap(grade=>[grade,...classLetters.map(letter=>grade+letter)]));
const knownClasses=new Set(classCodes);
export const gradeOfClass=code=>knownClasses.has(code)?code.match(/^\d+/)[0]:null;
export const normalizeClasses=values=>Array.isArray(values)?[...new Set(values)].filter(code=>knownClasses.has(code)).sort((a,b)=>classCodes.indexOf(a)-classCodes.indexOf(b)):[];
export function mountClassPicker(root,{multiple=false,available=null,value=[],onChange=()=>{}}={}){
 const grade=document.createElement('select'),letter=document.createElement('select');
 const gradeLabel=document.createElement('label'),letterLabel=document.createElement('label');
 const gradeText=document.createElement('span'),letterText=document.createElement('span'),controls=document.createElement('div');
 const add=document.createElement('button'),chips=document.createElement('div');
 grade.dataset.classGrade='';letter.dataset.classLetter='';add.dataset.addClass='';add.type='button';add.className='button alt';
 gradeLabel.className=letterLabel.className='field';controls.className='class-selector-controls';chips.className='class-tags';
 gradeLabel.append(gradeText,grade);letterLabel.append(letterText,letter);controls.append(gradeLabel,letterLabel);
 if(multiple)controls.append(add);root.classList.add('class-picker');root.replaceChildren(controls);if(multiple)root.append(chips);
 let options=available===null?classCodes:normalizeClasses(available),selected=[];
 const current=()=>{const code=grade.value+letter.value;return options.includes(code)?code:'';};
 const tg=()=>document.documentElement.lang==='tg';
 const read=()=>multiple?selected.slice():current()?[current()]:[];
 const rebuild=(select,values,placeholder,keep)=>{
  select.replaceChildren(new Option(placeholder,''),...values.map(value=>new Option(value,value)));
  select.value=values.includes(keep)?keep:'';
 };
 function refresh(){
  const gradeValue=grade.value,letterValue=letter.value;
  gradeText.textContent=tg()?'Рақами синф':'Номер класса';letterText.textContent=tg()?'Ҳарфи синф':'Буква класса';
  add.textContent=tg()?'Иловаи синф':'Добавить класс';
  rebuild(grade,classGrades.filter(n=>options.some(code=>gradeOfClass(code)===n)),tg()?'Рақамро интихоб кунед':'Выберите номер',gradeValue);
  const bare=options.includes(grade.value),letters=classLetters.filter(l=>grade.value&&options.includes(grade.value+l));
  rebuild(letter,letters,bare?(tg()?'Бе ҳарф':'Без буквы'):(tg()?'Ҳарфро интихоб кунед':'Выберите букву'),letterValue);
  letter.disabled=!grade.value||!letters.length;add.disabled=!current()||selected.includes(current());
  chips.replaceChildren(...selected.map(code=>{
   const remove=document.createElement('button');remove.type='button';remove.className='button alt';remove.textContent=`${code} ×`;
   remove.setAttribute('aria-label',`${tg()?'Хориҷ кунед':'Убрать класс'} ${code}`);
   remove.addEventListener('click',()=>{selected=selected.filter(item=>item!==code);refresh();onChange(read());grade.focus();});return remove;
  }));
 }
 grade.addEventListener('change',()=>{letter.value='';refresh();if(!multiple)onChange(read());});
 letter.addEventListener('change',()=>{refresh();if(!multiple)onChange(read());});
 add.addEventListener('click',()=>{
  const code=current();if(!code||selected.includes(code))return;
  selected=normalizeClasses([...selected,code]);refresh();onChange(read());grade.focus();
 });
 function set(codes,allowed=options){
  options=allowed===null?classCodes:normalizeClasses(allowed);
  selected=normalizeClasses(codes).filter(code=>options.includes(code));
  if(!multiple){
   const code=selected[0]??'',n=gradeOfClass(code)??'',l=code.slice(n.length);
   grade.replaceChildren(new Option(n,n));letter.replaceChildren(new Option(l,l));
  }
  refresh();
 }
 set(value);return {read,set,refresh,focus:()=>grade.focus()};
}
