-- HU-09/T2: aggregated inputs for the credibility of reports (design in
-- docs/domain-design.md, "Credibilidad de reportes (HU-09)", option A). The
-- formula lives in web/src/server/credibility.ts; the database only returns
-- per-report aggregates. Nothing is persisted.
--
-- Decisions approved by the PO on 19/11/2026:
--   D1 only the latest assessment of each assessor counts (created_at desc,
--      id as tie-break); no UNIQUE (report_id, assessor_id) is added here.
--   D2 there is no withdrawal of assessments in Sprint 1.
--   D3 the report author's own assessments are ignored.
--   D4 permissions are not rechecked; inactive profiles are excluded and the
--      current trust_level is used.
--   D5 report_inputs is the first function that reads report_assessments; the
--      table stays closed to anon, authenticated and service_role.
--   D6 there are no report states yet; the public wrapper relies on the RLS of
--      public.reports, so future states will apply by themselves.

-- Not exposed by PostgREST (supabase/config.toml exposes public and
-- graphql_public only). Same pattern as authorization_internal.
create schema credibility_internal;
revoke all on schema credibility_internal from public, anon, authenticated, service_role;
grant usage on schema credibility_internal to anon, authenticated;

-- Definer: reads report_assessments, profiles and report_evidences, which the
-- callers cannot read, and returns only aggregates. Never returns assessor_id,
-- uploaded_by, storage_path or individual trust levels.
create function credibility_internal.report_inputs(report_ids uuid[])
returns table (
  report_id uuid,
  report_created_at timestamptz,
  visible_evidences integer,
  latest_evidence_at timestamptz,
  validations integer,
  validation_trust_sum integer,
  invalidations integer,
  invalidation_trust_sum integer,
  latest_assessment_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- 100 is the maximum page size of GET /api/reports.
  if report_ids is null or pg_catalog.cardinality(report_ids) > 100 then
    raise invalid_parameter_value;
  end if;

  return query
  with target as (
    select r.id, r.author_id, r.created_at
    from public.reports r
    where r.id = any (report_ids)
  ),
  evidence as (
    -- Only visible evidences count; a hidden one stops counting, it does not subtract.
    select e.report_id,
      pg_catalog.count(*)::integer as visible,
      pg_catalog.max(e.created_at) as latest
    from public.report_evidences e
    join target t on t.id = e.report_id
    where e.moderation_status = 'visible'
    group by e.report_id
  ),
  latest_assessment as (
    -- D1: the latest assessment of each assessor in the report.
    -- D2: if HU-08 adds withdrawal later, withdrawn assessments must be
    -- excluded here, before picking the latest one.
    select distinct on (a.report_id, a.assessor_id)
      a.report_id, a.assessor_id, a.action, a.created_at
    from public.report_assessments a
    join target t on t.id = a.report_id
    order by a.report_id, a.assessor_id, a.created_at desc, a.id desc
  ),
  counted as (
    -- D3: not the author. D4: active profile, current trust_level; the
    -- permissions held when assessing are not rechecked.
    select l.report_id, l.action, l.created_at, p.trust_level
    from latest_assessment l
    join target t on t.id = l.report_id
    join public.profiles p on p.id = l.assessor_id
    where l.assessor_id <> t.author_id
      and p.is_active
  ),
  assessment as (
    select c.report_id,
      (pg_catalog.count(*) filter (where c.action = 'validate'))::integer as validations,
      coalesce(pg_catalog.sum(c.trust_level) filter (where c.action = 'validate'), 0)::integer
        as validation_trust,
      (pg_catalog.count(*) filter (where c.action = 'invalidate'))::integer as invalidations,
      coalesce(pg_catalog.sum(c.trust_level) filter (where c.action = 'invalidate'), 0)::integer
        as invalidation_trust,
      pg_catalog.max(c.created_at) as latest
    from counted c
    group by c.report_id
  )
  select t.id,
    t.created_at,
    coalesce(e.visible, 0),
    e.latest,
    coalesce(s.validations, 0),
    coalesce(s.validation_trust, 0),
    coalesce(s.invalidations, 0),
    coalesce(s.invalidation_trust, 0),
    s.latest
  from target t
  left join evidence e on e.report_id = t.id
  left join assessment s on s.report_id = t.id
  order by t.id;
end;
$$;

-- Invoker: only the ids of the reports that the caller can read under the RLS
-- of public.reports reach the internal function (D6).
create function public.report_credibility_inputs(report_ids uuid[])
returns table (
  report_id uuid,
  report_created_at timestamptz,
  visible_evidences integer,
  latest_evidence_at timestamptz,
  validations integer,
  validation_trust_sum integer,
  invalidations integer,
  invalidation_trust_sum integer,
  latest_assessment_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  -- Checked before filtering, so the limit does not depend on visibility.
  if report_ids is null or pg_catalog.cardinality(report_ids) > 100 then
    raise invalid_parameter_value;
  end if;

  return query
  select i.*
  from credibility_internal.report_inputs(
    array(select r.id from public.reports r where r.id = any (report_ids))
  ) i;
end;
$$;

-- The aggregates are public (HU-01 shows credibility without a session).
-- No access for PUBLIC or service_role (handlers never use it, PR #13).
-- Privileges on public.report_assessments are not changed.
revoke all on function credibility_internal.report_inputs(uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.report_credibility_inputs(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function
  credibility_internal.report_inputs(uuid[]),
  public.report_credibility_inputs(uuid[])
  to anon, authenticated;
