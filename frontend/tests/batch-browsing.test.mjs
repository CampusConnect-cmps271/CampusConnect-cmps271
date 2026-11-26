import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {before,after,it} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
const migration=n=>readFile(new URL('../../supabase/migrations/'+n,import.meta.url),'utf8');
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';let db;
before(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated,service_role;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
 await db.exec(await migration('20261017091812_create_courses.sql'));
 await db.exec(await migration('20261125121639_optimize_course_departments.sql'));
 await db.exec(`create table public.resis_semesters(id text primary key,name text,synced_at timestamptz);
 insert into public.resis_semesters values('202720','Spring','2026-11-01Z'),('202710','Unfinished',null);
 create view public.course_rating_averages with(security_invoker=true) as select id as course_id,0::bigint as review_count,null::numeric as average_difficulty,null::numeric as average_workload,null::numeric as average_usefulness,null::numeric as average_overall from public.courses;
 grant select on public.course_rating_averages to authenticated;
 create table public.conversation_test_counts(user_id uuid,n integer);
 insert into public.conversation_test_counts values('${a}',2),('${b}',5);
 alter table public.conversation_test_counts enable row level security;
 create policy own_counts on public.conversation_test_counts for select to authenticated using(user_id=(select auth.uid()));
 create function public.count_my_unread_conversations() returns integer language sql stable security invoker set search_path='' as $$select coalesce((select n from public.conversation_test_counts where user_id=(select auth.uid())),0)$$;
 revoke all on function public.count_my_unread_conversations() from public,anon;grant execute on function public.count_my_unread_conversations() to authenticated;
 create table public.notifications(id uuid default gen_random_uuid(),recipient_id uuid,read_at timestamptz);
 alter table public.notifications enable row level security;
 create policy own_notifications on public.notifications for select to authenticated using(recipient_id=(select auth.uid()));
 insert into public.notifications(recipient_id) values('${a}'),('${b}'),('${b}');
 create table public.categories(id integer primary key,name text);insert into public.categories values(1,'General'),(2,'Questions');
 create table public.posts(id uuid primary key,author_id uuid,title text,body text,category text,created_at timestamptz,edited_at timestamptz,status text);
 create table public.post_upvotes(post_id uuid,user_id uuid);
 create table public.post_comments(id uuid default gen_random_uuid(),post_id uuid,author_id uuid,status text);
 alter table public.post_comments enable row level security;
 create policy visible_comments on public.post_comments for select to authenticated using(status='published' or author_id=(select auth.uid()));
 alter table public.posts enable row level security;
 create policy published_posts on public.posts for select to authenticated using(status='published');
 insert into public.courses(code,name,description,credits,department) select 'CMPS '||(100+i),'Computing '||i,'Synthetic description',3,'Computing' from generate_series(1,30)i;
 insert into public.courses(code,name,description,credits,department) values('MATH 201','Math','Synthetic',0,'Mathematics'),('TEST 101','Literal %_\\ text','Synthetic',3,'Testing');
 insert into public.posts select ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${a}','Post '||i,'Body','General','2026-11-01Z'::timestamptz+i*interval '1 minute',null,case when i=31 then 'draft' else 'published' end from generate_series(1,31)i;
 insert into public.post_comments(post_id,author_id,status) select '10000000-0000-4000-8000-000000000030','${a}','published' from generate_series(1,1001);
 insert into public.post_comments(post_id,author_id,status) values('10000000-0000-4000-8000-000000000030','${b}','removed');`);
 await db.exec(await migration('20261011180000_feed_top_sorting.sql'));await db.exec(await migration('20261125164302_batch_browsing_reads.sql'));
});
after(async()=>db?.close());
async function asUser(id,work){await db.exec(`set role authenticated;set request.jwt.claim.sub='${id}'`);try{return await work();}finally{await db.exec('reset role;reset request.jwt.claim.sub');}}
async function rpc(sql,args=[]){return(await db.query(sql,args)).rows[0].result;}
it('denies anonymous execution and retains invoker rights',async()=>{
 await db.exec('set role anon');try{for(const f of ['get_my_header_counts()','browse_course_catalogue()','get_campus_feed_page()'])await assert.rejects(db.query('select public.'+f),e=>e.code==='42501');}finally{await db.exec('reset role');}
 const {rows}=await db.query("select prosecdef,proconfig from pg_proc where proname in ('get_my_header_counts','browse_course_catalogue','get_campus_feed_page')");assert.equal(rows.length,3);assert.ok(rows.every(r=>!r.prosecdef&&r.proconfig.includes('search_path=""')));
});
it('scopes private counters to the caller',async()=>{
 assert.deepEqual(await asUser(a,()=>rpc('select public.get_my_header_counts() as result')),{messages:2,notifications:1});assert.deepEqual(await asUser(b,()=>rpc('select public.get_my_header_counts() as result')),{messages:5,notifications:2});
});
it('counts, clamps stale pages and bundles only page ratings',async()=>{
 const r=await asUser(a,()=>rpc("select public.browse_course_catalogue('CMPS','CMPS','',999,null,null) as result"));assert.equal(r.total,30);assert.equal(r.pages,2);assert.equal(r.page,2);assert.equal(r.courses.length,6);assert.equal(r.ratings.length,6);assert.equal(r.semesters.length,1);assert.ok(r.ratings.every(v=>r.courses.some(c=>c.id===v.course_id)));
});
it('escapes wildcard punctuation and preserves zero-credit bounds',async()=>{
 const r=await asUser(a,()=>rpc('select public.browse_course_catalogue($1,$1) as result',['%_\\']));assert.equal(r.total,1);assert.equal(r.courses[0].code,'TEST 101');
 const z=await asUser(a,()=>rpc("select public.browse_course_catalogue('','','',1,0,0) as result"));assert.equal(z.total,1);assert.equal(z.courses[0].code,'MATH 201');
});
it('handles empty results and rejects invalid resource bounds',async()=>{
 const r=await asUser(a,()=>rpc("select public.browse_course_catalogue('unknown','unknown','',999) as result"));assert.equal(r.total,0);assert.equal(r.page,1);assert.equal(r.pages,1);assert.deepEqual(r.courses,[]);
 for(const sql of ["select public.browse_course_catalogue('','','',10001)","select public.browse_course_catalogue('','','',1,5,3)","select public.get_campus_feed_page(101)"])await asUser(a,()=>assert.rejects(db.query(sql),e=>e.code==='22023'));
});
it('preserves caller RLS in course rows and department metadata',async()=>{
 await db.exec('begin;drop policy "Signed-in students can read the course catalogue" on public.courses;create policy restricted on public.courses for select to authenticated using(department=\'Mathematics\')');
 try{const r=await asUser(a,()=>rpc('select public.browse_course_catalogue() as result'));assert.equal(r.total,1);assert.deepEqual(r.departments,['Mathematics']);}finally{await db.exec('rollback');}
});
it('preserves feed pagination and counts over 1,000 visible comments',async()=>{
 const r=await asUser(a,()=>rpc('select public.get_campus_feed_page() as result'));assert.equal(r.posts.length,20);assert.equal(r.hasMore,true);assert.equal(r.posts[0].id,'10000000-0000-4000-8000-000000000030');assert.equal(r.posts[0].comment_count,1001);
 const p=await asUser(a,()=>rpc('select public.get_campus_feed_page(2) as result'));assert.equal(p.posts.length,10);assert.equal(p.hasMore,false);
 const own=await asUser(b,()=>rpc('select public.get_campus_feed_page() as result'));assert.equal(own.posts[0].comment_count,1002);
});
it('ignores invalid categories and preserves valid empty filters',async()=>{
 const r=await asUser(a,()=>rpc("select public.get_campus_feed_page(1,'newest','invalid') as result"));assert.equal(r.selectedCategory,'');assert.equal(r.posts.length,20);
 const e=await asUser(a,()=>rpc("select public.get_campus_feed_page(1,'newest','Questions') as result"));assert.equal(e.selectedCategory,'Questions');assert.deepEqual(e.posts,[]);
});
