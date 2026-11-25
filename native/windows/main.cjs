'use strict';
const {app,BrowserWindow,protocol,session,shell,dialog,ipcMain}=require('electron');
const {registerContent}=require('./content-ipc.cjs');
const fs=require('node:fs/promises'), path=require('node:path');
const origin='smapp://smartmaktab'; const root=path.join(__dirname,'web');
protocol.registerSchemesAsPrivileged([{scheme:'smapp',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.pfb':'application/octet-stream'};
const own=url=>{try{const u=new URL(url);return u.protocol==='smapp:'&&u.hostname==='smartmaktab'&&!u.port&&!u.username&&!u.password;}catch{return false;}};
const external=url=>{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='raw.githubusercontent.com'&&u.pathname.startsWith('/sharipovip/books/');}catch{return false;}};
function create(){
 const win=new BrowserWindow({width:1280,height:820,minWidth:360,minHeight:540,autoHideMenuBar:true,backgroundColor:'#102821',webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,preload:path.join(__dirname,'preload.cjs')}});
 win.webContents.setWindowOpenHandler(({url})=>{if(external(url))void shell.openExternal(url);return {action:'deny'};});
 win.webContents.on('will-navigate',(event,url)=>{if(!own(url)){event.preventDefault();if(external(url))void shell.openExternal(url);}});
 win.webContents.on('will-redirect',(event,url)=>{if(!own(url))event.preventDefault();});
 void win.loadURL(`${origin}/index.html`);
}
app.whenReady().then(()=>{
 app.setAppUserModelId(app.name==='SmartMaktab Pilot'?'tj.smartmaktab.app.pilot':'tj.smartmaktab.app');
 registerContent({app,ipcMain,dialog,BrowserWindow,own});
 protocol.handle('smapp',async request=>{
  if(!own(request.url)||!['GET','HEAD'].includes(request.method))return new Response(null,{status:403});
  try{const name=decodeURIComponent(new URL(request.url).pathname).replace(/^\//u,'')||'index.html';
   if(name.includes('\\')||!/^[-\w./]+$/u.test(name)||name.split('/').some(s=>['.','..'].includes(s)))return new Response(null,{status:404});
   const content=await fs.readFile(path.join(root,name));
   return new Response(request.method==='HEAD'?null:new Uint8Array(content),{headers:{'Content-Type':mime[path.extname(name)]??'application/octet-stream','X-Content-Type-Options':'nosniff'}});
  }catch{return new Response(null,{status:404});}
 });
 const ses=session.defaultSession;
 ses.setPermissionCheckHandler((_wc,perm,url,detail)=>own(url)&&own(detail?.embeddingOrigin||url)&&['media','fullscreen','clipboard-sanitized-write'].includes(perm));
 ses.setPermissionRequestHandler((wc,permission,respond,details)=>{
  if(!own(details.requestingUrl)||!own(wc.getURL())||details.isMainFrame===false){respond(false);return;}
  if(['fullscreen','clipboard-sanitized-write'].includes(permission)){respond(true);return;}
  if(permission!=='media'){respond(false);return;}
  const kinds=details.mediaTypes||[];
  dialog.showMessageBox(BrowserWindow.fromWebContents(wc),{type:'question',buttons:['Нет','Разрешить один раз'],defaultId:0,cancelId:0,message:`SmartMaktab запрашивает доступ: ${kinds.map(x=>x==='audio'?'микрофон':x==='video'?'камера':'медиа').join(', ')}.`}).then(r=>respond(r.response===1),()=>respond(false));
 });
 // Native sharing/open targets are selected by the user, not by arbitrary paths from WebView.
 ipcMain.handle('sm:open-file', async(event)=>{
  if(!own(event.senderFrame?.url)||!own(event.sender.getURL()))return false;
  const result=await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender),{properties:['openFile'],filters:[{name:'Документы и медиа',extensions:['pdf','docx','png','jpg','mp3','mp4','wav','txt']}]});
  return !result.canceled&&/[.](pdf|docx|png|jpg|mp3|mp4|wav|txt)$/i.test(result.filePaths[0])&&!(await shell.openPath(result.filePaths[0]));
 });
 create();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)create();});
});
app.on('window-all-closed',()=>app.quit());
