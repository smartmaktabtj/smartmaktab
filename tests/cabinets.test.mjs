import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const rows=JSON.parse(await read('shared/cabinet-registry.json'));

test('each planned cabinet is an individual document with its own identity',async()=>{
  assert.equal(rows.length,54);
  assert.equal(new Set(rows.map(row=>row.path)).size,54);
  assert.equal(new Set(rows.map(row=>row.id)).size,54);
  for(const [group,count] of Object.entries({school:20,advisers:20,subjects:11,office:2,raesat:1})) assert.equal(rows.filter(row=>row.group===group).length,count);
  for(const row of rows){
    assert.match(row.path,/^cabinets\/(?:[a-z-]+\/)*[a-z-]+\.html$/);
    const html=await read(row.path);
    assert.ok(html.includes(`data-cabinet-id="${row.id}"`),row.path);
    assert.ok(html.includes(`<h1 class="crumb">${row.title}</h1>`),row.path);
    assert.doesNotMatch(html,/<aside class="rail">/);
    assert.doesNotMatch(html,/<div class="hero">/);
    assert.doesNotMatch(html,/<a[^>]+href="[^"]*onboarding\/index\.html/);
  }
  const school=rows.filter(row=>row.group==='school');
  assert.deepEqual(school.slice(4,6).map(row=>row.title),['Муовини ҳарбӣ','Созмон']);
  assert.deepEqual(school.slice(13,15).map(row=>row.title),['Роҳбари синф','Раиси Шӯрои духтарон']);
  assert.deepEqual(rows.filter(row=>row.group==='advisers').map(row=>row.schoolCounterpart),school.map(row=>row.id.replace('school-','')));
});

test('all 54 HTML files have a profile, institution picker, and clean header controls without rail or DOCX template clutter',async()=>{
 const labels=new Set();
 for(const role of rows){
  const html=await read(role.path);assert.match(html,/id="institutionSearch"/);assert.match(html,/id="workspaceSchool"/);
  assert.match(html,/class="brand top-brand"/);
  assert.match(html,/id="institutionPicker" hidden/);
  assert.doesNotMatch(html,/id="cabinetRailToggle"|id="workspaceDocs"|id="workspaceMaterials"|id="workspaceOverview"|id="teacherDocumentPanel"/);
  if(role.id==='school-director')assert.match(html,/id="directorPersonnel"/);
  else{
   const match=html.match(/<label class="field"><span data-tg="[^"]+">([^<]+)<\/span><input data-intake-field="work-1" maxlength="120" required/);
   const title=match?.[1]??html.match(/<strong><span data-tg="[^"]+">([^<]+)<\/span><\/strong><div data-role-class=/)?.[1];
   assert.ok(title,role.id);assert.ok(!labels.has(title),role.id);labels.add(title);
  }
 }
 assert.equal(labels.size,53);
});
