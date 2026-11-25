import assert from 'node:assert/strict';
import {test} from 'node:test';
import {directorProfile,directorTask,directorPlan,taskInYear,maxTasks} from '../cabinets/school/director-data.mjs';
const profile={type:'school',shifts:'two'};
const task={direction:'learning',owner:'academic',title:' Учебный план ',due:'2027-08'};
test('director profile and yearly deadlines follow a September–August window',()=>{
  assert.deepEqual(directorProfile({...profile,principal:'discard'}),profile);
  assert.equal(directorProfile({...profile,shifts:'many'}),null);
  for(const due of ['2026-08','2026-00','2027-09','2026-9']) assert.equal(taskInYear(due,'2026'),false);
  for(const due of ['2026-09','2026-12','2027-01','2027-08']) assert.equal(taskInYear(due,'2026'),true);
  assert.equal(directorTask({...task,owner:'any'},'2026'),null);
  assert.equal(directorTask({...task,title:'  '},'2026'),null);
});
test('director draft is ordered, immutable and rejects stale deadlines',()=>{
  const tasks=[{...task},{...task,due:'2026-09'}];
  const opts={school:{name:'DEV · Мактаб A',id:'demo-a'},profile,year:'2026',goal:' Цель ',tasks};
  for(const change of [{year:'2027'},{goal:' '},{tasks:Array(maxTasks+1).fill(task)}]) assert.equal(directorPlan({...opts,...change}),null);
  const plan=directorPlan(opts);tasks[1].due='2027-01';
  assert.deepEqual(plan.tasks.map(entry=>entry.due),['2026-09','2027-08']);
  assert.equal(plan.tasks[0].title,'Учебный план');assert.equal(plan.goal,'Цель');assert.ok(Object.isFrozen(plan.tasks[0]));
});

test('director personnel is validated independently of school and annual plan',async()=>{
  const {validatePersonnel}=await import('../cabinets/school/director-data.mjs');
  const value={first:' Демо ',last:'Образец',birth:'1980',educationYears:'15',leadYears:'5',
    university:'Учебное заведение',specialty:'Педагогика',diploma:'master',category:'first',
    graduation:'2001',attestation:'2024',appointed:'2020',gender:'female',phone:'+000 123 45 67',email:'demo@example.test',address:'Вымышленный адрес',achievements:['excellence','monetary'],languages:['ru','en','de','other'],otherLanguage:'Итальянский'};
  for(const [change,error] of [[{leadYears:'20'},'experience'],[{attestation:'2027'},'dates'],[{birth:'2030'},'birth'],[{otherLanguage:''},'language'],[{category:'x'},'fields'],[{phone:'abc'},'contacts'],[{email:'invalid'},'contacts']]){
    assert.deepEqual(validatePersonnel({...value,...change},2026),{error});
  }
  const result=validatePersonnel({...value,passport:'discard'},2026).data;
  assert.deepEqual(result.achievements,['excellence','monetary']);assert.equal(result.email,'demo@example.test');assert.equal(result.first,'Демо');assert.equal(result.otherLanguage,'Итальянский');assert.equal(result.passport,undefined);
});


test('three-year renewal uses the latest completed course; leap-day rolls to end of February',async()=>{
  const {validateCourse,courseSchedule}=await import('../cabinets/school/director-data.mjs');
  const course={title:' Демо ',start:'2024-02-01',end:'2024-02-29',state:'completed'};
  assert.equal(validateCourse({...course,end:'2023-02-01'}),null);
  assert.equal(validateCourse({...course,end:'2025-02-29'}),null);
  assert.equal(courseSchedule([{...course,state:'planned'}],'2027-03-01'),null);
  const other={...course,end:'2026-01-10',state:'planned'};
  assert.deepEqual(courseSchedule([course,other],'2027-02-28'),{due:'2027-02-28',status:'due'});
  assert.deepEqual(courseSchedule([course,other],'2027-03-01'),{due:'2027-02-28',status:'overdue'});
  assert.deepEqual(courseSchedule([course,{...other,state:'completed'}],'2027-03-01'),{due:'2029-01-10',status:'upcoming'});
});
