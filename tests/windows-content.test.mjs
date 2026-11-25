import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publicKey,openPack,signPack,feed,fetchBounded,readBounded} from '../native/windows/content.cjs';
const pair=generateKeyPairSync('ed25519'), other=generateKeyPairSync('ed25519');
const pk=publicKey(pair.publicKey.export({format:'der',type:'spki'}).toString('base64'));
const roles=['school-director','school-teacher'];
const payload=()=>({schema:1,sequence:1,cabinets:{'school-director':[{id:'documents',title:{tg:'Ҳуҷҷатҳо',ru:'Документы'},icon:'folder',sections:[{id:'guide',title:{tg:'Намуна',ru:'Пример'},text:{tg:'Матни озмоишӣ',ru:'Демонстрационный текст'}}]}]}});
const bytes=x=>Buffer.from(JSON.stringify(x));
test('Windows catalog verifies Ed25519 and accepts narrowly typed role-specific sections',()=>{
 const data=payload(), good=signPack(bytes(data),pair.privateKey,roles);
 assert.deepEqual(openPack(good,pk,roles),data);
 assert.throws(()=>openPack(good,other.publicKey,roles),{code:'signature'});
 const tamper=JSON.parse(good);data.sequence=2;tamper.payload=bytes(data).toString('base64');
 assert.throws(()=>openPack(bytes(tamper),pk,roles),{code:'signature'});
 assert.throws(()=>openPack(Buffer.alloc(262145),pk,roles),{code:'size'});
});
test('even correctly signed unknown roles, scripts, permissions and unsupported schema must not activate',()=>{
 for(const bad of [{...payload(),schema:2},{...payload(),cabinets:{'fake-role':[]}},{...payload(),script:'console.log(1)'},{...payload(),permissions:['camera']}]){
  const raw=bytes(bad),envelope={payload:raw.toString('base64'),signature:sign(null,raw,pair.privateKey).toString('base64')};
  assert.throws(()=>openPack(bytes(envelope),pk,roles),{code:'schema'});
 }
});
test('bounded disk reads and pinned HTTPS raw GitHub fetch: no credentials and no redirects',async()=>{
 const url='https://raw.githubusercontent.com/example/downloads/main/latest.smupdate';
 for(const bad of ['http://raw.githubusercontent.com/example/downloads/main/latest.smupdate',url+'?token=1',url.replace('raw.githubusercontent.com','raw.githubusercontent.com.evil.test'),url.replace('latest.smupdate','install.exe')])assert.throws(()=>feed(bad),{code:'feed'});
 assert.equal(await fetchBounded(url,async (input,options)=>{assert.equal(input,url);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');return new Response('hello');}).then(b=>b.toString()),'hello');
 await assert.rejects(fetchBounded(url,async ()=>new Response(new Uint8Array(262145))),{code:'size'});
 const fs=await import('node:fs/promises'),d=await mkdtemp(join(tmpdir(),'sm-data-test-'));
 try{const f=join(d,'test.smupdate');await writeFile(f,'hello');assert.equal((await readBounded(f,fs)).toString(),'hello');await writeFile(f,Buffer.alloc(262145));await assert.rejects(readBounded(f,fs),{code:'size'});}finally{await rm(d,{force:true,recursive:true});}
});

test('Windows IPC rejects a restricted frame, persists signed data, and does not downgrade',async()=>{
 const {registerContent}=await import('../native/windows/content-ipc.cjs');
 const d=await mkdtemp(join(tmpdir(),'sm-data-ipc-')), pickPath=join(d,'usb.smupdate');
 const handlers=new Map(), app={getPath:()=>d}, ipcMain={handle:(n,f)=>handlers.set(n,f)};
 const unsigned='smapp://smartmaktab/cabinets/school/director.html';const senderFrame={url:unsigned};const sender={mainFrame:senderFrame,getURL:()=>unsigned};const event={sender,senderFrame};
 const ipc={app,ipcMain,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[pickPath]})},BrowserWindow:{fromWebContents:()=>null},own:u=>u.startsWith('smapp://smartmaktab/')};
 try{
  registerContent(ipc,{publicKey:pair.publicKey.export({format:'der',type:'spki'}).toString('base64'),roles});
  const status=()=>handlers.get('sm:content:get')(event), apply=(e=event)=>handlers.get('sm:content:apply')(e,'file');
  assert.equal((await status()).payload,null);
  assert.equal((await apply({...event,senderFrame:{url:unsigned}})).status,'denied');
  const next={...payload(),sequence:3};await writeFile(pickPath,signPack(bytes(next),pair.privateKey,roles));
  assert.equal((await apply()).status,'applied');
  assert.deepEqual(openPack(await readFile(join(d,'catalog.smupdate')),pk,roles),next);
  registerContent(ipc,{publicKey:pair.publicKey.export({format:'der',type:'spki'}).toString('base64'),roles});
  assert.deepEqual((await status()).payload,next);
  await writeFile(pickPath,signPack(bytes(payload()),pair.privateKey,roles));
  assert.equal((await apply()).status,'not-newer');
  await writeFile(pickPath,signPack(bytes({...payload(),sequence:4}),other.privateKey,roles));
  assert.equal((await apply()).status,'signature');assert.deepEqual((await status()).payload,next);
 }finally{await rm(d,{force:true,recursive:true});}
});
