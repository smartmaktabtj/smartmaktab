import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const read = path => readFile(new URL(path,import.meta.url),'utf8');
const account = n => `bb000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const schoolA = 'aa000000-0000-4000-8000-000000000003';
const schoolB = 'aa000000-0000-4000-8000-000000000004';
const q = async (query,args) => (await db.query(query,args)).rows;
async function as(n, fn, role='authenticated') {
  await db.exec(`set role ${role}`);
  try {
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:n ? account(n) : undefined, user_metadata:{role:'director'}, app_metadata:{platform_role:'developer'}})]);
    return await fn();
  } finally { await db.exec("reset role; select set_config('request.jwt.claims','{}',false)"); }
}
const submit = async (n,title,key=crypto.randomUUID(),org=schoolA) => as(n,async()=>
  (await q('select public.submit_plan_creation($1,$2,$3) as id',[org,title,key]))[0].id);
const decide = async (n,id,approve,org=schoolA) => as(n,async()=>
  (await q('select public.decide_plan_creation($1,$2,$3) as result',[org,id,approve]))[0].result);
const pending = (id)=>q('select id from public.plan_creation_requests where id=$1',[id]);
const denied = promise => assert.rejects(promise,{code:'42501'});

before(async()=>{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
    create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'sub')::uuid
    $$;
    grant usage on schema auth to anon,authenticated,service_role;`);
  await db.exec(await read('../supabase/migrations/20261124000100_dev_read_only.sql'));
  for (const [i,name] of ['staff-a','deputy-a','director-a','director-b','authority-a','developer','no-membership','temporary-a','school-admin'].entries()) {
    await q('insert into auth.users values ($1,$2,now())',[account(i+1),`${name}@example.test`]);
  }
  await db.exec(await read('../supabase/dev_fixture.sql'));
  await db.exec(await read('../supabase/experiments/plan_approval.sql'));
  await db.exec(await read('../supabase/experiments/plan_approval_fixture.sql'));
  await q("insert into public.school_memberships(user_id,organization_id,role) values ($1,$3,'staff'),($2,$3,'school_admin')",[account(8),account(9),schoolA]);
});
after(()=>db.close());

test('only members with approved prototype roles submit; request is visible only to author and assigned director',async()=>{
  const id = await submit(1,'  Synthetic visible plan  ');
  for (const n of [1,3]) assert.deepEqual(await as(n,()=>pending(id)),[{id}]);
  for (const n of [2,4,5,6,7,9]) assert.deepEqual(await as(n,()=>pending(id)),[]);
  assert.deepEqual(await as(1,()=>q('select title,status,requested_by,decided_by from public.plan_creation_requests where id=$1',[id])),
    [{title:'Synthetic visible plan',status:'pending',requested_by:account(1),decided_by:null}]);
  assert.deepEqual(await q("select id from public.school_records where title='Synthetic visible plan'"),[]);
  for (const n of [3,4,5,6,7,9]) await denied(submit(n,'Forbidden submit'));
  await denied(submit(1,'Wrong school',crypto.randomUUID(),schoolB));
});

test('anon, service_role and all client users lack direct write privileges',async()=>{
  for (const role of ['anon','service_role']) await as(1, async()=>{
    await denied(q('select id from public.plan_creation_requests'));
    await denied(q("select public.submit_plan_creation($1,'Synthetic',gen_random_uuid())",[schoolA]));
    await denied(q('select public.decide_plan_creation($1,gen_random_uuid(),true)',[schoolA]));
  },role);
  for (const n of [1,3,6]) await as(n,async()=>{
    await denied(q("insert into public.plan_creation_requests(organization_id,requested_by,client_request_id,title) values ($1,$2,gen_random_uuid(),'wrong')",[schoolA,account(n)]));
    await denied(q("update public.plan_creation_requests set title='changed' where organization_id=$1",[schoolA]));
    await denied(q('delete from public.plan_creation_requests where organization_id=$1',[schoolA]));
    await denied(q('select client_request_id from public.plan_creation_requests'));
    await denied(q("insert into public.school_records(organization_id,record_type,title) values ($1,'plan','wrong')",[schoolA]));
  });
});

