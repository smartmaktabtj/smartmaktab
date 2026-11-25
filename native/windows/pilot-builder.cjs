'use strict';
const version=process.env.SM_RELEASE_VERSION;
if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version??''))throw new Error('Version must be X.Y.Z');
if(process.env.SM_CONFIRM_PRIVATE_UNSIGNED!=='UNSIGNED')throw new Error('Private EXE requires explicit confirmation UNSIGNED');
module.exports={appId:'tj.smartmaktab.app.pilot',productName:'SmartMaktab Pilot',forceCodeSigning:false,extraMetadata:{name:'smartmaktab-pilot',productName:'SmartMaktab Pilot',version},directories:{output:'pilot-release'},files:['main.cjs','preload.cjs','content.cjs','content-ipc.cjs','content-config.json','web/**/*'],win:{target:['nsis'],signExecutable:false,artifactName:'SmartMaktab-${version}-Windows-x64-PILOT-UNSIGNED.${ext}',icon:'web/pwa-512.png'},nsis:{oneClick:false,perMachine:false,allowToChangeInstallationDirectory:true,shortcutName:'SmartMaktab Pilot'}};
