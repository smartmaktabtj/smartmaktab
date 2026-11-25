import {gunzipSync,strFromU8} from 'fflate';
const decode=data=>Uint8Array.from(atob(data),c=>c.charCodeAt(0));
const assetNode=()=>document.getElementById('sm-portable-reader');
export const hasPortablePdf=()=>!!assetNode();
let assets, enginePromise;
export function portablePdf(){
 if(enginePromise)return enginePromise;
 enginePromise=(async()=>{
  assets??=JSON.parse(strFromU8(gunzipSync(decode(assetNode().dataset.pack))));
  const js=name=>URL.createObjectURL(new Blob([assets[name]],{type:'text/javascript'}));
  const main=js('pdf.min.mjs');
  try{const engine=await import(main);engine.GlobalWorkerOptions.workerSrc=js('pdf.worker.min.mjs');return engine;}
  finally{URL.revokeObjectURL(main);}
 })().catch(error=>{enginePromise=null;throw error;});return enginePromise;
}
export class PortableFonts{
 async fetch({filename}){
  if(!Object.hasOwn(assets?.fonts??{},filename))throw new Error('Font unavailable');
  return decode(assets.fonts[filename]);
 }
}
