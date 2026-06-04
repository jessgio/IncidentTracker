-- Workflow state-machine & metrics redesign
-- Adds soft roles, blocking-aware status lifecycle timestamps, migrates legacy
-- status values, and indexes the columns used for filtering/aggregation.

-- 1. Soft roles on profiles ----------------------------------------------------
-- The column already exists with a legacy CHECK of ('agent','manager'); replace it.
alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add column if not exists role text;

update public.profiles set role = 'cs' where role = 'agent' or role is null;

alter table public.profiles alter column role set default 'cs';
alter table public.profiles alter column role set not null;

alter table public.profiles
  add constraint profiles_role_check check (role in ('cs', 'warehouse', 'manager'));

-- 2. Lifecycle timestamp columns ----------------------------------------------
alter table public.incidents
  add column if not exists status_changed_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists warehouse_requested_at timestamptz;

-- 3. Migrate legacy status values to the new lifecycle ------------------------
-- Drop the old 3-value CHECK first, migrate, then re-add the lifecycle CHECK.
alter table public.incidents drop constraint if exists incidents_status_check;

update public.incidents set status = 'New'           where status = 'Not Started';
update public.incidents set status = 'Investigating' where status = 'In Progress';
update public.incidents set status = 'Resolved'      where status = 'Completed';

alter table public.incidents
  add constraint incidents_status_check check (status in (
    'New', 'Investigating', 'Waiting on Warehouse', 'Waiting on Customer',
    'Waiting on Marketplace', 'Resolved', 'Closed'
  ));

-- 4. Backfill timestamps for existing rows ------------------------------------
update public.incidents
  set status_changed_at = coalesce(status_changed_at, updated_at, created_at)
  where status_changed_at is null;

update public.incidents
  set resolved_at = coalesce(resolved_at, updated_at, created_at)
  where status in ('Resolved', 'Closed') and resolved_at is null;

-- 5. Indexes for filtering / aggregation --------------------------------------
create index if not exists idx_incidents_status         on public.incidents (status);
create index if not exists idx_incidents_assigned_to    on public.incidents (assigned_to);
create index if not exists idx_incidents_complaint_date on public.incidents (complaint_date);
create index if not exists idx_incidents_created_at     on public.incidents (created_at);
create index if not exists idx_incidents_marketplace    on public.incidents (marketplace);
create index if not exists idx_incidents_category       on public.incidents (category);
create index if not exists idx_incidents_fault_party    on public.incidents (fault_party);
