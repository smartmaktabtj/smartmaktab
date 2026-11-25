import {subjectName} from './subjects.mjs';
const general={tg:['Фаъолсозӣ: дониши пешинаи хонандагонро бо саволи кӯтоҳ санҷед.','Фаҳмондадиҳӣ: мафҳуми асосиро бо як мисол нишон диҳед.','Машқ: як вазифаи мустақилона ва меъёри санҷишро муайян кунед.','Ҷамъбаст: аз хонандагон як хулоса ё мисол пурсед.'],ru:['Вход: проверьте исходные знания коротким вопросом.','Объяснение: покажите ключевое понятие на одном примере.','Практика: задайте самостоятельную работу и критерий проверки.','Итог: попросите учащихся сформулировать вывод или привести пример.']};
const focused={informatics:['Дар машқ алгоритм ё натиҷаро қадам ба қадам санҷед.','В практике добавьте пошаговую проверку алгоритма или результата.'],mathematics:['Як мисоли ҳалшуда ва як мисоли монанд барои кори мустақилона диҳед.','Подготовьте решённый образец и аналогичную задачу для самостоятельной работы.'],literature:['Хулосаро бо далел аз матн тасдиқ кунед.','Попросите обосновать вывод примером из текста.'],english:['Машқи кӯтоҳ бо гуфтор ё шунидан илова кунед.','Добавьте короткое задание на говорение или аудирование.']};
export function setupLessonAssistant(form,read){
 const control=document.createElement('button'),out=document.createElement('section'),title=document.createElement('h3'),note=document.createElement('p'),list=document.createElement('ol');
 control.className='button alt no-print';control.type='button';control.id='lessonAssistant';control.setAttribute('aria-controls','lessonAssistantHints');
 out.id='lessonAssistantHints';out.className='lesson-assistant no-print';out.hidden=true;title.tabIndex=-1;out.append(title,note,list);form.after(control,out);
 function refresh(){
  const ru=document.documentElement.lang==='ru';control.textContent=ru?'Помощь с планом урока':'Кумак бо нақшаи дарс';control.setAttribute('aria-expanded',String(!out.hidden));
  if(out.hidden)return;
  const {classCode,subject}=read();title.textContent=`${classCode||''} ${subjectName(subject)}`.trim()||(ru?'Структура урока':'Сохтори дарс');
  note.textContent=ru?'Локальные подсказки. Ничего не отправляется в интернет.':'Маслиҳатҳои маҳаллӣ. Маълумот ба интернет намеравад.';
  const steps=[...general[ru?'ru':'tg']];if(focused[subject])steps.splice(3,0,focused[subject][ru?1:0]);
  list.replaceChildren(...steps.map(value=>{const li=document.createElement('li');li.textContent=value;return li;}));
 }
 control.addEventListener('click',()=>{out.hidden=!out.hidden;refresh();if(!out.hidden)title.focus();});
 form.addEventListener('change',refresh);document.addEventListener('cabinet:language',refresh);document.addEventListener('cabinet:school',()=>{out.hidden=true;refresh();});refresh();return refresh;
}
