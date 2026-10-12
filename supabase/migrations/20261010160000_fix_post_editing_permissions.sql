
begin;

-- Allow authenticated users to update posts.
-- RLS determines which rows they can update.
grant update on public.posts to authenticated;

-- Remove the previous editing policy.
drop policy if exists "Authors can edit their own posts"
on public.posts;

-- Only authors may update published posts.
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

-- Prevent changes to protected fields.
create or replace function public.protect_post_edit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.author_id is distinct from old.author_id
    or new.status is distinct from old.status
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Protected post fields cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_post_edit_fields
on public.posts;

create trigger protect_post_edit_fields
before update on public.posts
for each row
execute function public.protect_post_edit_fields();

commit;
