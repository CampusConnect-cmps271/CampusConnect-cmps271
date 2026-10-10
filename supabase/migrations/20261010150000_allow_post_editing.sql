
begin;

grant update (title, body, category, edited_at)
on public.posts to authenticated;

create policy "Authors can edit their own posts"
on public.posts
for update
to authenticated
using (
  author_id = (select auth.uid())
  and status = 'published'
)
with check (
  author_id = (select auth.uid())
  and status = 'published'
);

commit;
