
begin;

-- Remove the existing update policies.
drop policy if exists "Authors can edit their own posts"
on public.posts;

drop policy if exists "Authors can soft delete their posts"
on public.posts;

drop policy if exists "Authors can update their own published posts"
on public.posts;

-- Authors can edit or soft-delete their published posts.
create policy "Authors can update their own published posts"
on public.posts
for update
to authenticated
using (
  author_id = (select auth.uid())
  and status = 'published'
)
with check (
  author_id = (select auth.uid())
  and status in ('published', 'deleted')
);

-- Ensure authors have permission to change the status.
grant update (title, body, category, edited_at, status)
on public.posts to authenticated;

commit;
