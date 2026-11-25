import {classCodes,normalizeClasses} from '../../shared/class-picker.mjs';
import {normalizeTeaching} from '../../shared/teaching-editor.mjs';
const allowedLanguages=new Set(['tg','ru']);
const parseDate=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'2000-01-01'||value>'2100-12-31') return null;
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value ? value:null;
};
function text(value,max){
  const raw=typeof value==='string'?value.trim():'';
  return raw && [...raw].length<=max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(raw)?raw:null;
}
export function validateTeacherProfile(input){
  if(!allowedLanguages.has(input?.language))return null;
  const teaching=normalizeTeaching(input.teaching);
  if(teaching.length)return {teaching,language:input.language};
  if(!Array.isArray(input.classes)||!input.classes.length||input.classes.some(code=>!classCodes.includes(code)))return null;
  // Legacy entries preserve classes for review, but never imply a subject.
  return {classes:normalizeClasses(input.classes),language:input.language};
}
export function makeLessonSnapshot({school,profile,classCode,subject,date,topic,goal}){
  const validated=validateTeacherProfile(profile);
  const parsed=parseDate(date), title=text(topic,120), objective=text(goal,300);
  if(!school?.name||!validated?.teaching?.some(row=>row.classCode===classCode&&row.subject===subject)||!parsed||!title||!objective)return null;
  return Object.freeze({school:school.name,subject,language:validated.language,classCode,date:parsed,topic:title,goal:objective});
}
