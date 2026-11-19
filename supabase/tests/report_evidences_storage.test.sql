-- HU-06/T4: private report-evidences bucket and its storage.objects policies.
-- Objects live in {user_id}/{report_id}/{uuid}.{png|jpg|webp}; the first
-- folder is the owner. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select results_eq(
  $$select public, file_size_limit, allowed_mime_types
    from storage.buckets where id = 'report-evidences'$$,
  $$values (false, 10485760::bigint, array['image/png', 'image/jpeg', 'image/webp'])$$,
  'Private bucket with the limits of rules.ts (10 MiB, PNG/JPEG/WebP, no PDF)'
);

select is(
  (select count(*) from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'report_evidences_objects_%'),
  3::bigint, 'Exactly three evidence policies on storage.objects (no update policy)'
);
select policy_cmd_is('storage', 'objects', p, c, p || ' covers ' || c)
from (values
  ('report_evidences_objects_insert_own', 'insert'),
  ('report_evidences_objects_select', 'select'),
  ('report_evidences_objects_delete_own_unregistered', 'delete')
) as policies(p, c);
select policy_roles_are('storage', 'objects', p, array['authenticated'],
  p || ' applies only to authenticated')
from unnest(array[
  'report_evidences_objects_insert_own',
  'report_evidences_objects_select',
  'report_evidences_objects_delete_own_unregistered'
]) p;

-- Fixtures, as the owner: u1 uploads, u2 is another collaborator, u3 is inactive.
insert into auth.users (id) values
  ('51111111-1111-4111-8111-111111111111'),
  ('52222222-2222-4222-8222-222222222222'),
  ('53333333-3333-4333-8333-333333333333');
update public.profiles set is_active = false
where id = '53333333-3333-4333-8333-333333333333';

insert into public.reports (
  id, author_id, title, description, target_url,
  page_key, target_host, registrable_domain
) values (
  'f1111111-1111-4111-8111-111111111111', '52222222-2222-4222-8222-222222222222',
  'Report', 'Description.', 'https://example.com/a',
  'https://example.com/a', 'example.com', 'example.com'
);

-- Unregistered upload of u1 and the object of a registered evidence of u1.
insert into storage.objects (bucket_id, name) values
  ('report-evidences',
   '51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/a1111111-1111-4111-8111-111111111111.png'),
  ('report-evidences',
   '51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/b1111111-1111-4111-8111-111111111111.png');
insert into public.report_evidences (
  id, report_id, uploaded_by, storage_path, original_name, mime_type, size_bytes, sha256
) values (
  'b1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111',
  '51111111-1111-4111-8111-111111111111',
  '51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/b1111111-1111-4111-8111-111111111111.png',
  'captura.png', 'image/png', 100, repeat('a', 64)
);

-- Owner of the uploads.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"51111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('report-evidences',
    '51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/c1111111-1111-4111-8111-111111111111.jpg')$$,
  'An active collaborator uploads to their own folder for a readable report'
);

select throws_ok(
  format($$insert into storage.objects (bucket_id, name) values ('report-evidences', %L)$$, name),
  '42501', null, description
)
from (values
  ('52222222-2222-4222-8222-222222222222/f1111111-1111-4111-8111-111111111111/c2222222-2222-4222-8222-222222222222.png',
   'Cannot upload to the folder of another user'),
  ('51111111-1111-4111-8111-111111111111/f9999999-9999-4999-8999-999999999999/c3333333-3333-4333-8333-333333333333.png',
   'Cannot upload for a report that does not exist or is not readable'),
  ('51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/captura.png',
   'The file name must be a server-generated UUID'),
  ('51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/c4444444-4444-4444-8444-444444444444.pdf',
   'PDF is not an allowed extension'),
  ('51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/c5555555-5555-4555-8555-555555555555.jpeg',
   'Only the canonical .jpg extension is allowed'),
  ('51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/extra/c6666666-6666-4666-8666-666666666666.png',
   'Extra folders are not allowed'),
  ('51111111-1111-4111-8111-111111111111/c7777777-7777-4777-8777-777777777777.png',
   'The report folder is required')
) as cases(name, description);

select results_eq(
  $$select name from storage.objects where bucket_id = 'report-evidences' order by name$$,
  $$values
    ('51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/a1111111-1111-4111-8111-111111111111.png'),
    ('51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/b1111111-1111-4111-8111-111111111111.png'),
    ('51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/c1111111-1111-4111-8111-111111111111.jpg')$$,
  'The owner reads all of their objects, registered or not'
);

with changed as (
  update storage.objects set metadata = '{}'::jsonb
  where bucket_id = 'report-evidences' returning id
)
select is((select count(*) from changed), 0::bigint, 'Objects cannot be overwritten (no update policy)');

-- Direct deletes are blocked by Storage itself; allow them to test the policy.
select set_config('storage.allow_delete_query', 'true', true);

with removed as (
  delete from storage.objects
  where name = '51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/a1111111-1111-4111-8111-111111111111.png'
  returning id
)
select is((select count(*) from removed), 1::bigint, 'The owner deletes an unconfirmed upload');

with removed as (
  delete from storage.objects
  where name = '51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/b1111111-1111-4111-8111-111111111111.png'
  returning id
)
select is((select count(*) from removed), 0::bigint,
  'The owner cannot delete the object of a registered evidence');

-- Another collaborator.
select set_config('request.jwt.claims',
  '{"sub":"52222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select results_eq(
  $$select name from storage.objects where bucket_id = 'report-evidences' order by name$$,
  $$values
    ('51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/b1111111-1111-4111-8111-111111111111.png')$$,
  'Others read only objects of registered evidences they can read'
);

with removed as (
  delete from storage.objects where bucket_id = 'report-evidences' returning id
)
select is((select count(*) from removed), 0::bigint, 'Others cannot delete any object');

-- Hidden evidences stop being readable for others.
reset role;
update public.report_evidences set moderation_status = 'hidden'
where id = 'b1111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"52222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is(
  (select count(*) from storage.objects where bucket_id = 'report-evidences'),
  0::bigint, 'The object of a hidden evidence is not readable by others'
);

-- Inactive profile.
select set_config('request.jwt.claims',
  '{"sub":"53333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('report-evidences',
    '53333333-3333-4333-8333-333333333333/f1111111-1111-4111-8111-111111111111/c8888888-8888-4888-8888-888888888888.png')$$,
  '42501', null, 'An inactive profile cannot upload'
);

-- Anonymous users.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  (select count(*) from storage.objects where bucket_id = 'report-evidences'),
  0::bigint, 'Anonymous users read no evidence object'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('report-evidences',
    '51111111-1111-4111-8111-111111111111/f1111111-1111-4111-8111-111111111111/c9999999-9999-4999-8999-999999999999.png')$$,
  '42501', null, 'Anonymous users cannot upload'
);

reset role;

select * from finish();
rollback;
