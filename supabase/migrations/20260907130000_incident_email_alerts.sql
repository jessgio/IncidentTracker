-- Per-case switch for automatic mention emails. Off by default to avoid inbox spam.
alter table public.incidents
  add column if not exists email_alerts boolean not null default false;
