begin;

-- Deleting an Auth user must not be blocked by their posts. Every other
-- table that references auth.users already cascades.
alter table public.posts
  drop constraint posts_author_id_fkey,
  add constraint posts_author_id_fkey
    foreign key (author_id) references auth.users(id) on delete cascade;

commit;
