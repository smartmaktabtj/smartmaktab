import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const uid=n=>`f0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=n=>`e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [a,b,officeA,officeB,territory]=[1,2,3,4,5].map(org);
test('synthetic RLS: cross-school isolation, no direct drafts, versioned review, idempotency and territorial aggregate',async()=>{
 const db=new PGlite(),q=(s,p=[])=>db.query(s,p).then(r=>r.rows);
 const denied=p=>assert.rejects(p,{code:'42501'});
 async function as(n,fn,role='authenticated'){
  await db.exec(`set role ${role}`);
  try{await q("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(n?{sub:uid(n),user_metadata:{role:'director'}}:{})]);return await fn();}
  finally{await db.exec("reset role; select set_config('request.jwt.claims','{}',false)");}
 }
 const request=(n,action,{school=a,row=null,stats=[null,null,null,null],reason=null,key=crypto.randomUUID()}={})=>as(n,()=>q('select public.update_school_summary($1,$2,2026,\'q1\',$3,$4,$5,$6,$7,$8,$9) as id',[key,school,action,row,...stats,reason]).then(r=>r[0].id));
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
   alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
   create schema auth; create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid $$;
   grant usage on schema auth to anon,authenticated,service_role;`);
  for(const path of ['../supabase/migrations/20261124000100_dev_read_only.sql','../supabase/experiments/summary_review.sql'])await db.exec(await readFile(new URL(path,import.meta.url),'utf8'));
  for(let i=1;i<=6;i++)await q('insert into auth.users values($1)',[uid(i)]);
  for(const [id,kind,name] of [[a,'school','A'],[b,'school','B'],[officeA,'education_authority','Authority A'],[officeB,'education_authority','Authority B'],[territory,'education_authority','Region']])await q('insert into public.organizations(id,kind,name) values($1,$2,$3)',[id,kind,name]);
  for(const [n,id,role] of [[1,a,'director'],[2,b,'director'],[3,officeA,'authority_viewer'],[4,officeB,'authority_viewer'],[5,territory,'authority_viewer'],[6,a,'staff']])await q('insert into public.school_memberships(user_id,organization_id,role) values($1,$2,$3)',[uid(n),id,role]);
  for(const [school,authority,level] of [[a,officeA,'maorif'],[b,officeB,'maorif'],[a,territory,'raesat']])await q('insert into smartmaktab_private.summary_scope(school_id,authority_id,level) values($1,$2,$3)',[school,authority,level]);
  for(const n of [2,3,4,5,6])await denied(request(n,'draft',{stats:[20,19,17,10]}));
  const key=crypto.randomUUID(),draft=await request(1,'draft',{stats:[20,19,17,10],key});
  assert.equal(await request(1,'draft',{stats:[20,19,17,10],key}),draft);
  await assert.rejects(request(1,'draft',{stats:[21,19,17,10],key}),{code:'22023'});
  await denied(as(1,()=>q("update public.school_summary_revisions set status='approved' where id=$1",[draft])));
  const status=()=>q('select id,status,version from public.school_summary_revisions order by version');
  for(const n of [2,3,4,5,6])assert.deepEqual(await as(n,status),[]);
  await assert.rejects(request(3,'approve',{row:draft}),{code:'55000'});
  await request(1,'submit',{row:draft});assert.equal((await as(3,status))[0].status,'submitted');
  await denied(request(4,'approve',{row:draft}));await denied(request(5,'approve',{row:draft}));
  assert.deepEqual(await as(5,status),[]);
  await request(3,'return',{row:draft,reason:'verify_totals'});
  const revised=await request(1,'draft',{row:draft,stats:[20,19,17,11]});assert.notEqual(draft,revised);
  const receipt=crypto.randomUUID();await request(1,'submit',{row:revised});assert.equal(await request(3,'approve',{row:revised,key:receipt}),revised);
  assert.equal(await request(3,'approve',{row:revised,key:receipt}),revised);
  const report=()=>q("select * from public.territory_summary($1,2026,'q1')",[territory]);
  assert.deepEqual(await as(5,report),[{schools:1,enrolled:20,assessed:19,passed:17,quality:11}]);assert.deepEqual(await as(5,status),[]);await denied(as(4,report));await denied(as(null,report,'anon'));
  await q('delete from public.school_memberships where user_id=$1',[uid(3)]);assert.deepEqual(await as(3,status),[]);
  await denied(request(3,'approve',{row:revised,key:receipt}));
 }finally{await db.close();}
});
