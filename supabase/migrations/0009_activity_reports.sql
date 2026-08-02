create table public.activity_reports (
  id uuid primary key default gen_random_uuid(),
  opportunity_slug text not null,
  reason text not null check (reason in ('expired', 'broken_link', 'incorrect_info', 'incorrect_eligibility', 'other')),
  detail text check (detail is null or length(detail) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.activity_reports enable row level security;

create index activity_reports_status_created_idx
  on public.activity_reports(status, created_at desc);

comment on table public.activity_reports
  is 'Anonymous corrections for platform-maintained activity data. Written and read only through server-side service role.';
