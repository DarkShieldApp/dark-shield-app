-- LOCAL ISOLATED DATABASE ONLY: dblink sessions need committed fixtures.
-- Unlike ordinary transactional suites, cleanup below restores policy/permissions
-- and removes only these fixture UUIDs. Never run on a shared database.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Supabase CLI's disposable local DB credentials, never a remote secret.
-- Use the container network address: loopback uses trust, which dblink rejects
-- for the non-superuser postgres role even when a password is supplied.
select dblink_connect(n, 'dbname=' || current_database() || ' user=postgres host=' ||
  host(inet_server_addr()) || ' port=5432 password=postgres')
from unnest(array['setup','holder','writer']) n;
select dblink_exec('setup', $remote$
  create temporary table saved_policy as select minimum_trust_level from private.assessment_policy;
  create temporary table saved_permissions as select * from public.role_permissions where permission_code='assessments.submit';
  update private.assessment_policy set minimum_trust_level=40;
  insert into public.role_permissions values ('collaborator','assessments.submit') on conflict do nothing;
  insert into auth.users(id) values
    ('08c40000-0000-4000-8000-000000000001'),
    ('08c40000-0000-4000-8000-000000000002'),
    ('08c40000-0000-4000-8000-000000000004');
  update public.profiles set trust_level=40 where id='08c40000-0000-4000-8000-000000000002';
  update public.profiles set role_code='admin' where id='08c40000-0000-4000-8000-000000000004';
  insert into public.reports(id,author_id,title,description,target_url,page_key,target_host,registrable_domain)
    values ('08c40000-0000-4000-8000-000000000003','08c40000-0000-4000-8000-000000000001',
    'Concurrency fixture','Only in isolated tests','https://example.com','https://example.com/','example.com','example.com');
$remote$);

-- A temporary invoker helper captures SQLSTATE, with the actual authenticated role.
select dblink_exec('writer', $remote$
  set application_name='hu08_t4_writer';
  set statement_timeout='10s';
  create function pg_temp.try_assessment(rev uuid) returns text
  language plpgsql security invoker as $body$
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims','{"sub":"08c40000-0000-4000-8000-000000000002","role":"authenticated"}',true);
    perform public.submit_report_assessment('08c40000-0000-4000-8000-000000000003','invalidate',rev);
    return 'ok';
  exception when others then return sqlstate;
  end;
  $body$;
$remote$);
select set_config('test.writer_pid', pid::text,true) from dblink('writer','select pg_backend_pid()') as t(pid integer);
create function pg_temp.await_writer_lock() returns boolean language plpgsql as $$
begin
  for attempt in 1..200 loop
    perform pg_stat_clear_snapshot();
    if exists(select 1 from pg_stat_activity where pid=current_setting('test.writer_pid')::integer and wait_event_type='Lock') then return true; end if;
    perform pg_sleep(0.01);
  end loop;
  return false;
end;
$$;
create function pg_temp.collect_writer() returns text language plpgsql as $$
declare outcome text;
begin
  select value into outcome from dblink_get_result('writer') as t(value text);
  perform * from dblink_get_result('writer') as t(value text);
  return outcome;
end;
$$;
create function pg_temp.queue_assessment() returns integer language sql as $$
  select dblink_send_query('writer', format('select pg_temp.try_assessment(%L::uuid)',
    (select revision from private.assessment_policy)))
$$;

-- Writer transaction starts first, but its actual submission waits for holder.
select dblink_exec('writer','begin');
select dblink_exec('holder', $remote$
  begin;
  set local role authenticated;
  set local request.jwt.claims='{"sub":"08c40000-0000-4000-8000-000000000002","role":"authenticated"}';
$remote$);
select * from dblink('holder', $remote$
  select public.submit_report_assessment('08c40000-0000-4000-8000-000000000003','validate',
    (public.assessment_policy()->>'revision')::uuid)::text
$remote$) as t(receipt text);
select is(pg_temp.queue_assessment(),1,'Second submission sent asynchronously');
select ok(pg_temp.await_writer_lock(),'Same assessor waits on the first transaction');
select dblink_exec('holder','commit');
select is(pg_temp.collect_writer(),'ok','Waiting submission succeeds after first commit');
select dblink_exec('writer','commit');
select is((select count(*) from public.report_assessments where report_id='08c40000-0000-4000-8000-000000000003'),2::bigint,'Both concurrent opinions are persisted');
select ok((select max(created_at) filter(where action='invalidate') > max(created_at) filter(where action='validate')
  from public.report_assessments where report_id='08c40000-0000-4000-8000-000000000003'),'Later lock winner is latest even though its transaction began first');
select results_eq($$select validations,invalidations from public.report_credibility_inputs(array['08c40000-0000-4000-8000-000000000003'::uuid])$$,
  $$values (0,1)$$,'Real HU-09 aggregate counts only the concurrent latest opinion');

