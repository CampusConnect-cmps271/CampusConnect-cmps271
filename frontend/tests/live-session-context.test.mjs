import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, after, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const sid = '10000000-0000-4000-8000-000000000001';
const otherSid = '10000000-0000-4000-8000-000000000002';
const claims = () => ({ sub:a, session_id:sid, role:'authenticated', aud:'authenticated', exp:Math.floor(Date.now()/1000)+3600 });
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth,public to authenticated,anon;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,is_anonymous boolean,raw_user_meta_data jsonb);
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create table public.profiles(id uuid primary key,full_name text);
    alter table public.profiles enable row level security;
    create policy own_profile on public.profiles for select to authenticated using(id=(select auth.uid()));
    grant select on public.profiles to authenticated;
    insert into auth.users values('${a}','one@example.test',now(),null,null,false,'{"full_name":"Registered One","email_verified":true}'),('${b}','two@example.test',now(),null,null,false,'{}');
    insert into auth.sessions values('${sid}','${a}',null),('${otherSid}','${b}',null);
    insert into public.profiles values('${a}','Profile One'),('${b}','Profile Two');`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261127145452_live_session_context.sql',import.meta.url),'utf8'));
});
after(async () => db?.close());
async function read(overrides={}) {
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({...claims(),...overrides})]);
  await db.exec('set role authenticated');
  try { return (await db.query('select public.get_my_session_context() as result')).rows[0].result; }
  finally { await db.exec('reset role'); }
}
async function changed(sql, check) {
  await db.exec('begin');
  try { await db.exec(sql); await check(); }
  finally { await db.exec('reset role;rollback'); }
}
it('returns only the live caller and caller-visible profile, without sensitive Auth fields', async () => {
  assert.deepEqual(await read(), {id:a,email:'one@example.test',confirmed:true,profile_name:'Profile One',metadata_full_name:'Registered One',metadata_name:null});
  assert.equal((await read({sub:b,session_id:otherSid})).profile_name,'Profile Two');
  assert.equal(await read({session_id:otherSid}),null);
});
it('keeps privileged reads private, denies anon/service execution, and exposes an invoker wrapper', async () => {
  for (const role of ['anon','service_role']) {
    await db.exec('set role '+role);
    try { await assert.rejects(db.query('select public.get_my_session_context()'),e=>e.code==='42501'); }
    finally { await db.exec('reset role'); }
  }
  await db.exec('set role authenticated');
  try { await assert.rejects(db.query('select * from auth.users'),e=>e.code==='42501'); }
  finally { await db.exec('reset role'); }
  const {rows} = await db.query("select n.nspname,p.proname,p.prosecdef,p.pronargs,p.proconfig,r.rolname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where p.proname in ('my_live_session_identity','get_my_session_context')");
  assert.equal(rows.length,2);
  for (const row of rows) { assert.equal(row.pronargs,0); assert.ok(row.proconfig.includes('search_path=""')); }
  assert.equal(rows.find(r=>r.nspname==='public').prosecdef,false);
  assert.equal(rows.find(r=>r.nspname==='app_private').prosecdef,true);
  assert.equal(rows.find(r=>r.nspname==='app_private').rolname,'postgres');
});
it('rejects absent, malformed, expired and wrongly scoped claims', async () => {
  for (const override of [{sub:null},{session_id:null},{session_id:'invalid'},{exp:0},{exp:'x'},{exp:null},{role:'anon'},{aud:'other'},{aud:[]},{aud:null}]) assert.equal(await read(override),null);
  assert.equal((await read({aud:['authenticated']})).id,a);
});
it('rejects revoked or expired sessions even with an otherwise valid token', async () => {
  await changed(`delete from auth.sessions where id='${sid}'`,async()=>assert.equal(await read(),null));
  await changed(`update auth.sessions set not_after=now()-interval '1 second' where id='${sid}'`,async()=>assert.equal(await read(),null));
  await changed(`update auth.sessions set not_after=now()+interval '1 hour' where id='${sid}'`,async()=>assert.equal((await read()).id,a));
});
it('rejects banned, deleted and anonymous users from live state', async () => {
  for (const patch of ["banned_until=now()+interval '1 hour'","deleted_at=now()","is_anonymous=true"]) {
    await changed(`update auth.users set ${patch} where id='${a}'`,async()=>assert.equal(await read(),null));
  }
  await changed(`delete from auth.users where id='${a}'`,async()=>assert.equal(await read(),null));
});
it('uses live confirmation rather than editable metadata and skips the profile for unconfirmed users', async () => {
  await changed(`update auth.users set email_confirmed_at=null where id='${a}'`,async()=>{
    const r=await read(); assert.equal(r.confirmed,false); assert.equal(r.profile_name,null);
  });
});
it('preserves profile RLS and handles optional missing or unreadable names',async()=>{
  for (const sql of ["drop policy own_profile on public.profiles",`delete from public.profiles where id='${a}'`,"revoke select on public.profiles from authenticated"]) {
    await changed(sql,async()=>{ const r=await read();assert.equal(r.id,a);assert.equal(r.profile_name,null); });
  }
  await changed(`update public.profiles set full_name='Changed live' where id='${a}'`,async()=>assert.equal((await read()).profile_name,'Changed live'));
});
it('returns only string metadata names and sees live email changes',async()=>{
  await changed(`update auth.users set email='changed@example.test',raw_user_meta_data='{"full_name":123,"name":"Current Name"}' where id='${a}'`,async()=>{
    const r=await read();assert.equal(r.email,'changed@example.test');assert.equal(r.metadata_full_name,null);assert.equal(r.metadata_name,'Current Name');
  });
});
