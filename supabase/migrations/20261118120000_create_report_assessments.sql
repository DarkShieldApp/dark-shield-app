-- HU-08/T3: persistence only; authorization and participation rules are pending.
create table public.report_assessments (
  id uuid constraint report_assessments_pkey primary key
    default gen_random_uuid(),
  report_id uuid not null,
  assessor_id uuid not null,
  action text not null,
  created_at timestamptz not null default now(),

  constraint report_assessments_report_fkey foreign key (report_id)
    references public.reports (id) on update restrict on delete restrict,
  constraint report_assessments_assessor_fkey foreign key (assessor_id)
    references public.profiles (id) on update restrict on delete restrict,
  constraint report_assessments_action_check
    check (action in ('validate', 'invalidate'))
);

-- Support lookups and FK checks without imposing a participation cardinality.
-- Whether (report_id, assessor_id) must be unique is still a domain decision.
create index report_assessments_report_id_idx
  on public.report_assessments (report_id);
create index report_assessments_assessor_id_idx
  on public.report_assessments (assessor_id);

-- No edit/withdrawal lifecycle or repeated-assessment behavior is authorized.
-- A future migration must resolve those rules before opening any access.
alter table public.report_assessments enable row level security;
revoke all on table public.report_assessments
  from public, anon, authenticated, service_role;
