-- HU-05/T4 + HU-06 (answer 2 in PR #13): reports are publicly readable.
-- anon reads the public projection (no author_id); authenticated reads every
-- column. Writes stay revoked until HU-05 defines them.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select policies_are('public', 'reports', array['reports_select_public'],
  'Only the public read policy exists');
select policy_cmd_is('public', 'reports', 'reports_select_public', 'select',
  'The policy covers SELECT');
select policy_roles_are('public', 'reports', 'reports_select_public',
  array['anon', 'authenticated'], 'The policy applies to anon and authenticated');

select ok(has_table_privilege('authenticated', 'public.reports', 'SELECT'),
  'authenticated can read every column');
select ok(not has_table_privilege('anon', 'public.reports', 'SELECT'),
  'anon has no table-wide SELECT');
select ok(has_column_privilege('anon', 'public.reports', c, 'SELECT'),
  'anon can read ' || c)
from unnest(array[
  'id', 'title', 'description', 'pattern_type', 'target_url',
  'page_key', 'target_host', 'registrable_domain', 'created_at'
]) c;
select ok(not has_column_privilege('anon', 'public.reports', 'author_id', 'SELECT'),
  'anon cannot read author_id');
select ok(not has_any_column_privilege('service_role', 'public.reports', 'SELECT'),
  'service_role keeps no access');

insert into auth.users (id) values ('a7777777-7777-4777-8777-777777777777');
insert into public.reports (
  id, author_id, title, description, target_url,
  page_key, target_host, registrable_domain
) values (
  'c7777777-7777-4777-8777-777777777777', 'a7777777-7777-4777-8777-777777777777',
  'Public report', 'Description.', 'https://example.com/pricing',
  'https://example.com/pricing', 'example.com', 'example.com'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$select title, page_key from public.reports
    where registrable_domain = 'example.com'$$,
  $$values ('Public report'::text, 'https://example.com/pricing'::text)$$,
  'anon reads the public projection used by GET /api/reports'
);
select throws_ok($$select author_id from public.reports$$,
  '42501', null, 'anon cannot read the author');
select throws_ok($$insert into public.reports default values$$,
  '42501', null, 'anon cannot create reports');
select throws_ok($$update public.reports set title = 'x'$$,
  '42501', null, 'anon cannot update reports');
select throws_ok($$delete from public.reports$$,
  '42501', null, 'anon cannot delete reports');

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a7777777-7777-4777-8777-777777777777","role":"authenticated"}', true);

select results_eq(
  $$select author_id from public.reports
    where id = 'c7777777-7777-4777-8777-777777777777'$$,
  $$values ('a7777777-7777-4777-8777-777777777777'::uuid)$$,
  'authenticated reads every column, author included'
);
select throws_ok($$insert into public.reports default values$$,
  '42501', null, 'authenticated cannot create reports yet (HU-05)');
select throws_ok($$update public.reports set title = 'x'$$,
  '42501', null, 'authenticated cannot update reports');
select throws_ok($$delete from public.reports$$,
  '42501', null, 'authenticated cannot delete reports');

reset role;

select * from finish();
rollback;
