begin;
-- Keep intermediate rows narrow to avoid spilling section JSON to temporary files.
-- These small bounded queries do not benefit from per-call JIT compilation.
create or replace function public.elective_candidate_page(
  p_groups jsonb default '[]', p_filters jsonb default '{}',
  p_offset integer default 0, p_limit integer default 1000
) returns jsonb language plpgsql stable security invoker set search_path = '' set jit = off as $$
begin
  if p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) > 300
     or p_filters is null or jsonb_typeof(p_filters) <> 'object'
     or octet_length(p_groups::text) + octet_length(p_filters::text) > 32768
     or p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Invalid candidate query' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_groups) g where jsonb_typeof(g) <> 'array') then
    raise exception 'Invalid interest groups' using errcode='22023';
  end if;
  return (
    with source as not materialized (
      select c.id,c.code,c.name,c.description,c.department,c.prerequisites,c.credits,
        null::text as semester_id,null::text as semester_name,null::timestamptz as synced_at,null::jsonb as sections
      from public.courses c where not (p_filters ? 'semester_id')
      union all
      select c.id,c.code,c.name,c.description,c.department,c.prerequisites,c.credits,
        c.semester_id,c.semester_name,c.synced_at,c.sections
      from public.course_semester_catalogue c where c.semester_id = p_filters->>'semester_id'
    ), groups as materialized (
      select coalesce(array(select value from jsonb_array_elements_text(g) w where value ~ '^[a-z0-9]+$'),array[]::text[]) as words
      from jsonb_array_elements(p_groups) g
    ), scoped as materialized (
      select id,code,credits,semester_id,semester_name,synced_at,case when jsonb_array_length(p_groups)>0 then
        lower(normalize(left(name||' '||department||' '||description,20000),NFKC) collate "C") else '' end as search_text,
        length(name||' '||department||' '||description)>10000 as long_text
      from source where semester_id is null or p_filters-'semester_id'='{}'::jsonb
        or exists(select 1 from jsonb_array_elements(sections) s where public.elective_section_matches(s,p_filters))
    ), interested as materialized (
      select * from scoped c where jsonb_array_length(p_groups) = 0 or c.long_text or exists (
        select 1 from groups g where not exists (
          select 1 from unnest(g.words) w where strpos(c.search_text,w)=0
        )
      )
    ), page as (
      select * from interested order by code,id offset p_offset limit p_limit
    )
    select jsonb_build_object(
      'catalogue_count',(select count(*) from scoped),
      'candidate_count',(select count(*) from interested),
      'courses',coalesce((select jsonb_agg(jsonb_build_object(
        'id',p.id,'code',p.code,'name',c.name,'description',c.description,
        'department',c.department,'prerequisites',c.prerequisites,'credits',p.credits,
        'review_count',a.review_count,'average_workload',a.average_workload,'average_overall',a.average_overall,
        'offering',case when p.semester_id is not null then jsonb_build_object(
          'semester_id',p.semester_id,'semester_name',p.semester_name,'synced_at',p.synced_at,'sections',case when p_filters-'semester_id'='{}'::jsonb then o.sections else
            (select jsonb_agg(s order by n) from jsonb_array_elements(o.sections) with ordinality s(s,n) where public.elective_section_matches(s,p_filters)) end) end
      ) order by p.code,p.id) from page p join public.courses c on c.id=p.id
        left join public.course_semester_catalogue o on o.id=p.id and o.semester_id=p.semester_id
        left join public.course_rating_averages a on a.course_id=p.id),'[]'::jsonb)
    )
  );
end;
$$;
notify pgrst, 'reload schema';
commit;
