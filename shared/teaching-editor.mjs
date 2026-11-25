import {normalizeClasses,mountClassPicker} from './class-picker.mjs';
import {subjectLabels,subjectName} from './subjects.mjs';
export function normalizeTeaching(rows){
 const out=[],keys=new Set();
 if(!Array.isArray(rows))return out;
 for(const row of rows.slice(0,120)){
  if(!row||!normalizeClasses([row.classCode]).length||typeof row.subject!=='string'||!Object.hasOwn(subjectLabels,row.subject))continue;
  const key=`${row.classCode}:${row.subject}`;if(keys.has(key))continue;keys.add(key);
  out.push({classCode:row.classCode,subject:row.subject});
 }
 return out;
}
export function mountTeachingEditor(host,{value=[],legacy=[],onChange=()=>{}}={}){
 const words=(tg,ru)=>document.documentElement.lang==='ru'?ru:tg;
 const element=(tag,cls='')=>{const n=document.createElement(tag);n.className=cls;return n;};
 const controls=element('div','teaching-entry'),classes=element('div'),label=element('label','field'),labelText=element('span'),subject=element('select'),add=element('button','button alt'),list=element('ul','teaching-list'),hint=element('p','small');
 subject.dataset.teachingSubject='';add.type='button';add.dataset.addClass='';label.append(labelText,subject);controls.append(classes,label,add);host.replaceChildren(controls,hint,list);
 let rows=normalizeTeaching(value),pending=normalizeClasses(legacy),edit=-1;
 const picker=mountClassPicker(classes,{onChange:refreshButton});
 function read(){return rows.map(row=>({...row}));}
 function save(){onChange(read());refresh();}
 function refreshButton(){const c=picker.read()[0];subject.disabled=!c;add.disabled=!c||!subject.value||rows.some((r,i)=>i!==edit&&r.classCode===c&&r.subject===subject.value)||(edit===-1&&rows.length>=120);}
 function refresh(){
  const chosen=subject.value;labelText.textContent=words('Фан','Предмет');
  subject.replaceChildren(new Option(words('Фанро интихоб кунед','Выберите предмет'),''),...Object.keys(subjectLabels).sort((a,b)=>(a==='other')-(b==='other')||subjectName(a).localeCompare(subjectName(b),'ru')).map(id=>new Option(subjectName(id),id)));subject.value=chosen;
  add.textContent=edit>=0?words('Сабти тағйир','Сохранить изменение'):words('Илова кардани синф ва фан','Добавить класс и предмет');
  const missing=pending.filter(code=>!rows.some(r=>r.classCode===code));
  hint.textContent=missing.length?`${words('Барои синфҳои қаблӣ фан интихоб кунед:','Укажите предмет для прежних классов:')} ${missing.join(', ')}`:'';
  list.replaceChildren(...rows.map((r,i)=>{
   const li=element('li'),description=element('b'),change=element('button','button alt'),remove=element('button','button alt');
   description.textContent=`${r.classCode} · ${subjectName(r.subject)}`;change.type=remove.type='button';
   change.textContent=words('Иваз кардан','Изменить');remove.textContent=words('Хориҷ кардан','Убрать');
   change.addEventListener('click',()=>{edit=i;picker.set([r.classCode]);subject.value=r.subject;refresh();picker.focus();});
   remove.addEventListener('click',()=>{rows.splice(i,1);edit=-1;picker.set([]);subject.value='';save();picker.focus();});li.append(description,change,remove);return li;
  }));picker.refresh();refreshButton();
 }
 subject.addEventListener('change',refreshButton);
 add.addEventListener('click',()=>{
  refreshButton();if(add.disabled)return;const row={classCode:picker.read()[0],subject:subject.value};
  if(edit>=0)rows[edit]=row;else rows.push(row);
  edit=-1;picker.set([]);subject.value='';save();picker.focus();
 });
 refresh();return {read,refresh,focus:picker.focus,set(next,old=[]){rows=normalizeTeaching(next);pending=normalizeClasses(old);edit=-1;picker.set([]);subject.value='';refresh();},missing:()=>pending.filter(code=>!rows.some(r=>r.classCode===code))};
}
