-- SCRUM-166 / SP2-43: catalogue data shared by discovery, reviews and comparison.
begin;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  credits numeric(5, 2) not null,
  -- Preserve the catalogue's AND/OR rules and prose, rather than flattening
  -- prerequisites into a list that could change their meaning.
  prerequisites text not null default '',
  department text not null,
  created_at timestamptz not null default now(),

  constraint courses_code_valid check (
    char_length(code) between 1 and 32
    and code = upper(btrim(code))
    and code !~ '[[:cntrl:]]'
    and code !~ '  '
  ),
  constraint courses_name_valid check (
    char_length(btrim(name)) between 1 and 300
  ),
  constraint courses_description_valid check (
    char_length(btrim(description)) between 1 and 20000
  ),
  constraint courses_credits_valid check (
    credits >= 0 and credits <= 999.99
  ),
  constraint courses_prerequisites_valid check (
    char_length(prerequisites) <= 10000
  ),
  constraint courses_department_valid check (
    char_length(btrim(department)) between 1 and 200
  )
);

create index courses_department_code_idx on public.courses (department, code);

alter table public.courses enable row level security;

-- Supabase can grant broad privileges on newly created tables by default.
-- Only the trusted maintenance script may write the public catalogue.
revoke all on public.courses from public, anon, authenticated, service_role;
grant select on public.courses to authenticated;
grant select, insert, update on public.courses to service_role;

create policy "Signed-in students can read the course catalogue"
on public.courses for select to authenticated using (true);

commit;
