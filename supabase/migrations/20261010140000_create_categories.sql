
begin;

create table public.categories (
  id bigint generated always as identity primary key,
  name text not null unique
);

insert into public.categories (name)
values
  ('Academics'),
  ('Campus Life'),
  ('Housing'),
  ('Clubs & Events'),
  ('General');

alter table public.categories enable row level security;

grant select on public.categories to authenticated;

create policy "Signed-in users can read categories"
on public.categories
for select
to authenticated
using (true);

commit;
