export const periods=['q1','q2','q3','q4','h1','h2','year'];
export function schoolProgress(totals,quarterMeans){
 const count=(value)=>/^\d{1,4}$/.test(String(value))?Number(value):NaN;
 const [enrolled,assessed,quality,passed]=totals.map(count);
 if(!Number.isInteger(enrolled)||enrolled<1||![assessed,quality,passed].every(Number.isInteger)||!(quality<=passed&&passed<=assessed&&assessed<=enrolled))return null;
 const quarter=quarterMeans.map(value=>{
  const text=String(value??'').trim().replace(',','.');
  const n=Number(text);return /^\d{1,2}(?:\.\d{1,2})?$/.test(text)&&n>=1&&n<=10?n:null;
 });
 const mean=(a,b)=>a===null||b===null?null:(a+b)/2;
 const h1=mean(quarter[0],quarter[1]),h2=mean(quarter[2],quarter[3]);
 return {enrolled,assessed,quality,passed,qualityPercent:quality*100/enrolled,passPercent:passed*100/enrolled,quarter,h1,h2,year:mean(h1,h2)};
}
export function orderSchedule(rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>12)return null;
 const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
 if(rows.some(row=>!row.subject||!time.test(row.start)||!time.test(row.end)||row.end<=row.start))return null;
 const ordered=[...rows].sort((a,b)=>a.start.localeCompare(b.start));
 for(let i=1;i<ordered.length;i++)if(ordered[i-1].end>ordered[i].start)return null;
 return ordered;
}
