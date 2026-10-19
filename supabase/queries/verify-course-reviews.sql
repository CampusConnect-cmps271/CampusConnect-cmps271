-- SCRUM-169: run in the Supabase SQL Editor as its default database role.
-- Uses two existing users and one existing course; creates no accounts.
-- Every test write is rolled back. No review or auth claim is persisted.
begin;

do $$
declare
  first_student uuid;
  second_student uuid;
  target_course uuid;
  review_id uuid;
  affected integer;
begin
  select id into first_student from auth.users order by id limit 1;
  select id into second_student from auth.users where id <> first_student order by id limit 1;
  if first_student is null or second_student is null then
    raise exception 'Verification requires two existing users; no accounts were created';
  end if;
  select c.id into target_course from public.courses c
  where not exists (
    select 1 from public.course_reviews r
    where r.course_id = c.id and r.student_id in (first_student, second_student)
  ) order by c.code limit 1;
  if target_course is null then
    raise exception 'Verification requires an existing course without reviews from these two users';
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', first_student::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', first_student, 'role', 'authenticated')::text, true);
  insert into public.course_reviews (
    course_id, difficulty_rating, workload_rating, usefulness_rating,
    overall_rating, body, semester_taken, completed_course
  ) values (target_course, 2, 3, 5, 4, 'SCRUM-169 rollback-only verification', 'Fall 2026', true)
  returning id into review_id;

  begin
    insert into public.course_reviews (
      course_id, difficulty_rating, workload_rating, usefulness_rating,
      overall_rating, body, semester_taken, completed_course
    ) values (target_course, 2, 3, 5, 4, 'Duplicate', 'Spring 2027', true);
    raise exception 'FAIL: a second review for the same student and course was accepted';
  exception when unique_violation then null;
  end;

  begin
    update public.course_reviews set student_id = second_student where id = review_id;
    raise exception 'FAIL: ownership reassignment was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.course_reviews set created_at = '2001-01-01' where id = review_id;
    raise exception 'FAIL: a client changed a server timestamp';
  exception when insufficient_privilege then null;
  end;

  update public.course_reviews set body = 'Owner edit verified' where id = review_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: owner could not edit their review'; end if;

  perform set_config('request.jwt.claim.sub', second_student::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', second_student, 'role', 'authenticated')::text, true);
  if not exists (select 1 from public.course_reviews where id = review_id) then
    raise exception 'FAIL: another signed-in student could not read the review';
  end if;
  update public.course_reviews set body = 'Not the owner' where id = review_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: another student edited the review'; end if;
  delete from public.course_reviews where id = review_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: another student deleted the review'; end if;

  begin
    insert into public.course_reviews (
      course_id, student_id, difficulty_rating, workload_rating, usefulness_rating,
      overall_rating, body, semester_taken, completed_course
    ) values (target_course, first_student, 2, 3, 5, 4, 'Impersonation', 'Fall 2026', true);
    raise exception 'FAIL: another student could impersonate the owner';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.course_reviews (
      course_id, difficulty_rating, workload_rating, usefulness_rating,
      overall_rating, body, semester_taken, completed_course
    ) values (target_course, 2.5, 3, 5, 4, 'Invalid fraction', 'Fall 2026', true);
    raise exception 'FAIL: a fractional rating was accepted or rounded';
  exception when check_violation then null;
  end;

  begin
    insert into public.course_reviews (
      course_id, difficulty_rating, workload_rating, usefulness_rating,
      overall_rating, body, semester_taken, completed_course
    ) values (target_course, 2, 3, 5, 4, 'Unconfirmed completion', 'Fall 2026', false);
    raise exception 'FAIL: course completion was not confirmed';
  exception when check_violation then null;
  end;

  perform set_config('role', 'anon', true);
  begin
    perform 1 from public.course_reviews;
    raise exception 'FAIL: anonymous read access was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.course_reviews where id = review_id;
    raise exception 'FAIL: anonymous delete access was allowed';
  exception when insufficient_privilege then null;
  end;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', first_student::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', first_student, 'role', 'authenticated')::text, true);
  delete from public.course_reviews where id = review_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'FAIL: owner could not delete their review'; end if;
end;
$$;

rollback;
select 'PASS: ownership, uniqueness, ratings, completion and anonymous access; all test writes rolled back' as verification;
