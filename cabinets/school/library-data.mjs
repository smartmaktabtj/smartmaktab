const zones=new Set(['main','reading']);
const funds=['textbooks','fiction','reference'];
const audiences=new Set(['primary','secondary','staff','all']);
export const maxLibraryActivities=12;
export function validateLibraryProfile(value){
  if(!zones.has(value?.zone)||!Array.isArray(value.funds)||!value.funds.length||value.funds.some(fund=>!funds.includes(fund))) return null;
  return {zone:value.zone,funds:funds.filter(fund=>value.funds.includes(fund))};
}
export function validateLibraryActivity(value,profile){
  const p=validateLibraryProfile(profile);
  const name=typeof value?.name==='string'?value.name.trim():'';
  if(!p||!p.funds.includes(value?.fund)||!audiences.has(value?.audience)||!name||[...name].length>120||/[\u0000-\u001f\u007f-\u009f]/.test(name)) return null;
  return {name,fund:value.fund,audience:value.audience};
}
export function makeLibrarySnapshot({school,profile,month,items}){
  const p=validateLibraryProfile(profile);
  if(!school?.name||!p||typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'||month>'2100-12'||
    !Array.isArray(items)||!items.length||items.length>maxLibraryActivities) return null;
  const verified=items.map(item=>validateLibraryActivity(item,p));
  if(verified.some(item=>!item)) return null;
  return Object.freeze({school:school.name,zone:p.zone,month,items:Object.freeze(verified.map(Object.freeze))});
}
