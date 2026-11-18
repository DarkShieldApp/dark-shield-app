-- HU-06/T4a: report evidence security. Grants stay revoked until the report
-- visibility (HU-05), sessions (HU-11) and permissions (HU-14/T3) are agreed.
-- The second part grants access temporarily, inside this rolled-back
-- transaction, to check what the policies will allow once access is opened.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.report_evidences'::regclass),
  'Report evidences RLS enabled'
);

select results_eq(
  $$select policyname::text, cmd::text, roles::text
    from pg_policies
    where schemaname = 'public' and tablename = 'report_evidences'
    order by policyname$$,
  $$values
    ('report_evidences_insert_own_active', 'INSERT', '{authenticated}'),
    ('report_evidences_select_visible', 'SELECT', '{authenticated}')$$,
  'Only insert and read policies for authenticated users'
);

select ok(
  not has_table_privilege(r, 'public.report_evidences', p),
  r || ' lacks ' || p
)
from unnest(array['anon', 'authenticated', 'service_role']) r
cross join unnest(array[
  'SELECT', 'INSERT', 'UPDATE', 'DELETE',
  'TRUNCATE', 'REFERENCES', 'TRIGGER'
]) p;

select ok(
  not has_any_column_privilege(r, 'public.report_evidences', p),
  r || ' lacks column ' || p
)
from unnest(array['anon', 'authenticated', 'service_role']) r
cross join unnest(array['SELECT', 'INSERT', 'UPDATE']) p;

-- Fixtures, created as the owner.
insert into auth.users (id) values
  ('b1111111-1111-4111-8111-111111111111'),  -- active collaborator
  ('b2222222-2222-4222-8222-222222222222'),  -- another active collaborator
  ('b3333333-3333-4333-8333-333333333333');  -- inactive profile

update public.profiles set is_active = false
where id = 'b3333333-3333-4333-8333-333333333333';

insert into public.reports (
  id, author_id, title, description, target_url,
  page_key, target_host, registrable_domain
) values
  ('c1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222',
   'Visible report', 'Description.', 'https://example.com/a',
   'https://example.com/a', 'example.com', 'example.com'),
  ('c2222222-2222-4222-8222-222222222222', 'b2222222-2222-4222-8222-222222222222',
   'Restricted report', 'Description.', 'https://example.com/b',
   'https://example.com/b', 'example.com', 'example.com');

insert into public.report_evidences (
  id, report_id, uploaded_by, storage_path, original_name,
  mime_type, size_bytes, sha256, moderation_status
) values
  ('e1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111',
   'b2222222-2222-4222-8222-222222222222',
   'reports/c1111111-1111-4111-8111-111111111111/e1111111-1111-4111-8111-111111111111.png',
   'visible.png', 'image/png', 100, repeat('1', 64), 'visible'),
  ('e2222222-2222-4222-8222-222222222222', 'c1111111-1111-4111-8111-111111111111',
   'b2222222-2222-4222-8222-222222222222',
   'reports/c1111111-1111-4111-8111-111111111111/e2222222-2222-4222-8222-222222222222.png',
   'oculta.png', 'image/png', 100, repeat('2', 64), 'hidden'),
  ('e3333333-3333-4333-8333-333333333333', 'c2222222-2222-4222-8222-222222222222',
   'b2222222-2222-4222-8222-222222222222',
   'reports/c2222222-2222-4222-8222-222222222222/e3333333-3333-4333-8333-333333333333.png',
   'restringida.png', 'image/png', 100, repeat('3', 64), 'visible');

-- Part 1: with the current grants nobody can use the table directly.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select throws_ok($$select * from public.report_evidences$$,
  '42501', null, 'Authenticated evidence read denied');
select throws_ok($$insert into public.report_evidences default values$$,
  '42501', null, 'Authenticated evidence insert denied');
select throws_ok($$update public.report_evidences set moderation_status = 'hidden'$$,
  '42501', null, 'Authenticated evidence update denied');
select throws_ok($$delete from public.report_evidences$$,
  '42501', null, 'Authenticated evidence delete denied');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$select * from public.report_evidences$$,
  '42501', null, 'Anonymous evidence read denied');
select throws_ok($$insert into public.report_evidences default values$$,
  '42501', null, 'Anonymous evidence insert denied');
select throws_ok($$update public.report_evidences set moderation_status = 'hidden'$$,
  '42501', null, 'Anonymous evidence update denied');
select throws_ok($$delete from public.report_evidences$$,
  '42501', null, 'Anonymous evidence delete denied');

reset role;

-- Part 2: policies once access is opened. The report visibility rule is not
-- decided yet (HU-05); a temporary policy stands in for it so the evidence
-- policies, which delegate to it, can be exercised. All of this is rolled back.
grant select on public.reports to authenticated;
create policy test_reports_visible on public.reports
  for select to authenticated using (title <> 'Restricted report');

