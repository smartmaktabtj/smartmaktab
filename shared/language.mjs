const languageKey='smartmaktab.language.v1';
function validLanguage(value){return value==='ru'||value==='tg';}
export function getLanguage(requested){
 if(validLanguage(requested))return requested;
 try{const saved=localStorage.getItem(languageKey);if(validLanguage(saved))return saved;}catch{}
 return 'tg';
}
export function saveLanguage(value){if(validLanguage(value))try{localStorage.setItem(languageKey,value);}catch{}}
