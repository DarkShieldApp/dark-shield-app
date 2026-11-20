begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001','{}'),
  ('00000000-0000-4000-8000-000000000002','{"role_code":"admin"}');
update profiles set role_code = 'admin' where id = '00000000-0000-4000-8000-000000000001';
set local role anon;
select throws_ok($$select public.my_permissions()$$,'42501',null,'Anonymous RPC denied');
select throws_ok($$delete from role_permissions$$,'42501',null,'Anonymous write denied');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select is(public.my_permissions(), null::jsonb, 'Missing subject');
select throws_ok($$select public.list_users(1,null)$$,'42501',null,'Missing subject denied');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","user_metadata":{"role_code":"admin"},"permissions":["users.read"]}';
select is(public.my_permissions(), '{"roleCode":"collaborator","permissions":["assessments.submit","evidences.add","reports.create"]}'::jsonb,
  'New user has only collaboration permissions');
select throws_ok($$select public.change_role(auth.uid(),'admin')$$,'42501',null,'No self-promotion');
select throws_ok($$select public.permission_matrix()$$,'42501',null,'No matrix for non-admin');
select throws_ok($$select public.set_permission('developer','reports.create',false)$$,'42501',null,'Cannot revoke via RPC');
select throws_ok($$select authorization_internal.list_users(1,null)$$,'42501',null,'Direct internal call checks actor');
select throws_ok($$update profiles set role_code = 'admin'$$,'42501',null,'No table writes');
select throws_ok($$insert into role_permissions values ('developer','users.read')$$,'42501',null,'No assignment writes');
select throws_ok($$select * from private.authorization_audit$$,'42501',null,'Audit inaccessible');

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001"}';
select is(jsonb_array_length(public.my_permissions()->'permissions'),6,'Admin also collaborates');
select results_eq($$select key from jsonb_object_keys(public.list_users(1,null)->'items'->0) key order by key$$,
  $$values ('displayName'),('id'),('isActive'),('roleCode')$$, 'Only minimal fields on each profile');
select is(public.list_users(1,null)->>'nextCursor','00000000-0000-4000-8000-000000000001','Deterministic first cursor');
select is(public.list_users(1,'00000000-0000-4000-8000-000000000001')->'items'->0->>'id','00000000-0000-4000-8000-000000000002','Exclusive cursor');
select throws_ok($$select public.list_users(101,null)$$,'22023',null,'Database bounds list');
select throws_ok($$select public.change_role(auth.uid(),'developer')$$,'PT409',null,'Last administrator cannot change own role');
select throws_ok($$select public.change_role('00000000-0000-4000-8000-000000000003','admin')$$,'PT404',null,'Unknown target after authorization');
select throws_ok($$select public.change_role('00000000-0000-4000-8000-000000000002','owner')$$,'22023',null,'Unknown role');
select lives_ok($$select public.change_role('00000000-0000-4000-8000-000000000002','developer')$$,'Admin changes another role');
select lives_ok($$select public.change_role('00000000-0000-4000-8000-000000000002','developer')$$,'Idempotent role change');
select throws_ok(format('select public.set_permission(%L,%L,%L)',r,p,r <> 'admin'),'PT409',null,'Critical assignment fixed: ' || r || ' ' || p)
from unnest(array['users.read','users.change_role','roles.manage_permissions']) p cross join unnest(array['admin','collaborator','developer']) r;
select lives_ok($$select public.set_permission('developer','reports.create',false)$$,'Revoke');
select lives_ok($$select public.set_permission('developer','reports.create',false)$$,'Idempotent revoke');
select is(public.permission_matrix()->'roles'->'developer','["assessments.submit","evidences.add"]'::jsonb,'Current matrix');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002"}';
select is(public.my_permissions(), '{"roleCode":"developer","permissions":["assessments.submit","evidences.add"]}'::jsonb,'Role and assignments update with same subject');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001"}';
select lives_ok($$select public.set_permission('developer','reports.create',true)$$,'Grant');
select lives_ok($$select public.set_permission('developer','reports.create',true)$$,'Idempotent grant');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002"}';
select is(public.my_permissions()->'permissions','["assessments.submit","evidences.add","reports.create"]'::jsonb,
  'Same developer identity sees restored capability immediately');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001"}';
reset role;
select results_eq($$select actor_id::text, operation, target_id::text, old_role, new_role, role_code, permission_code
  from private.authorization_audit where actor_id = '00000000-0000-4000-8000-000000000001' order by id$$,
  $$values ('00000000-0000-4000-8000-000000000001','change_role','00000000-0000-4000-8000-000000000002','collaborator','developer',null,null),
           ('00000000-0000-4000-8000-000000000001','revoke',null,null,null,'developer','reports.create'),
           ('00000000-0000-4000-8000-000000000001','grant',null,null,null,'developer','reports.create')$$,
  'Only effective changes recorded with verified actor and exact transitions');
-- pgrowlocks identifies the real tuple locks held until transaction end.
create extension if not exists pgrowlocks with schema extensions;
select ok(exists(select from extensions.pgrowlocks('public.roles') l join roles r on r.ctid=l.locked_row
  where r.code='admin' and 'For Update' = any(l.modes)), 'Mutations hold common admin row lock');
select ok(exists(select from extensions.pgrowlocks('public.profiles') l join profiles p on p.ctid=l.locked_row
  where p.id=auth.uid()), 'Verified actor remains locked until commit');
alter table private.authorization_audit add check (operation <> 'change_role') not valid;
set local role authenticated;
select throws_ok($$select public.change_role('00000000-0000-4000-8000-000000000002','admin')$$,'23514',null,'Audit failure aborts role change');
reset role;
select is((select role_code from profiles where id='00000000-0000-4000-8000-000000000002'),'developer','Role change rolled back');
update profiles set is_active=false where id=auth.uid();
set local role authenticated;
select is(public.my_permissions(),null::jsonb,'Inactive profile has no permissions');
select throws_ok($$select public.list_users(20,null)$$,'42501',null,'Inactive admin cannot list users');
select throws_ok($$select public.set_permission('admin','reports.create',false)$$,'42501',null,'Inactive admin cannot change assignments');
reset role;
set local role service_role;
select throws_ok($$insert into private.authorization_audit(actor_id) values (auth.uid())$$,'42501',null,'Service role cannot append audit');
select throws_ok($$update private.authorization_audit set actor_id=auth.uid()$$,'42501',null,'Service role cannot edit audit');
select throws_ok($$delete from private.authorization_audit$$,'42501',null,'Service role cannot erase audit');
reset role;
-- Isolate RLS from the real ACL assertions in permissions_model.
grant select, insert, delete on public.role_permissions to authenticated;
set local role authenticated;
select is((select count(*) from public.role_permissions),0::bigint,'RLS hides raw assignments even if granted SELECT');
select throws_ok($$insert into public.role_permissions values ('admin','reports.create')$$,'42501',null,'RLS rejects direct grants independently of ACL');
with removed as (delete from public.role_permissions returning role_code)
select is((select count(*) from removed),0::bigint,'RLS prevents direct revocation independently of ACL');
reset role;
select * from finish();
rollback;
