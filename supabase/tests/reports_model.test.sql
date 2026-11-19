begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'reports', 'Reports table exists');
select columns_are('public', 'reports', array[
  'id',
  'author_id',
  'title',
  'description',
  'pattern_type',
  'target_url',
  'page_key',
  'target_host',
  'registrable_domain',
  'created_at'
]);

select col_is_pk('public', 'reports', 'id', 'Report ID is the primary key');

select col_not_null('public', 'reports', 'author_id', 'Author is required');
select col_not_null('public', 'reports', 'title', 'Title is required');
select col_not_null('public', 'reports', 'description', 'Description is required');
select col_not_null('public', 'reports', 'target_url', 'Target URL is required');
select col_not_null('public', 'reports', 'page_key', 'Page key is required');
select col_not_null('public', 'reports', 'target_host', 'Target host is required');
select col_not_null('public', 'reports', 'registrable_domain', 'Domain is required');


select fk_ok(
  'public', 'reports', 'author_id',
  'public', 'profiles', 'id'
);


select ok(
  exists(
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'reports'
      and indexname = 'reports_author_id_idx'
  ),
  'Author index exists'
);

select ok(
  exists(
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'reports'
      and indexname = 'reports_page_key_idx'
  ),
  'Page key index exists'
);

select ok(
  exists(
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'reports'
      and indexname = 'reports_registrable_domain_idx'
  ),
  'Domain index exists'
);


insert into auth.users (id)
values ('e1111111-1111-4111-8111-111111111111');


insert into public.reports (
  author_id,
  title,
  description,
  target_url,
  page_key,
  target_host,
  registrable_domain
) values (
  'e1111111-1111-4111-8111-111111111111',
  'Hidden subscription',
  'The website hides subscription information.',
  'https://example.com/pricing',
  'example.com/pricing',
  'example.com',
  'example.com'
);

select is(
  (select count(*)::integer from public.reports
   where title = 'Hidden subscription'),
  1,
  'Valid report is stored'
);

select throws_ok(
  $$insert into public.reports (
    author_id, title, description, target_url,
    page_key, target_host, registrable_domain
  ) values (
    'e1111111-1111-4111-8111-111111111111',
    '', 'Description', 'https://example.com',
    'example.com', 'example.com', 'example.com'
  )$$,
  '23514', null, 'Empty title rejected'
);

select throws_ok(
  $$insert into public.reports (
    author_id, title, description, target_url,
    page_key, target_host, registrable_domain
  ) values (
    'e1111111-1111-4111-8111-111111111111',
    'Test', '', 'https://example.com',
    'example.com', 'example.com', 'example.com'
  )$$,
  '23514', null, 'Empty description rejected'
);

select throws_ok(
  $$insert into public.reports (
    author_id, title, description, target_url,
    page_key, target_host, registrable_domain
  ) values (
    'e1111111-1111-4111-8111-111111111111',
    'Test', 'Description', 'invalid-url',
    'example.com', 'example.com', 'example.com'
  )$$,
  '23514', null, 'Invalid URL rejected'
);

select throws_ok(
  $$insert into public.reports (
    author_id, title, description, target_url,
    page_key, target_host, registrable_domain
  ) values (
    'e2222222-2222-4222-8222-222222222222',
    'Test', 'Description', 'https://example.com',
    'example.com', 'example.com', 'example.com'
  )$$,
  '23503', null, 'Unknown author rejected'
);


select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'public.reports'::regclass),
  'Reports RLS is enabled'
);


select ok(
  not has_table_privilege('anon', 'public.reports', 'SELECT')
  and not has_table_privilege('authenticated', 'public.reports', 'INSERT')
  and not has_table_privilege('authenticated', 'public.reports', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.reports', 'DELETE'),
  'Direct report writes are restricted (public read: reports_public_read.test.sql)'
);

select * from finish();
rollback;
