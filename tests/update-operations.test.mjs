import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkWeekly,checkMatrix} from '../shared/operations-data.mjs';
import {newLoans,updateLoans,loanRows,readLoans} from '../shared/loans.mjs';
import {makePilotCertificate} from '../shared/pilot-certificate.mjs';
import {unzipSync,strFromU8} from 'fflate';
test('weekly schedule distinguishes class, teacher and room, with boundaries and days',()=>{
 const first={day:'mon',classCode:'5А',start:'08:00',end:'08:45',subject:'Math',teacher:'Устод 1',room:'101'};
 const second={...first,classCode:'6А',start:'08:30',end:'09:00',room:'102',teacher:' устод  1 '};
 for(const [changes,fields] of [[{},['teacher']],[{room:'101',teacher:'Другой'},['room']],[{classCode:'5А',teacher:'Другой'},['classCode']]])assert.deepEqual(checkWeekly([first,{...second,...changes}]).conflicts,[{first:1,second:2,fields}]);
 assert.deepEqual(checkWeekly([first,{...second,start:'08:45'}]).conflicts,[]);
 assert.deepEqual(checkWeekly([first,{...second,day:'tue'}]).conflicts,[]);
});
test('matrix preserves zero, absent and separately entered annual results',()=>{
 const {result}=checkMatrix({q1:['20','17','0','9'],year:['20','20','13','20']});
 assert.equal(result.q1.qualityPercent,0);assert.equal(result.q2,null);assert.equal(result.year.qualityPercent,65);
 assert.equal(checkMatrix({q1:['20','','0','9']}).error,'q1');
});
test('paper circulation preserves independent stock, blocks repeats and marks overdue',()=>{
 let state=updateLoans(newLoans(),{kind:'add',code:'X-1',title:'Книга'}).next;
 const add={kind:'lend',code:'X-1',reader:'P-1',issued:'2026-10-01',due:'2026-10-07'};
 state=updateLoans(state,add).next;assert.ok(state);assert.equal(updateLoans(state,add).error,'alreadyOut');
 assert.equal(loanRows(state,'2026-10-07')[0].status,'out');assert.equal(loanRows(state,'2026-10-08')[0].status,'overdue');
 const back={kind:'return',code:'X-1',today:'2026-10-08'};state=updateLoans(state,back).next;
 assert.deepEqual(readLoans(state),state);assert.equal(updateLoans(state,back).error,'alreadyIn');assert.equal(loanRows(state,'2026-10-08')[0].status,'available');
});
test('pilot DOCX preserves school context, validates date and class, escapes text and handles optional address',()=>{
 const make=(n,code,addr)=>makePilotCertificate({school_name:`МТМУ № ${n}`,class_code:code,district_name:'Ноҳияи шартӣ',document_number:`T-${n}`,student_full_name:`Хонанда & <${n}>`,issue_date:'2026-11-24',school_address:addr});
 const a=make(901,'5'),b=make(902,'11Ғ','Суроғаи шартӣ');
 const xml=outcome=>strFromU8(unzipSync(outcome.bytes)['word/document.xml']);
 assert.match(xml(a),/901/);assert.match(xml(a),/синфи 5-и /);assert.doesNotMatch(xml(a),/902|Суроға:|\{\{/);assert.match(xml(a),/Хонанда &amp; &lt;901&gt;/);assert.match(xml(a),/24\.11\.2026/);
 assert.match(xml(b),/Суроғаи шартӣ/);assert.doesNotMatch(xml(b),/901/);assert.equal(make(1,'5A').error,'class_code');
});
