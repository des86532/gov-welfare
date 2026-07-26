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
  where id = target_item_id and review_status in ('draft', 'in_review', 'published');
  if not found then raise exception 'reviewable source item not found'; end if;
  insert into public.reviews(source_item_id, reviewer_name, action, rationale)
  values (target_item_id, trim(reviewer), 'classify', trim(rationale));
end;
$$;

revoke all on function public.classify_source_item(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.classify_source_item(uuid, text, text, text) to service_role;

comment on function public.classify_source_item(uuid, text, text, text)
  is 'Reviews or revises a Source item classification and records the rationale. Service Role only.';
