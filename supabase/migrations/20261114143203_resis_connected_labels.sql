-- Derive component labels from current saved sections and explicit connected CRNs.
begin;
with source as materialized (
  select o.import_id,o.course_id,c.code,x.section,x.ord
  from public.course_offerings o join public.resis_semesters s on s.active_import_id=o.import_id
  join public.courses c on c.id=o.course_id
  cross join lateral jsonb_array_elements(o.sections) with ordinality x(section,ord)
), enriched as (
  select a.import_id,a.course_id,jsonb_agg(
    case when a.section ? 'connected_crns' then a.section || jsonb_build_object('connected_labels',coalesce((
      select jsonb_agg(target.code || ' · Section ' || (target.section->>'section') || ' · ' ||
        coalesce((select string_agg(distinct m->>'type',' / ' order by m->>'type') from jsonb_array_elements(target.section->'sessions') m where coalesce(m->>'type','')<>''),'Type unlisted') || ' · CRN ' || (target.section->>'crn') order by link.ord)
      from jsonb_array_elements_text(a.section->'connected_crns') with ordinality link(crn,ord)
      join source target on target.import_id=a.import_id and target.section->>'crn'=link.crn
    ),'[]'::jsonb)) else a.section end order by a.ord) sections
  from source a group by a.import_id,a.course_id
)
update public.course_offerings o set sections=e.sections from enriched e
where o.import_id=e.import_id and o.course_id=e.course_id and o.sections is distinct from e.sections;
commit;
