-- HU-09/T2: aggregated credibility inputs. credibility_internal.report_inputs
-- reads the closed report_assessments table (approved by the PO, D5) and only
-- returns per-report aggregates; public.report_credibility_inputs limits the
-- ids to the reports the caller can read under RLS. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Shape: unexposed schema, execution context and exact result columns.
select has_schema('credibility_internal', 'Internal credibility schema exists');
select has_function('credibility_internal', 'report_inputs', array['uuid[]'],
  'Internal aggregate function exists');
select has_function('public', 'report_credibility_inputs', array['uuid[]'],
  'Public wrapper exists');

select is(
  pg_get_function_result(f::regprocedure),
  'TABLE(report_id uuid, report_created_at timestamp with time zone, '
    || 'visible_evidences integer, latest_evidence_at timestamp with time zone, '
    || 'validations integer, validation_trust_sum integer, invalidations integer, '
    || 'invalidation_trust_sum integer, latest_assessment_at timestamp with time zone)',
  f || ' returns exactly the aggregate columns of the design'
)
from unnest(array[
  'credibility_internal.report_inputs(uuid[])',
  'public.report_credibility_inputs(uuid[])'
]) f;

select ok(
  not exists (
    select 1
    from pg_proc p, unnest(p.proargnames) n
    where p.oid in ('credibility_internal.report_inputs(uuid[])'::regprocedure,
                    'public.report_credibility_inputs(uuid[])'::regprocedure)
      and n in ('assessor_id', 'uploaded_by', 'storage_path', 'trust_level', 'author_id', 'action')
  ),
  'No identity, path or individual trust column is returned'
);

select ok(
  p.prosecdef = (p.oid = 'credibility_internal.report_inputs(uuid[])'::regprocedure)
    and p.provolatile = 's'
    and p.proconfig @> array['search_path=""'],
  p.oid::regprocedure::text || ' execution context (definer only inside, stable, empty search_path)'
)
from pg_proc p
where p.oid in ('credibility_internal.report_inputs(uuid[])'::regprocedure,
                'public.report_credibility_inputs(uuid[])'::regprocedure);

-- Privileges.
select ok(has_schema_privilege(r, 'credibility_internal', 'usage'),
  r || ' can resolve the internal schema')
from unnest(array['anon', 'authenticated']) r;
select ok(not has_schema_privilege('service_role', 'credibility_internal', 'usage'),
  'service_role cannot resolve the internal schema');
select ok(not has_schema_privilege(r, 'credibility_internal', 'create'),
  r || ' cannot replace internal functions')
from unnest(array['anon', 'authenticated', 'service_role']) r;
select is((select count(*) from pg_namespace n,
  lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
  where n.nspname = 'credibility_internal' and a.grantee = 0), 0::bigint,
  'PUBLIC has no privileges on the internal schema');

select ok(has_function_privilege(r, f, 'execute'), r || ' can execute ' || f)
from unnest(array['anon', 'authenticated']) r
cross join unnest(array[
  'credibility_internal.report_inputs(uuid[])',
  'public.report_credibility_inputs(uuid[])'
]) f;
select ok(not has_function_privilege('service_role', f, 'execute'),
  'service_role cannot execute ' || f)
from unnest(array[
  'credibility_internal.report_inputs(uuid[])',
  'public.report_credibility_inputs(uuid[])'
]) f;
select is((select count(*) from pg_proc p,
  lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.oid = f::regprocedure and a.grantee = 0), 0::bigint,
  'PUBLIC cannot execute ' || f)
from unnest(array[
  'credibility_internal.report_inputs(uuid[])',
  'public.report_credibility_inputs(uuid[])'
]) f;

-- The assessments table stays closed to every API role (D5).
select ok(not has_table_privilege(r, 'public.report_assessments', 'SELECT'),
  r || ' still lacks SELECT on report_assessments')
