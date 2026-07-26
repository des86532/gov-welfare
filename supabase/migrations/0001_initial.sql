create extension if not exists pgcrypto;

create type public.coverage_level as enum ('catalog_only', 'descriptive_only', 'matchable', 'needs_review', 'archived');
create type public.review_state as enum ('draft', 'in_review', 'published', 'rejected', 'superseded');
create type public.source_status as enum ('active', 'blocked', 'archived');

create table public.sources (
  id text primary key,
  name text not null,
  authority text not null,
  jurisdiction text not null,
  official_url text not null,
  format text not null check (format in ('json','csv','xml','ods','html','pdf','manual')),
  roles jsonb not null default '[]'::jsonb,
  automation_level text not null check (automation_level in ('structured_extract','text_extract','change_detection_only','manual')),
  adapter_key text not null,
  check_every_hours integer check (check_every_hours is null or check_every_hours > 0),
  license jsonb not null default '{}'::jsonb,
  catalog_modified_at timestamptz,
  resource_modified_at timestamptz,
  last_successful_fetch_at timestamptz,
  last_verified_at timestamptz,
  next_review_at timestamptz,
  crawler_required boolean not null default false,
  status public.source_status not null default 'active',
  blocked_reason text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources(id),
  observed_at timestamptz not null,
  http_status integer not null,
  content_type text,
  etag text,
  last_modified text,
  content_hash text not null,
  raw_body text,
  storage_path text,
  fetch_error jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, content_hash),
  check (raw_body is not null or storage_path is not null or fetch_error is not null)
);

create table public.source_items (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources(id),
  snapshot_id uuid not null references public.source_snapshots(id),
  external_id text not null,
  title text not null,
  raw_data jsonb not null,
  canonical_draft jsonb not null default '{}'::jsonb,
  unknown_fields jsonb not null default '{}'::jsonb,
  classification text check (classification in ('matchable','descriptive_only','excluded')),
  classification_rationale text,
  review_status public.review_state not null default 'draft',
  created_at timestamptz not null default now(),
  unique (snapshot_id, external_id)
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique,
  slug text not null unique,
  authority text not null,
  jurisdiction text not null,
  primary_category text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_versions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id),
  version integer not null check (version > 0),
  status public.review_state not null default 'draft',
  coverage public.coverage_level not null,
  title text not null,
  summary text not null,
  benefit_type text not null,
  decision_type text not null,
  canonical_content jsonb not null default '{}'::jsonb,
  rule_tree jsonb,
  effective_from date,
  effective_to date,
  application_open date,
  application_close date,
  application_url text,
  last_verified_at timestamptz,
  next_review_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (program_id, version),
  check (coverage <> 'matchable' or (rule_tree is not null and last_verified_at is not null)),
  check (status <> 'published' or published_at is not null)
);

create unique index one_published_version_per_program
  on public.program_versions(program_id) where status = 'published';

create table public.field_evidence (
  id uuid primary key default gen_random_uuid(),
  program_version_id uuid not null references public.program_versions(id) on delete cascade,
  field_path text not null,
  source_id text not null references public.sources(id),
  snapshot_id uuid not null references public.source_snapshots(id),
  locator text not null,
  extracted_value text not null,
  reviewed_at timestamptz,
  unique (program_version_id, field_path, source_id, locator)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  program_version_id uuid references public.program_versions(id),
  source_item_id uuid references public.source_items(id),
  reviewer_id uuid not null references auth.users(id),
  action text not null check (action in ('classify','request_changes','resolve_conflict','publish','rollback','archive')),
  diff jsonb not null default '{}'::jsonb,
  rationale text not null,
  created_at timestamptz not null default now(),
  check (program_version_id is not null or source_item_id is not null)
);

create table public.program_relationships (
  id uuid primary key default gen_random_uuid(),
  from_program_id uuid not null references public.programs(id),
  to_program_id uuid not null references public.programs(id),
  relationship text not null check (relationship in ('variant_of','implemented_by','supplements','replaces')),
  rationale text,
  unique (from_program_id, to_program_id, relationship),
  check (from_program_id <> to_program_id)
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false) $$;

alter table public.sources enable row level security;
alter table public.source_snapshots enable row level security;
alter table public.source_items enable row level security;
alter table public.programs enable row level security;
alter table public.program_versions enable row level security;
alter table public.field_evidence enable row level security;
alter table public.reviews enable row level security;
alter table public.program_relationships enable row level security;

create policy "public can read programs" on public.programs for select using (true);
create policy "public can read published versions" on public.program_versions for select using (status = 'published');
create policy "public can read published evidence" on public.field_evidence for select using (
  exists (select 1 from public.program_versions v where v.id = program_version_id and v.status = 'published')
);
create policy "public can read relationships" on public.program_relationships for select using (true);

create policy "admins manage sources" on public.sources for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage snapshots" on public.source_snapshots for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage source items" on public.source_items for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage programs" on public.programs for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage versions" on public.program_versions for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage evidence" on public.field_evidence for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage reviews" on public.reviews for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage relationships" on public.program_relationships for all using (public.is_admin()) with check (public.is_admin());

create index snapshots_source_observed_idx on public.source_snapshots(source_id, observed_at desc);
create index source_items_source_status_idx on public.source_items(source_id, review_status);
create index program_versions_program_status_idx on public.program_versions(program_id, status);
create index program_versions_content_fts_idx on public.program_versions using gin (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || canonical_content::text)
);
create index reviews_version_created_idx on public.reviews(program_version_id, created_at desc);

comment on table public.source_snapshots is 'Immutable source responses. A changed hash creates a Draft review task; it never overwrites a published version.';
comment on table public.field_evidence is 'Field and atomic-rule provenance using JSON path, HTML heading, or document page locators.';
