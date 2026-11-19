-- Replay exactly the migration recorded by the local CLI against populated T2.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);
drop function public.my_permissions();
drop function authorization_internal.my_permissions();
drop function public.list_users(integer, uuid);
drop function authorization_internal.list_users(integer, uuid);
drop function public.permission_matrix();
drop function authorization_internal.permission_matrix();
drop function public.change_role(uuid, text);
drop function authorization_internal.change_role(uuid, text);
drop function public.set_permission(text, text, boolean);
drop function authorization_internal.set_permission(text, text, boolean);
drop function authorization_internal.lock_admin(text);
drop function authorization_internal.require_admin(text);
drop schema authorization_internal;
drop table private.authorization_audit, public.role_permissions, public.permissions;
insert into auth.users (id) values ('00000000-0000-4000-9000-000000000010');
update profiles set role_code='developer', display_name='Existing', trust_level=47, is_active=false
  where id='00000000-0000-4000-9000-000000000010';
create temporary table before_profiles as table profiles;
create temporary table before_roles as table roles;
select unnest(statements) from supabase_migrations.schema_migrations where version='20261119104009'
\gexec
select results_eq($$select * from profiles order by id$$,$$select * from before_profiles order by id$$,'All existing profile data and timestamps preserved');
select results_eq($$select * from roles order by code$$,$$select * from before_roles order by code$$,'Existing roles preserved');
select is((select count(*) from role_permissions),12::bigint,'Migration installs the complete matrix');
select is((select count(*) from private.authorization_audit),0::bigint,'Seed is not a user action');
select * from finish();
rollback;
