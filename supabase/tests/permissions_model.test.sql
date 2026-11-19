begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select results_eq($$select code from permissions order by code$$,
  $$values ('assessments.submit'),('evidences.add'),('reports.create'),('roles.manage_permissions'),('users.change_role'),('users.read')$$,
  'Exact closed catalog');
select results_eq($$select role_code, array_agg(permission_code order by permission_code) from role_permissions group by 1 order by 1$$,
  $$values ('admin',array['assessments.submit','evidences.add','reports.create','roles.manage_permissions','users.change_role','users.read']),
           ('collaborator',array['assessments.submit','evidences.add','reports.create']),
           ('developer',array['assessments.submit','evidences.add','reports.create'])$$, 'Exact seed matrix');
select ok(bool_and(length(name) > 0 and length(description) > 0), 'Catalog explains each capability') from permissions;
select throws_ok($$insert into permissions values ('invalid','X')$$,'23514',null,'Catalog is closed');
select throws_ok($$update permissions set name = E'\t'$$,'23514',null,'Control characters rejected');
select throws_ok($$update permissions set name = '   '$$,'23514',null,'Blank names rejected');
select throws_ok($$insert into role_permissions values ('developer','reports.create')$$,'23505',null,'Composite primary key');
select throws_ok($$insert into role_permissions values ('unknown','reports.create')$$,'23503',null,'Role FK');
select throws_ok($$insert into role_permissions values ('admin','unknown')$$,'23503',null,'Permission FK');
select throws_ok($$insert into role_permissions values (null,'reports.create')$$,'23502',null,'Non-null role');
select throws_ok($$insert into role_permissions values ('admin', null)$$,'23502',null,'Non-null capability');
select throws_ok($$insert into role_permissions values ('developer','users.read')$$,'23514',null,'Constraint protects critical grants');
select ok(relrowsecurity, 'RLS on ' || relname) from pg_class where oid in
  ('public.permissions'::regclass,'public.role_permissions'::regclass,'private.authorization_audit'::regclass);
select ok(not has_table_privilege(r,t,p), r || ' lacks ' || p || ' on ' || t)
from unnest(array['anon','authenticated','service_role']) r
cross join unnest(array['public.permissions','public.role_permissions','private.authorization_audit']) t
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER']) p;
select ok(not has_any_column_privilege(r,t,p), r || ' lacks column ' || p || ' on ' || t)
from unnest(array['anon','authenticated','service_role']) r
cross join unnest(array['public.permissions','public.role_permissions','private.authorization_audit','public.profiles']) t
cross join unnest(array['INSERT','UPDATE']) p;
select ok(not has_schema_privilege(r,'private','usage'), r || ' cannot resolve audit schema')
from unnest(array['anon','authenticated','service_role']) r;
select ok(not has_schema_privilege('authenticated','authorization_internal','create'), 'Cannot replace internal functions');
select ok(p.proconfig @> array['search_path=""'] and p.prosecdef = (n.nspname = 'authorization_internal'),
  n.nspname || '.' || p.proname || ' execution context')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('authorization_internal','public') and proname in
  ('my_permissions','list_users','change_role','permission_matrix','set_permission');
select ok(not has_function_privilege(r,p.oid,'execute'), r || ' lacks EXECUTE on ' || p.oid::regprocedure)
from pg_proc p cross join unnest(array['anon','service_role']) r
where pronamespace = 'authorization_internal'::regnamespace or
  (pronamespace = 'public'::regnamespace and proname in ('my_permissions','list_users','change_role','permission_matrix','set_permission'));
select ok(not has_function_privilege('authenticated',p.oid,'execute'), 'Guard is owner-only')
from pg_proc p where pronamespace = 'authorization_internal'::regnamespace and proname in ('lock_admin','require_admin');
select * from finish();
rollback;
