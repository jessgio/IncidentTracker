-- Single-round-trip aggregate for the dashboard. Returns every KPI/chart the
-- dashboard needs as one jsonb payload so the client never downloads rows just
-- to count them. Filters mirror the table's filters (complaint_date range +
-- category/marketplace/status equality). The week-over-week trend is based on
-- created_at and intentionally ignores the date-range/status filters.

create or replace function public.incident_dashboard_stats(
  p_from date default null,
  p_to date default null,
  p_category text default null,
  p_marketplace text default null,
  p_status text default null,
  p_user_id uuid default null
)
returns jsonb
language sql
stable
security invoker
as $$
  with base as (
    select *
    from public.incidents i
    where (p_from is null or i.complaint_date >= p_from)
      and (p_to is null or i.complaint_date <= p_to)
      and (p_category is null or i.category = p_category)
      and (p_marketplace is null or i.marketplace = p_marketplace)
      and (p_status is null or i.status = p_status)
  ),
  open_base as (
    select * from base where status not in ('Resolved', 'Closed')
  )
  select jsonb_build_object(
    'total_all', (select count(*) from base),
    'total_open', (select count(*) from open_base),
    'waiting_on_warehouse', (select count(*) from base where status = 'Waiting on Warehouse'),
    'my_queue', (
      select count(*) from open_base
      where p_user_id is not null and assigned_to = p_user_id
    ),
    'sla_breaches', (
      select count(*) from open_base
      where coalesce(status_changed_at, created_at) < now() - interval '3 days'
    ),
    'avg_resolution_hours', (
      select round(avg(extract(epoch from (resolved_at - created_at)) / 3600.0)::numeric, 1)
      from base where resolved_at is not null
    ),
    'financial_impact', (
      select coalesce(sum(
        coalesce(refund_amount, 0) + coalesce(replacement_fee, 0) + coalesce(shipping_fee, 0)
      ), 0)
      from base
    ),
    'by_status', (
      select coalesce(jsonb_agg(jsonb_build_object('name', status, 'count', c) order by c desc), '[]'::jsonb)
      from (select status, count(*) c from base group by status) s
    ),
    'aging', jsonb_build_object(
      'd0_1', (
        select count(*) from open_base
        where coalesce(status_changed_at, created_at) >= now() - interval '1 day'
      ),
      'd1_3', (
        select count(*) from open_base
        where coalesce(status_changed_at, created_at) <  now() - interval '1 day'
          and coalesce(status_changed_at, created_at) >= now() - interval '3 days'
      ),
      'd3_plus', (
        select count(*) from open_base
        where coalesce(status_changed_at, created_at) < now() - interval '3 days'
      )
    ),
    'by_category', (
      select coalesce(jsonb_agg(jsonb_build_object('name', category, 'count', c) order by c desc), '[]'::jsonb)
      from (select category, count(*) c from base where category is not null group by category) s
    ),
    'by_marketplace', (
      select coalesce(jsonb_agg(jsonb_build_object('name', marketplace, 'count', c) order by c desc), '[]'::jsonb)
      from (select marketplace, count(*) c from base where marketplace is not null group by marketplace) s
    ),
    'by_fault', (
      select coalesce(jsonb_agg(jsonb_build_object('name', fault_party, 'count', c) order by c desc), '[]'::jsonb)
      from (
        select fault_party, count(*) c from base
        where fault_party is not null and fault_party <> ''
        group by fault_party
      ) s
    ),
    'by_blocked', (
      select coalesce(jsonb_agg(jsonb_build_object('name', party, 'count', c) order by c desc), '[]'::jsonb)
      from (
        select case status
          when 'Waiting on Warehouse'   then 'Warehouse'
          when 'Waiting on Customer'    then 'Customer'
          when 'Waiting on Marketplace' then 'Marketplace'
        end as party, count(*) c
        from open_base
        where status in ('Waiting on Warehouse', 'Waiting on Customer', 'Waiting on Marketplace')
        group by party
      ) s
    ),
    'trend', jsonb_build_object(
      'this_week', (
        select count(*) from public.incidents i
        where i.created_at >= now() - interval '7 days'
          and (p_category is null or i.category = p_category)
          and (p_marketplace is null or i.marketplace = p_marketplace)
      ),
      'last_week', (
        select count(*) from public.incidents i
        where i.created_at >= now() - interval '14 days'
          and i.created_at <  now() - interval '7 days'
          and (p_category is null or i.category = p_category)
          and (p_marketplace is null or i.marketplace = p_marketplace)
      )
    )
  );
$$;

grant execute on function public.incident_dashboard_stats(date, date, text, text, text, uuid) to authenticated;
