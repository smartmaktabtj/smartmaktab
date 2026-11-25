import {offlineViewer,tabStorage} from './cabinet-runtime.mjs';
// PDFs stay in a bounded, temporary cache. Nothing is preloaded or written to disk by the app.
const files=new Map();const max=150*1024*1024;let total=0;
export function cachedPdf(url){const file=files.get(url);if(file){files.delete(url);files.set(url,file);}return file;}
export function rememberPdf(url,file){if(cachedPdf(url))return;while(files.size&&(total+file.size>max||files.size>=6)){const [key,old]=files.entries().next().value;files.delete(key);total-=old.size;}if(file.size<=max){files.set(url,file);total+=file.size;}}
function storageKey(kind,url){if(!offlineViewer)return `smartmaktab.reader.${kind}.v1:${url}`;let a=2166136261,b=7;for(const x of url){a=Math.imul(a^x.codePointAt(0),16777619);b=(Math.imul(b,31)+x.codePointAt(0))|0;}return `smartmaktab.demo.reader.${kind}.${(a>>>0).toString(36)}-${(b>>>0).toString(36)}`;}
export const readerStore={get(kind,url){const key=storageKey(kind,url);try{return (offlineViewer?tabStorage:localStorage).getItem(key);}catch{return tabStorage.getItem(key);}},set(kind,url,value){const key=storageKey(kind,url);try{(offlineViewer?tabStorage:localStorage).setItem(key,value);}catch{tabStorage.setItem(key,value);}}};
