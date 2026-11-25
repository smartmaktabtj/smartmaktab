export const schoolIds=Array.from({length:88},(_,i)=>['demo-a','demo-a2','demo-a3','demo-b'][i]??`demo-${i+1}`);
export const validSchools=new Set(schoolIds);
export const schoolNames=Object.freeze(Object.fromEntries(schoolIds.map((id,i)=>[id,`МТМУ № ${i+1}`])));
export function findDemoSchools(query){
 const term=query.toLowerCase().trim().replace(/\s+/g,' '),number=term.match(/^(?:мтму\s*)?[№#]?\s*(\d+)$/u)?.[1];
 if(number)return schoolIds.filter((_,i)=>String(i+1)===String(Number(number)));
 return schoolIds.filter(id=>schoolNames[id].toLowerCase().includes(term));
}
