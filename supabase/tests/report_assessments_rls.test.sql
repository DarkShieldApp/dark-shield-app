begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok((select relrowsecurity from pg_class where oid = 'public.report_assessments'::regclass),
  'Assessment RLS is enabled');
select is((select count(*) from pg_policies
  where schemaname = 'public' and tablename = 'report_assessments'), 0::bigint,
  'No access policies exist before authorization rules are agreed');
select ok(not has_table_privilege(r, 'public.report_assessments', p), r || ' lacks ' || p)
from unnest(array['anon', 'authenticated', 'service_role']) r
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) p;
select ok(not has_any_column_privilege(r, 'public.report_assessments', p), r || ' lacks column ' || p)
from unnest(array['anon', 'authenticated', 'service_role']) r
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p;
select is((select count(*) from pg_class c,
  lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid = 'public.report_assessments'::regclass and a.grantee = 0), 0::bigint,
  'PUBLIC receives no table privileges');

-- Nonempty fixtures prove UPDATE/DELETE tests really have rows to protect.
insert into auth.users (id) values
  ('08511111-1111-4111-8111-111111111111'),
  ('08522222-2222-4222-8222-222222222222');
insert into public.reports (
  id, author_id, title, description, target_url, page_key, target_host, registrable_domain
) values (
  '08533333-3333-4333-8333-333333333333', '08511111-1111-4111-8111-111111111111',
  'RLS fixture', 'Report used only in this transaction.',
  'https://example.com', 'https://example.com/', 'example.com', 'example.com'
);
insert into public.report_assessments (id, report_id, assessor_id, action) values (
  '08544444-4444-4444-8444-444444444444', '08533333-3333-4333-8333-333333333333',
  '08522222-2222-4222-8222-222222222222', 'validate'
);

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select is(current_user::text, 'anon', 'Queries use the actual anon role');
select throws_ok($$select * from public.report_assessments$$, '42501', null, 'anon read denied by ACLs');
select throws_ok($$insert into public.report_assessments (report_id, assessor_id, action) values
  ('08533333-3333-4333-8333-333333333333', '08511111-1111-4111-8111-111111111111', 'invalidate')$$, '42501', null, 'anon insert denied by ACLs');
select throws_ok($$update public.report_assessments set action = 'invalidate'$$, '42501', null, 'anon update denied by ACLs');
select throws_ok($$delete from public.report_assessments$$, '42501', null, 'anon delete denied by ACLs');
select throws_ok($$truncate public.report_assessments$$, '42501', null, 'anon truncate denied by ACLs');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"08522222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is(current_user::text, 'authenticated', 'Queries use the actual authenticated role');
select throws_ok($$select * from public.report_assessments$$, '42501', null, 'authenticated read denied by ACLs');
select throws_ok($$insert into public.report_assessments (report_id, assessor_id, action) values
  ('08533333-3333-4333-8333-333333333333', '08511111-1111-4111-8111-111111111111', 'invalidate')$$, '42501', null, 'authenticated insert denied by ACLs');
select throws_ok($$update public.report_assessments set action = 'invalidate'$$, '42501', null, 'authenticated update denied by ACLs');
select throws_ok($$delete from public.report_assessments$$, '42501', null, 'authenticated delete denied by ACLs');
select throws_ok($$truncate public.report_assessments$$, '42501', null, 'authenticated truncate denied by ACLs');
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"sub":"08522222-2222-4222-8222-222222222222","role":"service_role"}', true);
select is(current_user::text, 'service_role', 'Queries use the actual service_role role');
select throws_ok($$select * from public.report_assessments$$, '42501', null, 'service_role read denied by ACLs');
select throws_ok($$insert into public.report_assessments (report_id, assessor_id, action) values
  ('08533333-3333-4333-8333-333333333333', '08511111-1111-4111-8111-111111111111', 'invalidate')$$, '42501', null, 'service_role insert denied by ACLs');
select throws_ok($$update public.report_assessments set action = 'invalidate'$$, '42501', null, 'service_role update denied by ACLs');
select throws_ok($$delete from public.report_assessments$$, '42501', null, 'service_role delete denied by ACLs');
select throws_ok($$truncate public.report_assessments$$, '42501', null, 'service_role truncate denied by ACLs');
reset role;

-- Isolate RLS from ACLs. These grants are local to the rolled-back test.
-- service_role bypasses RLS; its protection is the revoked ACL tested above.
grant select, insert, update, delete on public.report_assessments to anon, authenticated;

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select is((select count(*) from public.report_assessments), 0::bigint, 'RLS hides rows: anonymous');
select throws_ok($$insert into public.report_assessments (report_id, assessor_id, action) values
  ('08533333-3333-4333-8333-333333333333', '08511111-1111-4111-8111-111111111111', 'invalidate')$$, '42501', null, 'RLS denies valid insert: anonymous');
with changed as (update public.report_assessments set action = 'invalidate' returning id)
select is((select count(*) from changed), 0::bigint, 'RLS prevents update: anonymous');
with removed as (delete from public.report_assessments returning id)
select is((select count(*) from removed), 0::bigint, 'RLS prevents deletion: anonymous');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"08522222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*) from public.report_assessments), 0::bigint, 'RLS hides rows: assessor');
select throws_ok($$insert into public.report_assessments (report_id, assessor_id, action) values
  ('08533333-3333-4333-8333-333333333333', '08511111-1111-4111-8111-111111111111', 'invalidate')$$, '42501', null, 'RLS denies valid insert: assessor');
with changed as (update public.report_assessments set action = 'invalidate' returning id)
select is((select count(*) from changed), 0::bigint, 'RLS prevents update: assessor');
with removed as (delete from public.report_assessments returning id)
select is((select count(*) from removed), 0::bigint, 'RLS prevents deletion: assessor');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"08511111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((select count(*) from public.report_assessments), 0::bigint, 'RLS hides rows: report author');
select throws_ok($$insert into public.report_assessments (report_id, assessor_id, action) values
  ('08533333-3333-4333-8333-333333333333', '08511111-1111-4111-8111-111111111111', 'invalidate')$$, '42501', null, 'RLS denies valid insert: report author');
with changed as (update public.report_assessments set action = 'invalidate' returning id)
select is((select count(*) from changed), 0::bigint, 'RLS prevents update: report author');
with removed as (delete from public.report_assessments returning id)
select is((select count(*) from removed), 0::bigint, 'RLS prevents deletion: report author');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is((select count(*) from public.report_assessments), 0::bigint, 'RLS hides rows: missing subject');
select throws_ok($$insert into public.report_assessments (report_id, assessor_id, action) values
  ('08533333-3333-4333-8333-333333333333', '08511111-1111-4111-8111-111111111111', 'invalidate')$$, '42501', null, 'RLS denies valid insert: missing subject');
with changed as (update public.report_assessments set action = 'invalidate' returning id)
select is((select count(*) from changed), 0::bigint, 'RLS prevents update: missing subject');
with removed as (delete from public.report_assessments returning id)
select is((select count(*) from removed), 0::bigint, 'RLS prevents deletion: missing subject');
reset role;

select results_eq($$select report_id, assessor_id, action from public.report_assessments
  where id = '08544444-4444-4444-8444-444444444444'$$,
  $$values ('08533333-3333-4333-8333-333333333333'::uuid,
    '08522222-2222-4222-8222-222222222222'::uuid, 'validate')$$,
  'Denied operations preserve the original row');
select is((select count(*) from public.report_assessments
  where report_id = '08533333-3333-4333-8333-333333333333'), 1::bigint,
  'Denied insertions leave no extra rows');

select * from finish();
rollback;
