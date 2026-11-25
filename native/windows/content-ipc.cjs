'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {publicKey,openPack,feed,readBounded,fetchBounded}=require('./content.cjs');
function registerContent({app,ipcMain,dialog,BrowserWindow,own},configOverride){
 let config={},key,url='';try{config=configOverride??require('./content-config.json');if(config.publicKey)key=publicKey(config.publicKey);url=feed(config.feed);}catch{key=null;}
 const roles=config.roles??[];const dest=path.join(app.getPath('userData'),'catalog.smupdate');let queue=Promise.resolve();
 function allowed(e){const frame=e.senderFrame;return frame&&frame===e.sender.mainFrame&&own(frame.url)&&own(e.sender.getURL())&&/\/cabinets\//.test(new URL(frame.url).pathname);}
 async function current(){if(!key)return null;try{return openPack(await readBounded(dest,fs),key,roles);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 const transaction=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 ipcMain.handle('sm:content:get',async e=>{
  if(!allowed(e))return {status:'denied'};
  try{return {status:key?'ready':'no-key',online:!!key&&!!url,payload:await current()};}catch{return {status:'corrupt',online:false};}
 });
 ipcMain.handle('sm:content:apply',(e,kind)=>{
  if(!allowed(e)||!key||(kind!=='file'&&kind!=='online'))return {status:key?'denied':'no-key'};
  return transaction(async()=>{
   try{
    let data;if(kind==='online'){if(!url)return {status:'network'};data=await fetchBounded(url);}else{
     const chosen=await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender),{properties:['openFile'],filters:[{name:'SmartMaktab Data',extensions:['smupdate']}]});
     if(chosen.canceled)return {status:'cancel'};
     if(path.extname(chosen.filePaths[0]).toLowerCase()!=='.smupdate')return {status:'format'};
     data=await readBounded(chosen.filePaths[0],fs);
    }
    const payload=openPack(data,key,roles);let old;try{old=await current();}catch{return {status:'corrupt'};}
    if(old&&payload.sequence<=old.sequence)return {status:'not-newer',payload:old};
    const tmp=dest+'.'+randomUUID()+'.tmp';try{await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(tmp,data,{flag:'wx'});await fs.rename(tmp,dest);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
    return {status:'applied',payload};
   }catch(e){const safe=['size','format','schema','signature','network'];return {status:safe.includes(e.code)?e.code:kind==='online'?'network':'error'};}
  });
 });
}
module.exports={registerContent};
