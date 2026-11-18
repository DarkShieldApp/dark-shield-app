begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'public.reports'::regclass),
  'Reports RLS enabled'
);


select is(
  (select count(*)
   from pg_policies
   where schemaname = 'public'
     and tablename = 'reports'),
  0::bigint,
  'No report access policies defined'
);


select ok(
  not has_table_privilege(r, 'public.reports', p),
  r || ' lacks ' || p
)
from unnest(array[
  'anon', 'authenticated', 'service_role'
]) r
cross join unnest(array[
  'SELECT', 'INSERT', 'UPDATE', 'DELETE',
  'TRUNCATE', 'REFERENCES', 'TRIGGER'
]) p;


select ok(
  not has_any_column_privilege(r, 'public.reports', p),
  r || ' lacks column ' || p
)
from unnest(array['anon', 'authenticated']) r
cross join unnest(array['INSERT', 'UPDATE']) p;


set local role authenticated;

select throws_ok(
  $$select * from public.reports$$,
  '42501', null,
  'Authenticated report read denied'
);

select throws_ok(
  $$insert into public.reports default values$$,
  '42501', null,
  'Authenticated report insert denied'
);

select throws_ok(
  $$update public.reports set title = 'Modified'$$,
  '42501', null,
  'Authenticated report update denied'
);

select throws_ok(
  $$delete from public.reports$$,
  '42501', null,
  'Authenticated report delete denied'
);

reset role;

set local role anon;

select throws_ok(
  $$select * from public.reports$$,
  '42501', null,
  'Anonymous report read denied'
);

select throws_ok(
  $$insert into public.reports default values$$,
  '42501', null,
  'Anonymous report insert denied'
);

select throws_ok(
  $$update public.reports set title = 'Modified'$$,
  '42501', null,
  'Anonymous report update denied'
);

select throws_ok(
  $$delete from public.reports$$,
  '42501', null,
  'Anonymous report delete denied'
);

reset role;

grant select, insert, update, delete
  on public.reports to anon, authenticated;

set local role authenticated;

select is(
  (select count(*) from public.reports),
  0::bigint,
  'RLS hides reports from authenticated users'
);

select throws_ok(
  $$insert into public.reports default values$$,
  '42501', null,
  'RLS rejects authenticated insertion'
);

with changed as (
  update public.reports
  set title = 'Modified'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'RLS blocks authenticated updates'
);

with removed as (
  delete from public.reports returning id
)
select is(
  (select count(*) from removed),
  0::bigint,
  'RLS blocks authenticated deletion'
);

reset role;

set local role anon;

select is(
  (select count(*) from public.reports),
  0::bigint,
  'RLS hides reports from anonymous users'
);

select throws_ok(
  $$insert into public.reports default values$$,
  '42501', null,
  'RLS rejects anonymous insertion'
);

with changed as (
  update public.reports
  set title = 'Modified'
  returning id
)
select is(
  (select count(*) from changed),
  0::bigint,
  'RLS blocks anonymous updates'
);

with removed as (
  delete from public.reports returning id
)
select is(
  (select count(*) from removed),
  0::bigint,
  'RLS blocks anonymous deletion'
);

reset role;

select * from finish();
rollback;
