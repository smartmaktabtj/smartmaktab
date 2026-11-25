const wordsRx=/[\p{L}][\p{L}\p{M}'-]{2,}/gu;
const stop=new Set('дар барои шудааст мешавад мебошад агар онро инҳо ҳамин чунин чун баъд баъзе пеш ҳамон ҳастанд метавонад онҳо ки бо аз то ва ё як ду се ҳар хеле без это этот этой этих для под над при как что где или если уже они она оно так также был была были его неё него наша наши есть чтобы между которой который которая the and are from that this with have one two all not was which when into their'.split(' '));
export function termsFromText(text,limit=8){
 const words=new Map();for(const item of String(text).match(wordsRx)??[]){const word=item.toLocaleLowerCase('ru');if(word.length<4||stop.has(word))continue;words.set(word,(words.get(word)??0)+1);}
 return [...words].sort(([a,x],[b,y])=>y-x||a.localeCompare(b,'ru')).slice(0,limit).map(([word,count])=>({word,count}));
}
export function summarizeReaderText(text){
 const parts=String(text).match(/[^.!?…]+[.!?…]+|[^.!?…]+$/gu)?.map(x=>x.trim()).filter(x=>x.length>=25&&x.length<=450)??[];
 const top=new Set(termsFromText(text,18).map(x=>x.word));
 if(!parts.length)return String(text).trim().slice(0,760);
 return parts.map((p,index)=>({p,index,score:(p.toLocaleLowerCase('ru').match(wordsRx)??[]).filter(w=>top.has(w)).length/(p.length**.55)}))
  .sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,4).sort((a,b)=>a.index-b.index).map(x=>x.p).join(' ');
}

const legacyTajik={'Њ':'Ҳ','њ':'ҳ','Љ':'Ҷ','љ':'ҷ','Ќ':'Қ','ќ':'қ','Ѓ':'Ғ','ѓ':'ғ','Ў':'Ӯ','ў':'ӯ','Ї':'Ӣ','ї':'ӣ'};
export function normalizeLegacyTajik(text,title=''){
 const legacy=/[ЊњЉљЌќЃѓЎўЇї]/gu;
 const tajikTitle=/[ғқҳҷӯӣ]|тоҷик|точик/u.test(String(title).toLocaleLowerCase('tg'));
 // Legacy Tajik font encodings overlap real Cyrillic letters used in other languages.
 if(!tajikTitle&&!(/[ғқҳҷӯӣ]/iu.test(text)&&Array.from(text.matchAll(legacy)).length>=3))return text;
 return text.replace(legacy,ch=>legacyTajik[ch]);
}
export function extractReaderText(items,title=''){
 let output='',previous=null,previousEnd=false,spaces=false;
 for(const item of items.slice(0,4500)){
  if(typeof item.str!=='string')continue;
  const raw=item.str.normalize('NFC').replace(/[\u00ad\u200b\ufeff]/g,'');
  const fragment=raw.trim();
  if(!fragment){spaces=spaces||/\s/.test(raw);previousEnd=previousEnd||item.hasEOL;continue;}
  const t=item.transform,p=previous?.transform;
  const size=Array.isArray(t)?Math.hypot(t[2],t[3]):0;
  const gap=Array.isArray(t)&&Array.isArray(p)?t[4]-(p[4]+(previous.width||0)):Infinity;
  const sameLine=!previousEnd&&size>0&&p&&Math.abs(t[5]-p[5])<size*.26;
  if(output){
   if(!sameLine&&previousEnd&&/\p{L}[-‐]$/u.test(output)&&/^\p{Ll}/u.test(fragment))output=output.slice(0,-1);
   else if(!sameLine||!(gap>=-size*.15&&gap<size*(spaces ? .085 : .16)&&(!/^\s|\s$/u.test(raw))))output+=previousEnd?'\n':' ';
  }
  output+=fragment;previous=item;previousEnd=!!item.hasEOL;spaces=/\s$/.test(raw);
  if(output.length>10000)break;
 }
 return normalizeLegacyTajik(output.replace(/[ \t]+([,.;:!?])/g,'$1').replace(/(^|\n)\d{1,4}(?=\n|$)/g,'$1').replace(/\s+/g,' ').trim().slice(0,9000),title);
}
export function examplesForTerms(text,terms){
 const sentences=String(text).match(/[^.!?…]+[.!?…]+|[^.!?…]+$/gu)?.map(x=>x.trim()).filter(x=>x.length>=26&&x.length<=430)??[];
 return terms.map(({word})=>({word,quote:sentences.find(sentence=>(sentence.toLocaleLowerCase('ru').match(wordsRx)??[]).includes(word))??''}));
}
