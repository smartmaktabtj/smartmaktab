import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateTeacherProfile,makeLessonSnapshot} from '../cabinets/school/teacher-data.mjs';

test('teacher demo profile retains only allowed class codes and language',()=>{
  for(const input of [null,{classes:[],language:'ru'},{classes:['99Б'],language:'ru'},{classes:['8А'],language:'en'}]) {
    assert.equal(validateTeacherProfile(input),null);
  }
  assert.deepEqual(validateTeacherProfile({classes:['9Б','8А','8А'],language:'tg',email:'not stored'}),{classes:['8А','9Б'],language:'tg'});
});

test('lesson snapshots preserve original context, reject unauthorized class and invalid inputs',()=>{
  const eligible={school:{name:'DEV · Мактаб A'},profile:{teaching:[{classCode:'8А',subject:'mathematics'}],language:'tg'},classCode:'8А',subject:'mathematics',date:'2028-02-29',topic:' Таблица ',goal:' Найти сумму '};
  for(const change of [{school:null},{classCode:'9А'},{subject:'informatics'},{profile:{classes:['8А'],language:'tg'}},{date:'2026-02-29'},{topic:'   '},{goal:'a'.repeat(301)}]) assert.equal(makeLessonSnapshot({...eligible,...change}),null);
  const snapshot=makeLessonSnapshot(eligible);
  eligible.profile.teaching[0].classCode='9Б'; eligible.profile.language='ru'; eligible.school.name='DEV · Мактаб B';
  assert.deepEqual(snapshot,{school:'DEV · Мактаб A',subject:'mathematics',language:'tg',classCode:'8А',date:'2028-02-29',topic:'Таблица',goal:'Найти сумму'});
  assert.ok(Object.isFrozen(snapshot));
});

test('class grades 1–11 work with or without Cyrillic letters, including Tajik letters',async()=>{
 const {classGrades,classLetters,normalizeClasses}=await import('../shared/class-picker.mjs');
 assert.equal(classGrades.length,11);
 assert.ok(classLetters.includes('Ғ')&&classLetters.includes('Я'));
 assert.deepEqual(normalizeClasses(['11Я','5Б','5А','5','5Ғ','1Ҷ','12А','5B','5Б','11','']),['1Ҷ','5','5А','5Б','5Ғ','11','11Я']);
});

test('static schoolbook matching respects grade, subject, and source',async()=>{
 const {booksFor}=await import('../shared/teacher-books.mjs');
 assert.ok(booksFor('5Ғ','informatics').some(b=>b.verified&&new URL(b.url).hostname==='raw.githubusercontent.com'));
 assert.deepEqual(booksFor('5А','mathematics'),[]);assert.deepEqual(booksFor('5A','informatics'),[]);
 assert.deepEqual(booksFor('5','informatics'),booksFor('5А','informatics'));
 assert.deepEqual(booksFor('11','algebra'),booksFor('11Б','algebra'));
});

test('teacher shelf combines identical textbooks for class sections and reports only exact missing matches',async()=>{
 const {teacherShelf,booksFor}=await import('../shared/teacher-books.mjs');
 const a={classCode:'5',subject:'informatics'},b={classCode:'5А',subject:'informatics'},c={classCode:'5Б',subject:'mathematics'};
 const {items,missing}=teacherShelf([a,b,c]);
 assert.deepEqual(items.map(x=>x.url),booksFor('5','informatics').map(x=>x.url));
 assert.ok(items.length>0&&items.every(item=>item.rows.length===2));assert.deepEqual(missing,[c]);
});
