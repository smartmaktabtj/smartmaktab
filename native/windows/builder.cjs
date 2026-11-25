'use strict';
const env=process.env;
const version=env.SM_RELEASE_VERSION;
const need=(...keys)=>{for(const key of keys)if(!env[key]?.trim())throw new Error(`Missing ${key}`);};
if(!/^\d+\.\d+\.\d+$/.test(version??''))throw new Error('SM_RELEASE_VERSION must be a stable SemVer X.Y.Z');
need('WINDOWS_SIGNING_MODE');
let signature;
if(env.WINDOWS_SIGNING_MODE==='azure'){
 need('AZURE_TENANT_ID','AZURE_CLIENT_ID','AZURE_CLIENT_SECRET','WINDOWS_SIGN_ENDPOINT','WINDOWS_SIGN_ACCOUNT','WINDOWS_SIGN_PROFILE','WINDOWS_SIGN_PUBLISHER');
 if(!/^https:\/\/[-a-z0-9]+\.codesigning\.azure\.net\/?$/i.test(env.WINDOWS_SIGN_ENDPOINT))throw new Error('Expected a regional Azure Artifact Signing HTTPS endpoint');
 signature={azureSignOptions:{endpoint:env.WINDOWS_SIGN_ENDPOINT,codeSigningAccountName:env.WINDOWS_SIGN_ACCOUNT,certificateProfileName:env.WINDOWS_SIGN_PROFILE,publisherName:env.WINDOWS_SIGN_PUBLISHER}};
}else if(env.WINDOWS_SIGNING_MODE==='pfx'){
 need('WIN_CSC_LINK','WIN_CSC_KEY_PASSWORD','WINDOWS_SIGN_PUBLISHER');
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(env.WIN_CSC_LINK)||env.WIN_CSC_LINK.length%4||Buffer.from(env.WIN_CSC_LINK,'base64')[0]!==0x30)throw new Error('WINDOWS_CERT_BASE64 must encode a trusted PFX');
 signature={signtoolOptions:{publisherName:env.WINDOWS_SIGN_PUBLISHER,signingHashAlgorithms:['sha256']}};
}else throw new Error('WINDOWS_SIGNING_MODE must be azure or pfx; unsigned builds disabled');
module.exports={appId:'tj.smartmaktab.app',productName:'SmartMaktab',forceCodeSigning:true,extraMetadata:{version},directories:{output:'release'},files:['main.cjs','preload.cjs','web/**/*'],
 win:{target:['nsis'],icon:'web/pwa-512.png',artifactName:'SmartMaktab-${version}-Windows-x64.${ext}',...signature},nsis:{oneClick:false,perMachine:false,allowToChangeInstallationDirectory:true}};