from unnest(array['anon', 'authenticated', 'service_role']) r;

-- Fixtures, created as the owner. Profiles are created by the auth trigger
-- with trust_level 1 and active.
insert into auth.users (id) values
  ('09b00000-0000-4000-8000-000000000000'),  -- author of every report
  ('09b00000-0000-4000-8000-000000000001'),  -- x, t=100
  ('09b00000-0000-4000-8000-000000000002'),  -- y, t=100
  ('09b00000-0000-4000-8000-000000000003'),  -- z, t=100
  ('09b00000-0000-4000-8000-000000000004'),  -- inactive, t=100
  ('09b00000-0000-4000-8000-000000000005'),  -- t=34
  ('09b00000-0000-4000-8000-000000000006'),  -- t=34
  ('09b00000-0000-4000-8000-000000000007'),  -- t=67
  ('09b00000-0000-4000-8000-000000000008'),  -- t=1
  ('09b00000-0000-4000-8000-000000000009');  -- t=1

update public.profiles set trust_level = 100
where id in ('09b00000-0000-4000-8000-000000000000', '09b00000-0000-4000-8000-000000000001',
             '09b00000-0000-4000-8000-000000000002', '09b00000-0000-4000-8000-000000000003',
             '09b00000-0000-4000-8000-000000000004');
update public.profiles set trust_level = 34
where id in ('09b00000-0000-4000-8000-000000000005', '09b00000-0000-4000-8000-000000000006');
update public.profiles set trust_level = 67
where id = '09b00000-0000-4000-8000-000000000007';
update public.profiles set is_active = false
where id = '09b00000-0000-4000-8000-000000000004';

insert into public.reports (
  id, author_id, title, description, target_url,
  page_key, target_host, registrable_domain, created_at
)
select ('09c00000-0000-4000-8000-00000000000' || n)::uuid,
  '09b00000-0000-4000-8000-000000000000',
  case when n = 9 then 'Restricted report' else 'Credibility report ' || n end,
  'Report used only in this transaction.',
  'https://example.com/' || n, 'https://example.com/' || n,
  'example.com', 'example.com',
  ('2026-11-0' || n || ' 08:00:00+00')::timestamptz
from generate_series(1, 9) n;

-- Evidences: report 2 = case 5 (4 evidences of the author, 2 hidden);
-- report 9 has one visible evidence (RLS test).
insert into public.report_evidences (
  id, report_id, uploaded_by, storage_path, original_name,
  mime_type, size_bytes, sha256, moderation_status, created_at
)
select v.id::uuid, v.report_id::uuid, '09b00000-0000-4000-8000-000000000000',
  '09b00000-0000-4000-8000-000000000000/' || v.report_id || '/' || v.id || '.png',
  'evidence.png', 'image/png', 1, lpad(v.n::text, 64, '0'), v.status, v.created_at::timestamptz
from (values
  (1, '09e00000-0000-4000-8000-000000000001', '09c00000-0000-4000-8000-000000000002', 'visible', '2026-11-02 10:00:00+00'),
  (2, '09e00000-0000-4000-8000-000000000002', '09c00000-0000-4000-8000-000000000002', 'visible', '2026-11-02 11:00:00+00'),
  (3, '09e00000-0000-4000-8000-000000000003', '09c00000-0000-4000-8000-000000000002', 'hidden', '2026-11-02 12:00:00+00'),
  (4, '09e00000-0000-4000-8000-000000000004', '09c00000-0000-4000-8000-000000000002', 'hidden', '2026-11-02 13:00:00+00'),
  (5, '09e00000-0000-4000-8000-000000000005', '09c00000-0000-4000-8000-000000000009', 'visible', '2026-11-09 10:00:00+00')
) v(n, id, report_id, status, created_at);

