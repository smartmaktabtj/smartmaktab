'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {publicKey,feed,signPack}=require('../native/windows/content.cjs');
const root=path.join(__dirname,'..');const roles=require('../shared/cabinet-registry.json').map(x=>x.id);
const [cmd,...args]=process.argv.slice(2);
try{
 if(cmd==='configure'&&!args.length){const key=(process.env.SM_CONTENT_PUBLIC_KEY??'').trim(),url=feed((process.env.SM_CONTENT_FEED??'').trim());if(key)publicKey(key);if(url&&!key)throw new Error('Set content public key before feed');fs.writeFileSync(path.join(root,'native/windows/content-config.json'),JSON.stringify({publicKey:key,feed:url,roles}));console.log(key?'Content key configured':'No content key; import disabled');}
 else if(cmd==='keygen'&&args.length===1){
  const dest=path.resolve(args[0]);if(dest===root||dest.startsWith(root+path.sep))throw new Error('Choose a new folder outside the repository');fs.mkdirSync(dest,{mode:0o700});
  const {privateKey,publicKey:pub}=crypto.generateKeyPairSync('ed25519');fs.writeFileSync(path.join(dest,'publisher.smupdate-key'),privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});fs.writeFileSync(path.join(dest,'SM_CONTENT_PUBLIC_KEY.txt'),pub.export({type:'spki',format:'der'}).toString('base64')+'\n',{flag:'wx'});console.log('Created key and separate public key; use only the public text as repository variable.');
 }else if(cmd==='sign'&&args.length===3){const [src,key,out]=args;if(!out.endsWith('.smupdate')||fs.statSync(src).size>190*1024)throw new Error('Expected small JSON input and .smupdate output');const raw=fs.readFileSync(src);fs.writeFileSync(out,signPack(raw,crypto.createPrivateKey(fs.readFileSync(key)),roles),{flag:'wx'});console.log('Signed data package: '+path.basename(out));}
 else throw new Error('Use configure | keygen PRIVATE_NEW_FOLDER | sign payload.json path/to/publisher.smupdate-key output.smupdate');
}catch(error){console.error('SmartMaktab:',error.message);process.exitCode=1;}
