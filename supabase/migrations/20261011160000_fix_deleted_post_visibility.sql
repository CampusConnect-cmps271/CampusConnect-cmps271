
begin;

drop policy if exists "Students can read published posts"
on public.posts;

create policy "Students can read published posts"
on public.posts
for select
to authenticated
using (
  status = 'published'
  or author_id = (select auth.uid())
);

commit;
