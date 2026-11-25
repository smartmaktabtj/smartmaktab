import {appRoot,offlineViewer} from './cabinet-runtime.mjs';
export const gatewayEnabled=!offlineViewer&&document.querySelector('meta[name="sm-aliya-gateway"]')?.content==='local'&&location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname);
export async function runGateway(payload,signal){
 if(!gatewayEnabled)throw new Error('disabled');
 const response=await fetch(new URL('api/aliya/run',appRoot),{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',credentials:'same-origin',body:JSON.stringify(payload),signal});
 const result=await response.json();if(!response.ok||typeof result.text!=='string'||!result.text.trim())throw new Error(result.error??'unavailable');return result.text;
}
