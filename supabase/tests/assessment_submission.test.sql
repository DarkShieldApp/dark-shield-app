-- HU-08/T4: real PostgreSQL behavior and ACL/RLS, all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('private', 'assessment_policy', 'Protected policy exists');
select ok((select relrowsecurity from pg_class where oid = 'private.assessment_policy'::regclass), 'Policy RLS enabled');
select is((select minimum_trust_level from private.assessment_policy), null::integer, 'No unapproved default minimum');
select has_index('public', 'report_assessments', 'report_assessments_latest_idx',
  array['report_id', 'assessor_id', 'created_at', 'id']);
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'report_assessments'),
  0::bigint, 'Assessment table still has no policies');
select ok(not has_table_privilege(r, t, p), r || ' lacks ' || p || ' on ' || t)
from unnest(array['anon', 'authenticated', 'service_role']) r
cross join unnest(array['public.report_assessments', 'private.assessment_policy']) t
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p;
select ok(not has_any_column_privilege(r, t, p), r || ' lacks column ' || p || ' on ' || t)
from unnest(array['anon', 'authenticated', 'service_role']) r
cross join unnest(array['public.report_assessments', 'private.assessment_policy']) t
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p;

select ok(has_function_privilege('authenticated', f, 'execute'), 'Authenticated may call ' || f)
from unnest(array['public.assessment_policy()', 'assessment_internal.policy()',
  'public.submit_report_assessment(uuid,text,uuid)', 'assessment_internal.submit(uuid,text,uuid)']) f;
select ok(not has_function_privilege(r, f, 'execute'), r || ' cannot call ' || f)
from unnest(array['anon', 'service_role']) r
cross join unnest(array['public.assessment_policy()', 'assessment_internal.policy()',
  'public.submit_report_assessment(uuid,text,uuid)', 'assessment_internal.submit(uuid,text,uuid)']) f;
select ok(not has_function_privilege(r, 'private.refresh_assessment_policy_revision()', 'execute'), 'Revision trigger is private for ' || r)
from unnest(array['anon','authenticated','service_role']) r;
select is((select count(*) from pg_proc p,
  lateral aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
  where p.oid = f::regprocedure and a.grantee = 0), 0::bigint, 'PUBLIC cannot execute ' || f)
from unnest(array['public.assessment_policy()', 'assessment_internal.policy()',
  'public.submit_report_assessment(uuid,text,uuid)', 'assessment_internal.submit(uuid,text,uuid)']) f;
select ok(proconfig @> array['search_path=""'] and
  prosecdef = (pronamespace = 'assessment_internal'::regnamespace),
  oid::regprocedure::text || ' has hardened execution context')
from pg_proc where oid in ('public.assessment_policy()'::regprocedure, 'assessment_internal.policy()'::regprocedure,
  'public.submit_report_assessment(uuid,text,uuid)'::regprocedure, 'assessment_internal.submit(uuid,text,uuid)'::regprocedure);
select is((select proargnames from pg_proc where oid = 'public.submit_report_assessment(uuid,text,uuid)'::regprocedure),
  array['target_report_id','requested_action','expected_policy_revision'], 'No identity, threshold or audit inputs');
select ok(not has_schema_privilege(r,'assessment_internal','CREATE'), r || ' cannot replace RPCs')
from unnest(array['anon','authenticated','service_role']) r;

insert into auth.users(id) values
 ('08f00000-0000-4000-8000-000000000001'),
 ('08f00000-0000-4000-8000-000000000002');
update public.profiles set trust_level = 40 where id = '08f00000-0000-4000-8000-000000000002';
insert into public.reports(id,author_id,title,description,target_url,page_key,target_host,registrable_domain)
values ('08f00000-0000-4000-8000-000000000003','08f00000-0000-4000-8000-000000000001',
 'T4 fixture','T4 transactional report','https://example.com','https://example.com/','example.com','example.com');
