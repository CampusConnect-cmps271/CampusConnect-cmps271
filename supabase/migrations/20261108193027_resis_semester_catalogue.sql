-- SCRUM-242: semester snapshots from Resis. Browser reads never call Resis.
begin;

alter table public.courses add column data_source text not null default 'aub_catalogue'
  check (data_source in ('aub_catalogue', 'resis'));

create table public.resis_semesters (
  id text primary key check (id ~ '^[0-9]{6}$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  university_id integer not null default 1 check (university_id = 1),
  source_updated_at timestamptz,
  active_import_id uuid,
  synced_at timestamptz
);
create table public.resis_imports (
  id uuid primary key default gen_random_uuid(),
  semester_id text not null references public.resis_semesters(id),
  fetched_at timestamptz not null,
  expected_courses integer not null check (expected_courses between 1 and 20000),
  created_at timestamptz not null default now(),
  unique (id, semester_id)
);
alter table public.resis_semesters add constraint resis_active_import_fk
  foreign key (active_import_id, id) references public.resis_imports(id, semester_id);
create index resis_imports_semester_idx on public.resis_imports(semester_id);
create index resis_semesters_active_idx on public.resis_semesters(active_import_id, id);

create table public.course_offerings (
  import_id uuid not null references public.resis_imports(id) on delete cascade,
  course_id uuid not null references public.courses(id),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  credits numeric(5,2) not null check (credits between 0 and 999.99),
  instructors text[] not null default '{}',
  attributes text[] not null default '{}',
  prerequisite_variants text[] not null default '{}',
  sections jsonb not null check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) between 1 and 1000),
  source_updated_at timestamptz,
  primary key (import_id, course_id)
);
create index course_offerings_course_idx on public.course_offerings(course_id, import_id);

alter table public.resis_semesters enable row level security;
alter table public.resis_imports enable row level security;
alter table public.course_offerings enable row level security;
revoke all on public.resis_semesters, public.resis_imports, public.course_offerings
  from public, anon, authenticated, service_role;
grant select on public.resis_semesters, public.course_offerings to authenticated;
grant select, insert, update on public.resis_semesters to service_role;
grant select, insert, delete on public.resis_imports to service_role;
grant select, insert, update, delete on public.course_offerings to service_role;
create policy "Students can read imported semester labels" on public.resis_semesters
  for select to authenticated using (active_import_id is not null);
create policy "Students can read active semester offerings" on public.course_offerings
  for select to authenticated using (exists (
    select 1 from public.resis_semesters s where s.active_import_id = import_id
  ));

-- IDs and all original catalogue text survive reimports, as do reviews/plans.
-- New Resis-only entries explicitly say that a full description is unavailable.
create function public.stage_resis_courses(p_import_id uuid, p_courses jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  if not exists (select 1 from public.resis_imports where id = p_import_id) then
    raise exception 'Unknown import';
  end if;
  if exists (select 1 from public.resis_semesters where active_import_id = p_import_id) then
    raise exception 'Active snapshots are immutable';
  end if;
  if jsonb_typeof(p_courses) <> 'array' or jsonb_array_length(p_courses) not between 1 and 100 then
    raise exception 'Supply 1 to 100 validated courses';
  end if;
  insert into public.courses (code, name, description, credits, department, prerequisites, data_source)
  select x.code, x.title,
    'A full catalogue description is not available yet. Semester offering information is provided by Resis.',
    x.credits,
    coalesce((select c.department from public.courses c
      where split_part(c.code, ' ', 1) = split_part(x.code, ' ', 1)
      group by c.department order by count(*) desc, c.department limit 1), split_part(x.code, ' ', 1)),
    'Catalogue requirements are not yet verified. Check the semester-specific section rules and AUB SIS.',
    'resis'
  from jsonb_to_recordset(p_courses) as x(code text, title text, credits numeric, prerequisite_variants text[])
  on conflict (code) do nothing;

  insert into public.course_offerings
    (import_id, course_id, title, credits, instructors, attributes, prerequisite_variants, sections, source_updated_at)
  select p_import_id, c.id, x.title, x.credits, x.instructors, x.attributes,
    x.prerequisite_variants, x.sections, x.source_updated_at
  from jsonb_to_recordset(p_courses) as x(code text, title text, credits numeric,
    instructors text[], attributes text[], prerequisite_variants text[], sections jsonb, source_updated_at timestamptz)
  join public.courses c on c.code = x.code
  on conflict (import_id, course_id) do update set
    title = excluded.title, credits = excluded.credits, instructors = excluded.instructors,
    attributes = excluded.attributes, prerequisite_variants = excluded.prerequisite_variants,
    sections = excluded.sections, source_updated_at = excluded.source_updated_at;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- One pointer swap publishes a complete dataset; an interrupted import never
-- replaces the student's previously readable semester snapshot.
create function public.activate_resis_import(p_import_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare batch public.resis_imports; actual integer; previous timestamptz;
begin
  select * into strict batch from public.resis_imports where id = p_import_id;
  perform pg_advisory_xact_lock(hashtext('resis:' || batch.semester_id));
  select i.fetched_at into previous from public.resis_semesters s
    join public.resis_imports i on i.id = s.active_import_id where s.id = batch.semester_id;
  if previous > batch.fetched_at then raise exception 'A newer snapshot is already active'; end if;
  select count(*) into actual from public.course_offerings where import_id = p_import_id;
  if actual <> batch.expected_courses then raise exception 'Incomplete semester snapshot'; end if;
  update public.resis_semesters set active_import_id = p_import_id, synced_at = batch.fetched_at
    where id = batch.semester_id;
  return actual;
end;
$$;
revoke all on function public.stage_resis_courses(uuid,jsonb), public.activate_resis_import(uuid)
  from public, anon, authenticated;
grant execute on function public.stage_resis_courses(uuid,jsonb), public.activate_resis_import(uuid) to service_role;

create view public.course_semester_catalogue with (security_invoker = true) as
select c.id,c.code,c.name,o.credits,c.description,c.department,c.prerequisites,c.data_source,
  s.id as semester_id,s.name as semester_name,s.synced_at,
  o.title as semester_title,o.instructors,o.attributes,o.prerequisite_variants,o.sections,o.source_updated_at,
  a.review_count,
  case when a.review_count >= 3 then round(a.average_difficulty,1) end as difficulty,
  case when a.review_count >= 3 then round(a.average_workload,1) end as workload
from public.resis_semesters s
join public.course_offerings o on o.import_id = s.active_import_id
join public.courses c on c.id = o.course_id
left join public.course_rating_averages a on a.course_id = c.id;
revoke all on public.course_semester_catalogue from public,anon,authenticated,service_role;
grant select on public.course_semester_catalogue to authenticated,service_role;
notify pgrst, 'reload schema';
commit;
