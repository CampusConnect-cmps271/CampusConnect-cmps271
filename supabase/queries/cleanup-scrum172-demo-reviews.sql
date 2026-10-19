-- Removes only the three sample bodies seeded for the manual SCRUM-172 preview.
-- Course, demo account, semester and exact body must all match.
-- No accounts, real-student reviews, or other courses are changed.
begin;

with samples(full_name, body) as (
  values
    ('Lina Haddad',
      '[DEMO SCRUM-172] Synthetic review for testing, not actual student feedback. Sample A: practical group exercises and a useful project.'),
    ('Karim Mansour',
      '[DEMO SCRUM-172] Synthetic review for testing, not actual student feedback. Sample B: challenging design topics with manageable weekly work.'),
    ('Rana Khoury',
      '[DEMO SCRUM-172] Synthetic review for testing, not actual student feedback. Sample C: approachable concepts with a substantial project workload.')
)
delete from public.course_reviews r
using public.courses c, auth.users u, samples s
where r.course_id = c.id and c.code = 'CMPS 271'
  and r.student_id = u.id and u.raw_user_meta_data->>'full_name' = s.full_name
  and r.semester_taken = 'DEMO - Fall 2026'
  and r.body = s.body
returning r.id;

commit;