select set_config('test.assessment_revision',(select revision::text from private.assessment_policy),true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"08f00000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((public.assessment_policy()->>'minimumTrustLevel')::integer, null::integer, 'Disabled policy is observable without table access');
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate',
 current_setting('test.assessment_revision')::uuid)$$, 'PT503', null, 'Direct RPC fails closed while unconfigured');
reset role;
select throws_ok($$update private.assessment_policy set minimum_trust_level = 0$$,'23514',null,'Policy rejects zero');
select throws_ok($$update private.assessment_policy set minimum_trust_level = 101$$,'23514',null,'Policy rejects above range');
update private.assessment_policy set minimum_trust_level = 40;
select isnt((select revision::text from private.assessment_policy),current_setting('test.assessment_revision'),'Changing policy rotates revision');
select set_config('test.assessment_revision',(select revision::text from private.assessment_policy),true);
create temporary table assessment_receipts (payload jsonb);
grant select,insert on assessment_receipts to authenticated;
set local role authenticated;
insert into assessment_receipts values (public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate',
 current_setting('test.assessment_revision')::uuid));
insert into assessment_receipts values (public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','invalidate',
 current_setting('test.assessment_revision')::uuid));
select is((select count(*) from assessment_receipts),2::bigint,'Both actions succeed at exactly the minimum');
select results_eq($$select jsonb_object_keys(payload) from assessment_receipts limit 4$$,
 $$values ('id'),('action'),('reportId'),('createdAt')$$,'Receipt exposes only generated ID, report, action and date');
select results_eq($$select validations,invalidations from public.report_credibility_inputs(array['08f00000-0000-4000-8000-000000000003'::uuid])$$,
 $$values (0,1)$$,'HU-09 counts only the latest opinion, not the number of submissions');
reset role;
select is((select count(*) from public.report_assessments where report_id='08f00000-0000-4000-8000-000000000003'),2::bigint,'History is preserved');
select is((select count(distinct id) from public.report_assessments where report_id='08f00000-0000-4000-8000-000000000003'),2::bigint,'IDs generated independently');
select ok((select max(created_at) filter(where action='invalidate') > max(created_at) filter(where action='validate')
 from public.report_assessments where report_id='08f00000-0000-4000-8000-000000000003'),'Same-transaction writes have a strict order');
select is((select count(*) from public.report_assessments where report_id='08f00000-0000-4000-8000-000000000003'
 and assessor_id='08f00000-0000-4000-8000-000000000002'),2::bigint,'Identity comes from auth.uid');

