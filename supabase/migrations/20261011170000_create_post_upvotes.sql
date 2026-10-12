
begin;

-- Each student can upvote a post only once.
create table public.post_upvotes (
  post_id uuid not null
    references public.posts(id) on delete cascade,

  user_id uuid not null
    references auth.users(id) on delete cascade,

  created_at timestamptz not null default now(),

  primary key (post_id, user_id)
);

-- Improve queries for a student's votes.
create index post_upvotes_user_id_idx
on public.post_upvotes (user_id);

-- Enable Row Level Security.
alter table public.post_upvotes
enable row level security;

-- Allow authenticated students to access the table.
grant select, insert, delete
on public.post_upvotes
to authenticated;

-- Students can see votes on published posts.
create policy "Students can read post upvotes"
on public.post_upvotes
for select
to authenticated
using (
  exists (
    select 1
    from public.posts
    where posts.id = post_upvotes.post_id
      and posts.status = 'published'
  )
);

-- Students can upvote published posts as themselves.
create policy "Students can upvote published posts"
on public.post_upvotes
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.posts
    where posts.id = post_upvotes.post_id
      and posts.status = 'published'
  )
);

-- Students can remove only their own upvotes.
create policy "Students can remove their own upvotes"
on public.post_upvotes
for delete
to authenticated
using (
  user_id = (select auth.uid())
);

commit;
