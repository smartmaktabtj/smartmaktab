const languageKey='smartmaktab.language.v1';
export function getLanguage(){return 'tg';}
export function saveLanguage(){
 try{localStorage.setItem(languageKey,'tg');}catch{}
 try{globalThis.SmartMaktabSqlite?.setItem?.(languageKey,'tg');}catch{}
}
