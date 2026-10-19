-- SCRUM-169 / SP2-46: review storage; the student form follows in SCRUM-170.
begin;

create table public.course_reviews (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  -- Unscaled numeric + integer checks reject fractional input rather than
  -- silently rounding it during an integer-column cast.
  difficulty_rating numeric not null,
  workload_rating numeric not null,
  usefulness_rating numeric not null,
  overall_rating numeric not null,
  body text not null,
  semester_taken text not null,
  completed_course boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint course_reviews_one_per_student unique (course_id, student_id),
  constraint course_reviews_difficulty_range check (
    difficulty_rating between 1 and 5 and difficulty_rating = trunc(difficulty_rating)
  ),
  constraint course_reviews_workload_range check (
    workload_rating between 1 and 5 and workload_rating = trunc(workload_rating)
  ),
  constraint course_reviews_usefulness_range check (
    usefulness_rating between 1 and 5 and usefulness_rating = trunc(usefulness_rating)
  ),
  constraint course_reviews_overall_range check (
    overall_rating between 1 and 5 and overall_rating = trunc(overall_rating)
  ),
  constraint course_reviews_body_length check (
    char_length(body) between 1 and 5000 and body ~ '[^[:space:]]'
  ),
  constraint course_reviews_semester_length check (
    char_length(semester_taken) between 1 and 80 and semester_taken ~ '[^[:space:]]'
  ),
  constraint course_reviews_completion_confirmed check (completed_course)
);

comment on table public.course_reviews is
  'One self-attested completed-course review per student and course. Ratings are whole numbers from 1 to 5.';
comment on column public.course_reviews.difficulty_rating is '1 = easiest; 5 = hardest.';
comment on column public.course_reviews.workload_rating is '1 = lightest workload; 5 = heaviest workload.';
comment on column public.course_reviews.usefulness_rating is '1 = least useful; 5 = most useful.';
comment on column public.course_reviews.overall_rating is '1 = lowest overall experience; 5 = highest overall experience.';
comment on column public.course_reviews.completed_course is
  'Student confirmation, not independent verification of academic completion.';

-- Covers ownership policies, user deletion and the student's review list.
create index course_reviews_student_idx on public.course_reviews(student_id);
-- Supports per-course review lists in a stable newest-first order.
create index course_reviews_course_created_idx
  on public.course_reviews(course_id, created_at desc, id);

alter table public.course_reviews enable row level security;

-- Supabase default privileges can be broader than the intended API.
revoke all on public.course_reviews from public, anon, authenticated, service_role;
grant select, delete on public.course_reviews to authenticated;
grant insert (
  course_id, student_id, difficulty_rating, workload_rating, usefulness_rating,
  overall_rating, body, semester_taken, completed_course
) on public.course_reviews to authenticated;
-- Ownership, course identity and timestamps cannot be reassigned by a client.
grant update (
  difficulty_rating, workload_rating, usefulness_rating, overall_rating,
  body, semester_taken, completed_course
) on public.course_reviews to authenticated;
grant select, insert, update, delete on public.course_reviews to service_role;

create policy "Signed-in students can read course reviews"
on public.course_reviews for select to authenticated using (true);

create policy "Students can create their own course review"
on public.course_reviews for insert to authenticated
with check (student_id = (select auth.uid()));

create policy "Students can update their own course review"
on public.course_reviews for update to authenticated
using (student_id = (select auth.uid()))
with check (student_id = (select auth.uid()));

create policy "Students can delete their own course review"
on public.course_reviews for delete to authenticated
using (student_id = (select auth.uid()));

create function public.set_course_review_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_course_review_updated_at()
from public, anon, authenticated, service_role;

create trigger set_course_review_updated_at
before update on public.course_reviews
for each row execute function public.set_course_review_updated_at();

commit;