set local role authenticated;
select throws_ok($$select * from public.report_assessments$$,'42501',null,'No direct history read');
select throws_ok($$insert into public.report_assessments default values$$,'42501',null,'No direct insert');
select throws_ok($$update public.report_assessments set action='validate'$$,'42501',null,'No edit');
select throws_ok($$delete from public.report_assessments$$,'42501',null,'No withdrawal');
select throws_ok($$update private.assessment_policy set minimum_trust_level=1$$,'42501',null,'Caller cannot lower minimum');
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate',
 current_setting('test.assessment_revision')::uuid, 1)$$,'42883',null,'No overload accepting a threshold');
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003',null, current_setting('test.assessment_revision')::uuid)$$,'22023',null,'Invalid action rejected');
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','', current_setting('test.assessment_revision')::uuid)$$,'22023',null,'Invalid action rejected');
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','VALIDATE', current_setting('test.assessment_revision')::uuid)$$,'22023',null,'Invalid action rejected');
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate ', current_setting('test.assessment_revision')::uuid)$$,'22023',null,'Invalid action rejected');
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','withdraw', current_setting('test.assessment_revision')::uuid)$$,'22023',null,'Invalid action rejected');
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate; delete from public.profiles', current_setting('test.assessment_revision')::uuid)$$,'22023',null,'Invalid action rejected');
select throws_ok($$select public.submit_report_assessment(null,'validate', current_setting('test.assessment_revision')::uuid)$$,'22023',null,'Null report rejected');
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate',null)$$,'22023',null,'Null revision rejected');
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000099','validate', current_setting('test.assessment_revision')::uuid)$$,'PT404',null,'Missing report rejected');
select set_config('request.jwt.claims','{"sub":"08f00000-0000-4000-8000-000000000099","role":"authenticated"}',true);
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate', current_setting('test.assessment_revision')::uuid)$$,'42501',null,'Missing profile rejected');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.assessment_policy()$$,'42501',null,'Policy RPC requires identity');
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate', current_setting('test.assessment_revision')::uuid)$$,'42501',null,'Write RPC requires identity');
reset role;
update public.profiles set trust_level=40 where id='08f00000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"08f00000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate', current_setting('test.assessment_revision')::uuid)$$,'PT403',null,'Author cannot assess own report');
reset role;
update public.profiles set is_active=false where id='08f00000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"08f00000-0000-4000-8000-000000000002","role":"authenticated","user_metadata":{"trust_level":100,"is_active":true}}',true);
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate', current_setting('test.assessment_revision')::uuid)$$,'42501',null,'Inactive account cannot forge activity in metadata');
reset role;
update public.profiles set is_active=true,trust_level=39 where id='08f00000-0000-4000-8000-000000000002';
set local role authenticated;
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate', current_setting('test.assessment_revision')::uuid)$$,'42501',null,'Persisted confidence below minimum is rejected');
reset role;
update public.profiles set trust_level=40 where id='08f00000-0000-4000-8000-000000000002';
update public.profiles set role_code='collaborator' where id='08f00000-0000-4000-8000-000000000002';
set local role authenticated;
select lives_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','invalidate', current_setting('test.assessment_revision')::uuid)$$,'collaborator can submit with the effective permission');
reset role;
delete from public.role_permissions where role_code='collaborator' and permission_code='assessments.submit';
set local role authenticated;
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate', current_setting('test.assessment_revision')::uuid)$$,'42501',null,'Revoked collaborator permission cannot submit');
reset role;
update public.profiles set role_code='developer' where id='08f00000-0000-4000-8000-000000000002';
set local role authenticated;
select lives_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','invalidate', current_setting('test.assessment_revision')::uuid)$$,'developer can submit with the effective permission');
reset role;
delete from public.role_permissions where role_code='developer' and permission_code='assessments.submit';
set local role authenticated;
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate', current_setting('test.assessment_revision')::uuid)$$,'42501',null,'Revoked developer permission cannot submit');
reset role;
update public.profiles set role_code='admin' where id='08f00000-0000-4000-8000-000000000002';
set local role authenticated;
select lives_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','invalidate', current_setting('test.assessment_revision')::uuid)$$,'admin can submit with the effective permission');
reset role;
delete from public.role_permissions where role_code='admin' and permission_code='assessments.submit';
set local role authenticated;
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate', current_setting('test.assessment_revision')::uuid)$$,'42501',null,'Revoked admin permission cannot submit');
reset role;
select is((select count(*) from public.report_assessments where report_id='08f00000-0000-4000-8000-000000000003'),5::bigint,'Rejections and revocations preserve history without extra rows');
set local role authenticated;
select results_eq($$select validations,invalidations from public.report_credibility_inputs(array['08f00000-0000-4000-8000-000000000003'::uuid])$$,
 $$values (0,1)$$,'D4: revocation does not remove the historical opinion from aggregates');
reset role;
update private.assessment_policy set minimum_trust_level=41;
set local role authenticated;
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate', current_setting('test.assessment_revision')::uuid)$$,'PT409',null,'Old policy revision rejected');
reset role;
set local role anon;
select throws_ok($$select public.assessment_policy()$$,'42501',null,'anon cannot invoke policy');
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate', current_setting('test.assessment_revision')::uuid)$$,'42501',null,'anon cannot invoke writer');
reset role;
set local role service_role;
select throws_ok($$select public.assessment_policy()$$,'42501',null,'service_role cannot invoke policy');
select throws_ok($$select public.submit_report_assessment('08f00000-0000-4000-8000-000000000003','validate', current_setting('test.assessment_revision')::uuid)$$,'42501',null,'service_role cannot invoke writer');
reset role;
select * from finish();
rollback;