-- Revocation through the existing administrative RPC, not a mocked permission.
select dblink_exec('holder', $remote$
  begin;
  set local role authenticated;
  set local request.jwt.claims='{"sub":"08c40000-0000-4000-8000-000000000004","role":"authenticated"}';
  do $body$ begin perform public.set_permission('collaborator','assessments.submit',false); end; $body$;
$remote$);
select is(pg_temp.queue_assessment(),1,'Submission races administrative revocation');
select ok(pg_temp.await_writer_lock(),'Submission waits on the permission row');
select dblink_exec('holder','commit');
select is(pg_temp.collect_writer(),'42501','Committed permission revocation prevents the pending insert');
select dblink_exec('setup', $$insert into public.role_permissions values ('collaborator','assessments.submit')$$);

select dblink_exec('holder', $$begin; update public.profiles set is_active=false where id='08c40000-0000-4000-8000-000000000002'$$);
select is(pg_temp.queue_assessment(),1,'Submission races account deactivation');
select ok(pg_temp.await_writer_lock(),'Submission waits for account update');
select dblink_exec('holder','commit');
select is(pg_temp.collect_writer(),'42501','Deactivation prevents the pending insert');
select dblink_exec('setup', $$update public.profiles set is_active=true where id='08c40000-0000-4000-8000-000000000002'$$);

select dblink_exec('holder', $$begin; update public.profiles set trust_level=39 where id='08c40000-0000-4000-8000-000000000002'$$);
select is(pg_temp.queue_assessment(),1,'Submission races reduced confidence');
select ok(pg_temp.await_writer_lock(),'Submission waits for confidence update');
select dblink_exec('holder','commit');
select is(pg_temp.collect_writer(),'42501','Lower confidence prevents the pending insert');
select dblink_exec('setup', $$update public.profiles set trust_level=40 where id='08c40000-0000-4000-8000-000000000002'$$);

select dblink_exec('setup', $$delete from public.role_permissions where role_code='developer' and permission_code='assessments.submit'$$);
select dblink_exec('holder', $remote$
  begin;
  set local role authenticated;
  set local request.jwt.claims='{"sub":"08c40000-0000-4000-8000-000000000004","role":"authenticated"}';
  do $body$ begin perform public.change_role('08c40000-0000-4000-8000-000000000002','developer'); end; $body$;
$remote$);
select is(pg_temp.queue_assessment(),1,'Submission races role change');
select ok(pg_temp.await_writer_lock(),'Submission waits for role update');
select dblink_exec('holder','commit');
select is(pg_temp.collect_writer(),'42501','Changed role is evaluated with its current permissions');
select dblink_exec('setup', $$update public.profiles set role_code='collaborator' where id='08c40000-0000-4000-8000-000000000002'$$);

select dblink_exec('holder', $$begin; update private.assessment_policy set minimum_trust_level=41$$);
select is(pg_temp.queue_assessment(),1,'Submission races policy update');
select ok(pg_temp.await_writer_lock(),'Submission waits for policy update');
select dblink_exec('holder','commit');
select is(pg_temp.collect_writer(),'PT409','Stale revision prevents the pending insert');
select dblink_exec('setup', $$update private.assessment_policy set minimum_trust_level=40$$);

select dblink_exec('holder', $$begin; update public.reports set author_id='08c40000-0000-4000-8000-000000000002' where id='08c40000-0000-4000-8000-000000000003'$$);
select is(pg_temp.queue_assessment(),1,'Submission races report ownership update');
select ok(pg_temp.await_writer_lock(),'Submission waits for ownership update');
select dblink_exec('holder','commit');
select is(pg_temp.collect_writer(),'PT403','New author cannot assess their own report');
select is((select count(*) from public.report_assessments where report_id='08c40000-0000-4000-8000-000000000003'),2::bigint,'All rejected races leave history unchanged');

select dblink_exec('writer','begin isolation level repeatable read');
select is(pg_temp.queue_assessment(),1,'Stronger isolation call queued');
select is(pg_temp.collect_writer(),'40001','RPC refuses a potentially stale transaction snapshot');
select dblink_exec('writer','rollback');

-- Restore only data touched by this isolated suite. No business history is removed.
select dblink_exec('setup', $remote$
  begin;
  delete from public.report_assessments where report_id='08c40000-0000-4000-8000-000000000003';
  delete from public.reports where id='08c40000-0000-4000-8000-000000000003';
  delete from private.authorization_audit where actor_id='08c40000-0000-4000-8000-000000000004';
  delete from public.profiles where id in ('08c40000-0000-4000-8000-000000000001','08c40000-0000-4000-8000-000000000002','08c40000-0000-4000-8000-000000000004');
  delete from auth.users where id in ('08c40000-0000-4000-8000-000000000001','08c40000-0000-4000-8000-000000000002','08c40000-0000-4000-8000-000000000004');
  delete from public.role_permissions where permission_code='assessments.submit';
  insert into public.role_permissions select * from saved_permissions;
  update private.assessment_policy set minimum_trust_level=(select minimum_trust_level from saved_policy);
  commit;
$remote$);
select dblink_disconnect(n) from unnest(array['setup','holder','writer']) n;
select * from finish();
rollback;
