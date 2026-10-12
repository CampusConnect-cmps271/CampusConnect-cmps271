begin;

-- Comments on posts. A reply is a comment whose parent_id points at a
-- top-level comment on the same post (one level of nesting).
create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null
    references public.posts(id) on delete cascade,
  author_id uuid not null
    references auth.users(id) on delete cascade,
  parent_id uuid,
  body text not null,
  created_at timestamptz not null default now(),

  constraint post_comments_body_length
    check (char_length(trim(body)) between 1 and 2000),

  -- Lets a reply prove its parent belongs to the same post.
  constraint post_comments_id_post_unique
    unique (id, post_id),

  constraint post_comments_parent_same_post
    foreign key (parent_id, post_id)
    references public.post_comments (id, post_id)
    on delete cascade
);

-- Replies may not be nested under another reply.
create function public.enforce_single_level_replies()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null and exists (
    select 1
    from public.post_comments
    where id = new.parent_id
      and parent_id is not null
  ) then
    raise exception 'Replies cannot be nested more than one level'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger post_comments_single_level
before insert on public.post_comments
for each row
execute function public.enforce_single_level_replies();

create index post_comments_post_created_idx
on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

grant select, insert on public.post_comments to authenticated;

create policy "Students can read comments on published posts"
on public.post_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.posts
    where posts.id = post_comments.post_id
      and posts.status = 'published'
  )
);

create policy "Students can comment on published posts as themselves"
on public.post_comments
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and exists (
    select 1
    from public.posts
    where posts.id = post_comments.post_id
      and posts.status = 'published'
  )
);

commit;
