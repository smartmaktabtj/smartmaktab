import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateLibraryProfile,validateLibraryActivity,makeLibrarySnapshot,maxLibraryActivities} from '../cabinets/school/library-data.mjs';
const demoProfile={zone:'reading',funds:['fiction','textbooks']};
const item={name:' Выставка ',fund:'fiction',audience:'primary'};
test('library stores only whitelisted zone and fund codes',()=>{
  assert.deepEqual(validateLibraryProfile({...demoProfile,librarian:'discard'}),{zone:'reading',funds:['textbooks','fiction']});
  assert.equal(validateLibraryProfile({zone:'other',funds:['fiction']}),null);
  assert.equal(validateLibraryProfile({zone:'main',funds:[]}),null);
  assert.equal(validateLibraryProfile({zone:'main',funds:['unknown']}),null);
});
test('library activities use assigned fund sections and the printable snapshot is immutable',()=>{
  assert.deepEqual(validateLibraryActivity(item,demoProfile),{name:'Выставка',fund:'fiction',audience:'primary'});
  assert.equal(validateLibraryActivity({...item,fund:'reference'},demoProfile),null);
  assert.equal(validateLibraryActivity({...item,audience:'other'},demoProfile),null);
  const opts={school:{name:'DEV · Мактаб A'},profile:{...demoProfile,funds:[...demoProfile.funds]},month:'2027-01',items:[{...item}]};
  assert.equal(makeLibrarySnapshot({...opts,month:'2027-13'}),null);
  assert.equal(makeLibrarySnapshot({...opts,items:[]}),null);
  assert.equal(makeLibrarySnapshot({...opts,items:Array(maxLibraryActivities+1).fill(item)}),null);
  const old=makeLibrarySnapshot(opts);opts.items[0].name='Другой текст'; opts.profile.zone='main';
  assert.equal(old.items[0].name,'Выставка');assert.equal(old.zone,'reading');assert.ok(Object.isFrozen(old.items[0]));
});
