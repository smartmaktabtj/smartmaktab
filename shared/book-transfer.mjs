const maxBytes=150*1024*1024;
export function readableSize(bytes,lang=document.documentElement.lang){
 return Number.isSafeInteger(bytes)&&bytes>0?`${new Intl.NumberFormat(lang==='ru'?'ru':'tg-TJ',{minimumFractionDigits:1,maximumFractionDigits:1}).format(bytes/1000000)} ${lang==='ru'?'МБ':'МБ'}`:'—';
}
export async function fetchBookFile(book,{signal,onProgress=()=>{},fetcher=fetch}={}){
 const response=await fetcher(book.url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
 if(!response.ok||!response.body)throw new Error('download_failed');
 const header=Number(response.headers.get('Content-Length')),reference=Number(book.size);
 const total=Number.isSafeInteger(header)&&header>0?header:Number.isSafeInteger(reference)&&reference>0?reference:null;
 if(total&&total>maxBytes){await response.body.cancel();throw new Error('too_large');}
 const input=response.body.getReader();const parts=[];let loaded=0;
 onProgress({loaded,total});
 try{
  for(;;){const {done,value}=await input.read();if(done)break;
   if(signal?.aborted)throw new DOMException('Aborted','AbortError');
   loaded+=value.byteLength;if(loaded>maxBytes)throw new Error('too_large');parts.push(value);onProgress({loaded,total});
  }
 }catch(error){await input.cancel().catch(()=>{});throw error;}finally{input.releaseLock();}
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 const blob=new Blob(parts,{type:'application/pdf'});if(!/^(?:.|\n){0,1020}%PDF-/.test(await blob.slice(0,1024).text()))throw new Error('not_pdf');
 return blob;
}
const translit={а:'a',б:'b',в:'v',г:'g',ғ:'gh',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',ӣ:'i',й:'y',к:'k',қ:'q',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ӯ:'u',ф:'f',х:'kh',ҳ:'h',ц:'ts',ч:'ch',ҷ:'j',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
export function bookFilename(title){
 const latin=[...String(title).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase()].map(c=>Object.hasOwn(translit,c)?translit[c]:c).join('');
 const slug=latin.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,88).replace(/-+$/g,'');
 return `${slug||'smartmaktab-textbook'}.pdf`;
}
