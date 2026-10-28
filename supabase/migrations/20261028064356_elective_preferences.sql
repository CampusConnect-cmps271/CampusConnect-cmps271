-- SCRUM-212: private, self-reported elective preferences. No shared schema changes.
begin;
create table public.elective_preferences (
  student_id uuid primary key references auth.users(id) on delete cascade,
  interests text[] not null,
  preferred_workload text not null check (preferred_workload in ('light','moderate','heavy')),
  academic_goals text not null check (char_length(btrim(academic_goals)) between 1 and 1000 and academic_goals !~ '[[:cntrl:]]'),
  completed_course_codes text[] not null default '{}',
  updated_at timestamptz not null default now(),
  check (cardinality(interests) between 1 and 10 and array_ndims(interests) = 1),
  check (cardinality(completed_course_codes) <= 60 and coalesce(array_ndims(completed_course_codes), 1) = 1)
);
alter table public.elective_preferences enable row level security;
revoke all on public.elective_preferences from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.elective_preferences to authenticated;
grant all on public.elective_preferences to service_role;
create policy "Students read their own preferences" on public.elective_preferences
  for select to authenticated using (student_id = (select auth.uid()));
create policy "Students insert their own preferences" on public.elective_preferences
  for insert to authenticated with check (student_id = (select auth.uid()));
create policy "Students update their own preferences" on public.elective_preferences
  for update to authenticated using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy "Students delete their own preferences" on public.elective_preferences
  for delete to authenticated using (student_id = (select auth.uid()));

create function public.validate_elective_preferences() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.interests) v where v is null or char_length(btrim(v)) not between 1 and 60 or v ~ '[[:cntrl:]]') then
    raise exception 'Invalid interest' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(new.completed_course_codes) v
    where v is null or not exists (select 1 from public.courses c where c.code = v)) then
    raise exception 'Unknown completed course code' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end; $$;
revoke all on function public.validate_elective_preferences() from public, anon, authenticated, service_role;
create trigger validate_elective_preferences before insert or update on public.elective_preferences
  for each row execute function public.validate_elective_preferences();
comment on table public.elective_preferences is 'Private elective preferences; completed courses are self-reported, not verified eligibility.';
notify pgrst, 'reload schema';
commit;
