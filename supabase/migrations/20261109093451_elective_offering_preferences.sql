-- Optional private filters over already-imported Resis data. No external API calls.
begin;
alter table public.elective_preferences add column offering_preferences jsonb not null default '{}'
  check (jsonb_typeof(offering_preferences) = 'object' and octet_length(offering_preferences::text) <= 32768);

create function public.validate_elective_offering_preferences() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare p jsonb := new.offering_preferences; field text; item jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Invalid offering preferences' using errcode = '23514'; end if;
  if p = '{}'::jsonb then return new; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in
    ('semester_id','instructors','attributes','meeting_days','earliest_start','latest_end')) then
    raise exception 'Unknown offering preference' using errcode = '23514';
  end if;
  if jsonb_typeof(p->'semester_id') is distinct from 'string'
    or (p->>'semester_id') !~ '^[0-9]{6}$'
    or not exists (select 1 from public.resis_semesters s where s.id = p->>'semester_id' and s.active_import_id is not null) then
    raise exception 'Choose an imported semester' using errcode = '23514';
  end if;
  foreach field in array array['instructors','attributes','meeting_days'] loop
    if p ? field then
      if jsonb_typeof(p->field) <> 'array' then raise exception 'Invalid offering list' using errcode = '23514'; end if;
      if jsonb_array_length(p->field) > (case when field = 'meeting_days' then 7 else 10 end) then
        raise exception 'Too many offering choices' using errcode = '23514';
      end if;
      for item in select value from jsonb_array_elements(p->field) loop
        if jsonb_typeof(item) <> 'string' or char_length(btrim(item #>> '{}')) not between 1 and 300
          or (item #>> '{}') ~ '[[:cntrl:]]' then raise exception 'Invalid offering choice' using errcode = '23514'; end if;
        if field = 'meeting_days' and (item #>> '{}') not in ('M','T','W','R','F','S','U') then
          raise exception 'Invalid meeting day' using errcode = '23514';
        end if;
      end loop;
    end if;
  end loop;
  foreach field in array array['earliest_start','latest_end'] loop
    if p ? field and (jsonb_typeof(p->field) <> 'string' or (p->>field) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
      raise exception 'Invalid meeting time' using errcode = '23514';
    end if;
  end loop;
  if p ? 'earliest_start' and p ? 'latest_end' and p->>'earliest_start' >= p->>'latest_end' then
    raise exception 'Earliest start must be before latest end' using errcode = '23514';
  end if;
  return new;
end; $$;
revoke all on function public.validate_elective_offering_preferences() from public,anon,authenticated,service_role;
create trigger validate_elective_offering_preferences before insert or update of offering_preferences
  on public.elective_preferences for each row execute function public.validate_elective_offering_preferences();
comment on column public.elective_preferences.offering_preferences is
  'Private optional semester, instructor, attribute and schedule filters. Applied to one saved section at a time; never calls Resis.';
notify pgrst, 'reload schema';
commit;