insert into public.report_assessments (id, report_id, assessor_id, action, created_at) values
  -- Report 3 = case 21: x validates and later invalidates; y invalidates.
  ('09a00000-0000-4000-8000-000000000031', '09c00000-0000-4000-8000-000000000003',
   '09b00000-0000-4000-8000-000000000001', 'validate', '2026-11-03 10:00:00+00'),
  ('09a00000-0000-4000-8000-000000000032', '09c00000-0000-4000-8000-000000000003',
   '09b00000-0000-4000-8000-000000000001', 'invalidate', '2026-11-03 11:00:00+00'),
  ('09a00000-0000-4000-8000-000000000033', '09c00000-0000-4000-8000-000000000003',
   '09b00000-0000-4000-8000-000000000002', 'invalidate', '2026-11-03 09:00:00+00'),
  -- Report 4: z has two assessments with the same created_at; the greater id
  -- (the invalidation) wins. It is inserted first so insertion order is not it.
  ('09a00000-0000-4000-8000-000000000042', '09c00000-0000-4000-8000-000000000004',
   '09b00000-0000-4000-8000-000000000003', 'invalidate', '2026-11-04 10:00:00+00'),
  ('09a00000-0000-4000-8000-000000000041', '09c00000-0000-4000-8000-000000000004',
   '09b00000-0000-4000-8000-000000000003', 'validate', '2026-11-04 10:00:00+00'),
  -- Report 5 = case 20: the author validates (latest) and x validates.
  ('09a00000-0000-4000-8000-000000000051', '09c00000-0000-4000-8000-000000000005',
   '09b00000-0000-4000-8000-000000000000', 'validate', '2026-11-05 12:00:00+00'),
  ('09a00000-0000-4000-8000-000000000052', '09c00000-0000-4000-8000-000000000005',
   '09b00000-0000-4000-8000-000000000001', 'validate', '2026-11-05 10:00:00+00'),
  -- Report 6 = case 22: x validates; the inactive profile validates later.
  ('09a00000-0000-4000-8000-000000000061', '09c00000-0000-4000-8000-000000000006',
   '09b00000-0000-4000-8000-000000000001', 'validate', '2026-11-06 10:00:00+00'),
  ('09a00000-0000-4000-8000-000000000062', '09c00000-0000-4000-8000-000000000006',
   '09b00000-0000-4000-8000-000000000004', 'validate', '2026-11-06 11:00:00+00'),
  -- Report 7 = case 18: two validations t=34 and one invalidation t=67.
  ('09a00000-0000-4000-8000-000000000071', '09c00000-0000-4000-8000-000000000007',
   '09b00000-0000-4000-8000-000000000005', 'validate', '2026-11-07 10:00:00+00'),
  ('09a00000-0000-4000-8000-000000000072', '09c00000-0000-4000-8000-000000000007',
   '09b00000-0000-4000-8000-000000000006', 'validate', '2026-11-07 11:00:00+00'),
  ('09a00000-0000-4000-8000-000000000073', '09c00000-0000-4000-8000-000000000007',
   '09b00000-0000-4000-8000-000000000007', 'invalidate', '2026-11-07 12:00:00+00'),
  -- Report 8 = cases 11 and 23: two validations t=1.
  ('09a00000-0000-4000-8000-000000000081', '09c00000-0000-4000-8000-000000000008',
   '09b00000-0000-4000-8000-000000000008', 'validate', '2026-11-08 10:00:00+00'),
  ('09a00000-0000-4000-8000-000000000082', '09c00000-0000-4000-8000-000000000008',
   '09b00000-0000-4000-8000-000000000009', 'validate', '2026-11-08 11:00:00+00'),
  -- Report 9: restricted under the emulated RLS below.
  ('09a00000-0000-4000-8000-000000000091', '09c00000-0000-4000-8000-000000000009',
   '09b00000-0000-4000-8000-000000000001', 'validate', '2026-11-09 11:00:00+00');

create function pg_temp.inputs(report uuid)
returns text language sql stable
as $$
  select row(i.*)::text from public.report_credibility_inputs(array[report]) i
