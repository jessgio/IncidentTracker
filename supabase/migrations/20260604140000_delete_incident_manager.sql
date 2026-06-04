-- Managers can permanently delete an incident and its related rows.

-- Cascade deletes when parent incident is removed (safe if constraints already exist).
alter table public.comments
  drop constraint if exists comments_incident_id_fkey;

alter table public.comments
  add constraint comments_incident_id_fkey
  foreign key (incident_id) references public.incidents (id) on delete cascade;

alter table public.attachments
  drop constraint if exists attachments_incident_id_fkey;

alter table public.attachments
  add constraint attachments_incident_id_fkey
  foreign key (incident_id) references public.incidents (id) on delete cascade;

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

  if coalesce(v_role, '') <> 'manager' then
    raise exception 'Only managers can delete incidents' using errcode = '42501';
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

grant execute on function public.delete_incident(uuid) to authenticated;

-- Allow managers to delete incidents directly if RLS is enabled (RPC also enforces role).
drop policy if exists "Managers can delete incidents" on public.incidents;

create policy "Managers can delete incidents"
  on public.incidents
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'manager'
    )
  );
