begin;
alter table public.elective_preferences drop constraint elective_preferences_academic_goals_check;
alter table public.elective_preferences add constraint elective_preferences_academic_goals_check check (char_length(btrim(academic_goals)) between 0 and 1000 and academic_goals !~ '[[:cntrl:]]');
do $$ declare constraint_name text; begin
  for constraint_name in select conname from pg_constraint where conrelid='public.elective_preferences'::regclass and contype='c' and pg_get_constraintdef(oid) like '%cardinality(interests)%' loop
    execute format('alter table public.elective_preferences drop constraint %I',constraint_name);
  end loop;
end $$;
alter table public.elective_preferences add constraint elective_preferences_interest_bounds check (cardinality(interests) between 0 and 10 and coalesce(array_ndims(interests),1)=1);
alter table public.elective_preferences add constraint elective_preferences_browse_scope check (cardinality(interests)>0 or offering_preferences ? 'semester_id');
notify pgrst, 'reload schema';
commit;