grant select on public.report_evidences to anon, authenticated;
grant insert (id, report_id, uploaded_by, storage_path, original_name,
              mime_type, size_bytes, sha256)
  on public.report_evidences to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select results_eq(
  $$select id from public.report_evidences order by id$$,
  $$values ('e1111111-1111-4111-8111-111111111111'::uuid)$$,
  'Only visible evidences of visible reports are readable'
);

select lives_ok(
  $$insert into public.report_evidences (
      id, report_id, uploaded_by, storage_path, original_name,
      mime_type, size_bytes, sha256)
    values ('e4444444-4444-4444-8444-444444444444',
      'c1111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111',
      'reports/c1111111-1111-4111-8111-111111111111/e4444444-4444-4444-8444-444444444444.png',
      'mia.png', 'image/png', 100, repeat('4', 64))$$,
  'Active collaborator adds an evidence to a visible report'
);

select results_eq(
  $$select uploaded_by, moderation_status from public.report_evidences
    where id = 'e4444444-4444-4444-8444-444444444444'$$,
  $$values ('b1111111-1111-4111-8111-111111111111'::uuid, 'visible'::text)$$,
  'The new evidence is readable and starts visible'
);

select throws_ok(
  $$insert into public.report_evidences (
      id, report_id, uploaded_by, storage_path, original_name,
      mime_type, size_bytes, sha256)
    values ('e5555555-5555-4555-8555-555555555555',
      'c1111111-1111-4111-8111-111111111111',
      'b2222222-2222-4222-8222-222222222222',
      'reports/c1111111-1111-4111-8111-111111111111/e5555555-5555-4555-8555-555555555555.png',
      'suplantada.png', 'image/png', 100, repeat('5', 64))$$,
  '42501', null, 'Cannot upload in the name of another user'
);

select throws_ok(
  $$insert into public.report_evidences (
      id, report_id, uploaded_by, storage_path, original_name,
      mime_type, size_bytes, sha256)
    values ('e6666666-6666-4666-8666-666666666666',
      'c2222222-2222-4222-8222-222222222222',
      'b1111111-1111-4111-8111-111111111111',
      'reports/c2222222-2222-4222-8222-222222222222/e6666666-6666-4666-8666-666666666666.png',
      'restringida.png', 'image/png', 100, repeat('6', 64))$$,
  '42501', null, 'Cannot add evidence to a report the user cannot see'
);

select throws_ok(
  $$insert into public.report_evidences (
      id, report_id, uploaded_by, storage_path, original_name,
      mime_type, size_bytes, sha256, moderation_status)
    values ('e7777777-7777-4777-8777-777777777777',
      'c1111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111',
      'reports/c1111111-1111-4111-8111-111111111111/e7777777-7777-4777-8777-777777777777.png',
      'moderada.png', 'image/png', 100, repeat('7', 64), 'hidden')$$,
  '42501', null, 'Moderation status cannot be chosen by the uploader'
);

select throws_ok($$update public.report_evidences set moderation_status = 'hidden'$$,
  '42501', null, 'Evidences cannot be updated directly');
select throws_ok($$delete from public.report_evidences$$,
  '42501', null, 'Evidences cannot be deleted directly');

select set_config('request.jwt.claims',
  '{"sub":"b3333333-3333-4333-8333-333333333333","role":"authenticated","user_metadata":{"is_active":true}}', true);

select throws_ok(
  $$insert into public.report_evidences (
      id, report_id, uploaded_by, storage_path, original_name,
      mime_type, size_bytes, sha256)
    values ('e8888888-8888-4888-8888-888888888888',
      'c1111111-1111-4111-8111-111111111111',
      'b3333333-3333-4333-8333-333333333333',
      'reports/c1111111-1111-4111-8111-111111111111/e8888888-8888-4888-8888-888888888888.png',
      'inactivo.png', 'image/png', 100, repeat('8', 64))$$,
  '42501', null, 'Inactive profile cannot add evidences, whatever its token metadata says'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select throws_ok(
  $$insert into public.report_evidences (
      id, report_id, uploaded_by, storage_path, original_name,
      mime_type, size_bytes, sha256)
    values ('e9999999-9999-4999-8999-999999999999',
      'c1111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111',
      'reports/c1111111-1111-4111-8111-111111111111/e9999999-9999-4999-8999-999999999999.png',
      'sinsesion.png', 'image/png', 100, repeat('9', 64))$$,
  '42501', null, 'Token without a subject cannot add evidences'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*) from public.report_evidences),
  0::bigint,
  'Without a policy for anon, no evidence is readable anonymously'
);

reset role;

select * from finish();
rollback;
