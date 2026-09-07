-- Product that is blocked / causing the incident
alter table public.incidents
  add column if not exists affected_product text;
