-- HU-06/T4a: report evidence security. Access is for authenticated users under
-- RLS (Bearer token pattern of the reports API); anon and service_role get
-- nothing. Report visibility is emulated with a temporary policy so these
-- tests do not depend on the policies of public.reports. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.evidence_path(uploader uuid, report uuid, evidence uuid)
returns text language sql immutable
as $$ select uploader::text || '/' || report::text || '/' || evidence::text || '.png' $$;
grant execute on function pg_temp.evidence_path(uuid, uuid, uuid) to authenticated;

select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.report_evidences'::regclass),
  'Report evidences RLS enabled'
);

select policies_are('public', 'report_evidences', array[
  'report_evidences_insert_own_active',
  'report_evidences_select_visible',
  'report_evidences_update_moderation_admin'
], 'Only insert, read and moderation policies');
select policy_cmd_is('public', 'report_evidences',
  'report_evidences_insert_own_active', 'insert', 'Insert policy covers INSERT');
select policy_cmd_is('public', 'report_evidences',
  'report_evidences_select_visible', 'select', 'Read policy covers SELECT');
select policy_cmd_is('public', 'report_evidences',
  'report_evidences_update_moderation_admin', 'update', 'Moderation policy covers UPDATE');
select policy_roles_are('public', 'report_evidences', p, array['authenticated'],
  p || ' applies only to authenticated')
from unnest(array[
  'report_evidences_insert_own_active',
  'report_evidences_select_visible',
  'report_evidences_update_moderation_admin'
]) p;

-- Privileges: anon and service_role have none.
select ok(
  not has_table_privilege(r, 'public.report_evidences', p),
  r || ' lacks ' || p
)
from unnest(array['anon', 'service_role']) r
cross join unnest(array[
  'SELECT', 'INSERT', 'UPDATE', 'DELETE',
  'TRUNCATE', 'REFERENCES', 'TRIGGER'
]) p;
select ok(
  not has_any_column_privilege(r, 'public.report_evidences', p),
  r || ' lacks column ' || p
)
from unnest(array['anon', 'service_role']) r
cross join unnest(array['SELECT', 'INSERT', 'UPDATE']) p;

-- authenticated: read rows, insert only server-provided columns and update
-- only the moderation status. No delete.
select ok(has_table_privilege('authenticated', 'public.report_evidences', 'SELECT'),
  'authenticated can SELECT');
select ok(
  not has_table_privilege('authenticated', 'public.report_evidences', p),
  'authenticated lacks table-wide ' || p
)
from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p;
select ok(
  has_column_privilege('authenticated', 'public.report_evidences', c, 'INSERT'),
  'authenticated can insert ' || c
)
from unnest(array[
  'id', 'report_id', 'uploaded_by', 'storage_path', 'original_name',
  'mime_type', 'size_bytes', 'sha256'
]) c;
select ok(
  not has_column_privilege('authenticated', 'public.report_evidences', c, 'INSERT'),
  'authenticated cannot choose ' || c
)
from unnest(array['moderation_status', 'created_at']) c;
select ok(
  has_column_privilege('authenticated', 'public.report_evidences', 'moderation_status', 'UPDATE'),
  'authenticated can request a moderation change (RLS limits it to admins)'
);
select ok(
  not has_column_privilege('authenticated', 'public.report_evidences', c, 'UPDATE'),
  'authenticated cannot update ' || c
)
from unnest(array[
  'id', 'report_id', 'uploaded_by', 'storage_path', 'original_name',
  'mime_type', 'size_bytes', 'sha256', 'created_at'
]) c;

-- Fixtures, created as the owner.
insert into auth.users (id) values
  ('b1111111-1111-4111-8111-111111111111'),  -- active collaborator
  ('b2222222-2222-4222-8222-222222222222'),  -- active collaborator, report author
  ('b3333333-3333-4333-8333-333333333333'),  -- inactive collaborator
  ('b4444444-4444-4444-8444-444444444444'),  -- active admin
  ('b5555555-5555-4555-8555-555555555555');  -- inactive admin

