-- HU-05/T4 model, read access agreed in the HU-06/T4 contract (PR #13,
-- answer 2): reports are public, as HU-01 requires to consult a page without
-- collaborator permissions. There are no report states yet; when moderation
-- adds one, this policy must filter by it. Writes stay revoked (HU-05).
create policy reports_select_public
  on public.reports for select to anon, authenticated
  using (true);

-- anon reads the public projection used by GET /api/reports, without the
-- author. authenticated also reads author_id (e.g. HU-08: not assessing one's
-- own report). Evidence policies need authenticated to read reports.
grant select (
  id, title, description, pattern_type, target_url,
  page_key, target_host, registrable_domain, created_at
) on table public.reports to anon;
grant select on table public.reports to authenticated;
