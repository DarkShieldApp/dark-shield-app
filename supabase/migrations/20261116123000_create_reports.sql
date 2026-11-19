-- HU-05/T4: Report model for storing dark pattern reports.
create table public.reports (
  id uuid constraint reports_pkey primary key
    default gen_random_uuid(),

  author_id uuid not null,
  title text not null,
  description text not null,
  pattern_type text,

  target_url text not null,
  page_key text not null,
  target_host text not null,
  registrable_domain text not null,

  created_at timestamptz not null default now(),

  constraint reports_author_fkey foreign key (author_id)
    references public.profiles (id) on delete restrict,

  constraint reports_title_check check (
    char_length(title) between 1 and 150
    and title ~ '[^[:space:]]'
    and title !~ '[[:cntrl:]]'
  ),

  constraint reports_description_check check (
    char_length(description) between 1 and 5000
    and description ~ '[^[:space:]]'
  ),

  constraint reports_target_url_check check (
    char_length(target_url) between 1 and 2048
    and target_url ~ '^https?://'
  )
);

-- Index report fields used by queries.
create index reports_author_id_idx
  on public.reports (author_id);

create index reports_page_key_idx
  on public.reports (page_key);

create index reports_registrable_domain_idx
  on public.reports (registrable_domain);

-- Reports are protected by RLS.
-- Access policies will be defined with the report API.
alter table public.reports enable row level security;

-- Clear default grants until report access rules are implemented.
revoke all on table public.reports
  from public, anon, authenticated, service_role;
