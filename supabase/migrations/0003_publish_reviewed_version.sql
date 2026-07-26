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
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if review_action not in ('publish', 'rollback') then
    raise exception 'invalid review action';
  end if;

  select program_id into target_program_id
  from public.program_versions
  where id = target_version_id and status in ('draft', 'in_review', 'superseded')
  for update;
  if target_program_id is null then raise exception 'publishable version not found'; end if;

  update public.program_versions
  set status = 'superseded'
  where program_id = target_program_id and status = 'published';

  update public.program_versions
  set status = 'published', published_at = now()
  where id = target_version_id;

  insert into public.reviews(program_version_id, reviewer_name, action, rationale)
  values (target_version_id, reviewer, review_action, rationale);
end;
$$;

revoke all on function public.publish_program_version(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.publish_program_version(uuid, text, text, text) to service_role;

comment on function public.publish_program_version(uuid, text, text, text)
  is 'Atomically supersedes the current Published version and publishes a reviewed Draft. Service Role only.';
