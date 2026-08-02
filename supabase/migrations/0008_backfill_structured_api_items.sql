update public.source_items as item
set classification = coalesce(item.classification, 'descriptive_only'),
    classification_rationale = coalesce(
      item.classification_rationale,
      'Structured government API passthrough; official source link required and no eligibility rule is generated.'
    ),
    review_status = 'published'
from public.sources as source
where source.id = item.source_id
  and source.automation_level = 'structured_extract'
  and item.review_status in ('draft', 'in_review');
