
begin;

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id),
  title text not null,
  body text not null,
  category text not null,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  edited_at timestamptz,

  constraint posts_title_length
    check (char_length(trim(title)) between 1 and 200),

  constraint posts_body_length
    check (char_length(trim(body)) between 1 and 10000),

  constraint posts_category_not_empty
    check (char_length(trim(category)) > 0),

  constraint posts_status_check
    check (status in ('published', 'deleted'))
);

create index posts_published_newest_idx
on public.posts (created_at desc, id desc)
where status = 'published';

alter table public.posts enable row level security;

grant select, insert on public.posts to authenticated;

create policy "Students can read published posts"
on public.posts
for select
to authenticated
using (status = 'published');

create policy "Students can create their own posts"
on public.posts
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and status = 'published'
  and edited_at is null
);

commit;