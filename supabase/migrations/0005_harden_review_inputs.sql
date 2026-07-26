create or replace function public.publish_program_version(
  target_version_id uuid,
  reviewer text,
  rationale text,
  review_action text default 'publish'
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_program_id uuid;
  target_application_url text;
  target_verified_at timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role required' using errcode = '42501'; end if;
  if review_action not in ('publish', 'rollback') then raise exception 'invalid review action'; end if;
  if nullif(trim(reviewer), '') is null or nullif(trim(rationale), '') is null or length(trim(rationale)) < 10 then
    raise exception 'reviewer and rationale are required';
  end if;

  select program_id, application_url, last_verified_at
  into target_program_id, target_application_url, target_verified_at
  from public.program_versions
  where id = target_version_id
    and ((review_action = 'publish' and status in ('draft', 'in_review'))
      or (review_action = 'rollback' and status = 'superseded'))
  for update;
  if target_program_id is null then raise exception 'publishable version not found'; end if;
  if target_application_url is null or target_verified_at is null then raise exception 'application URL and verification date are required'; end if;
  if not exists (select 1 from public.field_evidence where program_version_id = target_version_id) then raise exception 'reviewed evidence is required'; end if;
  if exists (select 1 from public.field_evidence where program_version_id = target_version_id and reviewed_at is null) then raise exception 'all evidence must be reviewed'; end if;
  if exists (
    select 1 from public.field_evidence e
    join public.sources s on s.id = e.source_id
    where e.program_version_id = target_version_id and s.last_check_error is not null
  ) then raise exception 'source check error must be resolved before publish'; end if;
  if exists (
    select 1 from public.field_evidence e
    where e.program_version_id = target_version_id
      and e.snapshot_id is distinct from (
        select ss.id from public.source_snapshots ss
        where ss.source_id = e.source_id and ss.content_hash is not null
        order by ss.observed_at desc limit 1
      )
  ) then raise exception 'evidence must reference the latest successful snapshot'; end if;

  update public.program_versions set status = 'superseded'
  where program_id = target_program_id and status = 'published';
  update public.program_versions set status = 'published', published_at = now()
  where id = target_version_id;
  insert into public.reviews(program_version_id, reviewer_name, action, rationale)
  values (target_version_id, trim(reviewer), review_action, trim(rationale));
end;
$$;

create or replace function public.reject_program_version(
  target_version_id uuid,
  reviewer text,
  rationale text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role required' using errcode = '42501'; end if;
  if nullif(trim(reviewer), '') is null or nullif(trim(rationale), '') is null or length(trim(rationale)) < 10 then
    raise exception 'reviewer and rationale are required';
  end if;
  update public.program_versions set status = 'rejected'
  where id = target_version_id and status in ('draft', 'in_review');
  if not found then raise exception 'rejectable version not found'; end if;
  insert into public.reviews(program_version_id, reviewer_name, action, rationale)
  values (target_version_id, trim(reviewer), 'request_changes', trim(rationale));
end;
$$;

create or replace function public.classify_source_item(
  target_item_id uuid,
  target_classification text,
  reviewer text,
  rationale text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role required' using errcode = '42501'; end if;
  if target_classification not in ('matchable', 'descriptive_only', 'excluded') then raise exception 'invalid classification'; end if;
  if nullif(trim(reviewer), '') is null or nullif(trim(rationale), '') is null or length(trim(rationale)) < 10 then
    raise exception 'reviewer and rationale are required';
  end if;
  update public.source_items
  set classification = target_classification,
      classification_rationale = trim(rationale),
      review_status = 'published'
  where id = target_item_id and review_status in ('draft', 'in_review');
  if not found then raise exception 'reviewable source item not found'; end if;
  insert into public.reviews(source_item_id, reviewer_name, action, rationale)
  values (target_item_id, trim(reviewer), 'classify', trim(rationale));
end;
$$;
