begin;

-- A student's private bookmarks. Each student can save a post only once.
create table public.saved_posts (
  user_id uuid not null
    references auth.users(id) on delete cascade,

  post_id uuid not null
    references public.posts(id) on delete cascade,

  created_at timestamptz not null default now(),

  primary key (user_id, post_id)
);

-- Newest saves first on the Saved page.
create index saved_posts_user_created_idx
on public.saved_posts (user_id, created_at desc);

alter table public.saved_posts enable row level security;

grant select, insert, delete on public.saved_posts to authenticated;

-- Saved posts are private: students see only their own.
create policy "Students can read their own saved posts"
on public.saved_posts
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Students can save published posts as themselves"
on public.saved_posts
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.posts
    where posts.id = saved_posts.post_id
      and posts.status = 'published'
  )
);

create policy "Students can unsave their own saved posts"
on public.saved_posts
for delete
to authenticated
using (user_id = (select auth.uid()));

commit;
