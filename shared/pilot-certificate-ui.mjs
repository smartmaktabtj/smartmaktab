import {canNativeSave,nativeSave} from './native-shell.mjs';
import {openWorkspaceView,closeWorkspaceView} from './workspace-view.mjs';
import {mountClassPicker} from './class-picker.mjs';
import {cabinetFormAction,offlineViewer} from './cabinet-runtime.mjs';
import {makePilotCertificate,pilotCertificateFields} from './pilot-certificate.mjs';
const labels={title:['Маълумотнома · DOCX','Справка об обучении · DOCX'],scope:['Шакли корӣ — тасдиқ нашудааст. Танҳо маълумоти сохта ворид кунед.','Рабочий шаблон не утверждён. Вводите только вымышленные данные.'],school:['Аввал мактабро интихоб кунед.','Сначала выберите школу.'],build:['Омода кардани DOCX','Подготовить DOCX'],close:['Пӯшидан','Закрыть'],download:['Боргирии DOCX','Скачать DOCX'],hint:['Барои боргирӣ SmartMaktab-ро дар браузер кушоед.','Для скачивания откройте SmartMaktab в обычном браузере.'],failed:['Майдонро санҷед:','Проверьте поле:'],error:['DOCX сохта нашуд.','Не удалось сформировать DOCX.']};
export function setupPilotCertificate(article,group,school){
 if(!['school-director','school-records-clerk'].includes(article.dataset.cabinetId))return;
 const tg=()=>document.documentElement.lang!=='ru',t=k=>labels[k][tg()?0:1],fieldLabel=f=>tg()?f.label_tg:f.label_ru;
 const make=(tag,cls)=>{const x=document.createElement(tag);if(cls)x.className=cls;return x;};
 const trigger=make('button','button alt'),actions=make('div','control');trigger.type='button';trigger.dataset.pilotCertificate='';actions.append(trigger);group.append(actions);
 const panel=make('section','section no-print');panel.id='pilotCertificate';panel.hidden=true;document.getElementById('workspaceDocs').after(panel);
 const form=make('form'),head=make('h2'),note=make('p','small'),scope=make('p'),grid=make('div','school-fields'),classBox=make('fieldset','class-form-field'),legend=make('legend'),host=make('div');
 form.autocomplete='off';form.noValidate=true;head.tabIndex=-1;classBox.append(legend,host);grid.append(classBox);
 const picker=mountClassPicker(host,{onChange:clearResult}),button=make('button','button'),close=make('button','button alt'),line=make('div','control'),status=make('p','small'),summary=make('p','notice'),download=make('button','button alt'),hint=make('p','small');
 button.type='submit';close.type=download.type='button';status.setAttribute('role','status');line.append(button,close);form.append(head,note,scope,grid,line,status,summary,download,hint);panel.append(form);
 const fields=new Map();let prepared=null,error='';
 for(const field of pilotCertificateFields){if(['class_code','school_name'].includes(field.key))continue;const l=make('label','field'),label=make('span'),input=make('input');input.dataset.pilotField=field.key;input.type=field.type==='date'?'date':'text';if(input.type==='text')input.maxLength=200;if(input.type==='date')input.value=new Date().toLocaleDateString('sv-SE');input.required=field.required;l.append(label,input);grid.append(l);fields.set(field.key,{field,label,input});}
 function clearResult(){prepared=null;error='';render();}
 function render(){
  trigger.textContent=head.textContent=t('title');note.textContent=t('scope');scope.textContent=school()?.name??t('school');button.textContent=t('build');close.textContent=t('close');download.textContent=t('download');hint.textContent=t('hint');
  legend.textContent=fieldLabel(pilotCertificateFields.find(f=>f.key==='class_code'));
  for(const {field,label} of fields.values())label.textContent=fieldLabel(field)+(field.required?' *':'');
  status.textContent=!error?'':error in labels?t(error):`${t('failed')} ${fieldLabel(pilotCertificateFields.find(f=>f.key===error))}`;
  summary.hidden=!prepared;summary.textContent=prepared?`${prepared.data.school_name} · ${prepared.data.class_code} · ${prepared.data.student_full_name}`:'';
  download.hidden=!prepared||offlineViewer;hint.hidden=!prepared||!offlineViewer;picker.refresh();
 }
 function reset(){form.reset();picker.set([]);for(const {input} of fields.values())if(input.type==='date')input.value=new Date().toLocaleDateString('sv-SE');clearResult();}
 trigger.addEventListener('click',()=>{panel.hidden=false;openWorkspaceView(panel.id,trigger);});
 close.addEventListener('click',()=>{closeWorkspaceView(panel.id);panel.hidden=true;reset();});
 form.addEventListener('input',clearResult);
 cabinetFormAction(form,button,()=>{
  if(!school()){error='school';render();return;}
  const raw={school_name:school().name,class_code:picker.read()[0],...Object.fromEntries([...fields].map(([k,{input}])=>[k,input.value]))};
  try{const outcome=makePilotCertificate(raw);prepared=outcome.bytes?outcome:null;error=outcome.error??'';}catch{prepared=null;error='error';}render();
 });
 download.addEventListener('click',()=>{
  if(!prepared||offlineViewer)return;
  const blob=new Blob([prepared.bytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  if(canNativeSave()){void nativeSave(blob,'student_enrollment_certificate.docx').catch(()=>{error='error';render();});return;}
  const url=URL.createObjectURL(blob);
  const a=make('a');a.download='student_enrollment_certificate.docx';a.href=url;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
 });
 document.addEventListener('cabinet:school',()=>{panel.hidden=true;reset();});document.addEventListener('cabinet:language',render);render();
}
