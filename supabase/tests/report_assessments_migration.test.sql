-- Replay the actual migration against existing reports/profiles, without reset.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

select ok((select cardinality(statements) > 0 from supabase_migrations.schema_migrations
  where version = '20261118120000'), 'Assessment migration SQL is recorded');
drop table public.report_assessments;

insert into auth.users (id) values
  ('08611111-1111-4111-8111-111111111111'),
  ('08622222-2222-4222-8222-222222222222');
insert into public.reports (
  id, author_id, title, description, target_url, page_key, target_host, registrable_domain
) values (
  '08633333-3333-4333-8333-333333333333', '08611111-1111-4111-8111-111111111111',
  'Existing report', 'Report predating assessment persistence.',
  'https://example.com', 'https://example.com/', 'example.com', 'example.com'
);
create temporary table profiles_before_assessments as select * from public.profiles;
create temporary table reports_before_assessments as select * from public.reports;

select unnest(statements) from supabase_migrations.schema_migrations
where version = '20261118120000'
\gexec

select results_eq($$select * from public.profiles order by id$$,
  $$select * from profiles_before_assessments order by id$$, 'Existing profiles are unchanged');
select results_eq($$select * from public.reports order by id$$,
  $$select * from reports_before_assessments order by id$$, 'Existing reports are unchanged');
select is((select count(*) from public.report_assessments), 0::bigint,
  'Migration does not seed or infer any assessments');
select lives_ok($$insert into public.report_assessments (report_id, assessor_id, action) values (
  '08633333-3333-4333-8333-333333333333', '08622222-2222-4222-8222-222222222222', 'invalidate')$$,
  'Assessment can reference pre-existing parents');
select ok((select relrowsecurity from pg_class where oid = 'public.report_assessments'::regclass),
  'Replayed migration enables RLS');
select is((select count(*) from pg_policies
  where schemaname = 'public' and tablename = 'report_assessments'), 0::bigint,
  'Replayed migration has no access policies');
select ok(not exists (
  select 1 from unnest(array['anon', 'authenticated', 'service_role']) r
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) p
  where has_table_privilege(r, 'public.report_assessments', p)
), 'Replayed migration revokes all API role privileges');

select * from finish();
rollback;
