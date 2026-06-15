-- Replace blocked-by breakdown with financial impact grouped by fault party.

create or replace function public.incident_dashboard_stats(
  p_from date default null,
  p_to date default null,
  p_category text default null,
  p_marketplace text default null,
  p_status text default null,
  p_fault_party text default null,
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
      and (p_fault_party is null or i.fault_party = p_fault_party)
  ),
  open_base as (
    select * from base where status not in ('Resolved', 'Closed')
  ),
  pic_status as (
    select
      ob.assigned_to as pic_id,
      coalesce(nullif(trim(pr.full_name), ''), pr.email, 'Unassigned') as pic_name,
      ob.status,
      count(*)::int as c
    from open_base ob
    left join public.profiles pr on pr.id = ob.assigned_to
    group by ob.assigned_to, pr.full_name, pr.email, ob.status
  ),
  first_response as (
    select
      b.id,
      extract(epoch from (
        coalesce(
          (select min(c.created_at) from public.comments c where c.incident_id = b.id),
          case
            when b.status_changed_at > b.created_at + interval '5 minutes'
            then b.status_changed_at
            else null
          end
        ) - b.created_at
      ) / 3600.0) as hours
    from base b
    where exists (select 1 from public.comments c where c.incident_id = b.id)
       or b.status_changed_at > b.created_at + interval '5 minutes'
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
    'avg_first_response_hours', (
      select round(avg(hours)::numeric, 1) from first_response where hours is not null
    ),
    'first_response_count', (select count(*)::int from first_response where hours is not null),
    'avg_warehouse_cycle_hours', (
      select round(avg(
        extract(epoch from (warehouse_completed_at - warehouse_requested_at)) / 3600.0
      )::numeric, 1)
      from base
      where warehouse_requested_at is not null
        and warehouse_completed_at is not null
    ),
    'warehouse_cycle_count', (
      select count(*)::int from base
      where warehouse_requested_at is not null
        and warehouse_completed_at is not null
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
    'by_fault_financial', (
      select coalesce(jsonb_agg(jsonb_build_object('name', fault_party, 'amount', amt) order by amt desc), '[]'::jsonb)
      from (
        select
          fault_party,
          coalesce(sum(
            coalesce(refund_amount, 0) + coalesce(replacement_fee, 0) + coalesce(shipping_fee, 0)
          ), 0) as amt
        from base
        where fault_party is not null and fault_party <> ''
        group by fault_party
        having coalesce(sum(
          coalesce(refund_amount, 0) + coalesce(replacement_fee, 0) + coalesce(shipping_fee, 0)
        ), 0) > 0
      ) s
    ),
    'by_pic', (
      select coalesce(jsonb_agg(pic_row order by total_active desc), '[]'::jsonb)
      from (
        select
          jsonb_build_object(
            'pic_id', pic_id,
            'pic_name', pic_name,
            'total_active', sum(c),
            'by_status', (
              select coalesce(
                jsonb_agg(jsonb_build_object('name', status, 'count', c) order by c desc),
                '[]'::jsonb
              )
              from pic_status ps2
              where ps2.pic_id is not distinct from ps.pic_id
                and ps2.pic_name = ps.pic_name
            )
          ) as pic_row,
          sum(c) as total_active
        from pic_status ps
        group by pic_id, pic_name
      ) grouped
    ),
    'trend', jsonb_build_object(
      'this_week', (
        select count(*) from public.incidents i
        where i.created_at >= now() - interval '7 days'
          and (p_category is null or i.category = p_category)
          and (p_marketplace is null or i.marketplace = p_marketplace)
          and (p_fault_party is null or i.fault_party = p_fault_party)
      ),
      'last_week', (
        select count(*) from public.incidents i
        where i.created_at >= now() - interval '14 days'
          and i.created_at <  now() - interval '7 days'
          and (p_category is null or i.category = p_category)
          and (p_marketplace is null or i.marketplace = p_marketplace)
          and (p_fault_party is null or i.fault_party = p_fault_party)
      ),
      'this_week_resolved', (
        select count(*) from public.incidents i
        where i.resolved_at >= now() - interval '7 days'
          and (p_category is null or i.category = p_category)
          and (p_marketplace is null or i.marketplace = p_marketplace)
          and (p_fault_party is null or i.fault_party = p_fault_party)
      ),
      'last_week_resolved', (
        select count(*) from public.incidents i
        where i.resolved_at >= now() - interval '14 days'
          and i.resolved_at <  now() - interval '7 days'
          and (p_category is null or i.category = p_category)
          and (p_marketplace is null or i.marketplace = p_marketplace)
          and (p_fault_party is null or i.fault_party = p_fault_party)
      )
    )
  );
$$;