update public.profiles set is_active = false
where id in ('b3333333-3333-4333-8333-333333333333', 'b5555555-5555-4555-8555-555555555555');
update public.profiles set role_code = 'admin'
where id in ('b4444444-4444-4444-8444-444444444444', 'b5555555-5555-4555-8555-555555555555');

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
   pg_temp.evidence_path('b2222222-2222-4222-8222-222222222222',
     'c1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111'),
   'visible.png', 'image/png', 100, repeat('1', 64), 'visible'),
  ('e2222222-2222-4222-8222-222222222222', 'c1111111-1111-4111-8111-111111111111',
   'b2222222-2222-4222-8222-222222222222',
   pg_temp.evidence_path('b2222222-2222-4222-8222-222222222222',
     'c1111111-1111-4111-8111-111111111111', 'e2222222-2222-4222-8222-222222222222'),
   'oculta.png', 'image/png', 100, repeat('2', 64), 'hidden'),
  ('e3333333-3333-4333-8333-333333333333', 'c2222222-2222-4222-8222-222222222222',
   'b2222222-2222-4222-8222-222222222222',
   pg_temp.evidence_path('b2222222-2222-4222-8222-222222222222',
     'c2222222-2222-4222-8222-222222222222', 'e3333333-3333-4333-8333-333333333333'),
   'restringida.png', 'image/png', 100, repeat('3', 64), 'visible');

-- Anonymous users cannot touch evidences at all.
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

-- Emulate report visibility: whatever policies public.reports has, within
-- this transaction only "Restricted report" is unreadable.
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
grant select on public.reports to authenticated;
create policy test_reports_visible on public.reports
  for select to authenticated using (title <> 'Restricted report');

-- Active collaborator.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select results_eq(
  $$select id from public.report_evidences order by id$$,
  $$values ('e1111111-1111-4111-8111-111111111111'::uuid)$$,
  'Only visible evidences of readable reports are readable'
);

select lives_ok(
  $$insert into public.report_evidences (
      id, report_id, uploaded_by, storage_path, original_name,
      mime_type, size_bytes, sha256)
    values ('e4444444-4444-4444-8444-444444444444',
      'c1111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111',
      pg_temp.evidence_path('b1111111-1111-4111-8111-111111111111',
        'c1111111-1111-4111-8111-111111111111', 'e4444444-4444-4444-8444-444444444444'),
      'mia.png', 'image/png', 100, repeat('4', 64))$$,
  'Active collaborator adds an evidence to a report by another author'
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
      pg_temp.evidence_path('b2222222-2222-4222-8222-222222222222',
        'c1111111-1111-4111-8111-111111111111', 'e5555555-5555-4555-8555-555555555555'),
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
      pg_temp.evidence_path('b1111111-1111-4111-8111-111111111111',
        'c2222222-2222-4222-8222-222222222222', 'e6666666-6666-4666-8666-666666666666'),
      'restringida.png', 'image/png', 100, repeat('6', 64))$$,
  '42501', null, 'Cannot add evidence to a report the user cannot read'
);

select throws_ok(
  $$insert into public.report_evidences (
      id, report_id, uploaded_by, storage_path, original_name,
      mime_type, size_bytes, sha256, moderation_status)
    values ('e7777777-7777-4777-8777-777777777777',
      'c1111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111',
      pg_temp.evidence_path('b1111111-1111-4111-8111-111111111111',
        'c1111111-1111-4111-8111-111111111111', 'e7777777-7777-4777-8777-777777777777'),
      'moderada.png', 'image/png', 100, repeat('7', 64), 'hidden')$$,
  '42501', null, 'Moderation status cannot be chosen by the uploader'
);

-- Per-collaborator limit through the API role: four more reach the five allowed.
select lives_ok(
  $$insert into public.report_evidences (
      id, report_id, uploaded_by, storage_path, original_name,
      mime_type, size_bytes, sha256)
    select id, 'c1111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111',
      pg_temp.evidence_path('b1111111-1111-4111-8111-111111111111',
        'c1111111-1111-4111-8111-111111111111', id),
      'lote.png', 'image/png', 100, sha
    from (values
      ('ea111111-1111-4111-8111-111111111111'::uuid, repeat('a', 64)),
      ('ea222222-2222-4222-8222-222222222222'::uuid, repeat('b', 64)),
      ('ea333333-3333-4333-8333-333333333333'::uuid, repeat('c', 64)),
      ('ea444444-4444-4444-8444-444444444444'::uuid, repeat('d', 64))
    ) as batch(id, sha)$$,
  'A collaborator reaches the limit of five evidences in a report'
);

