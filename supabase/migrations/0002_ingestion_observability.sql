alter table public.source_snapshots alter column content_hash drop not null;

alter table public.sources
  add column last_checked_at timestamptz,
  add column last_check_error jsonb;

alter table public.reviews alter column reviewer_id drop not null;
alter table public.reviews add column reviewer_name text;
alter table public.reviews add constraint reviews_reviewer_check
  check (reviewer_id is not null or nullif(trim(reviewer_name), '') is not null);

comment on column public.sources.last_checked_at is 'Last attempted check, whether successful or failed.';
comment on column public.sources.last_check_error is 'Latest fetch error; cleared after the next successful check.';
comment on column public.reviews.reviewer_name is 'Named curator for imported/manual reviews that are not tied to an Auth user.';
