begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'report_assessments', 'Assessment table exists');
select columns_are('public', 'report_assessments',
  array['id', 'report_id', 'assessor_id', 'action', 'created_at']);
select col_is_pk('public', 'report_assessments', 'id', 'Assessment UUID is the primary key');
select col_type_is('public', 'report_assessments', c::name, 'uuid', c || ' is UUID')
from unnest(array['id', 'report_id', 'assessor_id']) c;
select col_type_is('public', 'report_assessments', 'action', 'text', 'Action is text');
select col_type_is('public', 'report_assessments', 'created_at', 'timestamp with time zone', 'Creation date is timestamptz');
select col_not_null('public', 'report_assessments', c::name, c || ' is required')
from unnest(array['id', 'report_id', 'assessor_id', 'action', 'created_at']) c;
select col_hasnt_default('public', 'report_assessments', 'action', 'Caller must choose an action');
select fk_ok('public', 'report_assessments', 'report_id', 'public', 'reports', 'id');
select fk_ok('public', 'report_assessments', 'assessor_id', 'public', 'profiles', 'id');
select has_index('public', 'report_assessments', 'report_assessments_report_id_idx', array['report_id']);
select has_index('public', 'report_assessments', 'report_assessments_assessor_id_idx', array['assessor_id']);
select ok((select confupdtype = 'r' and confdeltype = 'r' from pg_constraint
  where conrelid = 'public.report_assessments'::regclass and conname = c),
  c || ' restricts parent updates and deletions')
from unnest(array['report_assessments_report_fkey', 'report_assessments_assessor_fkey']) c;

-- Local transactional fixtures only; the migration seeds no assessments.
-- Owner access verifies storage, not collaborator authorization.
insert into auth.users (id) values
  ('08111111-1111-4111-8111-111111111111'),
  ('08222222-2222-4222-8222-222222222222'),
  ('08333333-3333-4333-8333-333333333333');
insert into public.reports (
  id, author_id, title, description, target_url, page_key, target_host, registrable_domain
) values (
  '08444444-4444-4444-8444-444444444444', '08111111-1111-4111-8111-111111111111',
  'Assessment fixture', 'Report used only in this transaction.',
  'https://example.com/pricing', 'https://example.com/pricing', 'example.com', 'example.com'
);

select lives_ok($$insert into public.report_assessments (report_id, assessor_id, action) values
  ('08444444-4444-4444-8444-444444444444', '08222222-2222-4222-8222-222222222222', 'validate'),
  ('08444444-4444-4444-8444-444444444444', '08333333-3333-4333-8333-333333333333', 'invalidate')$$,
  'Both actions can be stored with existing parents');
select results_eq($$select report_id, assessor_id, action from public.report_assessments
  where report_id = '08444444-4444-4444-8444-444444444444' order by assessor_id$$,
  $$values
    ('08444444-4444-4444-8444-444444444444'::uuid, '08222222-2222-4222-8222-222222222222'::uuid, 'validate'),
    ('08444444-4444-4444-8444-444444444444'::uuid, '08333333-3333-4333-8333-333333333333'::uuid, 'invalidate')$$,
  'Stored actions retain their report and assessor');
select is((select count(distinct id) from public.report_assessments
  where report_id = '08444444-4444-4444-8444-444444444444'), 2::bigint, 'UUIDs are generated independently');
select is((select count(*) from public.report_assessments
  where report_id = '08444444-4444-4444-8444-444444444444' and created_at = now()),
  2::bigint, 'Creation dates default to the transaction timestamp');

select throws_ok(format($sql$insert into public.report_assessments (report_id, assessor_id, action)
  values ('08444444-4444-4444-8444-444444444444', '08222222-2222-4222-8222-222222222222', %L)$sql$, a),
  '23514', null, 'Invalid action rejected: ' || quote_literal(a))
from unnest(array['', ' ', 'VALIDATE', 'validate ', 'invalid', 'true']) a;
select throws_ok($$insert into public.report_assessments (report_id, assessor_id)
  values ('08444444-4444-4444-8444-444444444444', '08222222-2222-4222-8222-222222222222')$$,
  '23502', null, 'Missing action rejected');
select throws_ok(format($sql$update public.report_assessments set %I = null
  where report_id = '08444444-4444-4444-8444-444444444444'$sql$, c),
  '23502', null, c || ' cannot become null')
from unnest(array['id', 'report_id', 'assessor_id', 'action', 'created_at']) c;
select throws_ok($$update public.report_assessments set action = 'unknown'
  where report_id = '08444444-4444-4444-8444-444444444444'$$,
  '23514', null, 'Action constraint also rejects invalid updates by the owner');
select throws_ok($$insert into public.report_assessments (id, report_id, assessor_id, action)
  select id, report_id, assessor_id, action from public.report_assessments
  where assessor_id = '08222222-2222-4222-8222-222222222222'$$,
  '23505', null, 'Duplicate primary key rejected');
select throws_ok($$insert into public.report_assessments (report_id, assessor_id, action)
  values ('08999999-9999-4999-8999-999999999999', '08222222-2222-4222-8222-222222222222', 'validate')$$,
  '23503', null, 'Nonexistent report rejected');
select throws_ok($$insert into public.report_assessments (report_id, assessor_id, action)
  values ('08444444-4444-4444-8444-444444444444', '08999999-9999-4999-8999-999999999999', 'invalidate')$$,
  '23503', null, 'Nonexistent assessor rejected');
select throws_ok(format($sql$update public.report_assessments
  set %I = '08999999-9999-4999-8999-999999999999'
  where report_id = '08444444-4444-4444-8444-444444444444'$sql$, c),
  '23503', null, c || ' cannot be changed to a missing parent')
from unnest(array['report_id', 'assessor_id']) c;
select throws_ok($$delete from public.reports where id = '08444444-4444-4444-8444-444444444444'$$,
  '23503', null, 'Deleting the report cannot cascade into assessments');
-- This profile has no reports: its assessment FK alone must prevent deletion.
select throws_ok($$delete from public.profiles where id = '08222222-2222-4222-8222-222222222222'$$,
  '23503', null, 'Deleting the assessor cannot cascade into assessments');
select is((select count(*) from public.report_assessments
  where report_id = '08444444-4444-4444-8444-444444444444'), 2::bigint,
  'Rejected operations leave both assessments intact');

select * from finish();
rollback;