$$;
grant execute on function pg_temp.inputs(uuid) to anon, authenticated;

-- Aggregates, read through the public wrapper as anon (public query, HU-01).
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select is(current_user::text, 'anon', 'Aggregates are read as the actual anon role');

select is(pg_temp.inputs('09c00000-0000-4000-8000-000000000001'),
  row('09c00000-0000-4000-8000-000000000001'::uuid, '2026-11-01 08:00:00+00'::timestamptz,
      0, null::timestamptz, 0, 0, 0, 0, null::timestamptz)::text,
  'Case 1: a report without inputs returns zeros, null dates and its creation date');
select is(pg_temp.inputs('09c00000-0000-4000-8000-000000000002'),
  row('09c00000-0000-4000-8000-000000000002'::uuid, '2026-11-02 08:00:00+00'::timestamptz,
      2, '2026-11-02 11:00:00+00'::timestamptz, 0, 0, 0, 0, null::timestamptz)::text,
  'Case 5: hidden evidences neither count nor move the latest evidence date');
select is(pg_temp.inputs('09c00000-0000-4000-8000-000000000003'),
  row('09c00000-0000-4000-8000-000000000003'::uuid, '2026-11-03 08:00:00+00'::timestamptz,
      0, null::timestamptz, 0, 0, 2, 200, '2026-11-03 11:00:00+00'::timestamptz)::text,
  'Case 21: only the latest assessment of each assessor counts (D1)');
select is(pg_temp.inputs('09c00000-0000-4000-8000-000000000004'),
  row('09c00000-0000-4000-8000-000000000004'::uuid, '2026-11-04 08:00:00+00'::timestamptz,
      0, null::timestamptz, 0, 0, 1, 100, '2026-11-04 10:00:00+00'::timestamptz)::text,
  'D1 tie-break: with equal created_at the greater id is the latest');
select is(pg_temp.inputs('09c00000-0000-4000-8000-000000000005'),
  row('09c00000-0000-4000-8000-000000000005'::uuid, '2026-11-05 08:00:00+00'::timestamptz,
      0, null::timestamptz, 1, 100, 0, 0, '2026-11-05 10:00:00+00'::timestamptz)::text,
  'Case 20: the author''s assessment is ignored and does not move the date (D3)');
select is(pg_temp.inputs('09c00000-0000-4000-8000-000000000006'),
  row('09c00000-0000-4000-8000-000000000006'::uuid, '2026-11-06 08:00:00+00'::timestamptz,
      0, null::timestamptz, 1, 100, 0, 0, '2026-11-06 10:00:00+00'::timestamptz)::text,
  'Case 22: assessments of inactive profiles are excluded (D4)');
select is(pg_temp.inputs('09c00000-0000-4000-8000-000000000007'),
  row('09c00000-0000-4000-8000-000000000007'::uuid, '2026-11-07 08:00:00+00'::timestamptz,
      0, null::timestamptz, 2, 68, 1, 67, '2026-11-07 12:00:00+00'::timestamptz)::text,
  'Case 18: counts and trust sums per action');
select is(pg_temp.inputs('09c00000-0000-4000-8000-000000000008'),
  row('09c00000-0000-4000-8000-000000000008'::uuid, '2026-11-08 08:00:00+00'::timestamptz,
      0, null::timestamptz, 2, 2, 0, 0, '2026-11-08 11:00:00+00'::timestamptz)::text,
  'Case 11: two validations of minimum trust');

select is(
  (select count(*) from public.report_credibility_inputs(array[
    '09c00000-0000-4000-8000-000000000001', '09c00000-0000-4000-8000-000000000001',
    '09c00000-0000-4000-8000-000000000002', '09c00000-0000-4000-8000-0000000000ff'
  ]::uuid[])),
  2::bigint,
  'One row per existing report: duplicates and unknown ids add no rows'
);
select is(
  (select count(*) from public.report_credibility_inputs(array[]::uuid[])),
  0::bigint,
  'An empty list returns no rows'
);

