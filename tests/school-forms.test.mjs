import {test} from 'node:test';
import assert from 'node:assert/strict';
import {schoolProgress} from '../shared/school-forms-data.mjs';
test('sums and reports percentages over total and calculates halves and year',()=>{
 const result=schoolProgress(['25','22','14','20'],['6','8,5','9','7']);
 assert.equal(result.qualityPercent,56);assert.equal(result.passPercent,80);
 assert.deepEqual([result.h1,result.h2,result.year],[7.25,8,7.625]);
});
test('missing marks are not zero and impossible totals are rejected',()=>{
 assert.equal(schoolProgress(['12','7','2','5'],['6','','11','7']).year,null);
 for(const totals of [['0','0','0','0'],['20','21','6','10'],['20','15','11','10'],['20','15','-2','10'],['20','15','','10']])assert.equal(schoolProgress(totals,['','','','']),null);
});
test('schedule sorts lessons and prevents time overlaps',async()=>{
 const {orderSchedule}=await import('../shared/school-forms-data.mjs');
 const lesson=(subject,start,end)=>({subject,start,end});
 assert.deepEqual(orderSchedule([lesson('Б','09:00','09:45'),lesson('А','08:00','08:45')]).map(row=>row.subject),['А','Б']);
 assert.equal(orderSchedule([lesson('А','08:00','09:20'),lesson('Б','09:00','09:45')]),null);
 assert.equal(orderSchedule([lesson('А','09:20','09:00')]),null);
});
