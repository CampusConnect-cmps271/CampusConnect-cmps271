
begin;

-- Allow authenticated users to update the status column.
-- Row-level security still restricts updates to post authors.
grant update (status) on public.posts to authenticated;

-- Replace the editing policy with one that supports
-- both normal edits and soft deletion.
drop policy if exists "Authors can edit their own posts"
on public.posts;

drop policy if exists "Authors can soft delete their posts"
on public.posts;

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

-- Protect ownership and other immutable fields.
-- Deleting a post may only change its status.
create or replace function public.protect_post_edit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.author_id is distinct from old.author_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Protected post fields cannot be changed';
  end if;

  if old.status = 'deleted' then
    raise exception 'Deleted posts cannot be modified';
  end if;

  if new.status = 'deleted' then
    if new.title is distinct from old.title
      or new.body is distinct from old.body
      or new.category is distinct from old.category
      or new.edited_at is distinct from old.edited_at
    then
      raise exception 'Deletion can only change post status';
    end if;
  elsif new.status is distinct from 'published' then
    raise exception 'Invalid post status';
  end if;

  return new;
end;
$$;

commit;