-- Limits: null and more than 100 ids are rejected, also on the internal one.
select lives_ok(
  $$select * from public.report_credibility_inputs(
      array_fill('09c00000-0000-4000-8000-000000000001'::uuid, array[100]))$$,
  '100 ids are accepted'
);
select throws_ok(
  $$select * from public.report_credibility_inputs(
      array_fill('09c00000-0000-4000-8000-000000000001'::uuid, array[101]))$$,
  '22023', null, '101 ids are rejected by the wrapper'
);
select throws_ok(
  $$select * from public.report_credibility_inputs(null)$$,
  '22023', null, 'A null list is rejected by the wrapper'
);
select throws_ok(
  $$select * from credibility_internal.report_inputs(
      array_fill('09c00000-0000-4000-8000-000000000001'::uuid, array[101]))$$,
  '22023', null, '101 ids are rejected by the internal function'
);
select throws_ok(
  $$select * from credibility_internal.report_inputs(null)$$,
  '22023', null, 'A null list is rejected by the internal function'
);

-- Direct reads of the closed table still fail.
select throws_ok($$select * from public.report_assessments$$,
  '42501', null, 'anon cannot read report_assessments directly');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"09b00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(pg_temp.inputs('09c00000-0000-4000-8000-000000000003'),
  row('09c00000-0000-4000-8000-000000000003'::uuid, '2026-11-03 08:00:00+00'::timestamptz,
      0, null::timestamptz, 0, 0, 2, 200, '2026-11-03 11:00:00+00'::timestamptz)::text,
  'authenticated gets the same aggregates through the wrapper');
select throws_ok($$select * from public.report_assessments$$,
  '42501', null, 'authenticated cannot read report_assessments directly');
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$select * from public.report_credibility_inputs(array['09c00000-0000-4000-8000-000000000001'::uuid])$$,
  '42501', null, 'service_role cannot execute the wrapper');
reset role;

-- Case 23: the current trust_level is used (raised to 100 after assessing).
update public.profiles set trust_level = 100
where id in ('09b00000-0000-4000-8000-000000000008', '09b00000-0000-4000-8000-000000000009');
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select is(pg_temp.inputs('09c00000-0000-4000-8000-000000000008'),
  row('09c00000-0000-4000-8000-000000000008'::uuid, '2026-11-08 08:00:00+00'::timestamptz,
      0, null::timestamptz, 2, 200, 0, 0, '2026-11-08 11:00:00+00'::timestamptz)::text,
  'Case 23: the current trust_level of each assessor is used (D4)');
reset role;

-- Emulate report visibility: whatever policies public.reports has, within
-- this transaction "Restricted report" is unreadable for both API roles.
do $$
declare
  policy record;
begin
  for policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'reports' and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy %I on public.reports', policy.policyname);
  end loop;
end
$$;
create policy test_reports_visible on public.reports
  for select to anon, authenticated using (title <> 'Restricted report');

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select results_eq(
  $$select report_id from public.report_credibility_inputs(array[
      '09c00000-0000-4000-8000-000000000008',
      '09c00000-0000-4000-8000-000000000009'
    ]::uuid[]) order by report_id$$,
  $$values ('09c00000-0000-4000-8000-000000000008'::uuid)$$,
  'anon: a report hidden by RLS gets no credibility row'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"09b00000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select report_id from public.report_credibility_inputs(array[
      '09c00000-0000-4000-8000-000000000008',
      '09c00000-0000-4000-8000-000000000009'
    ]::uuid[]) order by report_id$$,
  $$values ('09c00000-0000-4000-8000-000000000008'::uuid)$$,
  'authenticated: a report hidden by RLS gets no credibility row'
);
reset role;

select * from finish();
rollback;
