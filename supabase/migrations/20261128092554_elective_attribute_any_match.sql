-- Add opt-in OR matching; omitted mode preserves existing saved preferences.
begin;
create or replace function public.elective_section_matches(section jsonb, filters jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select
    (not (filters ? 'instructors') or jsonb_array_length(filters->'instructors') = 0 or exists (
      select 1 from jsonb_array_elements_text(filters->'instructors') wanted,
        jsonb_array_elements_text(section->'instructors') actual
      where lower(btrim(regexp_replace(wanted.value, '\s*\(P\)\s*$', ''))) =
            lower(btrim(regexp_replace(actual.value, '\s*\(P\)\s*$', '')))
    ))
    and (
      coalesce(jsonb_array_length(filters->'attributes'),0) = 0
      or case when filters->>'attribute_match' = 'any' then exists (
        select 1 from jsonb_array_elements_text(filters->'attributes') wanted,
          jsonb_array_elements_text(section->'attributes') actual
        where lower(btrim(regexp_replace(wanted.value, '\s*\(P\)\s*$', ''))) =
              lower(btrim(regexp_replace(actual.value, '\s*\(P\)\s*$', '')))
      ) else not exists (
        select 1 from jsonb_array_elements_text(filters->'attributes') wanted
        where not exists (select 1 from jsonb_array_elements_text(section->'attributes') actual
          where lower(btrim(regexp_replace(wanted.value, '\s*\(P\)\s*$', ''))) =
                lower(btrim(regexp_replace(actual.value, '\s*\(P\)\s*$', ''))))
      ) end
    )
    and (
      (coalesce(jsonb_array_length(filters->'meeting_days'),0) = 0
        and not (filters ? 'earliest_start') and not (filters ? 'latest_end'))
      or (jsonb_array_length(section->'sessions') > 0 and not exists (
        select 1 from jsonb_array_elements(section->'sessions') meeting
        where (coalesce(jsonb_array_length(filters->'meeting_days'),0) > 0 and (
          coalesce(regexp_replace(meeting->>'days','\s','','g'),'') !~ '^[MTWRFSU]+$'
          or exists (select 1 from regexp_split_to_table(regexp_replace(meeting->>'days','\s','','g'),'') day
            where not (filters->'meeting_days' ? day))
        )) or ((filters ? 'earliest_start' or filters ? 'latest_end') and (
          coalesce(meeting->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          or coalesce(meeting->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          or meeting->>'start' >= meeting->>'end'
          or (filters ? 'earliest_start' and meeting->>'start' < filters->>'earliest_start')
          or (filters ? 'latest_end' and meeting->>'end' > filters->>'latest_end')
        ))
      ))
    );
$$;
revoke all on function public.elective_section_matches(jsonb,jsonb) from public,anon;
grant execute on function public.elective_section_matches(jsonb,jsonb) to authenticated,service_role;


create or replace function public.validate_elective_offering_preferences() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare p jsonb := new.offering_preferences; field text; item jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Invalid offering preferences' using errcode = '23514'; end if;
  if p = '{}'::jsonb then return new; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in
    ('semester_id','instructors','attributes','attribute_match','meeting_days','earliest_start','latest_end')) then
    raise exception 'Unknown offering preference' using errcode = '23514';
  end if;
  if jsonb_typeof(p->'semester_id') is distinct from 'string'
    or (p->>'semester_id') !~ '^[0-9]{6}$'
    or not exists (select 1 from public.resis_semesters s where s.id = p->>'semester_id' and s.active_import_id is not null) then
    raise exception 'Choose an imported semester' using errcode = '23514';
  end if;
  if p ? 'attribute_match' and (jsonb_typeof(p->'attribute_match') <> 'string' or p->>'attribute_match' not in ('any','all')) then
    raise exception 'Invalid attribute match mode' using errcode = '23514';
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

notify pgrst, 'reload schema';
commit;
