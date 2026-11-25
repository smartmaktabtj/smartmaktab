const types=new Set(['school','gymnasium','lyceum']),shifts=new Set(['one','two']);
const directions=new Set(['learning','upbringing','facilities']),owners=new Set(['director','academic','educator','caretaker']);
export const maxTasks=16;
const clean=(value,max)=>{
  const str=typeof value==='string'?value.trim():'';
  return str&&[...str].length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(str)?str:null;
};
export const validYear=year=>typeof year==='string'&&/^\d{4}$/.test(year)&&year>='2000'&&year<='2099';
export function directorProfile(value){
  return types.has(value?.type)&&shifts.has(value?.shifts)?{type:value.type,shifts:value.shifts}:null;
}
export function taskInYear(due,year){
  return validYear(year)&&typeof due==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(due)&&due>=`${year}-09`&&due<=`${Number(year)+1}-08`;
}
export function directorTask(value,year){
  const title=clean(value?.title,140);
  return title&&directions.has(value.direction)&&owners.has(value.owner)&&taskInYear(value.due,year)
    ?{title,direction:value.direction,owner:value.owner,due:value.due}:null;
}
export function directorPlan({school,profile,year,goal,tasks}){
  const p=directorProfile(profile),objective=clean(goal,220);
  if(!school?.name||!school.id||!p||!validYear(year)||!objective||!Array.isArray(tasks)||!tasks.length||tasks.length>maxTasks) return null;
  const verified=tasks.map(task=>directorTask(task,year));
  if(verified.some(task=>!task)) return null;
  return Object.freeze({school:school.name,code:school.id,year,goal:objective,type:p.type,shifts:p.shifts,
    tasks:Object.freeze(verified.sort((a,b)=>a.due.localeCompare(b.due)).map(Object.freeze))});
}

const languageCodes=['tg','ru','en','fa','de','fr','uz','ar','tr','zh','other'];
const diplomaCodes=new Set(['vocational','bachelor','specialist','master','other']);
const categoryCodes=new Set(['none','second','first','highest','other']);
export function validatePersonnel(value,now=new Date().getFullYear()){
  if(!value)return {error:'fields'};
  const first=clean(value.first,60),last=clean(value.last,60),middle=clean(value.middle,60);
  const university=clean(value.university,120),specialty=clean(value.specialty,100);
  if(!first||!last||!university||!specialty||!diplomaCodes.has(value.diploma)||!categoryCodes.has(value.category)||(value.middle&&!middle))return {error:'fields'};
  const validInt=(text,min,max,pattern)=>typeof text==='string'&&pattern.test(text)&&Number(text)>=min&&Number(text)<=max;
  const birth=value.birth,year=/^\d{4}$/,seniority=/^\d{1,2}$/;
  if(!validInt(birth,1900,now,year))return {error:'birth'};
  if(!validInt(value.educationYears,0,Math.min(80,now-Number(birth)),seniority)||
     !validInt(value.leadYears,0,Number(value.educationYears),seniority))return {error:'experience'};
  const dates=['graduation','attestation','appointed'];
  if(dates.some(field=>value[field]&&!validInt(value[field],Number(birth)+1,now,year)))return {error:'dates'};
  if(!Array.isArray(value.languages)||value.languages.some(code=>!languageCodes.includes(code)))return {error:'fields'};
  const languages=languageCodes.filter(code=>value.languages.includes(code));
  const other=languages.includes('other')?clean(value.otherLanguage,70):null;
  if(languages.includes('other')&&!other)return {error:'language'};
  if(['phone','email','address','awardNotes'].some(key=>value[key]!=null&&typeof value[key]!=='string'))return {error:'contacts'};
  const rawPhone=value.phone?.trim()??'',phone=rawPhone?clean(rawPhone,30):'',email=value.email?.trim()??'';
  const address=value.address?.trim()??'',awardNotes=value.awardNotes?.trim()??'';
  if((rawPhone&&(!phone||!/^\+?[0-9(). -]+$/.test(phone)||phone.replace(/\D/g,'').length<5)) ||
     (email&&(!clean(email,100)||!/^\S+@[^@\s]+\.[^@\s]+$/.test(email)))||
     (address&&!clean(address,160)))return {error:'contacts'};
  const gender=value.gender??'';
  const awardCodes=['excellence','certificate','monetary','other'];
  const rawAwards=value.achievements??[];
  if(!['','female','male'].includes(gender)||!Array.isArray(rawAwards)||rawAwards.some(code=>!awardCodes.includes(code))||(awardNotes&&!clean(awardNotes,180)))return {error:'fields'};
  return {data:{gender,phone,email,address,awardNotes,achievements:awardCodes.filter(code=>rawAwards.includes(code)),first,last,middle:middle??'',birth,educationYears:value.educationYears,leadYears:value.leadYears,languages,otherLanguage:other??'',university,specialty,
    diploma:value.diploma,category:value.category,...Object.fromEntries(dates.map(field=>[field,value[field]??'']))}};
}

const dateText = value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'2199-12-31')return null;
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:null;
};
export const courseIntervalYears=3;
export function validateCourse(value){
  const title=clean(value?.title,120),provider=clean(value?.provider,120);
  const start=dateText(value?.start),end=dateText(value?.end);
  const state=value?.state;
  return title&&start&&end&&start<=end&&(!value.provider||provider)&&['completed','planned'].includes(state)?{title,provider:provider??'',start,end,state}:null;
}
export function courseSchedule(courses,today){
  if(!dateText(today)||!Array.isArray(courses))return null;
  const last=courses.map(validateCourse).filter(course=>course&&course.state==='completed'&&course.end<=today).sort((a,b)=>b.end.localeCompare(a.end))[0];
  if(!last)return null;
  const [year,month,day]=last.end.split('-').map(Number),target=year+courseIntervalYears;
  const lastDay=new Date(Date.UTC(target,month,0)).getUTCDate();
  const due=`${target}-${String(month).padStart(2,'0')}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
  return {due,status:due<today?'overdue':due===today?'due':'upcoming'};
}
