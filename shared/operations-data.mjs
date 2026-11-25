import {classCodes} from './class-picker.mjs';
import {schoolProgress} from './school-forms-data.mjs';
export const weekDays=['mon','tue','wed','thu','fri','sat','sun'];
export const matrixPeriods=['q1','q2','h1','q3','q4','h2','year'];
const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const norm=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
export function checkWeekly(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>60)return {error:'invalid'};
 const copy=rows.map((row,index)=>({...row,index}));
 if(copy.some(row=>!classCodes.includes(row.classCode)||!weekDays.includes(row.day)||!time.test(row.start)||!time.test(row.end)||row.end<=row.start||![row.subject,row.teacher,row.room].every(v=>typeof v==='string'&&v.trim()&&v.length<=100)))return {error:'invalid'};
 const sorted=copy.sort((a,b)=>weekDays.indexOf(a.day)-weekDays.indexOf(b.day)||a.start.localeCompare(b.start)||a.index-b.index),conflicts=[];
 for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){
  const a=sorted[i],b=sorted[j];if(a.day!==b.day||b.start>=a.end)break;
  const fields=['classCode','teacher','room'].filter(key=>norm(a[key])===norm(b[key]));
  if(fields.length)conflicts.push({first:a.index+1,second:b.index+1,fields});
 }
 return {sorted,conflicts};
}
export function checkMatrix(rows){
 const result={};
 for(const period of matrixPeriods){
  const cell=rows[period];if(!Array.isArray(cell)||cell.every(value=>value==='')){result[period]=null;continue;}
  const checked=schoolProgress(cell,['','','','']);if(!checked)return {error:period};result[period]=checked;
 }
 return {result};
}
