begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

select ok(
  (select cardinality(statements) > 0
   from supabase_migrations.schema_migrations
   where version = '20261116123000'),
  'Report migration SQL is recorded'
);

insert into auth.users (id) values
  ('a1111111-1111-4111-8111-111111111111');

update public.profiles
set display_name = 'Existing User',
    trust_level = 42
where id = 'a1111111-1111-4111-8111-111111111111';

-- Remove the later HU-08 dependency only within this historical replay.
alter table public.report_assessments
  drop constraint report_assessments_report_fkey;
drop table public.reports;

select unnest(statements)
from supabase_migrations.schema_migrations
where version = '20261116123000'
\gexec

select has_table(
  'public', 'reports',
  'Reports table recreated successfully'
);

select is(
  (select trust_level
   from public.profiles
   where id = 'a1111111-1111-4111-8111-111111111111'),
  42::smallint,
  'Existing user trust level preserved'
);


select fk_ok(
  'public', 'reports', 'author_id',
  'public', 'profiles', 'id'
);

select is(
  (select count(*)::integer
   from pg_indexes
   where schemaname = 'public'
     and tablename = 'reports'),
  4,
  'All four report indexes recreated'
);

select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'public.reports'::regclass),
  'Replayed migration enables RLS'
);

select ok(
  not has_table_privilege(
    'authenticated', 'public.reports', 'SELECT'
  ),
  'Authenticated users have no direct read access'
);

insert into public.reports (
  author_id,
  title,
  description,
  target_url,
  page_key,
  target_host,
  registrable_domain
) values (
  'a1111111-1111-4111-8111-111111111111',
  'Test report',
  'Dark pattern detected on an existing website.',
  'https://example.com',
  'example.com',
  'example.com',
  'example.com'
);

select is(
  (select count(*)::integer
   from public.reports
   where title = 'Test report'),
  1,
  'Report can reference a pre-existing profile'
);

select * from finish();
rollback;