select throws_ok(
  $$insert into public.report_evidences (
      id, report_id, uploaded_by, storage_path, original_name,
      mime_type, size_bytes, sha256)
    values ('ea555555-5555-4555-8555-555555555555',
      'c1111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111',
      pg_temp.evidence_path('b1111111-1111-4111-8111-111111111111',
        'c1111111-1111-4111-8111-111111111111', 'ea555555-5555-4555-8555-555555555555'),
      'sexta.png', 'image/png', 100, repeat('e', 64))$$,
  '23514', 'EVIDENCE_TOO_MANY', 'The sixth evidence is rejected'
);

with changed as (
  update public.report_evidences set moderation_status = 'hidden' returning id
)
select is((select count(*) from changed), 0::bigint,
  'A collaborator cannot moderate, not even their own evidences');

select throws_ok($$update public.report_evidences set original_name = 'otro.png'$$,
  '42501', null, 'Evidence data cannot be updated');
select throws_ok($$delete from public.report_evidences$$,
  '42501', null, 'Evidences cannot be deleted directly');

-- Inactive profile, whatever its token metadata says, and token without subject.
select set_config('request.jwt.claims',
  '{"sub":"b3333333-3333-4333-8333-333333333333","role":"authenticated","user_metadata":{"is_active":true}}', true);
select throws_ok(
  $$insert into public.report_evidences (
      id, report_id, uploaded_by, storage_path, original_name,
      mime_type, size_bytes, sha256)
    values ('e8888888-8888-4888-8888-888888888888',
      'c1111111-1111-4111-8111-111111111111',
      'b3333333-3333-4333-8333-333333333333',
      pg_temp.evidence_path('b3333333-3333-4333-8333-333333333333',
        'c1111111-1111-4111-8111-111111111111', 'e8888888-8888-4888-8888-888888888888'),
      'inactivo.png', 'image/png', 100, repeat('8', 64))$$,
  '42501', null, 'Inactive profile cannot add evidences'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$insert into public.report_evidences (
      id, report_id, uploaded_by, storage_path, original_name,
      mime_type, size_bytes, sha256)
    values ('e9999999-9999-4999-8999-999999999999',
      'c1111111-1111-4111-8111-111111111111',
      'b1111111-1111-4111-8111-111111111111',
      pg_temp.evidence_path('b1111111-1111-4111-8111-111111111111',
        'c1111111-1111-4111-8111-111111111111', 'e9999999-9999-4999-8999-999999999999'),
      'sinsesion.png', 'image/png', 100, repeat('9', 64))$$,
  '42501', null, 'Token without a subject cannot add evidences'
);

-- Active admin: sees every evidence and changes only the moderation status.
select set_config('request.jwt.claims',
  '{"sub":"b4444444-4444-4444-8444-444444444444","role":"authenticated"}', true);

select ok(
  (select count(*) from public.report_evidences
   where id in ('e1111111-1111-4111-8111-111111111111',
                'e2222222-2222-4222-8222-222222222222',
                'e3333333-3333-4333-8333-333333333333')) = 3,
  'Admin sees hidden evidences and those of unreadable reports to moderate them'
);

with changed as (
  update public.report_evidences set moderation_status = 'visible'
  where id = 'e2222222-2222-4222-8222-222222222222' returning id
)
select is((select count(*) from changed), 1::bigint, 'Admin makes a hidden evidence visible');

with changed as (
  update public.report_evidences set moderation_status = 'hidden'
  where id = 'e1111111-1111-4111-8111-111111111111' returning id
)
select is((select count(*) from changed), 1::bigint, 'Admin hides an evidence');

select throws_ok(
  $$update public.report_evidences set moderation_status = 'removed'
    where id = 'e1111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'Admin cannot set an unknown moderation status');
select throws_ok($$update public.report_evidences set sha256 = repeat('0', 64)$$,
  '42501', null, 'Admin cannot change evidence data');
select throws_ok($$delete from public.report_evidences$$,
  '42501', null, 'Admin cannot delete evidences directly');

-- Inactive admin is not an admin.
select set_config('request.jwt.claims',
  '{"sub":"b5555555-5555-4555-8555-555555555555","role":"authenticated"}', true);

with changed as (
  update public.report_evidences set moderation_status = 'visible' returning id
)
select is((select count(*) from changed), 0::bigint, 'Inactive admin cannot moderate');

select ok(
  not exists (select 1 from public.report_evidences
              where id = 'e1111111-1111-4111-8111-111111111111'),
  'Inactive admin does not see the evidence hidden by the active admin'
);

reset role;

select * from finish();
rollback;
