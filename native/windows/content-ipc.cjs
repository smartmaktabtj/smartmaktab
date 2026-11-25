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
 async function store(data){
    const payload=openPack(data,key,roles);let old;try{old=await current();}catch{return {status:'corrupt'};}
    if(old&&payload.sequence<=old.sequence)return {status:'not-newer',payload:old};
    const tmp=dest+'.'+randomUUID()+'.tmp';try{await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(tmp,data,{flag:'wx'});await fs.rename(tmp,dest);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
    return {status:'applied',payload};
 }
 async function findDownloadsPack(){
    let best=null;
    const folders=['downloads','home'];
    for(const folder of folders){
     let dir;try{dir=app.getPath(folder);}catch{continue;}
     let entries;try{entries=await fs.readdir(dir);}catch{continue;}
     for(const name of entries){
      if(!name.toLowerCase().endsWith('.smupdate'))continue;
      try{
       const data=await readBounded(path.join(dir,name),fs);
       const payload=openPack(data,key,roles);
       if(!best||payload.sequence>best.payload.sequence)best={data,payload,source:path.join(dir,name)};
      }catch{}
     }
    }
    const usbLetters=['D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
    const usbSubs=['Download','Загрузки','SmartMaktab'];
    for(const letter of usbLetters){
     for(const sub of usbSubs){
      const usbDir=path.join(letter+':',sub);
      let entries;try{entries=await fs.readdir(usbDir);}catch{continue;}
      for(const name of entries){
       if(!name.toLowerCase().endsWith('.smupdate'))continue;
       try{
        const data=await readBounded(path.join(usbDir,name),fs);
        const payload=openPack(data,key,roles);
        if(!best||payload.sequence>best.payload.sequence)best={data,payload,source:path.join(usbDir,name)};
       }catch{}
      }
     }
    }
    return best;
 }
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
    return await store(data);
   }catch(e){const safe=['size','format','schema','signature','network'];return {status:safe.includes(e.code)?e.code:kind==='online'?'network':'error'};}
  });
 });
 ipcMain.handle('sm:content:check',e=>{
  if(!allowed(e)||!key)return {status:key?'denied':'no-key'};
  return transaction(async()=>{
   try{
    const found=await findDownloadsPack();
    if(!found)return {status:'none'};
    return await store(found.data);
   }catch(e){const safe=['size','format','schema','signature','network'];return {status:safe.includes(e.code)?e.code:'error'};}
  });
 });
}
module.exports={registerContent};
