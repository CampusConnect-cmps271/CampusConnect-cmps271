import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export async function benchmarkDatabase(fixture, snapshots = []) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;`);
  const migration = async name => db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));
  await migration("20261017091812_create_courses.sql");
  await db.exec(`create table public.perf_ratings(course_id uuid primary key,review_count bigint,average_difficulty numeric,average_workload numeric,average_overall numeric);
    grant select on public.perf_ratings to authenticated,service_role;
    create view public.course_rating_averages with(security_invoker=true) as select c.id as course_id,
      coalesce(r.review_count,0)::bigint as review_count,r.average_difficulty,r.average_workload,r.average_overall
      from public.courses c left join public.perf_ratings r on r.course_id=c.id;
    grant select on public.course_rating_averages to authenticated,service_role;`);
  await migration("20261108193027_resis_semester_catalogue.sql");
  await db.query(`insert into public.courses(id,code,name,description,department,prerequisites,credits)
    select id,code,name,description,department,prerequisites,credits from jsonb_to_recordset($1::jsonb)
    as c(id uuid,code text,name text,description text,department text,prerequisites text,credits numeric)`, [JSON.stringify(fixture.courses)]);
  if (fixture.ratings?.length) await db.query(`insert into public.perf_ratings
    select course_id,review_count,average_difficulty,average_workload,average_overall from jsonb_to_recordset($1::jsonb)
    as r(course_id uuid,review_count bigint,average_difficulty numeric,average_workload numeric,average_overall numeric)`, [JSON.stringify(fixture.ratings)]);
  for (const snapshot of snapshots) {
    await db.query("insert into public.resis_semesters(id,name) values ($1,$2)",[snapshot.semester.id,snapshot.semester.name]);
    await db.query("insert into public.resis_imports(id,semester_id,fetched_at,expected_courses) values($1,$2,$3,$4)", [snapshot.id,snapshot.semester.id,snapshot.fetched_at,snapshot.courses.length]);
    for (let start=0; start<snapshot.courses.length; start+=100) await db.query("select public.stage_resis_courses($1,$2::jsonb)",[snapshot.id,JSON.stringify(snapshot.courses.slice(start,start+100))]);
    await db.query("select public.activate_resis_import($1)",[snapshot.id]);
  }
  await migration("20261112162408_elective_candidate_queries.sql");
  await migration("20261112162835_elective_candidate_query_cost.sql");
  await db.exec("set role authenticated");
  return db;
}
export function databaseClient(db, latency = 0) {
  const stats = { requests: 0, bytes: 0, dbMs: 0 };
  async function read(operation) {
    stats.requests++; const started = performance.now();
    const data = await operation(); stats.dbMs += performance.now() - started;
    stats.bytes += Buffer.byteLength(JSON.stringify(data));
    if (latency) await new Promise(resolve => setTimeout(resolve,latency));
    return { data, error: null };
  }
  return { stats, reset() { stats.requests=0; stats.bytes=0; stats.dbMs=0; },
    rpc: (_name,args) => read(async () => (await db.query("select public.elective_candidate_page($1::jsonb,$2::jsonb,$3,$4) as result",[JSON.stringify(args.p_groups),JSON.stringify(args.p_filters),args.p_offset,args.p_limit])).rows[0].result),
    from(table) { let columns,semester; const builder = {
      select(value) { columns=value; return builder; },
      eq(_column,value) { semester=value; return builder; },
      order() { return builder; },
      range(start,end) { return read(async () => (await db.query(`select ${columns} from public.${table} ${semester ? 'where semester_id=$3' : ''} order by code offset $1 limit $2`, semester ? [start,end-start+1,semester] : [start,end-start+1])).rows); },
      in(_column,ids) { return read(async () => (await db.query(`select ${columns} from public.course_rating_averages where course_id=any($1::uuid[])`,[ids])).rows); },
    }; return builder; },
  };
}
