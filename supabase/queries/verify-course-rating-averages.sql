-- SCRUM-171: run as the Supabase SQL Editor's default database role.
-- Uses two existing Auth users and one course without reviews. Creates no accounts.
-- All synthetic reviews and local session claims are rolled back.
begin;

do $$
declare
  first_student uuid;
  second_student uuid;
  target_course uuid;
  first_review uuid;
  second_review uuid;
  stats record;
begin
  select id into first_student from auth.users order by id limit 1;
  select id into second_student from auth.users where id <> first_student order by id limit 1;
  if first_student is null or second_student is null then
    raise exception 'Verification needs two existing users; no accounts were created';
  end if;
  select c.id into target_course from public.courses c
  where not exists (select 1 from public.course_reviews r where r.course_id = c.id)
  order by c.code limit 1;
  if target_course is null then
    raise exception 'Verification needs an existing course without reviews';
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', first_student::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', first_student, 'role', 'authenticated')::text, true);
  select * into stats from public.course_rating_averages where course_id = target_course;
  if not found or stats.review_count is distinct from 0
    or array[stats.average_difficulty, stats.average_workload, stats.average_usefulness, stats.average_overall]
      is distinct from array[null::numeric, null::numeric, null::numeric, null::numeric] then
    raise exception 'FAIL: empty course must have count 0 and NULL averages';
  end if;

  insert into public.course_reviews(course_id, difficulty_rating, workload_rating,
    usefulness_rating, overall_rating, body, semester_taken, completed_course)
  values (target_course, 1, 2, 5, 4, 'SCRUM-171 rollback-only verification.', 'Fall 2026', true)
  returning id into first_review;
  select * into stats from public.course_rating_averages where course_id = target_course;
  if not found or stats.review_count is distinct from 1
    or array[stats.average_difficulty, stats.average_workload, stats.average_usefulness, stats.average_overall]
      is distinct from array[1::numeric, 2::numeric, 5::numeric, 4::numeric] then
    raise exception 'FAIL: first insert did not update the view';
  end if;

  perform set_config('request.jwt.claim.sub', second_student::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', second_student, 'role', 'authenticated')::text, true);
  insert into public.course_reviews(course_id, difficulty_rating, workload_rating,
    usefulness_rating, overall_rating, body, semester_taken, completed_course)
  values (target_course, 4, 5, 2, 1, 'SCRUM-171 second rollback-only review.', 'Spring 2027', true)
  returning id into second_review;
  select * into stats from public.course_rating_averages where course_id = target_course;
  if not found or stats.review_count is distinct from 2
    or array[stats.average_difficulty, stats.average_workload, stats.average_usefulness, stats.average_overall]
      is distinct from array[2.5::numeric, 3.5::numeric, 3.5::numeric, 2.5::numeric] then
    raise exception 'FAIL: two-student averages are incorrect';
  end if;

  perform set_config('request.jwt.claim.sub', first_student::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', first_student, 'role', 'authenticated')::text, true);
  update public.course_reviews set difficulty_rating = 5, workload_rating = 1,
    usefulness_rating = 4, overall_rating = 3 where id = first_review;
  select * into stats from public.course_rating_averages where course_id = target_course;
  if not found or stats.review_count is distinct from 2
    or array[stats.average_difficulty, stats.average_workload, stats.average_usefulness, stats.average_overall]
      is distinct from array[4.5::numeric, 3::numeric, 3::numeric, 2::numeric] then
    raise exception 'FAIL: owner edit did not update all averages';
  end if;

  delete from public.course_reviews where id = first_review;
  select * into stats from public.course_rating_averages where course_id = target_course;
  if not found or stats.review_count is distinct from 1
    or array[stats.average_difficulty, stats.average_workload, stats.average_usefulness, stats.average_overall]
      is distinct from array[4::numeric, 5::numeric, 2::numeric, 1::numeric] then
    raise exception 'FAIL: owner deletion did not update averages and count';
  end if;

  perform set_config('request.jwt.claim.sub', second_student::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', second_student, 'role', 'authenticated')::text, true);
  delete from public.course_reviews where id = second_review;
  select * into stats from public.course_rating_averages where course_id = target_course;
  if not found or stats.review_count is distinct from 0
    or array[stats.average_difficulty, stats.average_workload, stats.average_usefulness, stats.average_overall]
      is distinct from array[null::numeric, null::numeric, null::numeric, null::numeric] then
    raise exception 'FAIL: deleting the final review did not restore the empty state';
  end if;

  perform set_config('role', 'anon', true);
  begin
    perform 1 from public.course_rating_averages;
    raise exception 'FAIL: anonymous callers can read rating averages';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
select 'PASS: live averages, counts, owner edits/deletes and anonymous denial; all test writes rolled back.' as verification;
