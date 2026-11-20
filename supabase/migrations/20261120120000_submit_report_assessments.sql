-- HU-08/T4: closed tables, append-only scoped RPC, no approved trust default.
create table private.assessment_policy (
  singleton boolean primary key default true check (singleton),
  minimum_trust_level integer check (minimum_trust_level between 1 and 100),
  revision uuid not null default gen_random_uuid()
);
alter table private.assessment_policy enable row level security;
revoke all on private.assessment_policy from public, anon, authenticated, service_role;
insert into private.assessment_policy (minimum_trust_level) values (null);

create function private.refresh_assessment_policy_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := gen_random_uuid();
  return new;
end;
$$;
revoke all on function private.refresh_assessment_policy_revision()
  from public, anon, authenticated, service_role;
create trigger assessment_policy_revision before update on private.assessment_policy
  for each row execute function private.refresh_assessment_policy_revision();

-- Supports the existing HU-09 ordering and the monotonic history lookup below.
create index report_assessments_latest_idx
  on public.report_assessments (report_id, assessor_id, created_at desc, id desc);

create schema assessment_internal;
revoke all on schema assessment_internal from public, anon, authenticated, service_role;
grant usage on schema assessment_internal to authenticated;

create function assessment_internal.policy() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  return (select jsonb_build_object('minimumTrustLevel', minimum_trust_level, 'revision', revision)
    from private.assessment_policy where singleton);
end;
$$;

create function assessment_internal.submit(
  target_report_id uuid, requested_action text, expected_policy_revision uuid
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  policy private.assessment_policy%rowtype;
  actor public.profiles%rowtype;
  report_author uuid;
  recorded_at timestamptz;
  saved public.report_assessments%rowtype;
begin
  if actor_id is null then raise insufficient_privilege; end if;
  if target_report_id is null or requested_action is null
     or requested_action not in ('validate', 'invalidate') or expected_policy_revision is null then
    raise invalid_parameter_value;
  end if;
  -- Every lookup after a wait must see newly committed data (PostgREST default).
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001', message = 'Read committed required';
  end if;

  -- Consistent lock order: policy -> assessor -> permission -> report.
  select * into policy from private.assessment_policy where singleton for share;
  if not found or policy.minimum_trust_level is null then
    raise exception using errcode = 'PT503', message = 'Assessment policy unavailable';
  end if;
  -- A revision is a concurrency guard, never a caller-selected threshold.
  if policy.revision <> expected_policy_revision then
    raise exception using errcode = 'PT409', message = 'Assessment policy changed';
  end if;

  -- Serializes submissions by one assessor and blocks account/trust/role changes.
  select * into actor from public.profiles where id = actor_id for update;
  if not found or not actor.is_active then raise insufficient_privilege; end if;
  if actor.trust_level < policy.minimum_trust_level then raise insufficient_privilege; end if;
  -- Hold the actual assignment, including against administrative DELETE/revoke.
  perform 1 from public.role_permissions
    where role_code = actor.role_code and permission_code = 'assessments.submit' for share;
  if not found then raise insufficient_privilege; end if;

  select author_id into report_author from public.reports where id = target_report_id for share;
  if not found then
    raise exception using errcode = 'PT404', message = 'Report not found';
  end if;
  if report_author = actor_id then
    raise exception using errcode = 'PT403', message = 'Own report assessment forbidden';
  end if;
  -- D6: no report states exist today. Future states require an explicit guard here.
  -- now() is transaction-start time, so it cannot order transactions that wait.
  select greatest(clock_timestamp(), max(created_at) + interval '1 microsecond')
    into recorded_at from public.report_assessments
    where report_id = target_report_id and assessor_id = actor_id;
  if not isfinite(recorded_at) then
    raise exception using errcode = 'PT503', message = 'Assessment history requires maintenance';
  end if;
  insert into public.report_assessments (report_id, assessor_id, action, created_at)
    values (target_report_id, actor_id, requested_action, recorded_at) returning * into saved;
  return jsonb_build_object('id', saved.id, 'reportId', saved.report_id,
    'action', saved.action, 'createdAt', saved.created_at);
end;
$$;

revoke all on all functions in schema assessment_internal from public, anon, authenticated, service_role;
grant execute on function assessment_internal.policy(), assessment_internal.submit(uuid, text, uuid)
  to authenticated;

create function public.assessment_policy() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select assessment_internal.policy()
$$;
create function public.submit_report_assessment(
  target_report_id uuid, requested_action text, expected_policy_revision uuid
) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select assessment_internal.submit(target_report_id, requested_action, expected_policy_revision)
$$;
revoke all on function public.assessment_policy(), public.submit_report_assessment(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.assessment_policy(), public.submit_report_assessment(uuid, text, uuid)
  to authenticated;
-- No grants, policies or update/delete operations on public.report_assessments.
