import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {normalizeClasses} from './class-picker.mjs';
import {documentBase64} from '../templates/student-enrollment-bytes.mjs';
import contract from '../templates/student_enrollment_certificate.tg.json' with {type:'json'};
const {fields}=contract;
export const pilotCertificateFields=fields;
const xmlEscape=text=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
export function validatePilotCertificate(fields){
 const data={};
 for(const field of pilotCertificateFields){
  const value=fields?.[field.key];const text=typeof value==='string'?value.trim():'';
  if(!text&&field.required)return {error:field.key};
  if(text.length>200||/[\x00-\x1f\x7f]|\{\{|\}\}/.test(text))return {error:field.key};
  if(field.type==='class_code'&&!normalizeClasses([text]).length)return {error:field.key};
  if(field.type==='date'){
   if(!/^20\d\d-\d\d-\d\d$/.test(text))return {error:field.key};const parsed=new Date(`${text}T00:00:00Z`);
   if(Number.isNaN(parsed.valueOf())||parsed.toISOString().slice(0,10)!==text)return {error:field.key};
   data[field.key]=text.split('-').reverse().join('.');
  }else data[field.key]=text;
 }
 return {data};
}
export function makePilotCertificate(raw){
 const outcome=validatePilotCertificate(raw);if(!outcome.data)return outcome;
 const entries=unzipSync(Uint8Array.from(atob(documentBase64),x=>x.charCodeAt(0)));
 const used=new Set();let xml=strFromU8(entries['word/document.xml']);
 xml=xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,block=>{
  if(!outcome.data.school_address&&block.includes('{{school_address}}')){used.add('school_address');return '';}
  return block.replace(/\{\{([a-z_]+)\}\}/g,(_,key)=>{if(!Object.hasOwn(outcome.data,key))throw new Error('Unknown template marker');used.add(key);return xmlEscape(outcome.data[key]);});
 });
 if(used.size!==pilotCertificateFields.length||xml.includes('{{'))throw new Error('Unresolved pilot template markers');
 entries['word/document.xml']=strToU8(xml);
 return {data:outcome.data,bytes:zipSync(entries,{level:6})};
}
