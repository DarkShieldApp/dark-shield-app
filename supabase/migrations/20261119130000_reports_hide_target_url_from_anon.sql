-- HU-01/T3: target_url keeps the reported URL as submitted, query string
-- included (tracking or session identifiers). The public projection exposes
-- page_key instead, which excludes query and fragment, and GET /api/reports no
-- longer reads target_url. Revoke the column from anon so the publishable key
-- cannot read it directly through PostgREST either. Stored data is unchanged;
-- authenticated keeps its table-wide SELECT.
revoke select (target_url) on table public.reports from anon;