test('input validation and idempotent replay cannot overwrite the original proposal',async()=>{
  for (const title of [null,'   ','Bad\nTitle','x'.repeat(241)]) await assert.rejects(submit(1,title),{code:'22023'});
  await assert.rejects(submit(1,'valid',null),{code:'22023'});
  const key = crypto.randomUUID();
  const id = await submit(1,'Synthetic replay',key);
  assert.equal(await submit(1,'  Synthetic replay ',key),id);
  await assert.rejects(submit(1,'Changed replay',key),{code:'23505'});
  assert.equal((await q('select title from public.plan_creation_requests where id=$1',[id]))[0].title,'Synthetic replay');
  const events = await q('select action from public.audit_events where record_id=$1',[id]);
  assert.deepEqual(events,[{action:'INSERT'}]);
});

test('director of the same school approves atomically; no cross-school decision or duplicate record',async()=>{
  const id = await submit(2,'Synthetic approved plan');
  for (const n of [1,2,4,5,6,7,9]) await denied(decide(n,id,true));
  await denied(decide(4,id,true,schoolB));
  await denied(decide(3,crypto.randomUUID(),true));
  await assert.rejects(decide(3,id,null),{code:'22023'});
  const result = await decide(3,id,true);
  assert.equal(result.status,'approved');
  assert.deepEqual(await decide(3,id,true),result);
  await assert.rejects(decide(3,id,false),{code:'23505'});
  assert.deepEqual(await q("select id,organization_id,record_type,title from public.school_records where title='Synthetic approved plan'"),
    [{id:result.record_id,organization_id:schoolA,record_type:'plan',title:'Synthetic approved plan'}]);
  assert.deepEqual(await q('select action,actor_id from public.audit_events where record_id=$1 or record_id=$2 order by id',[id,result.record_id]),
    [{action:'INSERT',actor_id:account(2)},{action:'INSERT',actor_id:account(3)},{action:'UPDATE',actor_id:account(3)}]);
});

test('reject creates no record; removed membership or promotion cannot be used for self-approval',async()=>{
  const id = await submit(8,'Synthetic rejected plan');
  const self = await submit(8,'Synthetic self approval');
  await q("update public.school_memberships set role='director' where user_id=$1",[account(8)]);
  await denied(decide(8,self,true));
  await denied(decide(8,self,false));
  await q('delete from public.school_memberships where user_id=$1',[account(8)]);
  assert.deepEqual(await as(8,()=>pending(id)),[]);
  await denied(decide(3,id,true));
  const result = await decide(3,id,false);
  assert.deepEqual(result,{request_id:id,status:'rejected',record_id:null});
  assert.deepEqual(await decide(3,id,false),result);
  assert.deepEqual(await q("select id from public.school_records where title='Synthetic rejected plan'"),[]);
});

test('failed record insertion rolls the decision and audit back',async()=>{
  const id = await submit(1,'Synthetic forced rollback');
  await db.exec("alter table public.school_records add constraint test_insert_failure check (title <> 'Synthetic forced rollback');");
  try {
    await assert.rejects(decide(3,id,true),{code:'23514'});
    assert.deepEqual(await q('select status,record_id from public.plan_creation_requests where id=$1',[id]),[{status:'pending',record_id:null}]);
    assert.deepEqual(await q('select action from public.audit_events where record_id=$1',[id]),[{action:'INSERT'}]);
  } finally { await db.exec('alter table public.school_records drop constraint test_insert_failure'); }
});

test('pausing RPC keeps existing requests, plans, audit and read access',async()=>{
  const id = await submit(1,'Synthetic pause check');
  const result = await decide(3,id,true);
  const snapshot = await q('select id,action from public.audit_events where record_id=$1 or record_id=$2 order by id',[id,result.record_id]);
  await db.exec(await read('../supabase/experiments/pause_plan_approval.sql'));
  await denied(submit(1,'Synthetic post-pause request'));
  await denied(decide(3,id,true));
  assert.deepEqual(await as(1,()=>pending(id)),[{id}]);
  assert.deepEqual(await q('select id from public.school_records where id=$1',[result.record_id]),[{id:result.record_id}]);
  assert.deepEqual(await q('select id,action from public.audit_events where record_id=$1 or record_id=$2 order by id',[id,result.record_id]),snapshot);
});
