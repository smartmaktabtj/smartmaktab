import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const account = n => `bb000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org = n => `aa000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
before(async () => {
  // Emulate the Auth database contract and Supabase's existing broad default grants.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;`);
  await db.exec(await read('../supabase/migrations/20261124000100_dev_read_only.sql'));
  for (const [index, prefix] of ['staff-a','director-b','deputy-a','authority-a','developer','no-membership','admin-a'].entries()) {
    await db.query('insert into auth.users values ($1,$2,now())', [account(index+1), `${prefix}@example.test`]);
  }
  await db.exec(await read('../supabase/dev_fixture.sql'));
  await db.query("insert into public.school_memberships(user_id,organization_id,role) values ($1,$2,'school_admin')",[account(7),org(3)]);
});
after(() => db.close());
async function as(role, n, fn) {
  await db.exec(`set role ${role}`);
  try {
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:n ? account(n) : undefined, role, user_metadata:{platform_role:'developer'}, app_metadata:{platform_role:'developer'}})]);
    await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claims','{}',false)");
  }
}
const rows = async (sql, args) => (await db.query(sql,args)).rows;
const denied = promise => assert.rejects(promise, {code:'42501'});
for (const [n, name, schools, records, memberships, audit] of [
  [1,'staff',[3],1,1,false], [2,'director',[4],1,1,false], [3,'deputy',[3],1,1,false],
  [4,'authority',[1,3,5],2,1,false], [5,'developer',[1,2,3,4,5],4,5,true],
  [6,'no membership',[],0,0,false], [7,'school admin',[3],1,1,false]
]) {
  test(`RLS: ${name} sees only allowed scopes and columns`, () => as('authenticated',n,async () => {
    assert.deepEqual((await rows('select id from public.organizations order by id')).map(r=>r.id), schools.map(org));
    assert.equal((await rows('select id from public.school_records')).length, records);
    assert.equal((await rows('select id from public.school_memberships')).length, memberships);
    assert.deepEqual(await rows('select id from public.school_records where organization_id=$1', [org(2)]), []);
    assert.equal((await rows('select id from public.school_records where organization_id=$1',[org(4)])).length, [2,5].includes(n) ? 1:0);
    assert.equal((await rows('select id from public.school_records where deleted_at is not null')).length, n===5 ? 1:0);
    assert.equal((await rows('select id from public.audit_events')).length, audit ? 15:0);
    await denied(rows('select payload from public.school_records'));
    await denied(rows('select * from smartmaktab_private.platform_developers'));
  }));
}
test('anon and service_role have no Data API access to app tables', async () => {
  for (const role of ['anon','service_role']) await as(role,0, async () => {
    for (const table of ['organizations','school_records','school_memberships','audit_events']) {
      await denied(rows(`select id from public.${table}`));
    }
    await denied(rows('select smartmaktab_private.is_developer()'));
  });
});
test('client roles cannot write records, assign roles, alter organization or modify audit', async () => {
  for (const n of [1,2,3,4,5,6,7]) await as('authenticated',n,async () => {
    for (const sql of [
      "insert into public.school_records(organization_id, record_type, title) values ($1, 'plan', 'synthetic')",
      "update public.school_records set title='synthetic' where organization_id=$1",
      "delete from public.school_records where organization_id=$1",
      "update public.school_memberships set role='director' where organization_id=$1",
      "update public.organizations set parent_id=null where id=$1",
      "update public.audit_events set action='DELETE' where organization_id=$1",
      "delete from public.audit_events where organization_id=$1",
      "insert into public.audit_events (organization_id, db_role, action, table_name, record_id) values ($1,'synthetic','INSERT','public.school_records',$1)"
    ]) await denied(rows(sql, [org(3)]));
  });
});
test('trusted edits produce audit; role revocation checked against DB with same token', async () => {
  await db.query("update public.school_records set title='synthetic edit' where organization_id=$1 and deleted_at is null",[org(3)]);
  await db.query('delete from smartmaktab_private.platform_developers where user_id=$1',[account(5)]);
  assert.deepEqual((await rows('select action, table_name from public.audit_events order by id desc limit 2')), [
    {action:'DELETE',table_name:'smartmaktab_private.platform_developers'}, {action:'UPDATE',table_name:'public.school_records'}]);
  await as('authenticated',5,async()=>assert.deepEqual(await rows('select id from public.organizations'), []));
});
test('constraints reject invalid parent, membership and record tenancy', async () => {
  await assert.rejects(rows("insert into public.organizations (name,kind,parent_id) values ('test','school',$1)",[org(3)]),{code:'23503'});
  await assert.rejects(rows("insert into public.school_memberships (user_id,organization_id,role) values ($1,$2,'authority_viewer')",[account(6),org(3)]),{code:'23503'});
  await assert.rejects(rows("insert into public.school_records (organization_id,record_type,title) values ($1,'plan','test')",[org(1)]),{code:'23503'});
});
