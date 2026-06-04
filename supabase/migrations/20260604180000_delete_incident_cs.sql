-- Allow CS and managers to permanently delete incidents (was manager-only).

create or replace function public.delete_incident(p_incident_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role from public.profiles where id = auth.uid();

  if coalesce(v_role, '') not in ('manager', 'cs') then
    raise exception 'Only CS and managers can delete incidents' using errcode = '42501';
  end if;

  if not exists (select 1 from public.incidents where id = p_incident_id) then
    return false;
  end if;

  delete from public.comments where incident_id = p_incident_id;
  delete from public.attachments where incident_id = p_incident_id;
  delete from public.incidents where id = p_incident_id;

  return true;
end;
$$;

drop policy if exists "Managers can delete incidents" on public.incidents;
drop policy if exists "CS and managers can delete incidents" on public.incidents;

create policy "CS and managers can delete incidents"
  on public.incidents
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('manager', 'cs')
    )
  );
